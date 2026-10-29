import { createAnthropic } from "@ai-sdk/anthropic";
import {
  convertToModelMessages,
  streamText,
  type ModelMessage,
  type UIMessage,
  type UserContent,
  type UserModelMessage,
} from "ai";
import {
  aiDocumentFormats,
  injectDocumentStateMessages,
  toolDefinitionsToToolSet,
} from "@blocknote/xl-ai/server";
import { loadImagesFromText } from "@/lib/ai/images";
import { EDITOR_MODEL, MissingApiKeyError, requireApiKey } from "@/lib/ai/models";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Backend for the in-editor AI (slash menu, selection toolbar, page actions).
 *
 * BlockNote's xl-ai package owns this protocol: the browser posts AI SDK UI
 * messages plus the serialised definitions of the document-editing tools, and
 * expects a UI message stream back. The resulting tool calls are replayed into
 * the editor as suggestions the user accepts or rejects.
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

  const { messages, toolDefinitions } = (await req.json()) as {
    messages: UIMessage[];
    toolDefinitions: Parameters<typeof toolDefinitionsToToolSet>[0];
  };

  const anthropic = createAnthropic({ apiKey });

  const result = streamText({
    model: anthropic(EDITOR_MODEL),
    maxOutputTokens: 16000,
    system: `${aiDocumentFormats.html.systemPrompt}

You must answer every request by calling one of the provided document tools — never reply with plain prose.
Write in the same language as the surrounding document unless the user asks for another language.`,
    messages: await withDocumentImages(
      await convertToModelMessages(injectDocumentStateMessages(messages)),
    ),
    tools: toolDefinitionsToToolSet(toolDefinitions),
    // Claude Opus 5.5 rejects forced tool choice, so the instruction above does
    // the steering that `toolChoice: "required"` would elsewhere.
    toolChoice: "auto",
  });

  return result.toUIMessageStreamResponse();
}

/**
 * The document state reaches the model as HTML, so an embedded screenshot
 * arrives as nothing more than an `<img src="/api/files/…">` tag. This appends
 * the referenced uploads to the last user message as real image input, so the
 * editor AI can summarise or rewrite around what the pictures actually show.
 */
async function withDocumentImages(messages: ModelMessage[]): Promise<ModelMessage[]> {
  const images = await loadImagesFromText(JSON.stringify(messages));
  if (images.length === 0) return messages;

  const lastUserIndex = messages.findLastIndex((message) => message.role === "user");
  if (lastUserIndex === -1) return messages;

  const target = messages[lastUserIndex] as UserModelMessage;
  const existing: UserContent =
    typeof target.content === "string" ? [{ type: "text", text: target.content }] : target.content;

  const attachments: UserContent = images.flatMap((image) => [
    { type: "text" as const, text: `文件中 /api/files/${image.name} 這張圖的內容：` },
    { type: "image" as const, image: image.base64, mediaType: image.mediaType },
  ]);

  const next = [...messages];
  next[lastUserIndex] = { ...target, content: [...existing, ...attachments] };
  return next;
}
