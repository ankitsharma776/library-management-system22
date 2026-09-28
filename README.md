# Library Management System

A full-stack Library Management System built with Node.js, Express, SQLite and vanilla HTML/CSS/JavaScript.

## Features

- Responsive interface
- Dashboard statistics
- Book CRUD
- Member CRUD
- Search and validation
- Book issue and return workflow
- SQLite database integration
- Overdue count
- Transaction history

## Requirements

- Node.js 18+
- VS Code recommended

## Run locally

```bash
npm install
npm start
```

Open:

http://localhost:3000

The SQLite database `library.db` is created automatically on first run.

## API

- GET `/api/dashboard`
- GET/POST `/api/books`
- PUT/DELETE `/api/books/:id`
- GET/POST `/api/members`
- PUT/DELETE `/api/members/:id`
- GET `/api/transactions`
- POST `/api/transactions/issue`
- POST `/api/transactions/:id/return`
- GET `/api/health`

## Suggested testing

1. Add 3 books.
2. Add 3 members.
3. Search for a book.
4. Edit a book.
5. Issue a book.
6. Confirm available quantity decreases.
7. Return the book.
8. Confirm available quantity increases.
9. Try issuing an unavailable book.
10. Try deleting a book/member with an active issue and verify validation.

## Submission checklist

- Source code ZIP
- GitHub repository link, if requested
- README
- Screenshots of dashboard
- Screenshots of books CRUD
- Screenshots of members CRUD
- Screenshot of issue/return
- Short testing report
- Short project workflow/documentation
