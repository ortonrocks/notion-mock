"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import SearchDialog from "./SearchDialog";
import TrashDialog from "./TrashDialog";
import { ConfirmDialog } from "./ui/ConfirmDialog";
import { useToast } from "./ui/Toast";
import { api } from "@/lib/client-api";
import type { PageTreeNode } from "@/lib/types";

type Props = {
  tree: PageTreeNode[];
  activeId: string;
  onRefresh: () => Promise<void>;
  onCollapse: () => void;
};

export default function Sidebar({ tree, activeId, onRefresh, onCollapse }: Props) {
  const router = useRouter();
  const [searchOpen, setSearchOpen] = useState(false);
  const [trashOpen, setTrashOpen] = useState(false);

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setSearchOpen(true);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  const createPage = async (parentId: string | null) => {
    const page = await api.create({ parentId });
    await onRefresh();
    router.push(`/page/${page.id}`);
  };

  return (
    <aside className="flex w-[260px] shrink-0 flex-col border-r border-line bg-surface-1">
      <div className="flex items-center gap-1 px-3 py-3">
        <span className="flex-1 truncate text-sm font-medium text-ink">我的工作區</span>
        <button
          onClick={onCollapse}
          className="rounded px-1.5 py-1 text-ink-faint hover-surface hover:text-ink"
          title="收合側欄"
        >
          ⟨
        </button>
        <button
          onClick={() => void createPage(null)}
          className="rounded px-1.5 py-1 text-ink-faint hover-surface hover:text-ink"
          title="新增頁面"
        >
          ✎
        </button>
      </div>

      <div className="px-3 pb-2">
        <button
          onClick={() => setSearchOpen(true)}
          className="flex w-full items-center gap-2 rounded-md border border-line px-2.5 py-1.5 text-left text-sm text-ink-faint transition hover-surface"
        >
          <span>🔍</span>
          <span className="flex-1">搜尋</span>
          <kbd className="rounded bg-surface-2 px-1.5 py-0.5 text-[10px] text-ink-faint">Ctrl K</kbd>
        </button>
      </div>

      <nav className="min-h-0 flex-1 overflow-y-auto px-2 pb-6">
        <p className="px-2 py-2 text-xs font-medium text-ink-faint">頁面</p>
        {tree.length === 0 && <p className="px-2 py-1 text-sm text-ink-faint">還沒有任何頁面</p>}
        {tree.map((node) => (
          <TreeItem
            key={node.id}
            node={node}
            depth={0}
            activeId={activeId}
            onRefresh={onRefresh}
            onCreateChild={createPage}
          />
        ))}
      </nav>

      <div className="border-t border-line px-3 py-2">
        <button
          onClick={() => setTrashOpen(true)}
          className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm text-ink-muted transition hover-surface hover:text-ink"
        >
          <span>🗑️</span>
          <span className="flex-1">垃圾桶</span>
        </button>
      </div>

      {searchOpen && <SearchDialog onClose={() => setSearchOpen(false)} />}
      {trashOpen && <TrashDialog onClose={() => setTrashOpen(false)} onRestored={onRefresh} />}
    </aside>
  );
}

function TreeItem({
  node,
  depth,
  activeId,
  onRefresh,
  onCreateChild,
}: {
  node: PageTreeNode;
  depth: number;
  activeId: string;
  onRefresh: () => Promise<void>;
  onCreateChild: (parentId: string | null) => Promise<void>;
}) {
  const router = useRouter();
  const toast = useToast();
  const [expanded, setExpanded] = useState(true);
  const [confirming, setConfirming] = useState(false);
  const hasChildren = node.children.length > 0;

  const remove = async () => {
    try {
      await api.remove(node.id);
      await onRefresh();
      if (node.id === activeId) router.push("/");
    } catch (cause) {
      toast.show(cause instanceof Error ? cause.message : "刪除失敗", "error");
    }
  };

  return (
    <div>
      <div
        className={`group flex items-center gap-1 rounded-md pr-1 text-sm transition ${
          node.id === activeId ? "bg-[var(--surface-hover)] text-ink" : "text-ink-muted hover-surface"
        }`}
        style={{ paddingLeft: depth * 14 }}
      >
        <button
          onClick={() => setExpanded((value) => !value)}
          className={`w-5 shrink-0 text-xs text-ink-faint ${hasChildren ? "" : "invisible"}`}
          title={expanded ? "收合" : "展開"}
        >
          {expanded ? "▾" : "▸"}
        </button>

        <Link href={`/page/${node.id}`} className="flex min-w-0 flex-1 items-center gap-1.5 py-1">
          <span className="shrink-0">{node.icon ?? "📄"}</span>
          <span className="truncate">{node.title || "無標題"}</span>
        </Link>

        <button
          onClick={() => void onCreateChild(node.id)}
          className="hidden shrink-0 rounded px-1 text-ink-faint hover:text-ink group-hover:block"
          title="新增子頁面"
        >
          ＋
        </button>
        <button
          onClick={() => setConfirming(true)}
          className="hidden shrink-0 rounded px-1 text-ink-faint hover:text-red-400 group-hover:block"
          title="刪除頁面"
        >
          ✕
        </button>
      </div>

      {confirming && (
        <ConfirmDialog
          title={`刪除「${node.title || "無標題"}」？`}
          body={
            hasChildren
              ? "底下的子頁面也會一起刪除。可以之後從垃圾桶還原。"
              : "可以之後從垃圾桶還原。"
          }
          confirmLabel="刪除"
          danger
          onConfirm={remove}
          onClose={() => setConfirming(false)}
        />
      )}

      {expanded &&
        node.children.map((child) => (
          <TreeItem
            key={child.id}
            node={child}
            depth={depth + 1}
            activeId={activeId}
            onRefresh={onRefresh}
            onCreateChild={onCreateChild}
          />
        ))}
    </div>
  );
}
