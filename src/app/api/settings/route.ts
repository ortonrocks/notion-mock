import Anthropic from "@anthropic-ai/sdk";
import {
  clearStoredApiKey,
  looksLikeApiKey,
  maskKey,
  resolveApiKey,
  storeApiKey,
} from "@/lib/settings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Nothing in this file logs or returns the key itself. The browser only ever
// learns whether one is configured, where it came from, and its last 4 characters.
function describeCurrent() {
  const { key, source } = resolveApiKey();
  return {
    hasKey: key !== null,
    source,
    hint: key ? maskKey(key) : null,
  };
}

export async function GET() {
  return Response.json(describeCurrent());
}

export async function PUT(req: Request) {
  const { apiKey } = (await req.json().catch(() => ({}))) as { apiKey?: unknown };

  if (typeof apiKey !== "string" || apiKey.trim() === "") {
    return Response.json({ error: "請輸入 API key" }, { status: 400 });
  }

  const key = apiKey.trim();
  if (!looksLikeApiKey(key)) {
    return Response.json({ error: "格式看起來不對，Claude 的 key 以 sk-ant- 開頭" }, { status: 400 });
  }

  // Verify against the real API before storing, so a bad key is rejected here
  // rather than surfacing later as a failed chat. Listing models costs nothing.
  try {
    await new Anthropic({ apiKey: key }).models.list({ limit: 1 });
  } catch (error) {
    if (error instanceof Anthropic.AuthenticationError) {
      return Response.json({ error: "Claude 不接受這個 key，請確認是否已被撤銷" }, { status: 400 });
    }
    if (error instanceof Anthropic.APIConnectionError) {
      return Response.json({ error: "連不上 Claude API，請檢查網路後再試" }, { status: 502 });
    }
    const status = error instanceof Anthropic.APIError ? (error.status ?? "錯誤") : "錯誤";
    return Response.json({ error: `驗證失敗（${status}）` }, { status: 400 });
  }

  storeApiKey(key);
  return Response.json(describeCurrent());
}

export async function DELETE() {
  clearStoredApiKey();
  return Response.json(describeCurrent());
}
