import express from 'express';
import { getDb } from '../db.js';
import { answerQuestion } from '../services/llmService.js';

const queryRouter = express.Router();

queryRouter.get('/history', async (req, res) => {
  const db = getDb();
  const messages = await db.all(
    'SELECT role, message AS content, created_at FROM chats ORDER BY id'
  );
  res.json({ messages });
});

queryRouter.delete('/history', async (req, res) => {
  const db = getDb();
  await db.run('DELETE FROM chats');
  res.json({ success: true });
});

queryRouter.post('/', async (req, res) => {
  try {
    const { question } = req.body;
    if (!question) {
      return res.status(400).json({ error: 'Question is required' });
    }

    const db = getDb();
    const docs = await db.all(
      'SELECT id, filename, content, metadata, numeric_data FROM documents ORDER BY id'
    );
    const chunks = await db.all(
      `
        SELECT c.document_id, d.filename, c.chunk_index, c.content, c.embedding_json
        FROM document_chunks c
        JOIN documents d ON d.id = c.document_id
        ORDER BY c.document_id, c.chunk_index
      `
    );
    const result = await answerQuestion(question, docs, chunks);

    await db.run('INSERT INTO chats (role, message) VALUES (?, ?)', 'user', question);
    await db.run('INSERT INTO chats (role, message) VALUES (?, ?)', 'assistant', result.answer);

    const statusCode = result.status === 'invalid' ? 400 : 200;
    res.status(statusCode).json({
      answer: result.answer,
      error: result.status === 'invalid' ? result.answer : undefined,
      status: result.status,
      sources: result.sources || [],
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Query processing failed' });
  }
});

export default queryRouter;
