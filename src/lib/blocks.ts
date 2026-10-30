/**
 * Server-side helpers for reading BlockNote documents.
 *
 * The editor stores its document as a JSON block array. The server never loads
 * BlockNote itself, so these walk the JSON directly.
 */

type AnyBlock = {
  id?: string;
  type?: string;
  props?: Record<string, unknown>;
  content?: unknown;
  children?: AnyBlock[];
};

type InlineNode = {
  type?: string;
  text?: string;
  href?: string;
  props?: Record<string, unknown>;
  content?: unknown;
};

/** What a caller wants out of a run of inline content. */
type InlineVisitor = {
  text?: (text: string) => void;
  link?: (href: string, label: string) => void;
  mention?: (pageId: string, label: string) => void;
};

/**
 * Walks a run of inline content, reporting each piece.
 *
 * Everything that reads inline content goes through here. The alternative —
 * one function per use — is how `href` came to be dropped silently: the text
 * extractor recursed into a link's content for its label and never looked at
 * where it pointed, so nothing downstream could see a link at all.
 */
function walkInline(content: unknown, visit: InlineVisitor): void {
  if (typeof content === "string") {
    visit.text?.(content);
    return;
  }
  if (!Array.isArray(content)) return;

  for (const node of content) {
    if (typeof node === "string") {
      visit.text?.(node);
      continue;
    }
    if (!node || typeof node !== "object") continue;
    const inline = node as InlineNode;

    if (inline.type === "mention") {
      const pageId = typeof inline.props?.pageId === "string" ? inline.props.pageId : "";
      const label = typeof inline.props?.label === "string" ? inline.props.label : "";
      visit.mention?.(pageId, label);
      // A mention is an atom: its label is the whole of it.
      visit.text?.(label);
      continue;
    }

    if (typeof inline.href === "string") {
      let label = "";
      walkInline(inline.content, { text: (part) => (label += part) });
      visit.link?.(inline.href, label);
      visit.text?.(label);
      continue;
    }

    if (typeof inline.text === "string") {
      visit.text?.(inline.text);
      continue;
    }
    if (inline.content) walkInline(inline.content, visit);
  }
}

function inlineText(content: unknown): string {
  let out = "";
  walkInline(content, { text: (part) => (out += part) });
  return out;
}

function blockToMarkdown(block: AnyBlock, depth: number): string[] {
  const indent = "  ".repeat(depth);
  const text = inlineText(block.content);
  const lines: string[] = [];

  switch (block.type) {
    case "heading": {
      const level = Number(block.props?.level ?? 1);
      lines.push(`${"#".repeat(Math.min(Math.max(level, 1), 6))} ${text}`);
      break;
    }
    case "bulletListItem":
      lines.push(`${indent}- ${text}`);
      break;
    case "numberedListItem":
      lines.push(`${indent}1. ${text}`);
      break;
    case "checkListItem":
      lines.push(`${indent}- [${block.props?.checked ? "x" : " "}] ${text}`);
      break;
    case "codeBlock":
      lines.push("```" + String(block.props?.language ?? ""), text, "```");
      break;
    case "quote":
      lines.push(`> ${text}`);
      break;
    case "math":
      // The equation block keeps its LaTeX in props, not in inline content.
      lines.push("$$", String(block.props?.latex ?? ""), "$$");
      break;
    case "image":
      lines.push(`![${String(block.props?.caption ?? "")}](${String(block.props?.url ?? "")})`);
      break;
    case "table":
      lines.push(tableToMarkdown(block.content));
      break;
    default:
      lines.push(text);
  }

  for (const child of block.children ?? []) {
    lines.push(...blockToMarkdown(child, depth + 1));
  }
  return lines;
}

function tableToMarkdown(content: unknown): string {
  const rows = (content as { rows?: { cells?: unknown[] }[] } | undefined)?.rows ?? [];
  if (rows.length === 0) return "";
  const render = (cells: unknown[]) => `| ${cells.map((c) => inlineText(c)).join(" | ")} |`;
  const [header, ...rest] = rows;
  const headerCells = header.cells ?? [];
  return [
    render(headerCells),
    `|${headerCells.map(() => " --- ").join("|")}|`,
    ...rest.map((r) => render(r.cells ?? [])),
  ].join("\n");
}

/** Renders a stored document as markdown, for AI context and search snippets. */
export function blocksToMarkdown(content: unknown): string {
  if (!Array.isArray(content)) return "";
  return (content as AnyBlock[])
    .flatMap((block) => blockToMarkdown(block, 0))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Flat text used for the sidebar search index. */
export function blocksToPlainText(content: unknown): string {
  if (!Array.isArray(content)) return "";
  const walk = (blocks: AnyBlock[]): string[] =>
    blocks.flatMap((b) => [
      b.type === "math" ? String(b.props?.latex ?? "") : inlineText(b.content),
      ...walk(b.children ?? []),
    ]);
  return walk(content as AnyBlock[]).filter(Boolean).join("\n");
}

/** A reference from one page to another, found in a document. */
export type ExtractedLink = {
  targetId: string;
  kind: "mention" | "link";
  /** The surrounding block's text, so a backlink reads as more than a title. */
  context: string;
};

/** `/page/<uuid>`, which is what an internal link looks like once pasted. */
const INTERNAL_HREF = /^\/page\/([0-9a-f-]{36})$/;

const CONTEXT_LIMIT = 140;

/**
 * Finds every page this document points at.
 *
 * Hand-typed and pasted internal links count, not just `@` mentions — people
 * expect a link they pasted to show up as a backlink, and recognising one is a
 * single regex.
 *
 * A page can be referenced more than once; the strongest kind wins, so a page
 * both mentioned and linked is reported as a mention.
 */
export function extractLinks(content: unknown): ExtractedLink[] {
  if (!Array.isArray(content)) return [];
  const found = new Map<string, ExtractedLink>();

  const record = (targetId: string, kind: "mention" | "link", context: string) => {
    if (!targetId) return;
    const existing = found.get(targetId);
    if (existing && (existing.kind === "mention" || kind === "link")) return;
    found.set(targetId, { targetId, kind, context });
  };

  const walk = (blocks: AnyBlock[]) => {
    for (const block of blocks) {
      const context = inlineText(block.content).trim().slice(0, CONTEXT_LIMIT);
      walkInline(block.content, {
        mention: (pageId) => record(pageId, "mention", context),
        link: (href) => {
          const match = INTERNAL_HREF.exec(href);
          if (match) record(match[1], "link", context);
        },
      });
      walk(block.children ?? []);
    }
  };

  walk(content as AnyBlock[]);
  return [...found.values()];
}

export function parseContent(contentJson: string): unknown[] {
  try {
    const parsed = JSON.parse(contentJson);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}
