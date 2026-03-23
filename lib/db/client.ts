import fs from "node:fs";
import path from "node:path";

import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";

import { getEnv } from "@/lib/config/env";
import * as schema from "@/lib/db/schema";

let sqlite: Database.Database | null = null;
let database: ReturnType<typeof createDb> | null = null;

function createDb() {
  return drizzle(getSqlite(), { schema });
}

function ensureParentDirectory(filePath: string) {
  const absolutePath = path.isAbsolute(filePath) ? filePath : path.join(process.cwd(), filePath);
  fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
  return absolutePath;
}

export function getSqlite() {
  if (!sqlite) {
    const env = getEnv();
    const dbPath = ensureParentDirectory(env.SQLITE_PATH);

    sqlite = new Database(dbPath);
    sqlite.pragma("journal_mode = WAL");
    sqlite.pragma("foreign_keys = ON");
  }

  return sqlite;
}

export function getDb() {
  if (!database) {
    database = createDb();
  }

  return database;
}

export function initializeDatabase() {
  const db = getSqlite();

  db.exec(`
    CREATE TABLE IF NOT EXISTS assets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sha256 TEXT NOT NULL UNIQUE,
      original_filename TEXT NOT NULL,
      s3_key TEXT NOT NULL UNIQUE,
      public_url TEXT NOT NULL,
      mime_type TEXT NOT NULL,
      byte_size INTEGER NOT NULL,
      width INTEGER NOT NULL,
      height INTEGER NOT NULL,
      bucket TEXT NOT NULL,
      region TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS usages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      asset_id INTEGER NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
      post_slug TEXT NOT NULL,
      alt_text TEXT,
      caption TEXT,
      snippet TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS tags (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE
    );

    CREATE TABLE IF NOT EXISTS asset_tags (
      asset_id INTEGER NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
      tag_id INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
      PRIMARY KEY (asset_id, tag_id)
    );
  `);

  return getDb();
}

export function resetDatabaseForTests() {
  database = null;
  sqlite?.close();
  sqlite = null;
}
