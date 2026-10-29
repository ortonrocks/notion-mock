import "server-only";
import { db } from "./connection";

/**
 * Sibling ordering.
 *
 * `sort_order` is a REAL so a page can be dropped between two others without
 * renumbering the rest — the new position is just the midpoint. Floats run out
 * of room eventually, which is what the rebalance is for.
 */

/**
 * Renumbers a parent's children to 1, 2, 3 … in their current order.
 *
 * Trashed siblings are renumbered too, and that is the point: they still hold
 * a position, and restoring one must not collide with a live page.
 *
 * Callers are expected to already be inside a transaction.
 */
export function rebalanceSiblings(parentId: string | null): void {
  const siblings = db
    .prepare(
      `SELECT id FROM pages WHERE parent_id IS ?
       ORDER BY sort_order ASC, created_at ASC`,
    )
    .all(parentId) as { id: string }[];

  const update = db.prepare("UPDATE pages SET sort_order = ? WHERE id = ?");
  siblings.forEach((sibling, index) => update.run(index + 1, sibling.id));
}

/** True when some other page under the same parent already sits on this number. */
export function hasOrderCollision(parentId: string | null, id: string): boolean {
  const row = db
    .prepare(
      `SELECT 1 AS hit FROM pages
       WHERE parent_id IS ? AND id <> ?
         AND sort_order = (SELECT sort_order FROM pages WHERE id = ?)
       LIMIT 1`,
    )
    .get(parentId, id, id) as { hit: number } | undefined;
  return row !== undefined;
}
