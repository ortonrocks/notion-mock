"use client";

import { useState } from "react";
import { api, type ApiKeyStatus } from "@/lib/client-api";
import { Modal } from "./ui/Modal";

/**
 * Sets the Claude API key without touching `.env.local` or restarting.
 *
 * The key is stored in the local SQLite database and takes precedence over the
 * environment. The browser never receives the key itself — only whether one is
 * set, where it came from, and its last four characters.
 */
export default function SettingsDialog({
  status,
  onStatusChange,
  onClose,
}: {
  status: ApiKeyStatus | null;
  onStatusChange: (status: ApiKeyStatus) => void;
  onClose: () => void;
}) {
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const submit = async () => {
    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      onStatusChange(await api.apiKey.set(value));
      setValue("");
      setSaved(true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  };

  const clear = async () => {
    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      onStatusChange(await api.apiKey.clear());
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal onClose={onClose} labelledBy="settings-title">
      <div className="p-5">
        <h2 id="settings-title" className="text-base font-semibold text-ink">Claude API key</h2>
        <p className="mt-1 text-xs text-ink-faint">
          存在本機資料庫，不會上傳到任何地方。設定後立即生效，不需要重啟。
        </p>

        <div className="mt-4 rounded-lg border border-line bg-surface-2 px-3 py-2 text-xs">
          {status === null && <span className="text-ink-faint">讀取中…</span>}
          {status?.hasKey && (
            <span className="text-ink-muted">
              目前使用 <span className="font-mono text-ink">{status.hint}</span>
              {status.source === "env" ? "（來自 .env.local）" : "（在這裡設定的）"}
            </span>
          )}
          {status !== null && !status.hasKey && <span className="text-amber-300">尚未設定</span>}
        </div>

        <input
          autoFocus
          type="password"
          value={value}
          onChange={(event) => setValue(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && value.trim() !== "" && !busy) void submit();
          }}
          placeholder="sk-ant-..."
          spellCheck={false}
          autoComplete="off"
          className="mt-3 w-full rounded-lg border border-line bg-surface-2 px-3 py-2 font-mono text-sm text-ink outline-none placeholder:text-ink-faint focus:border-accent/60"
        />

        {error && <p className="mt-2 text-xs text-red-300">{error}</p>}
        {saved && !error && <p className="mt-2 text-xs text-emerald-300">已儲存並驗證通過</p>}

        <div className="mt-4 flex items-center justify-between gap-2">
          <a
            href="https://platform.claude.com/settings/keys"
            target="_blank"
            rel="noreferrer"
            className="text-xs text-ink-faint underline-offset-2 transition hover:text-ink-muted hover:underline"
          >
            到 Claude Console 取得 key
          </a>
          <div className="flex gap-2">
            {status?.source === "settings" && (
              <button
                onClick={() => void clear()}
                disabled={busy}
                className="rounded-lg px-3 py-1.5 text-sm text-ink-muted transition hover-surface hover:text-ink disabled:opacity-50"
              >
                清除
              </button>
            )}
            <button
              onClick={() => void submit()}
              disabled={busy || value.trim() === ""}
              className="rounded-lg bg-accent px-3 py-1.5 text-sm font-medium text-white transition hover:brightness-110 disabled:opacity-40"
            >
              {busy ? "驗證中…" : "儲存"}
            </button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
