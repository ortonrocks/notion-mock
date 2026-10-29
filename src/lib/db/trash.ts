import "server-only";
import type { TrashEntry } from "../types";
import { db } from "./connection";
import { hasOrderCollision, rebalanceSiblings } from "./ordering";

/**
 * The trash.
 *
 * Deleting is soft: the row stays, with `deleted_at` set and `trash_root_id`
 * pointing at the page whose deletion caused it. Only the page the user
 * actually deleted is listed — its descendants went down with it and come back
 * with it.
 */

/** Thrown when a restore targets a page that was only deleted as a descendant. */
export class NotATrashRootError extends Error {
  readonly code = "not_a_trash_root";
  constructor(readonly root: { id: string; title: string } | null) {
    super("這一頁是跟著上層一起被刪除的，請還原那一頁");
    this.name = "NotATrashRootError";
  }
}

export function listTrash(): TrashEntry[] {
  const rows = db
    .prepare(
      `SELECT p.id, p.title, p.icon, p.deleted_at,
              (SELECT COUNT(*) FROM pages c
                WHERE c.trash_root_id = p.id AND c.id <> p.id) AS descendants
       FROM pages p
       WHERE p.deleted_at IS NOT NULL AND p.trash_root_id = p.id
       ORDER BY p.deleted_at DESC`,
    )
    .all() as { id: string; title: string; icon: string | null; deleted_at: number; descendants: number }[];

  return rows.map((row) => ({
    id: row.id,
    title: row.title,
    icon: row.icon,
    deletedAt: row.deleted_at,
    descendants: row.descendants,
  }));
}

/**
 * Brings a trashed page and everything that went down with it back.
 *
 * Returns whether the page had to be re-homed: if its parent is still in the
 * trash, putting it back where it was would hide it, so it goes to the root
 * and the caller gets to say so.
 */
export function restorePage(id: string): { restored: number; reHomed: boolean } {
  const run = db.transaction(() => {
    const row = db
      .prepare(
        "SELECT id, parent_id, trash_root_id, deleted_at FROM pages WHERE id = ? AND deleted_at IS NOT NULL",
      )
      .get(id) as
      | { id: string; parent_id: string | null; trash_root_id: string | null; deleted_at: number }
      | undefined;

    if (!row) return null;

    if (row.trash_root_id !== id) {
      const root = row.trash_root_id
        ? (db.prepare("SELECT id, title FROM pages WHERE id = ?").get(row.trash_root_id) as
            | { id: string; title: string }
            | undefined)
        : undefined;
      throw new NotATrashRootError(root ?? null);
    }

    // A parent that is still trashed would swallow the page again.
    const parentAlive =
      row.parent_id === null ||
      db.prepare("SELECT 1 AS alive FROM pages WHERE id = ? AND deleted_at IS NULL").get(row.parent_id) !==
        undefined;

    const { changes } = db
      .prepare("UPDATE pages SET deleted_at = NULL, trash_root_id = NULL WHERE trash_root_id = ?")
      .run(id);

    const parentId = parentAlive ? row.parent_id : null;
    if (!parentAlive) {
      db.prepare("UPDATE pages SET parent_id = NULL WHERE id = ?").run(id);
    }

    // `createPage` reserves a trashed page's number, so a collision should not
    // happen. Checking anyway costs one indexed lookup and covers rows that
    // predate that fix.
    if (hasOrderCollision(parentId, id)) rebalanceSiblings(parentId);

    return { restored: changes, reHomed: !parentAlive };
  });

  return run() ?? { restored: 0, reHomed: false };
}

/** Deletes a trashed page and its subtree for good. */
export function purgePage(id: string): number {
  const run = db.transaction(() => {
    const ids = db
      .prepare("SELECT id FROM pages WHERE trash_root_id = ? AND deleted_at IS NOT NULL")
      .all(id) as { id: string }[];
    if (ids.length === 0) return 0;

    // Deleting the root first would cascade through the parent_id foreign key
    // anyway, but doing it explicitly keeps the count honest.
    const remove = db.prepare("DELETE FROM pages WHERE id = ?");
    let removed = 0;
    for (const row of ids) removed += remove.run(row.id).changes;
    return removed;
  });
  return run();
}

export function emptyTrash(): number {
  const run = db.transaction(() => {
    const { changes } = db.prepare("DELETE FROM pages WHERE deleted_at IS NOT NULL").run();
    return changes;
  });
  return run();
}
