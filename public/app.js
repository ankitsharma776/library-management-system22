const $ = (id) => document.getElementById(id);

function toast(message, error = false) {
  const el = $("toast");
  el.textContent = message;
  el.style.display = "block";
  el.style.background = error ? "#b42318" : "#172033";
  setTimeout(() => el.style.display = "none", 2500);
}

async function api(url, options = {}) {
  const response = await fetch(url, {
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    ...options
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Something went wrong");
  return data;
}

document.querySelectorAll(".tab").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".tab").forEach(b => b.classList.remove("active"));
    document.querySelectorAll(".section").forEach(s => s.classList.remove("active"));
    btn.classList.add("active");
    $(btn.dataset.section).classList.add("active");
    if (btn.dataset.section === "issue") {
      loadIssueOptions();
      loadTransactions();
    }
  });
});

async function loadDashboard() {
  const data = await api("/api/dashboard");
  $("bookCount").textContent = data.books;
  $("memberCount").textContent = data.members;
  $("issuedCount").textContent = data.issued;
  $("overdueCount").textContent = data.overdue;
}

async function loadBooks() {
  const search = encodeURIComponent($("bookSearch").value);
  const books = await api(`/api/books?search=${search}`);
  $("booksTable").innerHTML = books.map(b => `
    <tr>
      <td>${b.id}</td>
      <td>${escapeHtml(b.title)}</td>
      <td>${escapeHtml(b.author)}</td>
      <td>${escapeHtml(b.isbn || "-")}</td>
      <td>${escapeHtml(b.category || "General")}</td>
      <td>${b.quantity}</td>
      <td>${b.available}</td>
      <td>
        <button class="action-btn" onclick='editBook(${JSON.stringify(b)})'>Edit</button>
        <button class="action-btn delete" onclick="deleteBook(${b.id})">Delete</button>
      </td>
    </tr>
  `).join("") || `<tr><td colspan="8">No books found.</td></tr>`;
}

async function loadMembers() {
  const search = encodeURIComponent($("memberSearch").value);
  const members = await api(`/api/members?search=${search}`);
  $("membersTable").innerHTML = members.map(m => `
    <tr>
      <td>${m.id}</td>
      <td>${escapeHtml(m.name)}</td>
      <td>${escapeHtml(m.email || "-")}</td>
      <td>${escapeHtml(m.phone || "-")}</td>
      <td>
        <button class="action-btn" onclick='editMember(${JSON.stringify(m)})'>Edit</button>
        <button class="action-btn delete" onclick="deleteMember(${m.id})">Delete</button>
      </td>
    </tr>
  `).join("") || `<tr><td colspan="5">No members found.</td></tr>`;
}

function openBookForm(book = null) {
  $("modalTitle").textContent = book ? "Edit Book" : "Add Book";
  $("modalForm").innerHTML = `
    <input id="fTitle" placeholder="Book title" value="${escapeAttr(book?.title || "")}" required>
    <input id="fAuthor" placeholder="Author" value="${escapeAttr(book?.author || "")}" required>
    <input id="fIsbn" placeholder="ISBN" value="${escapeAttr(book?.isbn || "")}">
    <input id="fCategory" placeholder="Category" value="${escapeAttr(book?.category || "General")}">
    <input id="fQuantity" type="number" min="1" placeholder="Quantity" value="${book?.quantity || 1}" required>
    <button class="primary" type="submit">${book ? "Update Book" : "Add Book"}</button>
  `;
  $("modalForm").onsubmit = async (e) => {
    e.preventDefault();
    const body = {
      title: $("fTitle").value,
      author: $("fAuthor").value,
      isbn: $("fIsbn").value,
      category: $("fCategory").value,
      quantity: $("fQuantity").value
    };
    try {
      await api(book ? `/api/books/${book.id}` : "/api/books", {
        method: book ? "PUT" : "POST",
        body: JSON.stringify(body)
      });
      closeModal();
      toast(book ? "Book updated" : "Book added");
      await refreshAll();
    } catch (e) { toast(e.message, true); }
  };
  $("modal").classList.remove("hidden");
}
function editBook(book) { openBookForm(book); }

async function deleteBook(id) {
  if (!confirm("Delete this book?")) return;
  try { await api(`/api/books/${id}`, { method: "DELETE" }); toast("Book deleted"); await refreshAll(); }
  catch (e) { toast(e.message, true); }
}

function openMemberForm(member = null) {
  $("modalTitle").textContent = member ? "Edit Member" : "Add Member";
  $("modalForm").innerHTML = `
    <input id="mName" placeholder="Member name" value="${escapeAttr(member?.name || "")}" required>
    <input id="mEmail" type="email" placeholder="Email" value="${escapeAttr(member?.email || "")}">
    <input id="mPhone" placeholder="Phone" value="${escapeAttr(member?.phone || "")}">
    <button class="primary" type="submit">${member ? "Update Member" : "Add Member"}</button>
  `;
  $("modalForm").onsubmit = async (e) => {
    e.preventDefault();
    const body = { name: $("mName").value, email: $("mEmail").value, phone: $("mPhone").value };
    try {
      await api(member ? `/api/members/${member.id}` : "/api/members", {
        method: member ? "PUT" : "POST", body: JSON.stringify(body)
      });
      closeModal();
      toast(member ? "Member updated" : "Member added");
      await refreshAll();
    } catch (e) { toast(e.message, true); }
  };
  $("modal").classList.remove("hidden");
}
function editMember(member) { openMemberForm(member); }

async function deleteMember(id) {
  if (!confirm("Delete this member?")) return;
  try { await api(`/api/members/${id}`, { method: "DELETE" }); toast("Member deleted"); await refreshAll(); }
  catch (e) { toast(e.message, true); }
}

async function loadIssueOptions() {
  const [books, members] = await Promise.all([api("/api/books"), api("/api/members")]);
  $("issueBook").innerHTML = `<option value="">Select book</option>` +
    books.filter(b => b.available > 0).map(b => `<option value="${b.id}">${escapeHtml(b.title)} — ${b.available} available</option>`).join("");
  $("issueMember").innerHTML = `<option value="">Select member</option>` +
    members.map(m => `<option value="${m.id}">${escapeHtml(m.name)}</option>`).join("");
}

$("issueForm").addEventListener("submit", async e => {
  e.preventDefault();
  try {
    await api("/api/transactions/issue", {
      method: "POST",
      body: JSON.stringify({
        book_id: $("issueBook").value,
        member_id: $("issueMember").value,
        due_date: $("dueDate").value
      })
    });
    toast("Book issued successfully");
    $("issueForm").reset();
    await refreshAll();
    await loadIssueOptions();
    await loadTransactions();
  } catch (e) { toast(e.message, true); }
});

async function loadTransactions() {
  const rows = await api("/api/transactions");
  $("transactionsTable").innerHTML = rows.map(t => `
    <tr>
      <td>${t.id}</td>
      <td>${escapeHtml(t.title)}</td>
      <td>${escapeHtml(t.member_name)}</td>
      <td>${t.issue_date}</td>
      <td>${t.due_date}</td>
      <td>${t.return_date || "-"}</td>
      <td><span class="badge ${t.status === "issued" ? "pending" : ""}">${t.status}</span></td>
      <td>${t.status === "issued" ? `<button class="action-btn" onclick="returnBook(${t.id})">Return</button>` : "-"}</td>
    </tr>
  `).join("") || `<tr><td colspan="8">No transactions yet.</td></tr>`;
}

async function returnBook(id) {
  if (!confirm("Mark this book as returned?")) return;
  try {
    await api(`/api/transactions/${id}/return`, { method: "POST" });
    toast("Book returned");
    await refreshAll();
    await loadIssueOptions();
    await loadTransactions();
  } catch (e) { toast(e.message, true); }
}

function closeModal() { $("modal").classList.add("hidden"); }
$("modal").addEventListener("click", e => { if (e.target.id === "modal") closeModal(); });

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, c => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#039;" }[c]));
}
function escapeAttr(value) { return escapeHtml(value); }

async function refreshAll() {
  await Promise.all([loadDashboard(), loadBooks(), loadMembers()]);
}

$("dueDate").value = new Date(Date.now() + 14 * 86400000).toISOString().slice(0,10);
refreshAll().catch(err => toast(err.message, true));