"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { PageTreeNode } from "@/lib/types";

export type DropPosition = "before" | "inside" | "after";
export type DropTarget = { id: string; position: DropPosition } | null;

/** Everything under `id`, so a page cannot be dropped into its own subtree. */
function descendantsOf(nodes: PageTreeNode[], id: string): Set<string> {
  const found = new Set<string>();

  const collect = (node: PageTreeNode) => {
    found.add(node.id);
    node.children.forEach(collect);
  };

  const find = (list: PageTreeNode[]): boolean =>
    list.some((node) => {
      if (node.id === id) {
        collect(node);
        return true;
      }
      return find(node.children);
    });

  find(nodes);
  return found;
}

const EDGE = 40;
const SPEED = 8;

/**
 * Drag-to-reorder for the page tree.
 *
 * Native HTML5 drag events rather than a library: the tree is a handful of
 * rows, and the only parts worth writing are the ones a library would not get
 * right anyway — the three-way drop zone, and refusing a drop into the dragged
 * page's own subtree before the server has to.
 */
export function useTreeDrag({
  tree,
  scrollRef,
  onMove,
}: {
  tree: PageTreeNode[];
  scrollRef: React.RefObject<HTMLElement | null>;
  onMove: (id: string, target: { parentId: string | null; afterId: string | null; beforeId: string | null }) => void;
}) {
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<DropTarget>(null);

  // Recomputed once per drag, not per dragover.
  const forbidden = useRef<Set<string>>(new Set());
  const scrollBy = useRef(0);

  // Autoscroll while a drag hovers near the top or bottom of the pane. The
  // browser does not do this for a scrollable div, and without it the parts of
  // the tree that are off-screen cannot be reached.
  useEffect(() => {
    if (!draggingId) return;
    let frame = 0;

    const tick = () => {
      if (scrollBy.current !== 0 && scrollRef.current) {
        scrollRef.current.scrollTop += scrollBy.current;
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(frame);
      scrollBy.current = 0;
    };
  }, [draggingId, scrollRef]);

  const start = useCallback(
    (id: string, event: React.DragEvent) => {
      forbidden.current = descendantsOf(tree, id);
      setDraggingId(id);
      event.dataTransfer.effectAllowed = "move";
      // Firefox ignores a drag that carries no data.
      event.dataTransfer.setData("text/plain", id);
    },
    [tree],
  );

  const end = useCallback(() => {
    setDraggingId(null);
    setDropTarget(null);
    scrollBy.current = 0;
  }, []);

  const over = useCallback(
    (id: string, event: React.DragEvent) => {
      if (!draggingId || forbidden.current.has(id)) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = "move";

      const box = event.currentTarget.getBoundingClientRect();
      const offset = event.clientY - box.top;
      // The middle third means "drop as a child" — the only way to express
      // re-parenting with a pointer and no modifier keys.
      const position: DropPosition =
        offset < box.height / 3 ? "before" : offset > (box.height * 2) / 3 ? "after" : "inside";

      setDropTarget((current) =>
        current?.id === id && current.position === position ? current : { id, position },
      );

      const pane = scrollRef.current?.getBoundingClientRect();
      if (pane) {
        if (event.clientY - pane.top < EDGE) scrollBy.current = -SPEED;
        else if (pane.bottom - event.clientY < EDGE) scrollBy.current = SPEED;
        else scrollBy.current = 0;
      }
    },
    [draggingId, scrollRef],
  );

  const drop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();
      const id = draggingId;
      const target = dropTarget;
      end();
      if (!id || !target || forbidden.current.has(target.id)) return;

      const located = locate(tree, target.id);
      if (!located) return;
      const { node, siblings, parentId, index } = located;

      if (target.position === "inside") {
        // Appending: no neighbours named, so the server picks the end.
        onMove(id, { parentId: node.id, afterId: null, beforeId: null });
        return;
      }

      // The dragged page may already be among these siblings, in which case it
      // must not be used as its own neighbour.
      const without = siblings.filter((sibling) => sibling.id !== id);
      const at = without.findIndex((sibling) => sibling.id === node.id);
      const before = target.position === "before" ? at : at + 1;

      onMove(id, {
        parentId,
        afterId: without[before - 1]?.id ?? null,
        beforeId: without[before]?.id ?? null,
      });
      void index;
    },
    [draggingId, dropTarget, end, onMove, tree],
  );

  const isForbidden = useCallback((id: string) => forbidden.current.has(id), []);

  return { draggingId, dropTarget, isForbidden, start, end, over, drop };
}

function locate(
  nodes: PageTreeNode[],
  id: string,
  parentId: string | null = null,
): { node: PageTreeNode; siblings: PageTreeNode[]; parentId: string | null; index: number } | null {
  const index = nodes.findIndex((node) => node.id === id);
  if (index !== -1) return { node: nodes[index], siblings: nodes, parentId, index };

  for (const node of nodes) {
    const found = locate(node.children, id, node.id);
    if (found) return found;
  }
  return null;
}
