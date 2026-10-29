import "server-only";
import type Anthropic from "@anthropic-ai/sdk";
import { blocksToMarkdown } from "@/lib/blocks";
import { getPage, searchPages } from "@/lib/db";
import { loadImagesFromText } from "./images";
import type { Page } from "@/lib/types";

/**
 * Tools the sidebar agent can call.
 *
 * Read access spans the whole workspace; write access is deliberately limited
 * to a proposal on the page the user currently has open. `propose_edit` never
 * touches the database — it hands an instruction back to the browser, which
 * runs it through the editor's suggestion flow so the user can accept or
 * reject the diff.
 */
export const AGENT_TOOLS: Anthropic.Tool[] = [
  {
    name: "read_current_page",
    description:
      "Read the page the user currently has open: its full markdown, plus every image it embeds as actual image input you can look at. Call this before answering anything about 'this page', before summarising it, and before proposing an edit.",
    input_schema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "search_pages",
    description:
      "Search titles and body text of every page in the workspace. Returns matching page ids with a short snippet. Read-only.",
    input_schema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Keywords to look for. Supports any language." },
      },
      required: ["query"],
      additionalProperties: false,
    },
    strict: true,
  },
  {
    name: "read_page",
    description:
      "Read another page by id, using an id returned by search_pages: its markdown plus the images it embeds. Read-only — other pages can never be modified.",
    input_schema: {
      type: "object",
      properties: { page_id: { type: "string" } },
      required: ["page_id"],
      additionalProperties: false,
    },
    strict: true,
  },
  {
    name: "propose_edit",
    description:
      "Propose a change to the page the user currently has open. The change is NOT applied: it is shown in the editor as a highlighted diff that the user accepts or rejects. Pass one clear, self-contained instruction describing exactly what to change, written in the document's own language.",
    input_schema: {
      type: "object",
      properties: {
        instruction: {
          type: "string",
          description:
            "A complete editing instruction, e.g. 'Add a conclusion paragraph at the end summarising the three arguments above.'",
        },
      },
      required: ["instruction"],
      additionalProperties: false,
    },
    strict: true,
  },
];

type ToolResultContent = NonNullable<Anthropic.ToolResultBlockParam["content"]>;

export type ToolOutcome = {
  /** What is handed back to the model — text, or text interleaved with images. */
  content: ToolResultContent;
  /** One line shown in the chat UI under the tool call. */
  summary: string;
  /** Set when the tool asks the browser to open a suggestion in the editor. */
  proposal?: { instruction: string };
};

/**
 * Renders a page for the model: its markdown, followed by every screenshot or
 * picture it embeds as real image input, so Claude can read what is in them
 * rather than just seeing a file URL.
 */
async function renderPage(page: Page): Promise<ToolResultContent> {
  const markdown = blocksToMarkdown(page.content);
  const body: ToolResultContent = [
    {
      type: "text",
      text: `# ${page.title || "(無標題)"}

${markdown || "(這一頁還是空的)"}`,
    },
  ];

  const images = await loadImagesFromText(JSON.stringify(page.content));
  images.forEach((image, index) => {
    body.push({
      type: "text",
      text: `這一頁的第 ${index + 1} 張圖（/api/files/${image.name}）：`,
    });
    body.push({
      type: "image",
      source: { type: "base64", media_type: image.mediaType, data: image.base64 },
    });
  });

  return body;
}

export async function runAgentTool(
  name: string,
  input: Record<string, unknown>,
  context: { currentPageId: string },
): Promise<ToolOutcome> {
  switch (name) {
    case "read_current_page": {
      const page = getPage(context.currentPageId);
      if (!page) return { content: "錯誤：找不到目前的頁面。", summary: "找不到頁面" };
      return { content: await renderPage(page), summary: `讀取「${page.title || "無標題"}」` };
    }

    case "search_pages": {
      const query = String(input.query ?? "");
      const hits = searchPages(query, 8).filter((hit) => hit.id !== context.currentPageId);
      if (hits.length === 0) return { content: `沒有頁面符合「${query}」。`, summary: `搜尋「${query}」：0 筆` };
      const lines = hits.map((hit) => `- id: ${hit.id}\n  title: ${hit.title || "(無標題)"}\n  snippet: ${hit.snippet}`);
      return { content: lines.join("\n"), summary: `搜尋「${query}」：${hits.length} 筆` };
    }

    case "read_page": {
      const pageId = String(input.page_id ?? "");
      const page = getPage(pageId);
      if (!page) return { content: `錯誤：找不到 id 為 ${pageId} 的頁面。`, summary: "找不到頁面" };
      return { content: await renderPage(page), summary: `讀取「${page.title || "無標題"}」` };
    }

    case "propose_edit": {
      const instruction = String(input.instruction ?? "").trim();
      if (!instruction) return { content: "錯誤：instruction 不可為空。", summary: "提案無效" };
      return {
        content:
          "提案已送到編輯器，正在等待使用者審核。你不會知道結果，所以請直接告訴使用者去看編輯器裡標示的變更，不要重複提案。",
        summary: "提出修改建議",
        proposal: { instruction },
      };
    }

    default:
      return { content: `錯誤：未知的工具 ${name}。`, summary: `未知工具 ${name}` };
  }
}
