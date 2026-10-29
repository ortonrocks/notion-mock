# Notion Mock

A local, single-user notebook in the style of Notion, with Claude wired into the
editor. You bring your own API key, so there is no seat price and no AI quota.

[繁體中文說明在下方](#notion-mock-中文說明)

![A page being written, with a code block, a LaTeX equation, and the AI proposing an edit that is accepted](docs/demo.gif)

## Why

I wanted Notion's block editor with an AI that can actually change the page —
not just autocomplete next to it — and I did not want a subscription or a
monthly cap on how often I can ask. So this runs on your machine, keeps
everything in one SQLite file, and talks to Claude with your key.

It is not trying to be Notion. There is no sharing, no collaboration, no mobile
app. It is a good notebook for one person.

## Getting started

```bash
npm install
echo "ANTHROPIC_API_KEY=sk-ant-..." > .env.local
npm run dev
```

Open http://localhost:3000. The first run creates a starter page.

Everything lives in `data/notion.db` and `data/uploads/`, both ignored by git.
Delete the directory to start over; copy it to back up.

### The API key

You can skip `.env.local` and set the key from the gear icon in the page header
instead. It is checked against the API before being saved, stored in the local
database, and applies to the next request — no restart. A key set there wins
over the environment, and the browser is only ever told the last four
characters.

## What it does

The editor is [BlockNote](https://www.blocknotejs.org/) — nested blocks, slash
commands, drag handles, code blocks with Shiki highlighting, and a LaTeX block
via `/math`. The sidebar holds a nested page tree, and `Ctrl`+`K` searches
titles and body text. Edits autosave half a second after you stop typing.

You can paste or drop screenshots, images, video and PDFs straight into a page.
They are stored as files and served from `/api/files/`, not inlined into the
document JSON.

### AI

Four entry points, all of them preview-before-apply:

| Where | How |
|---|---|
| Slash menu | Type `/` then **Ask AI** |
| Selection | Select text, press the AI button in the toolbar |
| Whole page | Summarize or translate from the page header |
| Chat panel | On the right, with tools over the workspace |

Every change the AI makes arrives as a highlighted diff in the document. Nothing
is written to the database until you accept it, and autosave is suspended while
a change is waiting for review.

The chat agent gets four tools, and only one of them can touch your content:

- `read_current_page` — read the page you are on
- `search_pages` — search the workspace, read-only
- `read_page` — read any other page, read-only
- `propose_edit` — suggest a change to **the current page**; this does not write
  anything, it hands the instruction back to the editor's review flow

There is no tool that modifies another page.

Both AI routes also send the images a page references (PNG, JPEG, GIF, WebP, up
to eight per request) as real vision input, so a summary or a rewrite takes the
content of your screenshots into account instead of seeing an empty `<img>` tag.
See `src/lib/ai/images.ts`.

## Layout

```
src/
  app/
    page/[id]/page.tsx     page view (server component)
    api/pages/**           page CRUD
    api/search             search
    api/upload             paste / drop uploads
    api/files/[name]       serves uploaded files
    api/ai/editor          in-editor AI (BlockNote xl-ai protocol)
    api/ai/chat            chat agent (SSE + tool-use loop)
  components/
    Workspace.tsx          three-pane shell, owns the editor instance
    Sidebar.tsx            page tree
    Editor.tsx             BlockNote + AI extension
    MathBlock.tsx          KaTeX equation block
    AIPanel.tsx            chat panel
    PageHeader.tsx         whole-page AI actions
  lib/
    db.ts                  SQLite layer
    blocks.ts              block JSON to markdown
    uploads.ts             upload storage
    ai/images.ts           page images to Claude vision input
    ai/models.ts           model ids (change them here)
    ai/tools.ts            agent tool definitions
    ai/prompts.ts          agent system prompt
    settings.ts            where the API key is read from and stored
scripts/
  record-demo.mjs          regenerates docs/demo.gif
```

`npm run demo` re-records the GIF above. It builds the app, runs it against a
throwaway database in your temp directory so none of your own notes can appear
in it, drives Chromium through the script, and converts the capture with
ffmpeg. The AI steps make real API calls.

## Two SDKs, on purpose

`api/ai/chat` uses the official `@anthropic-ai/sdk` and runs its own tool-use
loop, which makes it easy to stream each step to the browser over SSE.

`api/ai/editor` uses Vercel's `@ai-sdk/anthropic` instead, because
`@blocknote/xl-ai` is built on the AI SDK and its streaming and diff protocol
has to be spoken exactly.

`ai` is pinned to v6 with `@ai-sdk/anthropic` v3 for the same reason. Upgrading
to v7 leaves two copies of `ai` in the tree and the protocol breaks in ways that
are not obvious from the error. If you touch those versions, check `npm ls ai`
afterwards.

## Models

Defaults to `claude-opus-5-5` for both routes. Change them in
`src/lib/ai/models.ts`, or set `CLAUDE_CHAT_MODEL` / `CLAUDE_EDITOR_MODEL` in
`.env.local`. Opus is the expensive option — `claude-sonnet-5-5` is half the
price and `claude-haiku-5-5` is a fraction of it.

## Known limitations

These are real and I have not fixed them yet.

- **No auth.** It assumes one person on one machine. Do not put it on the open
  internet as it stands.
- **Concurrent edits stop, they do not merge.** Each page body carries a
  version; a save built on a stale one is rejected and autosave halts with a
  prompt to reload. That protects you from the second tab quietly overwriting
  the first, but there is no merging — one side reloads and loses its
  unsaved edits.
- **Search is a `LIKE` scan**, so it reads every row. Fine for a few hundred
  pages, not for ten thousand.
- The in-editor AI works in HTML, so it cannot produce math blocks. Insert those
  yourself with `/math`.
- The AI occasionally emits a markdown table that converts into an empty 1x1
  table block. Select it and delete it.

## License

`@blocknote/xl-ai` is GPL-3.0 OR PROPRIETARY (BlockNote's core is MPL-2.0), so
this project is GPL-3.0. Distributing a closed-source build would need a
commercial license from BlockNote, or a diff-preview layer written from scratch.

Not affiliated with, endorsed by, or connected to Notion Labs, Inc. "Notion" is
their trademark; this project only borrows the layout.

---

# Notion Mock 中文說明

一個本機、單人使用的 Notion 風格筆記本，編輯器內建 Claude。你用自己的 API
key，所以沒有月費，也沒有 AI 使用額度。

![編輯頁面，依序示範程式碼區塊、LaTeX 公式，以及 AI 提出修改後按下接受](docs/demo.gif)

## 為什麼做這個

我想要 Notion 的區塊編輯器，搭配一個**真的能改動頁面**的 AI——不是在旁邊幫你
自動補字而已——而且不想為此付訂閱費，或是每個月被限制能問幾次。所以這個東西跑
在你自己的電腦上，資料放在一個 SQLite 檔案裡，用你自己的 key 呼叫 Claude。

它沒有要變成 Notion。沒有分享、沒有協作、沒有手機 app。它是一個給一個人用的、
好用的筆記本。

## 開始使用

```bash
npm install
echo "ANTHROPIC_API_KEY=sk-ant-..." > .env.local
npm run dev
```

打開 http://localhost:3000，第一次啟動會自動建立一頁範例。

所有東西都在 `data/notion.db` 和 `data/uploads/`，兩個都已經被 git 忽略。想重來
就刪掉整個資料夾，想備份就整個複製走。

### 關於 API key

你也可以完全不碰 `.env.local`，直接點頁首的齒輪設定。送出時會先向 API 驗證過才
存進本機資料庫，下一個請求就生效，**不需要重啟**。在這裡設定的 key 優先於環境
變數，而且瀏覽器永遠只會拿到最後四碼。

## 功能

編輯器是 [BlockNote](https://www.blocknotejs.org/)：巢狀區塊、斜線指令、拖曳
把手、用 Shiki 上色的程式碼區塊，以及用 `/math` 插入的 LaTeX 公式區塊。左側欄
是巢狀頁面樹，`Ctrl`+`K` 可以搜尋標題和內文。停止輸入半秒後自動存檔。

截圖、圖片、影片和 PDF 都可以直接貼上或拖進頁面。檔案會另外存起來、由
`/api/files/` 提供，不會塞進文件的 JSON 裡。

### AI

四個入口，全部都是先預覽再套用：

| 位置 | 操作 |
|---|---|
| 斜線選單 | 輸入 `/` 之後選 **Ask AI** |
| 選取文字 | 選起來，按工具列上的 AI 按鈕 |
| 整頁 | 頁首的摘要／翻譯 |
| 對話面板 | 右側，可以操作整個工作區 |

AI 做的每一處修改都會以差異標示出現在文件裡。**你按下接受之前，不會有任何東西
寫進資料庫**，而且在等待審核期間自動存檔會暫停。

對話 agent 有四個工具，其中只有一個碰得到你的內容：

- `read_current_page` — 讀你正在看的這一頁
- `search_pages` — 搜尋整個工作區，唯讀
- `read_page` — 讀其他任何一頁，唯讀
- `propose_edit` — 對**目前這一頁**提出修改建議。它不會寫入任何東西，只是把指令
  交回給編輯器的審核流程

沒有任何工具可以改動其他頁面。

兩條 AI 路線都會把頁面引用到的圖片（PNG、JPEG、GIF、WebP，單次最多八張）當成
真正的影像輸入送出去，所以摘要或改寫會把你截圖裡的內容算進去，而不是只看到一個
空的 `<img>` 標籤。實作在 `src/lib/ai/images.ts`。

## 專案結構

見上方英文版的 Layout 一節。

`npm run demo` 可以重新錄製上面那張 GIF：它會建置、用你暫存目錄裡一個全新的資料庫
跑起來（所以你自己的筆記不可能入鏡），用腳本操作 Chromium，再用 ffmpeg 轉檔。
其中 AI 的部分會真的呼叫 API。

## 為什麼用了兩套 SDK

這是刻意的。

`api/ai/chat` 用官方的 `@anthropic-ai/sdk`，自己跑 tool use 迴圈，這樣比較容易
把每一步透過 SSE 串到瀏覽器顯示。

`api/ai/editor` 改用 Vercel 的 `@ai-sdk/anthropic`，因為 `@blocknote/xl-ai`
是建在 AI SDK 上的，它的串流和差異預覽協定必須照規格走。

`ai` 固定在 v6、搭配 `@ai-sdk/anthropic` v3，原因相同。升到 v7 會讓相依樹裡同時
存在兩份 `ai`，協定壞掉的方式從錯誤訊息完全看不出來。如果你動了這些版本，記得
事後跑一次 `npm ls ai` 確認。

## 模型

兩條路線都預設 `claude-opus-5-5`。要換就改 `src/lib/ai/models.ts`，或在
`.env.local` 設 `CLAUDE_CHAT_MODEL` / `CLAUDE_EDITOR_MODEL`。Opus 是最貴的選項，
`claude-sonnet-5-5` 大約是一半價格，`claude-haiku-5-5` 更是只有零頭。

## 已知限制

以下都是真的，而且我還沒修。

- **沒有登入機制。** 它假設只有一個人、一台電腦。就目前狀態不要放到公開網路上。
- **同時編輯會中止，不會合併。** 每一頁的內文都帶版本號，用過期版本送出的存檔會被
  拒絕，自動存檔隨即停止並提示重新載入。這能擋住第二個分頁靜默覆蓋第一個，但沒有
  合併機制——其中一邊重新載入時，會失去尚未存檔的修改。
- **搜尋是 `LIKE` 全表掃描**，會讀過每一列。幾百頁沒問題，一萬頁就不行。
- 編輯器內的 AI 以 HTML 溝通，所以它產生不出數學區塊。公式請自己用 `/math` 插入。
- AI 偶爾會輸出 markdown 表格，轉換後變成一個空的 1x1 表格區塊。選起來刪掉即可。

## 授權

`@blocknote/xl-ai` 的授權是 GPL-3.0 OR PROPRIETARY（BlockNote 核心是 MPL-2.0），
因此本專案採用 GPL-3.0。若要以閉源形式散佈，需要向 BlockNote 取得商用授權，或是
自行重寫一套差異預覽層。

本專案與 Notion Labs, Inc. 無任何關聯，也未獲其背書。「Notion」是該公司的商標，
這個專案只是參考了它的介面配置。
