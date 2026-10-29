"use client";

import { useEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import { createPortal } from "react-dom";
import { useAnchoredPosition, type Align, type Placement } from "./useAnchoredPosition";

export type MenuItem =
  | { kind: "separator" }
  | {
      kind?: "item";
      label: string;
      icon?: string;
      hint?: string;
      danger?: boolean;
      disabled?: boolean;
      onSelect: () => void;
    };

type Shared = {
  anchorRef: RefObject<HTMLElement | null>;
  open: boolean;
  onClose: () => void;
  align?: Align;
  placement?: Placement;
};

/**
 * Closes the layer on Escape and on a click outside it.
 *
 * Mousedown rather than click: a click handler would fire after the trigger's
 * own, so clicking the trigger again would close and immediately reopen.
 */
function useDismiss(
  layerRef: RefObject<HTMLElement | null>,
  anchorRef: RefObject<HTMLElement | null>,
  onClose: () => void,
) {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
      }
    };
    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (layerRef.current?.contains(target) || anchorRef.current?.contains(target)) return;
      onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("mousedown", onPointerDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("mousedown", onPointerDown);
    };
  }, [layerRef, anchorRef, onClose]);
}

/** An anchored dropdown. The caller owns `open`, so any trigger can drive it. */
export function Menu({ open, ...props }: Shared & { items: MenuItem[]; width?: string }) {
  // Mounted only while open, so its state starts fresh every time and the
  // first position is measured during the initial render.
  if (!open || typeof document === "undefined") return null;
  return <MenuLayer {...props} />;
}

function MenuLayer({
  anchorRef,
  onClose,
  items,
  align = "start",
  placement = "bottom",
  width = "min-w-[180px]",
}: Omit<Shared, "open"> & { items: MenuItem[]; width?: string }) {
  const listRef = useRef<HTMLDivElement>(null);
  useAnchoredPosition(anchorRef, listRef, { align, placement });

  const selectable = items
    .map((item, index) => ({ item, index }))
    .filter(({ item }) => item.kind !== "separator" && !item.disabled);

  const [active, setActive] = useState(() => selectable[0]?.index ?? 0);

  useDismiss(listRef, anchorRef, onClose);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "ArrowDown" && event.key !== "ArrowUp" && event.key !== "Enter") return;
      event.preventDefault();

      const at = selectable.findIndex(({ index }) => index === active);
      if (event.key === "Enter") {
        const chosen = selectable[at]?.item;
        if (chosen && chosen.kind !== "separator") {
          onClose();
          chosen.onSelect();
        }
        return;
      }
      const step = event.key === "ArrowDown" ? 1 : -1;
      const next = selectable[(at + step + selectable.length) % selectable.length];
      if (next) setActive(next.index);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [active, selectable, onClose]);

  return createPortal(
    <div
      ref={listRef}
      role="menu"
      className={`fixed z-[60] ${width} overflow-hidden rounded-lg border border-line bg-surface-1 py-1 shadow-2xl ${
        align === "end" ? "-translate-x-full" : ""
      }`}
    >
      {items.map((item, index) =>
        item.kind === "separator" ? (
          <div key={index} className="my-1 border-t border-line" />
        ) : (
          <button
            key={index}
            role="menuitem"
            disabled={item.disabled}
            onMouseEnter={() => setActive(index)}
            onClick={() => {
              onClose();
              item.onSelect();
            }}
            className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm transition disabled:opacity-40 ${
              item.danger ? "text-red-300" : "text-ink-muted"
            } ${index === active && !item.disabled ? "bg-[var(--surface-hover)] text-ink" : ""}`}
          >
            {item.icon && <span className="w-4 shrink-0 text-center">{item.icon}</span>}
            <span className="flex-1 truncate">{item.label}</span>
            {item.hint && <span className="shrink-0 text-xs text-ink-faint">{item.hint}</span>}
          </button>
        ),
      )}
    </div>,
    document.body,
  );
}

/** A popover with the same anchoring, but arbitrary content. */
export function Popover({ open, ...props }: Shared & { children: ReactNode; width?: string }) {
  if (!open || typeof document === "undefined") return null;
  return <PopoverLayer {...props} />;
}

function PopoverLayer({
  anchorRef,
  onClose,
  children,
  align = "start",
  placement = "bottom",
  width = "w-[280px]",
}: Omit<Shared, "open"> & { children: ReactNode; width?: string }) {
  const panelRef = useRef<HTMLDivElement>(null);
  useAnchoredPosition(anchorRef, panelRef, { align, placement });

  useDismiss(panelRef, anchorRef, onClose);

  return createPortal(
    <div
      ref={panelRef}
      className={`fixed z-[60] ${width} rounded-lg border border-line bg-surface-1 p-3 shadow-2xl ${
        align === "end" ? "-translate-x-full" : ""
      }`}
    >
      {children}
    </div>,
    document.body,
  );
}
