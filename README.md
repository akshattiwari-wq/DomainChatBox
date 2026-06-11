# Document Chat Assistant

This project scaffolds a document-aware chat application.

## Tech stack

- React + Vite frontend
- Node.js + Express backend
- SQLite persistence
- OpenAI/Azure hosted LLM API
- PDF, Word, CSV, and text parsing

## Setup

1. Install dependencies for frontend and backend:

```bash
cd frontend
npm install
cd ../backend
npm install
```

2. Create a `.env` file in `backend/` using `.env.example`.

3. Start the app:

```bash
cd backend
npm run dev
```

In a second terminal:

```bash
cd frontend
npm run dev
```

## Notes

- Uploaded documents are persisted in the backend database.
- The app only answers questions from uploaded document content and rejects unrelated questions.
- Only 3 files can be uploaded at once.
- The chat history is persisted across backend restarts.
