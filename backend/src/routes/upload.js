import express from 'express';
import multer from 'multer';
import { parseDocument } from '../services/documentParser.js';
import { chunkDocument } from '../services/retrievalService.js';
import { generateEmbeddings } from '../services/embeddingService.js';
import { getDb } from '../db.js';

const uploadRouter = express.Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    files: 3,
    fileSize: 15 * 1024 * 1024,
  },
});

uploadRouter.post('/', upload.array('documents', 3), async (req, res) => {
  const db = getDb();

  try {
    const files = req.files;
    if (!files || files.length === 0) {
      return res.status(400).json({ error: 'No files uploaded' });
    }

    const { count } = await db.get('SELECT COUNT(*) AS count FROM documents');
    if (count + files.length > 3) {
      return res.status(400).json({
        error: `Upload limit is 3 documents. Delete ${count + files.length - 3} file(s) before uploading more.`,
      });
    }

    const parsedDocuments = await Promise.all(files.map((file) => parseDocument(file)));

    await db.exec('BEGIN TRANSACTION');

    for (let index = 0; index < files.length; index += 1) {
      const file = files[index];
      const parsed = parsedDocuments[index];
      const result = await db.run(
        `
          INSERT INTO documents (filename, mimetype, size_bytes, content, metadata, numeric_data)
          VALUES (?, ?, ?, ?, ?, ?)
        `,
        file.originalname,
        file.mimetype,
        file.size,
        parsed.text,
        JSON.stringify(parsed.metadata || {}),
        JSON.stringify(parsed.numericData || {})
      );

      const chunks = chunkDocument(parsed.text);
      const chunkTextInputs = chunks.map((chunk) => chunk.content);
      const embeddingResults = await generateEmbeddings(chunkTextInputs);

      for (let chunkIndex = 0; chunkIndex < chunks.length; chunkIndex += 1) {
        const chunk = chunks[chunkIndex];
        const embeddingValue = embeddingResults?.[chunkIndex] ?? chunk.embedding;
        await db.run(
          `
            INSERT INTO document_chunks (document_id, chunk_index, content, embedding_json)
            VALUES (?, ?, ?, ?)
          `,
          result.lastID,
          chunk.chunkIndex,
          chunk.content,
          JSON.stringify(embeddingValue)
        );
      }
    }

    await db.exec('COMMIT');

    const allFiles = await listFiles(db);
    res.json({ files: allFiles });
  } catch (error) {
    await db.exec('ROLLBACK').catch(() => {});
    console.error(error);
    res.status(500).json({ error: error.message || 'File upload failed' });
  }
});

uploadRouter.use((error, req, res, next) => {
  if (error instanceof multer.MulterError) {
    return res.status(400).json({ error: error.message });
  }

  return next(error);
});

function listFiles(db) {
  return db.all(
    `
      SELECT id, filename, mimetype, size_bytes, uploaded_at
      FROM documents
      ORDER BY uploaded_at DESC, id DESC
    `
  );
}

export default uploadRouter;
