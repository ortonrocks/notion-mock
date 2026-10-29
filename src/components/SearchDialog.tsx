"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { api } from "@/lib/client-api";
import type { SearchHit } from "@/lib/types";
import { Modal } from "./ui/Modal";

export default function SearchDialog({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [active, setActive] = useState(0);

  useEffect(() => {
    if (query.trim() === "") return;
    let cancelled = false;
    const timer = setTimeout(() => {
      void api
        .search(query)
        .then((results) => {
          if (!cancelled) setHits(results);
        })
        .catch(() => undefined);
    }, 180);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query]);

  // Results from an earlier query must not linger once the box is cleared.
  const visibleHits = query.trim() === "" ? [] : hits;
  const selected = Math.min(active, Math.max(0, visibleHits.length - 1));

  const open = (id: string) => {
    onClose();
    router.push(`/page/${id}`);
  };

  return (
    <Modal onClose={onClose} width="w-[560px]" top="pt-[12vh]">
      <input
        autoFocus
        value={query}
        onChange={(event) => {
          setQuery(event.target.value);
          setActive(0);
        }}
        onKeyDown={(event) => {
          if (visibleHits.length === 0) return;
          if (event.key === "ArrowDown") {
            event.preventDefault();
            setActive((at) => (at + 1) % visibleHits.length);
          } else if (event.key === "ArrowUp") {
            event.preventDefault();
            setActive((at) => (at - 1 + visibleHits.length) % visibleHits.length);
          } else if (event.key === "Enter") {
            event.preventDefault();
            open(visibleHits[selected].id);
          }
        }}
        placeholder="搜尋頁面標題與內容…"
        className="w-full bg-transparent px-4 py-3.5 text-sm text-ink outline-none placeholder:text-ink-faint"
      />
      <div className="max-h-[50vh] overflow-y-auto border-t border-line">
        {query.trim() !== "" && visibleHits.length === 0 && (
          <p className="px-4 py-6 text-center text-sm text-ink-faint">沒有符合的結果</p>
        )}
        {visibleHits.map((hit, index) => (
          <button
            key={hit.id}
            onMouseEnter={() => setActive(index)}
            onClick={() => open(hit.id)}
            className={`block w-full px-4 py-2.5 text-left transition hover-surface ${
              index === selected ? "bg-[var(--surface-hover)]" : ""
            }`}
          >
            <span className="block truncate text-sm text-ink">
              {hit.icon ?? "📄"} {hit.title || "無標題"}
            </span>
            {hit.snippet && (
              <span className="mt-0.5 block truncate text-xs text-ink-faint">{hit.snippet}</span>
            )}
          </button>
        ))}
      </div>
    </Modal>
  );
}
