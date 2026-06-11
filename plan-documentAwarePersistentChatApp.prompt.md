
## Plan: Document-Aware Persistent Chat App

Tech stack: React + Vite frontend, Node.js + Express backend, SQLite (or MongoDB) persistence, OpenAI/Azure-hosted LLM API, document parsing libraries for PDF/Word/CSV/text, embeddings-based retrieval, and a simple numeric prediction module.

TL;DR - Build a responsive web app with a React frontend and Node.js backend. The app will accept up to 3 uploaded documents, extract and persist their content, use a hosted LLM API with only document-derived context (no RAG retrieval over external knowledge), reject unrelated questions, and add a numeric prediction layer for future usage based on uploaded data.

Note: the conditions you provided are treated as project test cases and will be validated during verification.

**Steps**
1. Choose the stack and scaffold the project.
   - Use React (Vite) for the frontend and Node.js + Express for the backend.
   - Add persistent storage with SQLite or MongoDB for long-term document/chat memory.
2. Implement document upload and parsing.
   - Support PDF, Word, CSV, and plain text.
   - Extract text and structured numeric data.
   - Enforce the 3-file upload limit and metadata tracking.
3. Store documents and embeddings persistently.
   - Save raw text, extracted metadata, file identifier, and user-visible file list.
   - Generate embeddings for document chunks using the LLM API.
4. Build the chat interface.
   - Create a chat UI with message history, input box, and send button.
   - Show current uploaded files and a delete/replace button.
5. Implement domain-specific retrieval and validation.
   - Query the stored embeddings to find relevant document context.
   - If relevance is below threshold, return an "invalid question" error.
   - Pass only document-related context to the LLM.
6. Add a prediction module for numeric data.
   - Detect time-series or numeric records in uploaded docs.
   - Run a simple regression/forecast model to answer future usage queries.
   - Combine prediction output with document evidence.
7. Add persistent memory across sessions.
   - Ensure the app reads persisted documents and embeddings on startup.
   - Use a backend database to keep data available tomorrow or later.
8. Add file deletion and re-upload support.
   - Allow deleting one or all current files.
   - Clear the corresponding document records and embeddings.
   - Let the user upload new files again after deletion.

**Verification**
1. Run the app and upload a sample PDF, Word, and CSV file.
2. Ask a question directly about uploaded content; verify the answer uses the document data.
3. Ask an unrelated question; verify the app returns a clear invalid-question error.
4. Restart the app/browser and ask about the same document; verify persistence still works.
5. Delete uploaded files; verify the file list clears and the user can upload new files.
6. Upload numeric usage data (for example tire wear vs kilometers) and ask a future prediction question; verify the app returns a forecast based on the document.

**Decisions**
- Use a hosted LLM API for embeddings and question-answering.
- Build a browser-accessible responsive web app so it can work on desktop and mobile.
- Persist data in a backend database to satisfy permanent memory across sessions.
- Reject unrelated questions explicitly instead of answering broadly.

**Further Considerations**
1. If the app must handle multiple users separately, add authentication and per-user storage.
2. If the user wants truly offline/local operation later, the architecture can be adjusted to use a local open-source model.
3. If the document formats must expand beyond PDF/Word/CSV, add additional parser libraries for Excel, images/OCR, and other file types.
