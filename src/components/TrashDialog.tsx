"use client";

import { useEffect, useState } from "react";
import { api, TrashRootError } from "@/lib/client-api";
import type { TrashEntry } from "@/lib/types";
import { Modal } from "./ui/Modal";
import { ConfirmDialog } from "./ui/ConfirmDialog";
import { Button } from "./ui/Inputs";
import { useToast } from "./ui/Toast";

function when(timestamp: number): string {
  const minutes = Math.floor((Date.now() - timestamp) / 60000);
  if (minutes < 1) return "剛剛";
  if (minutes < 60) return `${minutes} 分鐘前`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} 小時前`;
  return `${Math.floor(hours / 24)} 天前`;
}

export default function TrashDialog({
  onClose,
  onRestored,
}: {
  onClose: () => void;
  /** The page tree changed, so the sidebar needs to reload. */
  onRestored: () => Promise<void>;
}) {
  const toast = useToast();
  const [entries, setEntries] = useState<TrashEntry[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [emptying, setEmptying] = useState(false);

  const reload = () => api.trash.list().then(setEntries);

  useEffect(() => {
    void reload().catch(() => setEntries([]));
  }, []);

  const restore = async (entry: TrashEntry) => {
    setBusy(entry.id);
    try {
      const { reHomed } = await api.trash.restore(entry.id);
      await reload();
      await onRestored();
      toast.show(
        reHomed
          ? `已還原「${entry.title || "無標題"}」，原本的上層頁面還在垃圾桶裡，所以放到了最外層`
          : `已還原「${entry.title || "無標題"}」`,
      );
    } catch (cause) {
      // The page was deleted as part of a subtree; its root is what to restore.
      if (cause instanceof TrashRootError) {
        toast.show(
          cause.root ? `請改為還原「${cause.root.title || "無標題"}」` : cause.message,
          "error",
        );
      } else {
        toast.show(cause instanceof Error ? cause.message : "還原失敗", "error");
      }
    } finally {
      setBusy(null);
    }
  };

  const purge = async (entry: TrashEntry) => {
    setBusy(entry.id);
    try {
      await api.trash.purge(entry.id);
      await reload();
      toast.show(`已永久刪除「${entry.title || "無標題"}」`);
    } catch (cause) {
      toast.show(cause instanceof Error ? cause.message : "刪除失敗", "error");
    } finally {
      setBusy(null);
    }
  };

  const empty = async () => {
    await api.trash.empty();
    await reload();
    toast.show("垃圾桶已清空");
  };

  return (
    <>
      <Modal onClose={onClose} width="w-[560px]" top="pt-[12vh]" labelledBy="trash-title">
        <div className="flex items-center justify-between border-b border-line px-5 py-3.5">
          <h2 id="trash-title" className="text-base font-semibold text-ink">
            垃圾桶
          </h2>
          {entries !== null && entries.length > 0 && (
            <Button variant="secondary" onClick={() => setEmptying(true)}>
              全部清空
            </Button>
          )}
        </div>

        <div className="max-h-[50vh] overflow-y-auto">
          {entries === null && <p className="px-5 py-8 text-center text-sm text-ink-faint">讀取中…</p>}

          {entries?.length === 0 && (
            <p className="px-5 py-8 text-center text-sm text-ink-faint">垃圾桶是空的</p>
          )}

          {entries?.map((entry) => (
            <div
              key={entry.id}
              className="group flex items-center gap-2 px-5 py-2.5 transition hover-surface"
            >
              <span className="shrink-0">{entry.icon ?? "📄"}</span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm text-ink">{entry.title || "無標題"}</span>
                <span className="block text-xs text-ink-faint">
                  {when(entry.deletedAt)}
                  {entry.descendants > 0 && `，含 ${entry.descendants} 個子頁面`}
                </span>
              </span>
              <Button variant="secondary" disabled={busy !== null} onClick={() => void restore(entry)}>
                {busy === entry.id ? "處理中…" : "還原"}
              </Button>
              <button
                disabled={busy !== null}
                onClick={() => void purge(entry)}
                title="永久刪除"
                className="rounded px-2 py-1 text-sm text-ink-faint transition hover:text-red-400 disabled:opacity-40"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      </Modal>

      {emptying && (
        <ConfirmDialog
          title="清空垃圾桶？"
          body="裡面所有頁面會被永久刪除，無法復原。"
          confirmLabel="永久刪除"
          danger
          onConfirm={empty}
          onClose={() => setEmptying(false)}
        />
      )}
    </>
  );
}
