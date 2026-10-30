"use client";

import Link from "next/link";
import type { Backlink } from "@/lib/types";

/**
 * The pages pointing at this one, shown under the document.
 *
 * Hidden entirely when there are none: an empty "Backlinks" heading on every
 * page is noise, and this is a notebook, not a wiki with a fixed chrome.
 */
export default function BacklinksPanel({ backlinks }: { backlinks: Backlink[] }) {
  if (backlinks.length === 0) return null;

  return (
    <section className="mt-16 border-t border-line pt-5">
      <h2 className="text-xs font-medium text-ink-faint">
        {backlinks.length} 個頁面連到這裡
      </h2>
      <ul className="mt-2 space-y-0.5">
        {backlinks.map((link) => (
          <li key={link.id}>
            <Link
              href={`/page/${link.id}`}
              className="block rounded-md px-2 py-1.5 transition hover-surface"
            >
              <span className="flex items-center gap-1.5 text-sm text-ink">
                <span className="shrink-0">{link.icon ?? "📄"}</span>
                <span className="truncate">{link.title || "無標題"}</span>
                {link.kind === "link" && (
                  <span className="shrink-0 text-xs text-ink-faint">連結</span>
                )}
              </span>
              {link.context && (
                <span className="mt-0.5 block truncate text-xs text-ink-faint">{link.context}</span>
              )}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
