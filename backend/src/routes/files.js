import express from 'express';
import { getDb } from '../db.js';

const filesRouter = express.Router();

filesRouter.get('/', async (req, res) => {
  const db = getDb();
  const files = await listFiles(db);
  res.json({ files });
});

filesRouter.get('/status', async (req, res) => {
  const db = getDb();
  const { count: fileCount } = await db.get('SELECT COUNT(*) AS count FROM documents');
  const { count: chatCount } = await db.get('SELECT COUNT(*) AS count FROM chats');
  const maxFiles = 3;
  const availableSlots = Math.max(0, maxFiles - fileCount);

  res.json({
    fileCount,
    chatCount,
    maxFiles,
    availableSlots,
    isReady: true,
  });
});

filesRouter.delete('/:id', async (req, res) => {
  const db = getDb();
  const { id } = req.params;
  await db.run('DELETE FROM documents WHERE id = ?', id);
  await clearChatsWhenNoDocumentsRemain(db);

  const files = await listFiles(db);
  res.json({ files });
});

filesRouter.delete('/', async (req, res) => {
  const db = getDb();
  await db.run('DELETE FROM documents');
  await db.run('DELETE FROM chats');
  res.json({ files: [] });
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

async function clearChatsWhenNoDocumentsRemain(db) {
  const { count } = await db.get('SELECT COUNT(*) AS count FROM documents');
  if (count === 0) {
    await db.run('DELETE FROM chats');
  }
}

export default filesRouter;
