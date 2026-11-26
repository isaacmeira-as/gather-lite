import { DatabaseSync } from "node:sqlite";
import path from "node:path";
import fs from "node:fs";

export const DB_PATH = process.env.DB_PATH ?? path.join(process.cwd(), "data", "gather-lite.sqlite");

let db: DatabaseSync;

export function getDb() {
  if (db) return db;
  if (DB_PATH !== ":memory:") fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
  db = new DatabaseSync(DB_PATH);
  db.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;");
  migrate(db);
  return db;
}

function migrate(db: DatabaseSync) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT UNIQUE,
      name TEXT NOT NULL,
      password_hash TEXT,
      avatar TEXT NOT NULL DEFAULT '{}',
      is_guest INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS spaces (
      id TEXT PRIMARY KEY,
      slug TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      owner_id TEXT NOT NULL REFERENCES users(id),
      is_private INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS maps (
      id TEXT PRIMARY KEY,
      space_id TEXT NOT NULL REFERENCES spaces(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      data TEXT NOT NULL,
      is_default INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS maps_space ON maps(space_id);
    CREATE TABLE IF NOT EXISTS memberships (
      space_id TEXT NOT NULL REFERENCES spaces(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      role TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      PRIMARY KEY (space_id, user_id)
    );
    CREATE TABLE IF NOT EXISTS invites (
      token TEXT PRIMARY KEY,
      space_id TEXT NOT NULL REFERENCES spaces(id) ON DELETE CASCADE,
      role TEXT NOT NULL DEFAULT 'member',
      created_by TEXT NOT NULL,
      expires_at INTEGER,
      max_uses INTEGER,
      uses INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS bans (
      space_id TEXT NOT NULL REFERENCES spaces(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL,
      reason TEXT,
      created_at INTEGER NOT NULL,
      PRIMARY KEY (space_id, user_id)
    );
    CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      space_id TEXT NOT NULL REFERENCES spaces(id) ON DELETE CASCADE,
      map_id TEXT,
      scope TEXT NOT NULL,
      from_user TEXT NOT NULL,
      from_name TEXT NOT NULL,
      from_color TEXT NOT NULL,
      to_user TEXT,
      recipients TEXT,
      text TEXT NOT NULL,
      ts INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS messages_space_ts ON messages(space_id, ts);
    CREATE TABLE IF NOT EXISTS object_state (
      space_id TEXT NOT NULL REFERENCES spaces(id) ON DELETE CASCADE,
      key TEXT NOT NULL,
      value TEXT NOT NULL,
      updated_at INTEGER NOT NULL,
      PRIMARY KEY (space_id, key)
    );
  `);
}

export const now = () => Date.now();
export function uid(prefix = "") {
  return prefix + Array.from(crypto.getRandomValues(new Uint8Array(12)), (b) => b.toString(16).padStart(2, "0")).join("");
}
