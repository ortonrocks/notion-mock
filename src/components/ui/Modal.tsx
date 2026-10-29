"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";

/**
 * The overlay dialog the app already used in two places, made reusable.
 *
 * It renders through a portal so a dialog opened from inside a scrolling pane
 * is not clipped by it, and it puts focus back where it came from on close —
 * both things the hand-rolled copies got wrong.
 */
export function Modal({
  onClose,
  children,
  width = "w-[520px]",
  top = "pt-[14vh]",
  labelledBy,
}: {
  onClose: () => void;
  children: ReactNode;
  /** Tailwind width class. Dialogs here are fixed-width, not fluid. */
  width?: string;
  /** How far down the viewport the dialog sits. */
  top?: string;
  labelledBy?: string;
}) {
  const returnFocusTo = useRef<HTMLElement | null>(null);

  useEffect(() => {
    returnFocusTo.current = document.activeElement as HTMLElement | null;
    return () => returnFocusTo.current?.focus?.();
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  // Rendered only in the browser: `document` does not exist during SSR.
  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      className={`fixed inset-0 z-50 flex items-start justify-center bg-black/50 ${top}`}
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        className={`${width} max-w-[90vw] overflow-hidden rounded-xl border border-line bg-surface-1 shadow-2xl`}
        onClick={(event) => event.stopPropagation()}
      >
        {children}
      </div>
    </div>,
    document.body,
  );
}
