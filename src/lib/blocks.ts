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

function inlineText(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .map((node) => {
      if (typeof node === "string") return node;
      if (!node || typeof node !== "object") return "";
      const n = node as { type?: string; text?: string; content?: unknown };
      if (typeof n.text === "string") return n.text;
      if (n.content) return inlineText(n.content);
      return "";
    })
    .join("");
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

export function parseContent(contentJson: string): unknown[] {
  try {
    const parsed = JSON.parse(contentJson);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}
