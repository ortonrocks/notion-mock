/**
 * Tidies up what the in-editor AI leaves behind.
 *
 * The AI speaks HTML, which costs it two things this editor can do:
 *
 *   - A markdown table in its answer round-trips into a table block with no
 *     cells, which shows up as an empty 1x1 box.
 *   - There is no HTML for an equation, so a formula arrives as `$$...$$`
 *     sitting in a paragraph as literal text.
 *
 * Both are cheap to repair once the changes have been accepted, which is what
 * this does. It only ever touches blocks the AI just wrote.
 */

import type { AppEditor } from "./editor-schema";

type Inline = { type?: string; text?: string };

type TableRow = { cells: unknown[] };

type AnyBlock = {
  id: string;
  type: string;
  content?: unknown;
  children?: AnyBlock[];
};

/** A paragraph that is nothing but one display equation. */
const DISPLAY_MATH = /^\s*(?:\$\$([\s\S]+?)\$\$|\\\[([\s\S]+?)\\\])\s*$/;

function plainText(content: unknown): string {
  if (!Array.isArray(content)) return "";
  return content
    .map((node) => (typeof node === "string" ? node : ((node as Inline)?.text ?? "")))
    .join("");
}

/** Walks the document depth-first; blocks nest, and the AI writes inside lists. */
function everyBlock(blocks: AnyBlock[], visit: (block: AnyBlock) => void) {
  for (const block of blocks) {
    visit(block);
    if (block.children?.length) everyBlock(block.children, visit);
  }
}

function isEmptyTable(block: AnyBlock): boolean {
  if (block.type !== "table") return false;
  const rows = (block.content as { rows?: TableRow[] } | undefined)?.rows;
  if (!rows || rows.length === 0) return true;
  // A 1x1 table whose only cell has no text is the shape the conversion
  // produces. A table the user is still filling in has more than one cell.
  const cells = rows.flatMap((row) => row.cells ?? []);
  return cells.every((cell) => {
    const content = Array.isArray(cell) ? cell : (cell as { content?: unknown })?.content;
    return plainText(content).trim() === "";
  });
}

/**
 * Returns how many blocks were changed, so the caller can skip a save when
 * there was nothing to do.
 */
export function cleanUpAfterAI(editor: AppEditor): number {
  const emptyTables: string[] = [];
  const equations: { id: string; latex: string }[] = [];

  // The walk only needs ids, types and content, and the schema's own block
  // union is far more specific than that. One cast here beats threading the
  // full generic through every helper.
  everyBlock(editor.document as unknown as AnyBlock[], (block) => {
    if (isEmptyTable(block)) {
      emptyTables.push(block.id);
      return;
    }
    if (block.type !== "paragraph") return;
    const match = DISPLAY_MATH.exec(plainText(block.content));
    if (match) equations.push({ id: block.id, latex: (match[1] ?? match[2]).trim() });
  });

  for (const { id, latex } of equations) {
    editor.replaceBlocks([id], [{ type: "math", props: { latex } }]);
  }
  if (emptyTables.length > 0) editor.removeBlocks(emptyTables);

  return emptyTables.length + equations.length;
}
