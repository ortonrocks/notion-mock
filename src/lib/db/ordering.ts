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

/** The smallest gap worth trusting before float precision stops splitting it. */
const MIN_GAP = 1e-9;

/**
 * The `sort_order` for a page dropped between two neighbours.
 *
 * Neighbours rather than an index, because the client's copy of the tree can
 * be stale and only the database knows the real numbers. Pass the ids of the
 * pages it should land after and before; either may be null at an end.
 *
 * Rebalances that parent first if the gap has run out, which takes about fifty
 * consecutive drops into the same spot.
 *
 * Callers are expected to already be inside a transaction.
 */
export function orderBetween(
  parentId: string | null,
  afterId: string | null,
  beforeId: string | null,
): number {
  const read = (id: string | null): number | null => {
    if (!id) return null;
    const row = db.prepare("SELECT sort_order FROM pages WHERE id = ?").get(id) as
      | { sort_order: number }
      | undefined;
    return row?.sort_order ?? null;
  };

  const compute = () => {
    const prev = read(afterId);
    const next = read(beforeId);

    if (prev !== null && next !== null) return (prev + next) / 2;
    if (prev !== null) return prev + 1;
    if (next !== null) return next - 1;

    const row = db
      .prepare("SELECT COALESCE(MAX(sort_order), 0) + 1 AS next FROM pages WHERE parent_id IS ?")
      .get(parentId) as { next: number };
    return row.next;
  };

  const candidate = compute();
  const prev = read(afterId);
  const next = read(beforeId);

  const exhausted =
    prev !== null && next !== null && (candidate === prev || candidate === next || Math.abs(next - prev) < MIN_GAP);

  if (!exhausted) return candidate;

  rebalanceSiblings(parentId);
  return compute();
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
