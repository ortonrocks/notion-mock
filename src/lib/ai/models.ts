/**
 * Every Claude model id used by the app lives here, so swapping models is a
 * one-file change.
 */
import { resolveApiKey } from "@/lib/settings";

/** Drives the sidebar agent (tool use over the workspace). */
export const CHAT_MODEL = process.env.CLAUDE_CHAT_MODEL ?? "claude-opus-5-5";

/** Drives in-editor rewriting. Lower effort keeps edits snappy. */
export const EDITOR_MODEL = process.env.CLAUDE_EDITOR_MODEL ?? "claude-opus-5-5";

export class MissingApiKeyError extends Error {
  readonly code = "missing_api_key";
  constructor() {
    super("還沒有設定 Claude API key。");
    this.name = "MissingApiKeyError";
  }
}

/**
 * A key saved through the settings dialog takes precedence over the
 * environment. Both the chat and editor routes build their client per request
 * from this, so a new key applies to the very next request without a restart.
 */
export function requireApiKey(): string {
  const { key } = resolveApiKey();
  if (!key) throw new MissingApiKeyError();
  return key;
}
