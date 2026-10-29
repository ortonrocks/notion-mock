"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useRef, useState } from "react";
import type { BlockNoteEditor } from "@blocknote/core";
import AIPanel from "./AIPanel";
import PageHeader from "./PageHeader";
import SettingsDialog from "./SettingsDialog";
import Sidebar from "./Sidebar";
import { api, type ApiKeyStatus } from "@/lib/client-api";
import type { Page, PageTreeNode } from "@/lib/types";

// BlockNote touches the DOM on construction, so it only runs in the browser.
const Editor = dynamic(() => import("./Editor"), {
  ssr: false,
  loading: () => <div className="px-2 pt-4 text-sm text-ink-faint">載入編輯器…</div>,
});

export default function Workspace({ page, initialTree }: { page: Page; initialTree: PageTreeNode[] }) {
  const [tree, setTree] = useState(initialTree);
  const [title, setTitle] = useState(page.title);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [aiPanelOpen, setAiPanelOpen] = useState(true);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [keyStatus, setKeyStatus] = useState<ApiKeyStatus | null>(null);
  const editorRef = useRef<BlockNoteEditor<never, never, never> | null>(null);

  // BlockNote's transport swallows the editor route's 503 body, so a missing
  // key would otherwise surface there as a bare "AI 請求失敗". Asking once on
  // mount lets both AI routes share one clear prompt.
  useEffect(() => {
    void api.apiKey.status().then(setKeyStatus).catch(() => {});
  }, []);

  const refreshTree = useCallback(async () => {
    setTree(await api.tree());
  }, []);

  const handleTitleChange = useCallback(
    (next: string) => {
      setTitle(next);
      setTree((current) => renameInTree(current, page.id, next));
    },
    [page.id],
  );

  /**
   * Hands an instruction to the editor's AI extension. The extension streams
   * the change in as a reviewable suggestion rather than applying it, which is
   * what makes the sidebar agent's `propose_edit` safe.
   */
  const runEditorInstruction = useCallback(async (instruction: string) => {
    const editor = editorRef.current;
    if (!editor) throw new Error("編輯器尚未就緒");
    const { AIExtension } = await import("@blocknote/xl-ai");
    const ai = editor.getExtension(AIExtension);
    if (!ai) throw new Error("找不到 AI 擴充");

    // The review flow (status tracking, accept/reject) only runs while the AI
    // menu is open at a block. Without this the changes land in the document
    // with nothing to approve them, which is exactly what we want to avoid.
    const blocks = editor.document as { id: string }[];
    const anchor = blocks[blocks.length - 1];
    if (anchor) ai.openAIMenuAtBlock(anchor.id);

    await ai.invokeAI({ userPrompt: instruction, useSelection: false });
  }, []);

  return (
    <div className="flex h-dvh w-full overflow-hidden bg-surface-0">
      {sidebarOpen && (
        <Sidebar
          tree={tree}
          activeId={page.id}
          onRefresh={refreshTree}
          onCollapse={() => setSidebarOpen(false)}
        />
      )}

      <main className="flex min-w-0 flex-1 flex-col">
        <PageHeader
          page={page}
          title={title}
          sidebarOpen={sidebarOpen}
          aiPanelOpen={aiPanelOpen}
          onOpenSidebar={() => setSidebarOpen(true)}
          onToggleAiPanel={() => setAiPanelOpen((open) => !open)}
          onRunInstruction={runEditorInstruction}
          onOpenSettings={() => setSettingsOpen(true)}
        />

        {keyStatus !== null && !keyStatus.hasKey && (
          <div className="flex items-center justify-center gap-3 border-b border-line bg-amber-500/10 px-4 py-2 text-sm">
            <span className="text-amber-200">還沒有設定 Claude API key，AI 功能都不會動</span>
            <button
              onClick={() => setSettingsOpen(true)}
              className="rounded-full bg-amber-500/80 px-3 py-1 text-xs font-medium text-black transition hover:brightness-110"
            >
              現在設定
            </button>
          </div>
        )}

        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="mx-auto w-full max-w-[720px] px-14 pb-40 pt-12">
            <input
              value={title}
              onChange={(event) => handleTitleChange(event.target.value)}
              // The title is a single field with one editor, so last-write-wins
              // is the right behaviour here; only the document body is versioned.
              onBlur={(event) => {
                void api.update(page.id, { title: event.target.value }).catch((error) => {
                  console.error("標題儲存失敗", error);
                });
              }}
              placeholder="無標題"
              className="mb-3 w-full bg-transparent text-[40px] font-bold leading-tight text-ink outline-none placeholder:text-[#ffffff21]"
            />
            <Editor
              pageId={page.id}
              initialContent={page.content}
              initialVersion={page.version}
              onReady={(editor) => {
                editorRef.current = editor as never;
              }}
            />
          </div>
        </div>
      </main>

      {aiPanelOpen && (
        <AIPanel
          pageId={page.id}
          pageTitle={title}
          onClose={() => setAiPanelOpen(false)}
          onRunInstruction={runEditorInstruction}
          onOpenSettings={() => setSettingsOpen(true)}
        />
      )}

      {settingsOpen && (
        <SettingsDialog
          status={keyStatus}
          onStatusChange={setKeyStatus}
          onClose={() => setSettingsOpen(false)}
        />
      )}
    </div>
  );
}

function renameInTree(nodes: PageTreeNode[], id: string, title: string): PageTreeNode[] {
  return nodes.map((node) =>
    node.id === id
      ? { ...node, title }
      : { ...node, children: renameInTree(node.children, id, title) },
  );
}
