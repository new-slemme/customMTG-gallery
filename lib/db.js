import fs from 'fs';
import Database from 'better-sqlite3';
import { DATA_DIR, DB_PATH } from './config';

let db;

export function getDb() {
  if (db) return db;

  fs.mkdirSync(DATA_DIR, { recursive: true });
  db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');

  db.exec(`
    CREATE TABLE IF NOT EXISTS comments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      set_slug TEXT NOT NULL,
      card_id TEXT NOT NULL,
      card_name TEXT NOT NULL,
      display_name TEXT,
      rating INTEGER,
      comment TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_comments_set_card_created
      ON comments (set_slug, card_id, created_at DESC);
  `);

  return db;
}
