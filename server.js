const express = require("express");
const path = require("path");
const db = require("./database");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, "public")));

function validateRequired(fields, names) {
  for (const name of names) {
    if (fields[name] === undefined || String(fields[name]).trim() === "") {
      return `${name} is required`;
    }
  }
  return null;
}

// Dashboard
app.get("/api/dashboard", (req, res) => {
  const stats = {
    books: db.prepare("SELECT COUNT(*) AS count FROM books").get().count,
    members: db.prepare("SELECT COUNT(*) AS count FROM members").get().count,
    issued: db.prepare("SELECT COUNT(*) AS count FROM transactions WHERE status='issued'").get().count,
    overdue: db.prepare(`
      SELECT COUNT(*) AS count FROM transactions
      WHERE status='issued' AND due_date < date('now')
    `).get().count
  };
  res.json(stats);
});

// Books
app.get("/api/books", (req, res) => {
  const search = String(req.query.search || "").trim();
  let rows;
  if (search) {
    const q = `%${search}%`;
    rows = db.prepare(`
      SELECT * FROM books
      WHERE title LIKE ? OR author LIKE ? OR isbn LIKE ?
      ORDER BY id DESC
    `).all(q, q, q);
  } else {
    rows = db.prepare("SELECT * FROM books ORDER BY id DESC").all();
  }
  res.json(rows);
});

app.post("/api/books", (req, res) => {
  const { title, author, isbn, category, quantity } = req.body;
  const error = validateRequired(req.body, ["title", "author"]);
  if (error) return res.status(400).json({ error });

  const qty = Number(quantity || 1);
  if (!Number.isInteger(qty) || qty < 1) {
    return res.status(400).json({ error: "Quantity must be a positive integer" });
  }

  try {
    const result = db.prepare(`
      INSERT INTO books (title, author, isbn, category, quantity, available)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      title.trim(),
      author.trim(),
      (isbn || "").trim(),
      (category || "General").trim(),
      qty,
      qty
    );
    res.status(201).json({ id: result.lastInsertRowid, message: "Book added successfully" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put("/api/books/:id", (req, res) => {
  const id = Number(req.params.id);
  const { title, author, isbn, category, quantity } = req.body;
  const error = validateRequired(req.body, ["title", "author"]);
  if (error) return res.status(400).json({ error });

  const existing = db.prepare("SELECT * FROM books WHERE id=?").get(id);
  if (!existing) return res.status(404).json({ error: "Book not found" });

  const qty = Number(quantity);
  if (!Number.isInteger(qty) || qty < 1) {
    return res.status(400).json({ error: "Quantity must be a positive integer" });
  }

  const issued = existing.quantity - existing.available;
  if (qty < issued) {
    return res.status(400).json({ error: `Quantity cannot be below currently issued copies (${issued})` });
  }

  const available = qty - issued;
  db.prepare(`
    UPDATE books
    SET title=?, author=?, isbn=?, category=?, quantity=?, available=?
    WHERE id=?
  `).run(
    title.trim(),
    author.trim(),
    (isbn || "").trim(),
    (category || "General").trim(),
    qty,
    available,
    id
  );

  res.json({ message: "Book updated successfully" });
});

app.delete("/api/books/:id", (req, res) => {
  const id = Number(req.params.id);
  const active = db.prepare("SELECT COUNT(*) AS count FROM transactions WHERE book_id=? AND status='issued'").get(id).count;
  if (active > 0) return res.status(400).json({ error: "Cannot delete a book while it is issued" });

  const result = db.prepare("DELETE FROM books WHERE id=?").run(id);
  if (!result.changes) return res.status(404).json({ error: "Book not found" });
  res.json({ message: "Book deleted successfully" });
});

// Members
app.get("/api/members", (req, res) => {
  const search = String(req.query.search || "").trim();
  let rows;
  if (search) {
    const q = `%${search}%`;
    rows = db.prepare(`
      SELECT * FROM members
      WHERE name LIKE ? OR email LIKE ? OR phone LIKE ?
      ORDER BY id DESC
    `).all(q, q, q);
  } else {
    rows = db.prepare("SELECT * FROM members ORDER BY id DESC").all();
  }
  res.json(rows);
});

app.post("/api/members", (req, res) => {
  const { name, email, phone } = req.body;
  const error = validateRequired(req.body, ["name"]);
  if (error) return res.status(400).json({ error });

  try {
    const result = db.prepare(`
      INSERT INTO members (name, email, phone)
      VALUES (?, ?, ?)
    `).run(name.trim(), (email || "").trim(), (phone || "").trim());
    res.status(201).json({ id: result.lastInsertRowid, message: "Member added successfully" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put("/api/members/:id", (req, res) => {
  const id = Number(req.params.id);
  const { name, email, phone } = req.body;
  const error = validateRequired(req.body, ["name"]);
  if (error) return res.status(400).json({ error });

  const result = db.prepare(`
    UPDATE members SET name=?, email=?, phone=? WHERE id=?
  `).run(name.trim(), (email || "").trim(), (phone || "").trim(), id);

  if (!result.changes) return res.status(404).json({ error: "Member not found" });
  res.json({ message: "Member updated successfully" });
});

app.delete("/api/members/:id", (req, res) => {
  const id = Number(req.params.id);
  const active = db.prepare("SELECT COUNT(*) AS count FROM transactions WHERE member_id=? AND status='issued'").get(id).count;
  if (active > 0) return res.status(400).json({ error: "Cannot delete a member with an active issued book" });

  const result = db.prepare("DELETE FROM members WHERE id=?").run(id);
  if (!result.changes) return res.status(404).json({ error: "Member not found" });
  res.json({ message: "Member deleted successfully" });
});

// Transactions / Issue / Return
app.get("/api/transactions", (req, res) => {
  const rows = db.prepare(`
    SELECT t.*, b.title, m.name AS member_name
    FROM transactions t
    JOIN books b ON b.id=t.book_id
    JOIN members m ON m.id=t.member_id
    ORDER BY t.id DESC
  `).all();
  res.json(rows);
});

app.post("/api/transactions/issue", (req, res) => {
  const { book_id, member_id, due_date } = req.body;
  if (!book_id || !member_id || !due_date) {
    return res.status(400).json({ error: "Book, member and due date are required" });
  }

  const book = db.prepare("SELECT * FROM books WHERE id=?").get(Number(book_id));
  const member = db.prepare("SELECT * FROM members WHERE id=?").get(Number(member_id));

  if (!book) return res.status(404).json({ error: "Book not found" });
  if (!member) return res.status(404).json({ error: "Member not found" });
  if (book.available < 1) return res.status(400).json({ error: "No available copy of this book" });

  const existing = db.prepare(`
    SELECT COUNT(*) AS count FROM transactions
    WHERE book_id=? AND member_id=? AND status='issued'
  `).get(Number(book_id), Number(member_id)).count;

  if (existing > 0) return res.status(400).json({ error: "This member already has this book issued" });

  const transaction = db.transaction(() => {
    db.prepare(`
      INSERT INTO transactions (book_id, member_id, issue_date, due_date, status)
      VALUES (?, ?, date('now'), ?, 'issued')
    `).run(Number(book_id), Number(member_id), due_date);

    db.prepare("UPDATE books SET available=available-1 WHERE id=?").run(Number(book_id));
  });

  transaction();
  res.status(201).json({ message: "Book issued successfully" });
});

app.post("/api/transactions/:id/return", (req, res) => {
  const id = Number(req.params.id);
  const transactionRow = db.prepare("SELECT * FROM transactions WHERE id=?").get(id);

  if (!transactionRow) return res.status(404).json({ error: "Transaction not found" });
  if (transactionRow.status === "returned") {
    return res.status(400).json({ error: "Book is already returned" });
  }

  const transaction = db.transaction(() => {
    db.prepare(`
      UPDATE transactions
      SET return_date=date('now'), status='returned'
      WHERE id=?
    `).run(id);

    db.prepare("UPDATE books SET available=available+1 WHERE id=?").run(transactionRow.book_id);
  });

  transaction();
  res.json({ message: "Book returned successfully" });
});

app.get("/api/health", (req, res) => {
  res.json({ status: "OK", message: "Library Management API is running" });
});

app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.listen(PORT, () => {
  console.log(`Library Management System running at http://localhost:${PORT}`);
});