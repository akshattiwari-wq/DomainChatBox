import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import uploadRouter from './routes/upload.js';
import queryRouter from './routes/query.js';
import filesRouter from './routes/files.js';
import { initDb } from './db.js';

dotenv.config();

const app = express();
const port = process.env.PORT || 4000;

app.use(cors());
app.use(express.json());

await initDb();

app.use('/api/upload', uploadRouter);
app.use('/api/query', queryRouter);
app.use('/api/files', filesRouter);

app.listen(port, () => {
  console.log(`Backend running on http://localhost:${port}`);
});
