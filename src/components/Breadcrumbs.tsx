"use client";

import Link from "next/link";
import type { PageSummary } from "@/lib/types";

/**
 * The chain from the workspace root down to this page.
 *
 * Deep trees collapse in the middle rather than wrapping or pushing the header
 * buttons off the end: the first and last two are what tell you where you are.
 */
export default function Breadcrumbs({ ancestors, title }: { ancestors: PageSummary[]; title: string }) {
  const collapsed = ancestors.length > 3;
  const shown = collapsed ? [ancestors[0], ...ancestors.slice(-2)] : ancestors;

  return (
    <nav className="flex min-w-0 items-center gap-1 text-sm text-ink-muted">
      {shown.map((page, index) => (
        <span key={page.id} className="flex min-w-0 items-center gap-1">
          {collapsed && index === 1 && <span className="text-ink-faint">…/</span>}
          <Link
            href={`/page/${page.id}`}
            className="max-w-[140px] truncate rounded px-1 py-0.5 transition hover-surface hover:text-ink"
          >
            {page.icon ?? "📄"} {page.title || "無標題"}
          </Link>
          <span className="text-ink-faint">/</span>
        </span>
      ))}
      <span className="truncate px-1 text-ink">{title || "無標題"}</span>
    </nav>
  );
}
