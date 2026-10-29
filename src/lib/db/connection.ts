import "server-only";
import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { runMigrations } from "./migrations";

function openDatabase() {
  const file = process.env.NOTION_MOCK_DB ?? path.join(process.cwd(), "data", "notion.db");
  fs.mkdirSync(path.dirname(file), { recursive: true });

  const db = new Database(file);
  db.pragma("journal_mode = WAL");
  // Next spawns more than one worker in dev, so two processes can hold the same
  // file. Without this a writer that finds the lock taken fails immediately
  // instead of waiting for it.
  db.pragma("busy_timeout = 5000");

  // Creates the schema on a new file and upgrades an existing one. Runs before
  // anything prepares a statement, and leaves `foreign_keys` ON.
  runMigrations(db, file);

  return db;
}

// `next dev` re-evaluates modules on every hot reload; without this each reload
// would open (and leak) another handle on the same file.
const globalForDb = globalThis as unknown as { __notionMockDb?: Database.Database };

export const db = globalForDb.__notionMockDb ?? openDatabase();
globalForDb.__notionMockDb = db;
