import type { Page, PageSummary, PageTreeNode, SearchHit, TrashEntry } from "./types";

/** Raised when a save was built on a version the server has moved past. */
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

/**
 * Raised when a restore targets a page that was deleted as part of a subtree.
 * Carries the page that actually has to be restored, when it is still around.
 */
export class TrashRootError extends Error {
  readonly code = "not_a_trash_root";
  constructor(
    message: string,
    readonly root: { id: string; title: string } | null,
  ) {
    super(message);
    this.name = "TrashRootError";
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
      root?: { id: string; title: string } | null;
    };
    // 409 covers more than one thing now, so the code decides which error the
    // caller gets rather than everything arriving as a version conflict.
    if (response.status === 409) {
      if (body.code === "not_a_trash_root") {
        throw new TrashRootError(body.error ?? "請還原上層頁面", body.root ?? null);
      }
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

  workspace: () =>
    request<{ tree: PageTreeNode[]; favorites: PageSummary[] }>("/api/pages"),

  move: (id: string, target: { parentId: string | null; afterId?: string | null; beforeId?: string | null }) =>
    request<{ page: Page }>(`/api/pages/${id}/move`, {
      method: "POST",
      body: JSON.stringify(target),
    }).then((r) => r.page),

  favorite: (id: string, on: boolean) =>
    request<{ favorite: boolean }>(`/api/pages/${id}/favorite`, { method: on ? "POST" : "DELETE" }),

  create: (input: { title?: string; parentId?: string | null } = {}) =>
    request<{ page: Page }>("/api/pages", { method: "POST", body: JSON.stringify(input) }).then((r) => r.page),

  update: (id: string, patch: PagePatch) =>
    request<{ page: Page }>(`/api/pages/${id}`, { method: "PATCH", body: JSON.stringify(patch) }).then((r) => r.page),

  remove: (id: string) => request<{ ok: true }>(`/api/pages/${id}`, { method: "DELETE" }),

  search: (query: string) =>
    request<{ hits: SearchHit[] }>(`/api/search?q=${encodeURIComponent(query)}`).then((r) => r.hits),

  trash: {
    list: () => request<{ entries: TrashEntry[] }>("/api/trash").then((r) => r.entries),
    restore: (id: string) =>
      request<{ restored: number; reHomed: boolean }>(`/api/trash/${id}/restore`, { method: "POST" }),
    purge: (id: string) => request<{ purged: number }>(`/api/trash/${id}`, { method: "DELETE" }),
    empty: () => request<{ purged: number }>("/api/trash", { method: "DELETE" }),
  },

  apiKey: {
    status: () => request<ApiKeyStatus>("/api/settings"),
    set: (apiKey: string) =>
      request<ApiKeyStatus>("/api/settings", { method: "PUT", body: JSON.stringify({ apiKey }) }),
    clear: () => request<ApiKeyStatus>("/api/settings", { method: "DELETE" }),
  },
};
