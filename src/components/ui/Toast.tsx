"use client";

import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from "react";

type ToastKind = "info" | "error";
type Toast = { id: number; message: string; kind: ToastKind };

const ToastContext = createContext<{ show: (message: string, kind?: ToastKind) => void } | null>(null);

const VISIBLE_MS = 4000;

/**
 * Transient messages.
 *
 * Restore, purge, export, move and save all fail asynchronously, and until now
 * the app's only ways to say so were `console.error` and `window.confirm`.
 */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(1);

  const show = useCallback((message: string, kind: ToastKind = "info") => {
    const id = nextId.current++;
    setToasts((current) => [...current, { id, message, kind }]);
    setTimeout(() => setToasts((current) => current.filter((toast) => toast.id !== id)), VISIBLE_MS);
  }, []);

  const value = useMemo(() => ({ show }), [show]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 bottom-20 z-[70] flex flex-col items-center gap-2">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={`pointer-events-auto rounded-full border px-4 py-2 text-sm shadow-xl ${
              toast.kind === "error"
                ? "border-red-500/40 bg-red-500/10 text-red-200"
                : "border-line bg-surface-2 text-ink"
            }`}
          >
            {toast.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

/**
 * Returns a `show` that is safe to call anywhere. Outside a provider it falls
 * back to the console rather than throwing — a missing toast is never a good
 * reason to take the page down.
 */
export function useToast() {
  const context = useContext(ToastContext);
  return (
    context ?? {
      show: (message: string, kind: ToastKind = "info") =>
        kind === "error" ? console.error(message) : console.log(message),
    }
  );
}
