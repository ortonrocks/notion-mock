import Anthropic from "@anthropic-ai/sdk";
import { CHAT_MODEL, MissingApiKeyError, requireApiKey } from "@/lib/ai/models";
import { AGENT_SYSTEM_PROMPT } from "@/lib/ai/prompts";
import { AGENT_TOOLS, runAgentTool } from "@/lib/ai/tools";

export const runtime = "nodejs";
export const maxDuration = 120;

/** Safety net so a looping model cannot run up an unbounded bill. */
const MAX_TURNS = 8;

type ChatRequest = {
  pageId: string;
  messages: Anthropic.MessageParam[];
};

/**
 * Sidebar agent. Runs the tool-use loop server-side and reports every step to
 * the browser over SSE so the panel can show tool calls as they happen.
 */
export async function POST(req: Request) {
  let apiKey: string;
  try {
    apiKey = requireApiKey();
  } catch (error) {
    if (error instanceof MissingApiKeyError) {
      return Response.json({ error: error.message, code: error.code }, { status: 503 });
    }
    return Response.json({ error: "AI 設定錯誤" }, { status: 503 });
  }

  const { pageId, messages: incoming } = (await req.json()) as ChatRequest;
  const client = new Anthropic({ apiKey });
  const messages: Anthropic.MessageParam[] = [...incoming];

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: Record<string, unknown>) =>
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));

      try {
        for (let turn = 0; turn < MAX_TURNS; turn++) {
          const stream = client.messages.stream({
            model: CHAT_MODEL,
            max_tokens: 16000,
            system: AGENT_SYSTEM_PROMPT,
            output_config: { effort: "medium" },
            tools: AGENT_TOOLS,
            messages,
          });

          for await (const event of stream) {
            if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
              send({ type: "text", delta: event.delta.text });
            }
          }

          const message = await stream.finalMessage();
          messages.push({ role: "assistant", content: message.content });

          if (message.stop_reason === "refusal") {
            send({ type: "error", message: "Claude 拒絕回答這個請求。" });
            break;
          }
          if (message.stop_reason !== "tool_use") {
            if (message.stop_reason === "max_tokens") {
              send({ type: "error", message: "回應長度達到上限，內容可能不完整。" });
            }
            break;
          }

          const toolUses = message.content.filter(
            (block): block is Anthropic.ToolUseBlock => block.type === "tool_use",
          );
          const results: Anthropic.ToolResultBlockParam[] = [];

          for (const toolUse of toolUses) {
            send({ type: "tool_start", id: toolUse.id, name: toolUse.name });
            try {
              const outcome = await runAgentTool(
                toolUse.name,
                (toolUse.input ?? {}) as Record<string, unknown>,
                { currentPageId: pageId },
              );
              send({ type: "tool_end", id: toolUse.id, summary: outcome.summary });
              if (outcome.proposal) {
                send({ type: "proposal", id: toolUse.id, instruction: outcome.proposal.instruction });
              }
              results.push({ type: "tool_result", tool_use_id: toolUse.id, content: outcome.content });
            } catch (error) {
              const detail = error instanceof Error ? error.message : String(error);
              send({ type: "tool_end", id: toolUse.id, summary: `失敗：${detail}` });
              results.push({
                type: "tool_result",
                tool_use_id: toolUse.id,
                content: `工具執行失敗：${detail}`,
                is_error: true,
              });
            }
          }

          // All results for one assistant turn must go back in a single user message.
          messages.push({ role: "user", content: results });
        }

        send({ type: "done" });
      } catch (error) {
        send({ type: "error", ...describeError(error) });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}

/**
 * A `code` of "missing_api_key" tells the panel to offer the settings dialog
 * rather than just printing the message. A rejected key gets the same
 * treatment, since the fix is the same.
 */
function describeError(error: unknown): { message: string; code?: string } {
  if (error instanceof Anthropic.AuthenticationError) {
    return { message: "Claude 不接受這個 API key，可能已被撤銷。", code: "missing_api_key" };
  }
  if (error instanceof Anthropic.RateLimitError) {
    return { message: "已達 Claude API 速率上限，請稍候再試。" };
  }
  if (error instanceof Anthropic.APIConnectionError) {
    return { message: "連不上 Claude API，請檢查網路。" };
  }
  if (error instanceof Anthropic.APIError) {
    return { message: `Claude API 回傳 ${error.status ?? "錯誤"}：${error.message}` };
  }
  return { message: error instanceof Error ? error.message : String(error) };
}
