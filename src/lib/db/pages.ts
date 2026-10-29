import "server-only";
import { randomUUID } from "node:crypto";
import { blocksToPlainText, parseContent } from "../blocks";
import type { Page, PageRow, PageSummary, PageTreeNode, SearchHit } from "../types";
import { db } from "./connection";

/** Thrown when an update targets a version of the page that is no longer current. */
export class VersionConflictError extends Error {
  readonly code = "version_conflict";
  constructor(readonly current: Page) {
    super("這一頁在別的地方被修改過");
    this.name = "VersionConflictError";
  }
}

/** The columns a summary needs, in the order the mappers below expect. */
const SUMMARY_COLUMNS = "id, parent_id, title, icon, sort_order, updated_at";

type SummaryRow = Pick<PageRow, "id" | "parent_id" | "title" | "icon" | "sort_order" | "updated_at">;

function toSummary(row: SummaryRow): PageSummary {
  return {
    id: row.id,
    parentId: row.parent_id,
    title: row.title,
    icon: row.icon,
    sortOrder: row.sort_order,
    updatedAt: row.updated_at,
  };
}

function toPage(row: PageRow): Page {
  return {
    id: row.id,
    parentId: row.parent_id,
    title: row.title,
    icon: row.icon,
    content: parseContent(row.content_json),
    sortOrder: row.sort_order,
    version: row.version,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function getPage(id: string): Page | null {
  const row = db
    .prepare("SELECT * FROM pages WHERE id = ? AND deleted_at IS NULL")
    .get(id) as PageRow | undefined;
  return row ? toPage(row) : null;
}

export function listPages(): PageSummary[] {
  const rows = db
    .prepare(
      `SELECT ${SUMMARY_COLUMNS}
       FROM pages WHERE deleted_at IS NULL
       ORDER BY sort_order ASC, created_at ASC`,
    )
    .all() as SummaryRow[];
  return rows.map(toSummary);
}

export function listTree(): PageTreeNode[] {
  const nodes = new Map<string, PageTreeNode>();
  const pages = listPages();
  for (const page of pages) nodes.set(page.id, { ...page, children: [] });

  const roots: PageTreeNode[] = [];
  for (const page of pages) {
    const node = nodes.get(page.id)!;
    const parent = page.parentId ? nodes.get(page.parentId) : undefined;
    if (parent) parent.children.push(node);
    else roots.push(node);
  }
  return roots;
}

export function listRecent(limit = 12): PageSummary[] {
  const rows = db
    .prepare(
      `SELECT ${SUMMARY_COLUMNS}
       FROM pages WHERE deleted_at IS NULL
       ORDER BY updated_at DESC LIMIT ?`,
    )
    .all(limit) as SummaryRow[];
  return rows.map(toSummary);
}

export function createPage(
  input: { title?: string; parentId?: string | null; icon?: string | null } = {},
): Page {
  const now = Date.now();
  const id = randomUUID();
  const parentId = input.parentId ?? null;

  // Reading MAX(sort_order) and inserting have to be one unit, or two pages
  // created at the same moment both land on the same position.
  const insert = db.transaction(() => {
    const { next } = db
      .prepare(
        `SELECT COALESCE(MAX(sort_order), 0) + 1 AS next FROM pages
         WHERE deleted_at IS NULL AND parent_id IS ?`,
      )
      .get(parentId) as { next: number };

    db.prepare(
      `INSERT INTO pages (id, parent_id, title, icon, content_json, plain_text, sort_order, version, created_at, updated_at)
       VALUES (?, ?, ?, ?, '[]', '', ?, 0, ?, ?)`,
    ).run(id, parentId, input.title ?? "", input.icon ?? null, next, now, now);
  });
  insert();

  return getPage(id)!;
}

/**
 * Applies a patch to a page and bumps its version.
 *
 * Pass `expectedVersion` to make the write conditional: if the page has moved
 * on since the caller last read it, nothing is written and a
 * `VersionConflictError` carrying the current page is thrown. Omitting it keeps
 * the older unconditional behaviour, which is what seeding wants.
 */
export function updatePage(
  id: string,
  patch: { title?: string; icon?: string | null; content?: unknown[]; parentId?: string | null },
  expectedVersion?: number,
): Page | null {
  const apply = db.transaction((): Page | null => {
    const existing = getPage(id);
    if (!existing) return null;

    const sets: string[] = [];
    const values: unknown[] = [];

    if (patch.title !== undefined) {
      sets.push("title = ?");
      values.push(patch.title);
    }
    if (patch.icon !== undefined) {
      sets.push("icon = ?");
      values.push(patch.icon);
    }
    if (patch.parentId !== undefined) {
      if (patch.parentId !== null && isDescendant(patch.parentId, id)) {
        throw new Error("Cannot move a page inside one of its own children");
      }
      sets.push("parent_id = ?");
      values.push(patch.parentId);
    }
    if (patch.content !== undefined) {
      sets.push("content_json = ?", "plain_text = ?");
      values.push(JSON.stringify(patch.content), blocksToPlainText(patch.content));
    }

    if (sets.length === 0) return existing;

    // `version` tracks the document body, not the row. Title, icon and parent
    // live in their own columns and never clobber the content, so bumping the
    // version for them would only make the editor report false conflicts.
    if (patch.content !== undefined) sets.push("version = version + 1");

    sets.push("updated_at = ?");
    values.push(Date.now(), id);

    let sql = `UPDATE pages SET ${sets.join(", ")} WHERE id = ?`;
    if (expectedVersion !== undefined) {
      sql += " AND version = ?";
      values.push(expectedVersion);
    }

    const { changes } = db.prepare(sql).run(...values);
    if (changes === 0) throw new VersionConflictError(existing);

    return getPage(id);
  });

  return apply();
}

/** True when `candidate` is `ancestor` itself or sits somewhere below it. */
export function isDescendant(candidate: string, ancestor: string): boolean {
  let current: string | null = candidate;
  const seen = new Set<string>();
  while (current) {
    if (current === ancestor) return true;
    if (seen.has(current)) return false;
    seen.add(current);
    const row = db.prepare("SELECT parent_id FROM pages WHERE id = ?").get(current) as
      | { parent_id: string | null }
      | undefined;
    current = row?.parent_id ?? null;
  }
  return false;
}

/** Soft-deletes a page and everything nested under it. */
export function deletePage(id: string): boolean {
  const now = Date.now();
  const ids: string[] = [];
  const queue = [id];
  while (queue.length > 0) {
    const current = queue.shift()!;
    ids.push(current);
    const children = db
      .prepare("SELECT id FROM pages WHERE parent_id = ? AND deleted_at IS NULL")
      .all(current) as { id: string }[];
    queue.push(...children.map((c) => c.id));
  }

  const stmt = db.prepare("UPDATE pages SET deleted_at = ? WHERE id = ? AND deleted_at IS NULL");
  const run = db.transaction((targets: string[]) => {
    let changed = 0;
    for (const target of targets) changed += stmt.run(now, target).changes;
    return changed;
  });
  return run(ids) > 0;
}

export function searchPages(query: string, limit = 10): SearchHit[] {
  const q = query.trim();
  if (!q) return [];
  const like = `%${q}%`;
  const rows = db
    .prepare(
      `SELECT id, title, icon, plain_text FROM pages
       WHERE deleted_at IS NULL AND (title LIKE ? OR plain_text LIKE ?)
       ORDER BY updated_at DESC LIMIT ?`,
    )
    .all(like, like, limit) as { id: string; title: string; icon: string | null; plain_text: string }[];

  return rows.map((row) => {
    const index = row.plain_text.toLowerCase().indexOf(q.toLowerCase());
    const start = Math.max(0, index - 40);
    const snippet =
      index === -1
        ? row.plain_text.slice(0, 120)
        : `${start > 0 ? "…" : ""}${row.plain_text.slice(start, index + q.length + 80)}`;
    return { id: row.id, title: row.title, icon: row.icon, snippet: snippet.replace(/\n+/g, " ") };
  });
}

const WELCOME_BLOCKS = [
  { type: "heading", props: { level: 2 }, content: "歡迎使用" },
  { type: "paragraph", content: "這是一個本機單人版的 Notion 仿作，AI 功能直接串 Claude API。" },
  { type: "heading", props: { level: 3 }, content: "三種用 AI 的方式" },
  { type: "bulletListItem", content: "在空白行輸入 / 叫出指令選單，選 Ask AI 讓它直接生成內容。" },
  { type: "bulletListItem", content: "選取一段文字，工具列最左邊的 Ask AI 可以改寫、延伸、翻譯。" },
  { type: "bulletListItem", content: "右側對話面板可以讀這一頁、搜尋其他頁面，也能提議修改這一頁。" },
  { type: "paragraph", content: "AI 的每一次修改都會先標示出來，按下接受才會真的寫入。" },
];

/** Gives a brand new database one page so the workspace is never empty. */
export function ensureSeeded(): void {
  const { count } = db.prepare("SELECT COUNT(*) AS count FROM pages").get() as { count: number };
  if (count > 0) return;
  const page = createPage({ title: "快速開始", icon: "👋" });
  updatePage(page.id, { content: WELCOME_BLOCKS });
}
