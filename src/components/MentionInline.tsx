"use client";

import { createReactInlineContentSpec } from "@blocknote/react";

/**
 * An `@`-mention: a chip that links to another page.
 *
 * `content: "none"` makes it an atom — one indivisible thing the cursor steps
 * over rather than into, which is what you want from a chip.
 *
 * The title is stored alongside the id. It is denormalised on purpose: the
 * chip renders instantly without a lookup, and a mention of a page that has
 * since been trashed still says what it used to be instead of going blank.
 * The workspace passes down live titles so a renamed page is not stale, and
 * this falls back to the stored label when it has none.
 */
export const MentionInline = createReactInlineContentSpec(
  {
    type: "mention",
    propSchema: {
      pageId: { default: "" },
      label: { default: "" },
    },
    content: "none",
  },
  {
    render: ({ inlineContent }) => {
      const { pageId, label } = inlineContent.props;
      return (
        <a
          href={`/page/${pageId}`}
          data-mention={pageId}
          // The editor owns the click; navigating is the browser's job only
          // when the document is read-only, so this stays a plain anchor.
          className="rounded px-0.5 text-accent underline decoration-accent/40 underline-offset-2 hover:decoration-accent"
        >
          @{label || "無標題"}
        </a>
      );
    },
    toExternalHTML: ({ inlineContent }) => (
      <a href={`/page/${inlineContent.props.pageId}`}>@{inlineContent.props.label || "無標題"}</a>
    ),
  },
);
