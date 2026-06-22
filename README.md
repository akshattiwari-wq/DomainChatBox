# Document Chat Assistant

A document-aware chat application that lets users upload documents and ask questions about their content.

## What it does

- Uploads PDF, Word, CSV, and plain text files.
- Extracts text and metadata from uploaded documents.
- Stores documents, text chunks, and chat history in SQLite.
- Answers questions using document context and optional OpenAI models.

## Project structure

- `frontend/` - React web UI served by a lightweight Node static server.
- `backend/` - Express server, file parsing, embeddings, search, and chat logic.
- `DOCUMENTATION_FOR_BEGINNERS.md` - beginner-friendly guide with setup, file explanations, and troubleshooting.

## Documentation Index

Start here if you are new to the repository:

- [Project Overview](PROJECT_OVERVIEW.md)
- [Architecture](ARCHITECTURE.md)
- [Installation Guide](INSTALLATION_GUIDE.md)
- [Runbook](RUNBOOK.md)
- [Troubleshooting](TROUBLESHOOTING.md)
- [Developer Onboarding](DEVELOPER_ONBOARDING.md)
- [Security Review](SECURITY_REVIEW.md)
- [Deployment Guide](DEPLOYMENT_GUIDE.md)
- [Maintenance Guide](MAINTENANCE_GUIDE.md)

## Quick start

1. Install dependencies in the backend and frontend folders:

```powershell
cd "c:\Users\Akshat Tiwari\OneDrive\Desktop\Final Project\backend"
npm install
cd "c:\Users\Akshat Tiwari\OneDrive\Desktop\Final Project\frontend"
npm install
```

2. Copy `backend/.env.example` to `backend/.env` and add your `OPENAI_API_KEY` if available.
   - For local self-hosted models, set `LOCAL_API_BASE_URL=` to the URL of your local OpenAI-compatible model server (for example, `http://127.0.0.1:8000`).
   - Set `LOCAL_LLM_MODEL=` to the model name your server exposes, such as `gpt2` for the built-in local demo server.
   - If you want the included CPU-friendly local server, see `backend/model_training/README.md` and run `backend/model_training/serve_local_model.py`.
3. Start both services from the repository root:

```powershell
cd "c:\Users\Akshat Tiwari\OneDrive\Desktop\Final Project"
node start-app.mjs
```

4. Open the URL shown by the frontend server, usually `http://localhost:5173`.

## Notes

- The frontend talks directly to the backend at `http://127.0.0.1:4000` by default.
- The frontend defaults to `http://127.0.0.1:4000`. If you need a different backend URL, edit `frontend/src/lib/api.js`.
- Upload a maximum of 3 documents.
- If the backend is not running, uploads and chat requests will fail.
- The root-level launcher starts the backend first, waits for it to answer `/api/files/status`, and then starts the frontend.
- On Windows, you can also run `Start-App.cmd`.

## Frontend / Backend Sync Workflow

1. Start both services from the repository root with `node start-app.mjs`.
2. The frontend loads the current document list from `GET /api/files` on startup.
3. After uploading or deleting documents, the frontend refreshes the file list from the backend automatically.
4. When the chat panel is visible, it loads conversation history from `GET /api/query/history`.
5. After sending a question, the frontend refreshes the chat history from the backend so the UI stays in sync.
6. If the backend disconnects or fails, the frontend shows an error and prompts you to restart the backend.

## Beginner guide

Read `DOCUMENTATION_FOR_BEGINNERS.md` for full instructions, file descriptions, and common error fixes.
