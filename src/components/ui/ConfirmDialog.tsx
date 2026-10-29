"use client";

import { useState } from "react";
import { Modal } from "./Modal";

/**
 * Replaces `window.confirm`, which cannot be styled, cannot say which button is
 * destructive, and blocks the whole tab while it is open.
 */
export function ConfirmDialog({
  title,
  body,
  confirmLabel = "確定",
  cancelLabel = "取消",
  danger = false,
  onConfirm,
  onClose,
}: {
  title: string;
  body?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  /** May be async; the dialog stays open and disabled until it settles. */
  onConfirm: () => void | Promise<void>;
  onClose: () => void;
}) {
  const [busy, setBusy] = useState(false);

  const confirm = async () => {
    setBusy(true);
    try {
      await onConfirm();
      onClose();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal onClose={busy ? () => {} : onClose} width="w-[420px]" labelledBy="confirm-title">
      <div className="p-5">
        <h2 id="confirm-title" className="text-base font-semibold text-ink">
          {title}
        </h2>
        {body && <p className="mt-2 text-sm text-ink-muted">{body}</p>}

        <div className="mt-5 flex justify-end gap-2">
          <button
            onClick={onClose}
            disabled={busy}
            className="rounded-lg px-3 py-1.5 text-sm text-ink-muted transition hover-surface hover:text-ink disabled:opacity-50"
          >
            {cancelLabel}
          </button>
          <button
            onClick={() => void confirm()}
            disabled={busy}
            autoFocus
            className={`rounded-lg px-3 py-1.5 text-sm font-medium text-white transition hover:brightness-110 disabled:opacity-40 ${
              danger ? "bg-red-600" : "bg-accent"
            }`}
          >
            {busy ? "處理中…" : confirmLabel}
          </button>
        </div>
      </div>
    </Modal>
  );
}
