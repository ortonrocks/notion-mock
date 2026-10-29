import "server-only";
import fs from "node:fs";
import path from "node:path";
import type Database from "better-sqlite3";

/**
 * Schema migrations, driven by `PRAGMA user_version`.
 *
 * Two rules keep this honest:
 *
 *   1. A step is never edited once it has shipped. Changing your mind means
 *      appending another step. Someone's database has already run the old one.
 *   2. A step must not import anything from the rest of `src/lib`. A step
 *      encodes the schema as it was at one moment in history; calling
 *      `createPage()` from one breaks on the day `createPage` changes.
 */
export type Migration = {
  version: number;
  name: string;
  up: (db: Database.Database) => void;
};

/** The schema as it shipped before migrations were versioned. */
const BASELINE = `
CREATE TABLE IF NOT EXISTS pages (
  id           TEXT PRIMARY KEY,
  parent_id    TEXT REFERENCES pages(id) ON DELETE CASCADE,
  title        TEXT NOT NULL DEFAULT '',
  icon         TEXT,
  content_json TEXT NOT NULL DEFAULT '[]',
  plain_text   TEXT NOT NULL DEFAULT '',
  sort_order   REAL NOT NULL DEFAULT 0,
  version      INTEGER NOT NULL DEFAULT 0,
  created_at   INTEGER NOT NULL,
  updated_at   INTEGER NOT NULL,
  deleted_at   INTEGER
);
CREATE INDEX IF NOT EXISTS pages_parent_idx ON pages(parent_id, sort_order);
CREATE INDEX IF NOT EXISTS pages_updated_idx ON pages(updated_at DESC);

CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS _migrations (
  version    INTEGER PRIMARY KEY,
  name       TEXT NOT NULL,
  applied_at INTEGER NOT NULL
);
`;

export const MIGRATIONS: Migration[] = [
  {
    version: 1,
    name: "baseline",
    up: (db) => {
      db.exec(BASELINE);
      // The one ad-hoc check from before this runner existed. It is the only
      // thing that can rescue a database created before `version` was added,
      // so it stays, verbatim, as part of reaching version 1.
      const columns = (db.prepare("PRAGMA table_info(pages)").all() as { name: string }[]).map(
        (column) => column.name,
      );
      if (!columns.includes("version")) {
        db.exec("ALTER TABLE pages ADD COLUMN version INTEGER NOT NULL DEFAULT 0");
      }
    },
  },
  {
    version: 2,
    name: "trash-roots",
    up: (db) => {
      // Which page's deletion put this row in the trash. A row is a trash
      // *entry* when it points at itself, and restoring one is a single
      // indexed lookup for everything that went down with it. Without it,
      // deleting a subtree is indistinguishable from deleting each page in
      // it, and restore cannot tell what to bring back.
      db.exec("ALTER TABLE pages ADD COLUMN trash_root_id TEXT");
      db.exec(
        "CREATE INDEX IF NOT EXISTS pages_trash_idx ON pages(trash_root_id) WHERE deleted_at IS NOT NULL",
      );

      // Pages trashed before this column existed have no root recorded.
      // Treating each as its own entry is the only answer that loses nothing:
      // they all show up in the trash and can each be restored.
      db.exec("UPDATE pages SET trash_root_id = id WHERE deleted_at IS NOT NULL");
    },
  },
];

const TARGET_VERSION = MIGRATIONS.reduce((max, step) => Math.max(max, step.version), 0);
const BACKUPS_TO_KEEP = 5;

function currentVersion(db: Database.Database): number {
  return db.pragma("user_version", { simple: true }) as number;
}

/**
 * Copies the database before the first step runs.
 *
 * `VACUUM INTO` rather than copying the file: it is synchronous, it is a
 * consistent snapshot, and it folds in the `-wal` file. Copying `notion.db`
 * alone would produce a backup missing every recent write.
 */
function backup(db: Database.Database, file: string, from: number) {
  const dir = path.join(path.dirname(file), "backups");
  fs.mkdirSync(dir, { recursive: true });

  // `VACUUM INTO` refuses to overwrite, and more than one process can reach
  // this line in the same second, so the name needs more than a timestamp.
  const stamp = new Date().toISOString().replace(/[-:T]/g, "").slice(0, 14);
  const target = path.join(dir, `notion-v${from}-${stamp}-${process.pid}.db`);
  db.prepare("VACUUM INTO ?").run(target);

  const old = fs
    .readdirSync(dir)
    .filter((name) => /^notion-v\d+-\d+\.db$/.test(name))
    .sort()
    .slice(0, -BACKUPS_TO_KEEP);
  for (const name of old) {
    try {
      fs.rmSync(path.join(dir, name));
    } catch {
      /* a backup we cannot delete is not worth failing a migration over */
    }
  }
  return target;
}

/**
 * Brings the database up to the latest version. Call once, from
 * `openDatabase()`, before any statement is prepared.
 */
export function runMigrations(db: Database.Database, file: string): void {
  // Neither pragma can be set inside a transaction, so both happen out here.
  // Foreign keys go off because the table-rebuild dance SQLite needs for some
  // column changes trips them while the new table is still empty.
  db.pragma("foreign_keys = OFF");

  try {
    const from = currentVersion(db);
    if (from >= TARGET_VERSION) return;

    // Version 0 is a database with nothing in it worth saving.
    //
    // A failed backup must not stop the upgrade. `next` runs several workers
    // against this file and they all arrive here; the one that loses the race
    // would otherwise throw on import and take the route down with it. The
    // migration itself is safe either way — each step re-checks the version
    // while holding the write lock.
    if (from > 0) {
      try {
        const target = backup(db, file, from);
        console.log(`[db] 升級 v${from} → v${TARGET_VERSION}，已備份到 ${target}`);
      } catch (cause) {
        console.warn(`[db] 升級前備份失敗，繼續升級：${cause instanceof Error ? cause.message : cause}`);
      }
    }

    for (const step of MIGRATIONS) {
      if (step.version <= from) continue;

      // IMMEDIATE takes the write lock before `user_version` is read again.
      // `next dev` runs more than one worker against this file; with a
      // deferred transaction both could read the same version and both try to
      // apply the same step. The loser here waits on busy_timeout instead.
      const apply = db.transaction(() => {
        if (currentVersion(db) >= step.version) return;
        step.up(db);
        db.prepare("INSERT OR REPLACE INTO _migrations (version, name, applied_at) VALUES (?, ?, ?)").run(
          step.version,
          step.name,
          Date.now(),
        );
        db.pragma(`user_version = ${step.version}`);
      });
      apply.immediate();
    }
  } finally {
    db.pragma("foreign_keys = ON");
    const broken = db.pragma("foreign_key_check") as unknown[];
    if (broken.length > 0) {
      console.error(`[db] 遷移後有 ${broken.length} 筆外鍵不一致`, broken.slice(0, 5));
    }
  }
}
