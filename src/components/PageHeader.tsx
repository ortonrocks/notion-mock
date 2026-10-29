"use client";

import { useState } from "react";
import type { Page } from "@/lib/types";

type Props = {
  page: Page;
  title: string;
  sidebarOpen: boolean;
  aiPanelOpen: boolean;
  onOpenSidebar: () => void;
  onToggleAiPanel: () => void;
  onRunInstruction: (instruction: string) => Promise<void>;
  onOpenSettings: () => void;
};

const PAGE_ACTIONS = [
  {
    key: "summarize",
    label: "整頁摘要",
    instruction:
      "在文件最前面插入一個標題為「摘要」的區塊，底下用三到五個項目符號條列整份文件的重點。不要更動原有內容。",
  },
  {
    key: "translate-en",
    label: "翻譯成英文",
    instruction: "Translate the entire document into English, keeping the existing block structure and formatting.",
  },
  {
    key: "translate-zh",
    label: "翻譯成繁中",
    instruction: "將整份文件翻譯成繁體中文，保留原本的區塊結構與格式。",
  },
] as const;

export default function PageHeader({
  page,
  title,
  sidebarOpen,
  aiPanelOpen,
  onOpenSidebar,
  onToggleAiPanel,
  onRunInstruction,
  onOpenSettings,
}: Props) {
  const [running, setRunning] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = async (key: string, instruction: string) => {
    setError(null);
    setRunning(key);
    try {
      await onRunInstruction(instruction);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setRunning(null);
    }
  };

  return (
    <header className="flex h-11 shrink-0 items-center gap-2 border-b border-line px-3 text-sm">
      {!sidebarOpen && (
        <button
          onClick={onOpenSidebar}
          className="rounded px-2 py-1 text-ink-muted hover-surface"
          title="展開側欄"
        >
          ☰
        </button>
      )}

      <span className="truncate text-ink-muted">{title || "無標題"}</span>
      <span className="rounded px-1.5 py-0.5 text-xs text-ink-faint">🔒 Private</span>

      <div className="ml-auto flex items-center gap-1">
        {PAGE_ACTIONS.map((action) => (
          <button
            key={action.key}
            onClick={() => void run(action.key, action.instruction)}
            disabled={running !== null}
            className="rounded px-2 py-1 text-xs text-ink-muted transition hover-surface hover:text-ink disabled:opacity-40"
          >
            {running === action.key ? "思考中…" : action.label}
          </button>
        ))}

        <button
          onClick={onToggleAiPanel}
          className={`ml-1 rounded px-2 py-1 text-xs transition hover-surface ${
            aiPanelOpen ? "text-ink" : "text-ink-muted"
          }`}
          title="切換 AI 面板"
        >
          ✦ AI
        </button>

        <button
          onClick={onOpenSettings}
          className="rounded px-2 py-1 text-xs text-ink-muted transition hover-surface hover:text-ink"
          title="設定 API key"
        >
          ⚙
        </button>
      </div>

      {error && (
        <div className="absolute right-4 top-12 z-20 max-w-sm rounded border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-200">
          {error}
        </div>
      )}

      <span className="sr-only">{page.id}</span>
    </header>
  );
}
