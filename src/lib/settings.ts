import "server-only";
import { deleteSetting, getSetting, setSetting } from "./db";

const API_KEY_SETTING = "anthropic_api_key";

/**
 * Where the key currently comes from. A key saved through the UI wins over the
 * environment, so changing it in the app does not require editing `.env.local`
 * or restarting the dev server.
 */
export type KeySource = "settings" | "env" | "none";

export function resolveApiKey(): { key: string | null; source: KeySource } {
  const stored = getSetting(API_KEY_SETTING);
  if (stored) return { key: stored, source: "settings" };

  const fromEnv = process.env.ANTHROPIC_API_KEY?.trim();
  if (fromEnv) return { key: fromEnv, source: "env" };

  return { key: null, source: "none" };
}

export function storeApiKey(key: string): void {
  setSetting(API_KEY_SETTING, key);
}

export function clearStoredApiKey(): void {
  deleteSetting(API_KEY_SETTING);
}

/**
 * Renders a key as `sk-ant-…WXYZ`. This is the only form of the key that ever
 * leaves the server — the full value is never sent to the browser.
 */
export function maskKey(key: string): string {
  const tail = key.slice(-4);
  return `sk-ant-…${tail}`;
}

/** A cheap shape check, so an obviously wrong value fails before we spend a round trip. */
export function looksLikeApiKey(key: string): boolean {
  return key.startsWith("sk-ant-") && key.length >= 20;
}
