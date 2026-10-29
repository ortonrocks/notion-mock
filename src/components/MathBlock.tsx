"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createReactBlockSpec } from "@blocknote/react";
import katex from "katex";
import "katex/dist/katex.min.css";

/**
 * A display-math block. BlockNote has no built-in equation block, so this adds
 * one: the LaTeX source lives in the block's `latex` prop, and KaTeX renders it.
 * Click the rendered formula to edit the source, Escape or click-away to render
 * it again.
 */
export const MathBlock = createReactBlockSpec(
  {
    type: "math",
    propSchema: { latex: { default: "" } },
    content: "none",
  },
  {
    render: MathBlockView,
    // Copying a math block out of the editor should yield something readable.
    toExternalHTML: ({ block }) => <pre>{`$$\n${block.props.latex}\n$$`}</pre>,
  },
);

type MathBlockViewProps = {
  block: { props: { latex: string } };
  editor: { isEditable: boolean; updateBlock: (block: never, update: never) => void };
};

function MathBlockView({ block, editor }: MathBlockViewProps) {
  const latex = block.props.latex;
  const [editing, setEditing] = useState(latex === "");
  const [draft, setDraft] = useState(latex);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!editing) return;
    // The slash menu moves the editor selection onto the new block after React
    // has painted it, which takes focus straight back off the textarea. Landing
    // the focus on the next frame wins that race; without it, typing after
    // `/math` goes into the document instead of the equation.
    const frame = requestAnimationFrame(() => textareaRef.current?.focus());
    return () => cancelAnimationFrame(frame);
  }, [editing]);

  const commit = () => {
    setEditing(false);
    if (draft !== latex) {
      editor.updateBlock(block as never, { props: { latex: draft } } as never);
    }
  };

  if (editing || !editor.isEditable) {
    return (
      <div className="my-2 w-full" data-math-block>
        <textarea
          ref={textareaRef}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={commit}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.preventDefault();
              commit();
            }
            // Keep the editor's own shortcuts out of the textarea.
            event.stopPropagation();
          }}
          rows={Math.max(2, draft.split("\n").length)}
          spellCheck={false}
          placeholder="輸入 LaTeX，例如 e^{i\pi} + 1 = 0"
          className="w-full resize-y rounded-md border border-line bg-surface-2 px-3 py-2 font-mono text-sm text-ink outline-none placeholder:text-ink-faint focus:border-accent/60"
        />
        <p className="mt-1 text-xs text-ink-faint">按 Esc 或點擊別處即可渲染</p>
      </div>
    );
  }

  return (
    <div
      data-math-block
      onClick={() => {
        setDraft(latex);
        setEditing(true);
      }}
      className="my-2 w-full cursor-pointer overflow-x-auto rounded-md px-3 py-2 text-center hover-surface"
    >
      <MathOutput latex={latex} />
    </div>
  );
}

function MathOutput({ latex }: { latex: string }) {
  // KaTeX renders synchronously, so this is plain derived state.
  const { html, error } = useMemo(() => {
    try {
      return {
        html: katex.renderToString(latex, { displayMode: true, throwOnError: true }),
        error: null as string | null,
      };
    } catch (cause) {
      return { html: "", error: cause instanceof Error ? cause.message : String(cause) };
    }
  }, [latex]);

  if (error) {
    return (
      <span className="font-mono text-sm text-red-300" title={error}>
        LaTeX 語法錯誤：{latex}
      </span>
    );
  }
  return <span dangerouslySetInnerHTML={{ __html: html }} />;
}
