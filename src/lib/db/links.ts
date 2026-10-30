import "server-only";
import { extractLinks } from "../blocks";
import type { Backlink } from "../types";
import { db } from "./connection";

/**
 * The link graph between pages.
 *
 * Links are extracted on the server, inside the same transaction that writes
 * the document. That makes the database the only source of truth and covers
 * every write path — the editor, the AI, duplication, seeding — without each
 * of them remembering to do it. Doing it in the browser would also run while
 * AI suggestions are still on screen, recording links the user has not
 * accepted yet.
 */

/** Replaces every link recorded for a page. Call inside the content transaction. */
export function replaceLinks(sourceId: string, content: unknown): void {
  db.prepare("DELETE FROM page_links WHERE source_id = ?").run(sourceId);

  const links = extractLinks(content);
  if (links.length === 0) return;

  const insert = db.prepare(
    "INSERT OR REPLACE INTO page_links (source_id, target_id, kind, context) VALUES (?, ?, ?, ?)",
  );
  for (const link of links) {
    // A page linking to itself is not a backlink, and a link to a page that
    // has been purged would break the foreign key.
    if (link.targetId === sourceId) continue;
    const exists = db.prepare("SELECT 1 AS hit FROM pages WHERE id = ?").get(link.targetId);
    if (!exists) continue;
    insert.run(sourceId, link.targetId, link.kind, link.context);
  }
}

/** The live pages that point at this one. */
export function getBacklinks(targetId: string): Backlink[] {
  const rows = db
    .prepare(
      `SELECT p.id, p.title, p.icon, p.updated_at, l.kind, l.context
         FROM page_links l JOIN pages p ON p.id = l.source_id
        WHERE l.target_id = ? AND l.source_id <> ? AND p.deleted_at IS NULL
        ORDER BY p.updated_at DESC`,
    )
    .all(targetId, targetId) as {
    id: string;
    title: string;
    icon: string | null;
    updated_at: number;
    kind: "mention" | "link";
    context: string;
  }[];

  return rows.map((row) => ({
    id: row.id,
    title: row.title,
    icon: row.icon,
    updatedAt: row.updated_at,
    kind: row.kind,
    context: row.context,
  }));
}
