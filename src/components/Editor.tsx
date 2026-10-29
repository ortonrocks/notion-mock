"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  BlockNoteSchema,
  defaultBlockSpecs,
  filterSuggestionItems,
  insertOrUpdateBlockForSlashMenu,
  type BlockNoteEditor,
} from "@blocknote/core";
import {
  FormattingToolbar,
  FormattingToolbarController,
  SuggestionMenuController,
  getDefaultReactSlashMenuItems,
  getFormattingToolbarItems,
  useCreateBlockNote,
  useExtensionState,
} from "@blocknote/react";
import { BlockNoteView } from "@blocknote/mantine";
import { zhTW } from "@blocknote/core/locales";
import { syntaxHighlighter } from "@blocknote/code-block";
import { AIExtension, AIMenuController, AIToolbarButton, getAISlashMenuItems } from "@blocknote/xl-ai";
import { zhTw as aiZhTW } from "@blocknote/xl-ai/locales";
import { DefaultChatTransport } from "ai";
import "@blocknote/core/fonts/inter.css";
import "@blocknote/mantine/style.css";
import "@blocknote/xl-ai/style.css";
import { MathBlock } from "./MathBlock";
import { api, ConflictError } from "@/lib/client-api";
import { cleanUpAfterAI } from "@/lib/editor-cleanup";

const AUTOSAVE_DELAY_MS = 500;

type SaveState = "idle" | "saving" | "saved" | "error" | "conflict";

/** The default blocks plus the LaTeX equation block. */
const schema = BlockNoteSchema.create({
  blockSpecs: { ...defaultBlockSpecs, math: MathBlock() },
});

/** Stores a pasted or dropped file and returns the URL the block points at. */
async function uploadFile(file: File): Promise<string> {
  const form = new FormData();
  form.append("file", file);
  const response = await fetch("/api/upload", { method: "POST", body: form });
  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? `上傳失敗 (${response.status})`);
  }
  const { url } = (await response.json()) as { url: string };
  return url;
}

export default function Editor({
  pageId,
  initialContent,
  initialVersion,
  onReady,
}: {
  pageId: string;
  initialContent: unknown[];
  initialVersion: number;
  onReady: (editor: BlockNoteEditor<never, never, never>) => void;
}) {
  const transport = useMemo(
    () => new DefaultChatTransport({ api: "/api/ai/editor" }),
    [],
  );

  const editor = useCreateBlockNote({
    schema,
    initialContent: initialContent.length > 0 ? (initialContent as never) : undefined,
    // The AI extension reads its labels from `dictionary.ai`; without it every
    // AI entry point throws "AI dictionary not found" and the editor fails to
    // mount at all.
    dictionary: { ...zhTW, ai: aiZhTW },
    extensions: [
      // Shiki-based highlighting for code blocks (`/code` or ```).
      syntaxHighlighter,
      AIExtension({ transport, agentCursor: { name: "Claude", color: "#8bc6ff" } }),
    ],
    uploadFile,
  });

  useEffect(() => {
    onReady(editor as never);
  }, [editor, onReady]);

  // "closed" means no AI request is in flight and nothing is awaiting review.
  const aiStatus = useExtensionState(AIExtension, {
    editor,
    selector: (state) => (state.aiMenuState === "closed" ? "closed" : state.aiMenuState.status),
  });

  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [saveState, setSaveState] = useState<SaveState>("idle");

  // The version we last saw from the server. Sent with every write so the
  // server can reject one built on a copy somebody else has moved past.
  const versionRef = useRef(initialVersion);
  // A request is in flight. Overlapping saves are the reason an older snapshot
  // could win: HTTP responses are not ordered.
  const savingRef = useRef(false);
  // The document changed while a save was in flight, so one more is owed.
  const dirtyRef = useRef(false);
  // Once the page has diverged, stop writing entirely until the user reloads.
  const conflictRef = useRef(false);
  const saveRef = useRef<() => Promise<void>>(null!);

  const save = useCallback(async () => {
    if (conflictRef.current) return;
    if (savingRef.current) {
      dirtyRef.current = true;
      return;
    }

    savingRef.current = true;
    dirtyRef.current = false;
    setSaveState("saving");

    try {
      const page = await api.update(pageId, {
        content: editor.document,
        version: versionRef.current,
      });
      versionRef.current = page.version;
      setSaveState("saved");
    } catch (error) {
      if (error instanceof ConflictError) {
        conflictRef.current = true;
        setSaveState("conflict");
      } else {
        setSaveState("error");
        console.error("自動儲存失敗", error);
      }
    } finally {
      savingRef.current = false;
      if (dirtyRef.current && !conflictRef.current) void saveRef.current();
    }
  }, [editor, pageId]);

  useEffect(() => {
    saveRef.current = save;
  }, [save]);

  const scheduleSave = () => {
    // While the AI is writing or its changes are awaiting review the document
    // holds suggestions the user has not agreed to. Persisting them would make
    // "reject" meaningless, so saving waits until the review is resolved.
    if (aiStatus !== "closed") return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => void save(), AUTOSAVE_DELAY_MS);
  };

  // Whether the AI has been open since the last time this ran. Without it the
  // effect below would also fire on mount, when there is nothing to clean up
  // and nothing to save.
  const aiWasOpenRef = useRef(false);

  // Once a review closes, whatever the user accepted is owed to the database,
  // after the pass that repairs the two things the AI's HTML cannot express.
  // Going through a timer keeps the write out of the render pass, and keying
  // only on `aiStatus` stops it re-firing whenever `save` is rebuilt.
  useEffect(() => {
    if (aiStatus !== "closed") {
      aiWasOpenRef.current = true;
      return;
    }
    if (!aiWasOpenRef.current) return;
    aiWasOpenRef.current = false;

    const timer = setTimeout(() => {
      cleanUpAfterAI(editor as never);
      void saveRef.current();
    }, 0);
    return () => clearTimeout(timer);
  }, [aiStatus, editor]);

  // A debounced save that has not fired yet is still owed. Without this,
  // navigating away or hiding the tab within the debounce window loses the edit.
  useEffect(() => {
    const flush = () => {
      if (saveTimer.current) {
        clearTimeout(saveTimer.current);
        saveTimer.current = null;
        void saveRef.current();
      }
    };
    const onHidden = () => {
      if (document.visibilityState === "hidden") flush();
    };
    document.addEventListener("visibilitychange", onHidden);
    return () => {
      document.removeEventListener("visibilitychange", onHidden);
      flush();
    };
  }, []);

  // A conflict means this copy cannot be saved. Reloading is the way out, so
  // there has to be a way to take your unsaved work with you first.
  const copyDocument = useCallback(() => {
    const markdown = editor.blocksToMarkdownLossy(editor.document);
    return navigator.clipboard.writeText(markdown);
  }, [editor]);

  const ai = editor.getExtension(AIExtension);

  return (
    <>
      <SaveIndicator state={saveState} onCopy={copyDocument} />
      <AIReviewBar status={aiStatus} ai={ai} />
      <BlockNoteView
        editor={editor}
        theme="dark"
        onChange={scheduleSave}
        // Replaced below so the AI entry points can be added.
        formattingToolbar={false}
        slashMenu={false}
      >
        <AIMenuController />

        <FormattingToolbarController
          formattingToolbar={() => (
            <FormattingToolbar>
              <AIToolbarButton />
              {getFormattingToolbarItems()}
            </FormattingToolbar>
          )}
        />

        <SuggestionMenuController
          triggerCharacter="/"
          getItems={async (query) =>
            filterSuggestionItems(
              [
                ...getDefaultReactSlashMenuItems(editor),
                ...getAISlashMenuItems(editor),
                {
                  title: "數學公式",
                  subtext: "用 LaTeX 寫一條置中的算式",
                  aliases: ["math", "latex", "formula", "equation", "公式", "算式"],
                  group: "基本區塊",
                  onItemClick: () =>
                    insertOrUpdateBlockForSlashMenu(editor, { type: "math", props: { latex: "" } }),
                },
              ],
              query,
            )
          }
        />
      </BlockNoteView>
    </>
  );
}

/**
 * Reports what autosave is doing. Previously a failed save only reached the
 * console, so the user had no way to know their work was not being stored.
 *
 * A conflict is the loud case: the page has been written from somewhere else
 * (another tab, usually), so saving stops entirely rather than overwriting it.
 */
function SaveIndicator({ state, onCopy }: { state: SaveState; onCopy: () => Promise<void> }) {
  const [copied, setCopied] = useState(false);

  if (state === "conflict") {
    return (
      <div className="fixed inset-x-0 top-4 z-50 flex justify-center">
        <div className="flex items-center gap-3 rounded-full border border-amber-500/40 bg-amber-500/10 px-4 py-2 text-sm shadow-xl">
          <span className="text-amber-200">
            這一頁在別的地方被修改過，為了不覆蓋掉那邊的內容，已停止自動儲存
          </span>
          <button
            onClick={() => {
              void onCopy().then(() => setCopied(true));
            }}
            className="rounded-full px-3 py-1 text-amber-200 transition hover:bg-amber-500/20"
          >
            {copied ? "已複製" : "複製這邊的內容"}
          </button>
          <button
            onClick={() => window.location.reload()}
            className="rounded-full bg-amber-500/80 px-3 py-1 font-medium text-black transition hover:brightness-110"
          >
            重新載入
          </button>
        </div>
      </div>
    );
  }

  if (state === "error") {
    return (
      <div className="fixed right-6 top-4 z-50 rounded-full border border-red-500/40 bg-red-500/10 px-3 py-1 text-xs text-red-200">
        儲存失敗，變更還沒寫入
      </div>
    );
  }

  if (state === "idle") return null;

  return (
    <div className="pointer-events-none fixed right-6 top-4 z-40 text-xs text-ink-faint">
      {state === "saving" ? "儲存中…" : "已儲存"}
    </div>
  );
}

/**
 * A fixed bar reporting what the AI is doing and, once it is done, letting the
 * user keep or discard the proposed changes.
 *
 * xl-ai also renders accept/reject inside its own floating menu, but that menu
 * is anchored to a block and easy to miss or scroll away from. Nothing is
 * written to the database until one of these buttons is pressed.
 */
function AIReviewBar({
  status,
  ai,
}: {
  status: "closed" | "user-input" | "thinking" | "ai-writing" | "user-reviewing" | "error";
  ai: ReturnType<BlockNoteEditor<never, never, never>["getExtension"]> extends infer T ? T : never;
}) {
  if (status === "closed" || status === "user-input") return null;

  const extension = ai as unknown as {
    acceptChanges: () => void;
    rejectChanges: () => void;
    retry: () => Promise<void>;
  };

  const busy = status === "thinking" || status === "ai-writing";

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-6 z-40 flex justify-center">
      <div className="pointer-events-auto flex items-center gap-3 rounded-full border border-line bg-surface-2 px-4 py-2 text-sm shadow-xl">
        {busy && <span className="text-ink-muted">{status === "thinking" ? "Claude 思考中…" : "Claude 正在改寫…"}</span>}

        {status === "error" && (
          <>
            <span className="text-red-300">AI 請求失敗</span>
            <button
              onClick={() => void extension.retry()}
              className="rounded-full px-3 py-1 text-ink-muted transition hover:bg-[var(--surface-hover)] hover:text-ink"
            >
              重試
            </button>
            <button
              onClick={() => extension.rejectChanges()}
              className="rounded-full px-3 py-1 text-ink-muted transition hover:bg-[var(--surface-hover)] hover:text-ink"
            >
              關閉
            </button>
          </>
        )}

        {status === "user-reviewing" && (
          <>
            <span className="text-ink-muted">AI 的修改已標示在文件中</span>
            <button
              onClick={() => extension.rejectChanges()}
              className="rounded-full px-3 py-1 text-ink-muted transition hover:bg-[var(--surface-hover)] hover:text-ink"
            >
              拒絕
            </button>
            <button
              // xl-ai renders its own accept control in a floating menu, so the
              // demo script needs a way to tell this one apart from it.
              data-ai-accept
              onClick={() => extension.acceptChanges()}
              className="rounded-full bg-accent px-3 py-1 font-medium text-white transition hover:brightness-110"
            >
              接受
            </button>
          </>
        )}
      </div>
    </div>
  );
}
