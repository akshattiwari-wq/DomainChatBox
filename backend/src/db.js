import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

let db;

export async function initDb() {
  const dirname = path.dirname(fileURLToPath(import.meta.url));
  const dbPath = process.env.SQLITE_PATH || path.join(dirname, '..', 'data', 'app.db');

  await fs.mkdir(path.dirname(dbPath), { recursive: true });

  db = await open({
    filename: dbPath,
    driver: sqlite3.Database,
  });

  await db.exec('PRAGMA foreign_keys = ON;');

  await db.exec(`
    CREATE TABLE IF NOT EXISTS documents (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      filename TEXT,
      mimetype TEXT,
      size_bytes INTEGER,
      content TEXT,
      metadata TEXT,
      numeric_data TEXT,
      uploaded_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  await ensureColumn('documents', 'mimetype', 'TEXT');
  await ensureColumn('documents', 'size_bytes', 'INTEGER');
  await ensureColumn('documents', 'numeric_data', 'TEXT');

  await db.exec(`
    CREATE TABLE IF NOT EXISTS document_chunks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      document_id INTEGER NOT NULL,
      chunk_index INTEGER NOT NULL,
      content TEXT NOT NULL,
      embedding_json TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE
    );
  `);

  await db.exec(`
    CREATE TABLE IF NOT EXISTS chats (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      role TEXT,
      message TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);
}

async function ensureColumn(table, column, definition) {
  const rows = await db.all(`PRAGMA table_info(${table})`);
  const exists = rows.some((row) => row.name === column);

  if (!exists) {
    await db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition};`);
  }
}

export function getDb() {
  if (!db) {
    throw new Error('Database not initialized');
  }

  return db;
}
