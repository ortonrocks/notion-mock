"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { api } from "@/lib/client-api";
import type { SearchHit } from "@/lib/types";

export default function SearchDialog({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<SearchHit[]>([]);

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

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

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 pt-[12vh]"
      onClick={onClose}
    >
      <div
        className="w-[560px] max-w-[90vw] overflow-hidden rounded-xl border border-line bg-surface-1 shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <input
          autoFocus
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="搜尋頁面標題與內容…"
          className="w-full bg-transparent px-4 py-3.5 text-sm text-ink outline-none placeholder:text-ink-faint"
        />
        <div className="max-h-[50vh] overflow-y-auto border-t border-line">
          {query.trim() !== "" && visibleHits.length === 0 && (
            <p className="px-4 py-6 text-center text-sm text-ink-faint">沒有符合的結果</p>
          )}
          {visibleHits.map((hit) => (
            <button
              key={hit.id}
              onClick={() => {
                onClose();
                router.push(`/page/${hit.id}`);
              }}
              className="block w-full px-4 py-2.5 text-left transition hover:bg-[var(--surface-hover)]"
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
      </div>
    </div>
  );
}
