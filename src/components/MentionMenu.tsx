"use client";

import type { SuggestionMenuProps } from "@blocknote/react";

export type MentionItem = {
  id: string;
  title: string;
  icon: string | null;
  /** Set on the trailing "create a page called …" entry. */
  create?: boolean;
};

/**
 * The list the `@` trigger shows.
 *
 * BlockNote only supplies a default renderer for its own item type. Anything
 * else — which a page lookup is — has to bring its own component and its own
 * click handler, so both are required props on the controller.
 */
export default function MentionMenu({
  items,
  loadingState,
  selectedIndex,
  onItemClick,
}: SuggestionMenuProps<MentionItem>) {
  if (loadingState === "loading-initial") {
    return (
      <div className="w-[280px] rounded-lg border border-line bg-surface-1 px-3 py-2 text-sm text-ink-faint shadow-2xl">
        搜尋中…
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="w-[280px] rounded-lg border border-line bg-surface-1 px-3 py-2 text-sm text-ink-faint shadow-2xl">
        找不到頁面
      </div>
    );
  }

  return (
    <div className="max-h-[320px] w-[280px] overflow-y-auto rounded-lg border border-line bg-surface-1 py-1 shadow-2xl">
      {items.map((item, index) => (
        <button
          key={item.id}
          onClick={() => onItemClick?.(item)}
          className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm transition hover-surface ${
            index === selectedIndex ? "bg-[var(--surface-hover)] text-ink" : "text-ink-muted"
          }`}
        >
          <span className="shrink-0">{item.create ? "＋" : (item.icon ?? "📄")}</span>
          <span className="truncate">
            {item.create ? `建立「${item.title}」` : item.title || "無標題"}
          </span>
        </button>
      ))}
    </div>
  );
}
