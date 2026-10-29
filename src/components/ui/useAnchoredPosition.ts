"use client";

import { useLayoutEffect, type RefObject } from "react";

export type Placement = "bottom" | "top";
export type Align = "start" | "end";
export type AnchorOptions = { placement?: Placement; align?: Align; gap?: number };

/**
 * Pins a floating layer to a trigger element.
 *
 * Menus and popovers here open from inside the editor's scrolling column. An
 * absolutely positioned layer would be clipped by that `overflow-y-auto`, so
 * they render in a portal and get fixed coordinates from this instead.
 *
 * The coordinates are written straight to the node's style rather than held in
 * state: position is something the DOM needs, not something React renders
 * from, and a layout effect lands it before the first paint.
 */
export function useAnchoredPosition(
  anchorRef: RefObject<HTMLElement | null>,
  layerRef: RefObject<HTMLElement | null>,
  { placement = "bottom", align = "start", gap = 4 }: AnchorOptions = {},
) {
  useLayoutEffect(() => {
    const place = () => {
      const anchor = anchorRef.current;
      const layer = layerRef.current;
      if (!anchor || !layer) return;

      const box = anchor.getBoundingClientRect();
      const below = window.innerHeight - box.bottom;
      const flip = placement === "top" || below < 220;

      layer.style.top = `${flip ? Math.max(8, box.top - gap) : box.bottom + gap}px`;
      layer.style.left = `${align === "end" ? box.right : box.left}px`;
    };

    place();
    window.addEventListener("resize", place);
    // Capture phase, so scrolling in any ancestor repositions the layer.
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [anchorRef, layerRef, placement, align, gap]);
}
