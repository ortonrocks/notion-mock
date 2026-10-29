"use client";

import { useRef, useState } from "react";

type ToolCall = { id: string; name: string; summary?: string };
type Proposal = { id: string; instruction: string; status: "running" | "ready" | "failed"; error?: string };

type ChatMessage = {
  role: "user" | "assistant";
  text: string;
  tools: ToolCall[];
  proposals: Proposal[];
};

const TOOL_LABELS: Record<string, string> = {
  read_current_page: "讀取目前頁面",
  search_pages: "搜尋工作區",
  read_page: "讀取其他頁面",
  propose_edit: "提出修改建議",
};

const SUGGESTIONS = [
  "這一頁在講什麼？",
  "幫我在最後加一段結論",
  "找出工作區裡和這一頁相關的筆記",
];

/** `code` lets the panel offer a fix instead of only printing the message. */
type PanelError = { message: string; code?: string };

export default function AIPanel({
  pageId,
  pageTitle,
  onClose,
  onRunInstruction,
  onOpenSettings,
}: {
  pageId: string;
  pageTitle: string;
  onClose: () => void;
  onRunInstruction: (instruction: string) => Promise<void>;
  onOpenSettings: () => void;
}) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<PanelError | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  /** Mutates the assistant message currently being streamed. */
  const patchLast = (update: (message: ChatMessage) => ChatMessage) =>
    setMessages((current) => {
      const next = [...current];
      next[next.length - 1] = update(next[next.length - 1]);
      return next;
    });

  const send = async (text: string) => {
    const prompt = text.trim();
    if (prompt === "" || busy) return;

    setError(null);
    setInput("");
    setBusy(true);

    const history = [
      ...messages.map((message) => ({ role: message.role, content: message.text })),
      { role: "user" as const, content: prompt },
    ].filter((message) => message.content.trim() !== "");

    setMessages((current) => [
      ...current,
      { role: "user", text: prompt, tools: [], proposals: [] },
      { role: "assistant", text: "", tools: [], proposals: [] },
    ]);
    queueMicrotask(() => scrollRef.current?.scrollTo({ top: 1e9 }));

    try {
      const response = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pageId, messages: history }),
      });

      if (!response.ok || !response.body) {
        const body = (await response.json().catch(() => ({}))) as { error?: string; code?: string };
        setError({
          message: body.error ?? `AI 服務回傳 ${response.status}`,
          code: body.code,
        });
        return;
      }

      await readEventStream(response.body, (event) => {
        switch (event.type) {
          case "text":
            patchLast((message) => ({ ...message, text: message.text + String(event.delta) }));
            break;
          case "tool_start":
            patchLast((message) => ({
              ...message,
              tools: [...message.tools, { id: String(event.id), name: String(event.name) }],
            }));
            break;
          case "tool_end":
            patchLast((message) => ({
              ...message,
              tools: message.tools.map((tool) =>
                tool.id === event.id ? { ...tool, summary: String(event.summary) } : tool,
              ),
            }));
            break;
          case "proposal": {
            const proposal: Proposal = {
              id: String(event.id),
              instruction: String(event.instruction),
              status: "running",
            };
            patchLast((message) => ({ ...message, proposals: [...message.proposals, proposal] }));
            void onRunInstruction(proposal.instruction)
              .then(() => updateProposal(setMessages, proposal.id, { status: "ready" }))
              .catch((cause: unknown) =>
                updateProposal(setMessages, proposal.id, {
                  status: "failed",
                  error: cause instanceof Error ? cause.message : String(cause),
                }),
              );
            break;
          }
          case "error":
            setError({
              message: String(event.message),
              code: typeof event.code === "string" ? event.code : undefined,
            });
            break;
        }
        scrollRef.current?.scrollTo({ top: 1e9 });
      });
    } catch (cause) {
      setError({ message: cause instanceof Error ? cause.message : String(cause) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <aside className="flex w-[380px] shrink-0 flex-col border-l border-line bg-surface-1">
      <header className="flex h-11 shrink-0 items-center gap-2 border-b border-line px-3">
        <span className="text-sm text-ink">✦ Claude</span>
        <span className="truncate text-xs text-ink-faint">· {pageTitle || "無標題"}</span>
        <button
          onClick={onClose}
          className="ml-auto rounded px-1.5 py-1 text-ink-faint hover-surface hover:text-ink"
          title="關閉面板"
        >
          ✕
        </button>
      </header>

      <div ref={scrollRef} className="min-h-0 flex-1 space-y-4 overflow-y-auto px-3 py-4">
        {messages.length === 0 && (
          <div className="pt-6">
            <p className="mb-3 text-lg text-ink">今天想做什麼？</p>
            <p className="mb-4 text-xs leading-relaxed text-ink-faint">
              我可以讀這一頁、搜尋工作區裡的其他頁面，也可以提議修改這一頁。
              所有修改都會先在編輯器裡標示出來，由你決定接受或拒絕。
            </p>
            <div className="space-y-1.5">
              {SUGGESTIONS.map((suggestion) => (
                <button
                  key={suggestion}
                  onClick={() => void send(suggestion)}
                  className="block w-full rounded-md border border-line px-3 py-2 text-left text-sm text-ink-muted transition hover-surface hover:text-ink"
                >
                  {suggestion}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((message, index) => (
          <div key={index}>
            {message.role === "user" ? (
              <div className="ml-auto w-fit max-w-[85%] rounded-xl bg-surface-2 px-3 py-2 text-sm text-ink">
                {message.text}
              </div>
            ) : (
              <div className="space-y-2">
                {message.tools.map((tool) => (
                  <div
                    key={tool.id}
                    className="flex items-center gap-2 rounded-md border border-line px-2.5 py-1.5 text-xs text-ink-faint"
                  >
                    <span>{tool.summary ? "✓" : "⋯"}</span>
                    <span className="text-ink-muted">{TOOL_LABELS[tool.name] ?? tool.name}</span>
                    {tool.summary && <span className="truncate">· {tool.summary}</span>}
                  </div>
                ))}

                {message.text && (
                  <p className="whitespace-pre-wrap text-sm leading-relaxed text-ink">{message.text}</p>
                )}

                {message.proposals.map((proposal) => (
                  <div
                    key={proposal.id}
                    className="rounded-md border border-accent/40 bg-accent/10 px-2.5 py-2 text-xs text-ink-muted"
                  >
                    <p className="mb-1 text-ink">✎ {proposal.instruction}</p>
                    {proposal.status === "running" && <p>正在編輯器中產生修改…</p>}
                    {proposal.status === "ready" && <p>修改已標示在編輯器中，請按接受或拒絕。</p>}
                    {proposal.status === "failed" && (
                      <p className="text-red-300">套用失敗：{proposal.error}</p>
                    )}
                  </div>
                ))}

                {busy && index === messages.length - 1 && message.text === "" && (
                  <p className="text-sm text-ink-faint">思考中…</p>
                )}
              </div>
            )}
          </div>
        ))}

        {error && (
          <div className="rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-200">
            {error.message}
            {error.code === "missing_api_key" && (
              <button
                onClick={onOpenSettings}
                className="mt-2 block rounded bg-red-500/30 px-2 py-1 text-red-100 transition hover:bg-red-500/50"
              >
                設定 API key
              </button>
            )}
          </div>
        )}
      </div>

      <div className="shrink-0 border-t border-line p-3">
        <textarea
          value={input}
          onChange={(event) => setInput(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              void send(input);
            }
          }}
          rows={2}
          placeholder={busy ? "回應中…" : "問 Claude，或請它修改這一頁…"}
          disabled={busy}
          className="w-full resize-none rounded-lg border border-line bg-surface-2 px-3 py-2 text-sm text-ink outline-none placeholder:text-ink-faint focus:border-accent/60 disabled:opacity-60"
        />
      </div>
    </aside>
  );
}

function updateProposal(
  setMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>,
  id: string,
  patch: Partial<Proposal>,
) {
  setMessages((current) =>
    current.map((message) => ({
      ...message,
      proposals: message.proposals.map((proposal) =>
        proposal.id === id ? { ...proposal, ...patch } : proposal,
      ),
    })),
  );
}

/** Reads the `data:`-prefixed SSE frames the chat route emits. */
async function readEventStream(
  body: ReadableStream<Uint8Array>,
  onEvent: (event: Record<string, unknown>) => void,
) {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    let boundary = buffer.indexOf("\n\n");
    while (boundary !== -1) {
      const frame = buffer.slice(0, boundary);
      buffer = buffer.slice(boundary + 2);
      const payload = frame.replace(/^data: ?/, "");
      if (payload) {
        try {
          onEvent(JSON.parse(payload) as Record<string, unknown>);
        } catch {
          // Ignore partial or malformed frames.
        }
      }
      boundary = buffer.indexOf("\n\n");
    }
  }
}
