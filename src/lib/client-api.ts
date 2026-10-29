import type { Page, PageTreeNode, SearchHit } from "./types";

/** Raised on a 409, carrying the page as the server currently has it. */
export class ConflictError extends Error {
  readonly code = "version_conflict";
  constructor(
    message: string,
    readonly current: Page | null,
  ) {
    super(message);
    this.name = "ConflictError";
  }
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: init?.body ? { "Content-Type": "application/json", ...init?.headers } : init?.headers,
  });
  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as {
      error?: string;
      code?: string;
      page?: Page;
    };
    if (response.status === 409) {
      throw new ConflictError(body.error ?? "這一頁在別的地方被修改過", body.page ?? null);
    }
    throw new Error(body.error ?? `請求失敗 (${response.status})`);
  }
  return (await response.json()) as T;
}

export type ApiKeyStatus = {
  hasKey: boolean;
  source: "settings" | "env" | "none";
  hint: string | null;
};

type PagePatch = {
  title?: string;
  icon?: string | null;
  content?: unknown[];
  parentId?: string | null;
  /** The version the caller last saw. Omit to write unconditionally. */
  version?: number;
};

export const api = {
  tree: () => request<{ tree: PageTreeNode[] }>("/api/pages").then((r) => r.tree),

  create: (input: { title?: string; parentId?: string | null } = {}) =>
    request<{ page: Page }>("/api/pages", { method: "POST", body: JSON.stringify(input) }).then((r) => r.page),

  update: (id: string, patch: PagePatch) =>
    request<{ page: Page }>(`/api/pages/${id}`, { method: "PATCH", body: JSON.stringify(patch) }).then((r) => r.page),

  remove: (id: string) => request<{ ok: true }>(`/api/pages/${id}`, { method: "DELETE" }),

  search: (query: string) =>
    request<{ hits: SearchHit[] }>(`/api/search?q=${encodeURIComponent(query)}`).then((r) => r.hits),

  apiKey: {
    status: () => request<ApiKeyStatus>("/api/settings"),
    set: (apiKey: string) =>
      request<ApiKeyStatus>("/api/settings", { method: "PUT", body: JSON.stringify({ apiKey }) }),
    clear: () => request<ApiKeyStatus>("/api/settings", { method: "DELETE" }),
  },
};
