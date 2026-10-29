# Notion Mock

A Notion-style notebook that runs on your own machine, for one person, with
Claude built into the editor. You bring your own API key.

![Writing a page: a heading, a LaTeX equation, a Python code block, then Claude rewriting the page and the change being accepted](docs/demo.gif)

[繁體中文](#notion-mock-中文說明)

## Running it

```bash
npm install
echo "ANTHROPIC_API_KEY=sk-ant-..." > .env.local
npm run dev
```

Then open http://localhost:3000. The first run creates a starter page.

The server listens on 127.0.0.1 only, so nothing on your network can reach it.
Pass `-H 0.0.0.0` if you actually want that, but read the last section first.

Your notes live in `data/notion.db` and `data/uploads/`, both gitignored, and
they stay there across restarts and rebuilds. Delete the directory to start
over.

To back up, copy the whole `data/` directory, not just the `.db` file. SQLite
runs in WAL mode here, so recent writes sit in `notion.db-wal` until they are
checkpointed — the `.db` file on its own can be almost empty.

### The API key

You can skip `.env.local` and set the key from the gear icon in the header. It
gets checked against the API before it is stored, goes into the local database,
and is picked up by the next request without a restart. A key set there wins
over the environment variable, and the browser is only ever told the last four
characters.

## The editor

[BlockNote](https://www.blocknotejs.org/), so: nested blocks, slash commands,
drag handles, code blocks with Shiki highlighting, and `/math` for a LaTeX
equation. `Ctrl`+`K` searches titles and body text. Edits save half a second
after you stop typing.

The sidebar tree can be dragged: the top and bottom thirds of a row reorder,
the middle third drops the page inside as a child. Starring a page pins it to a
Favourites section above the tree, and the header shows the path down to
whatever page you are on.

Screenshots, images, video and PDFs can be pasted or dropped straight in. They
are stored as files and served from `/api/files/`, not stuffed into the
document JSON.

Deleting a page puts it in the trash at the bottom of the sidebar, along with
whatever was nested under it. Restoring brings the whole subtree back. If its
parent was deleted separately and is still in the trash, the page comes back at
the top level instead, and says so.

## AI

There are four ways to reach it: **Ask AI** in the slash menu, the AI button in
the selection toolbar, the summarise and translate buttons in the page header,
and the chat panel on the right.

All four work the same way. The change shows up as a highlighted diff in the
document, nothing is written to the database until you accept it, and autosave
pauses while a change is waiting on you.

The chat agent has four tools, and only one of them can touch your content:
`read_current_page`, `search_pages` and `read_page` are read-only, and
`propose_edit` suggests a change to the page you are on — it writes nothing,
it hands the instruction back to the editor's review flow. No tool can modify
a different page.

Both AI routes also send the images a page references (PNG, JPEG, GIF, WebP, up
to eight per request) as real vision input, so a summary takes the content of
your screenshots into account instead of seeing an empty `<img>` tag.

Because the in-editor AI speaks HTML, two things come back wrong and get
repaired once you accept: a markdown table arrives as a table block with no
cells, and an equation arrives as `$$...$$` sitting in a paragraph. See
`src/lib/editor-cleanup.ts`.

## Layout

```
src/
  app/
    page/[id]/page.tsx     page view (server component)
    api/pages/**           page CRUD
    api/search             search
    api/upload             paste / drop uploads
    api/files/[name]       serves uploaded files
    api/settings           reads and sets the API key
    api/ai/editor          in-editor AI (BlockNote xl-ai protocol)
    api/ai/chat            chat agent (SSE + tool-use loop)
  components/
    Workspace.tsx          three-pane shell, owns the editor instance
    Sidebar.tsx            page tree
    Editor.tsx             BlockNote + AI extension, autosave
    MathBlock.tsx          KaTeX equation block
    AIPanel.tsx            chat panel
    PageHeader.tsx         whole-page AI actions
    SettingsDialog.tsx     API key
  lib/
    db.ts                  SQLite layer
    blocks.ts              block JSON to markdown
    uploads.ts             upload storage
    editor-cleanup.ts      repairs what the AI's HTML cannot express
    settings.ts            where the API key is read from and stored
    ai/images.ts           page images to Claude vision input
    ai/models.ts           model ids
    ai/tools.ts            agent tool definitions
    ai/prompts.ts          agent system prompt
scripts/
  record-demo.mjs          regenerates docs/demo.gif
```

`npm run demo` re-records the GIF. It builds the app, runs it against a
throwaway database in your temp directory so none of your own notes can appear
in it, drives Chromium through a script, and converts the capture with ffmpeg.
The AI steps make real API calls, on Sonnet rather than the Opus default, since
every second it spends thinking is a second of GIF.

## Models

Both routes default to `claude-opus-5-5`. Change them in `src/lib/ai/models.ts`
or set `CLAUDE_CHAT_MODEL` / `CLAUDE_EDITOR_MODEL`. Opus is the expensive
option: `claude-sonnet-5-5` is about half the price, `claude-haiku-5-5` a
fraction of it.

## Two SDKs, on purpose

`api/ai/chat` uses the official `@anthropic-ai/sdk` and runs its own tool-use
loop, which makes it easy to stream each step to the browser over SSE.

`api/ai/editor` uses Vercel's `@ai-sdk/anthropic`, because `@blocknote/xl-ai`
is built on the AI SDK and its streaming and diff protocol has to be spoken
exactly. `ai` is pinned to v6 with `@ai-sdk/anthropic` v3 for the same reason:
v7 leaves two copies of `ai` in the tree and the protocol breaks in ways the
error message gives no hint about. Run `npm ls ai` if you touch those versions.

## What it does not do

No accounts, no permissions. It assumes one person on one machine, which is why
the server binds to localhost.

Two tabs on the same page will not merge. The body carries a version number and
a save built on a stale one is rejected, so the second tab cannot overwrite the
first without telling you. You get a bar offering to copy your text to the
clipboard before you reload.

Search is a `LIKE` scan over every row, and that is on purpose. SQLite's FTS5
cannot tokenise Chinese: the default tokeniser swallows a run of Chinese as a
single token and matches nothing at all, and the trigram tokeniser needs three
characters, so a two-character word finds nothing. A scan is slower in theory
and correct in practice. It will start to matter somewhere past a few thousand
pages.

No sharing, no real-time collaboration, no mobile app.

## License

GPL-3.0, because `@blocknote/xl-ai` is GPL-3.0 OR PROPRIETARY (BlockNote's core
is MPL-2.0). A closed-source build would need a commercial license from
BlockNote, or a diff-preview layer written from scratch.

Not affiliated with or endorsed by Notion Labs, Inc. "Notion" is their
trademark; this borrows the layout.

---

# Notion Mock 中文說明

一個跑在自己電腦上的 Notion 風格筆記本，單人使用，編輯器內建 Claude，用你自己的
API key。

![示範：寫標題、插入 LaTeX 公式與 Python 程式碼區塊，再讓 Claude 改寫整頁並按下接受](docs/demo.gif)

## 怎麼跑起來

```bash
npm install
echo "ANTHROPIC_API_KEY=sk-ant-..." > .env.local
npm run dev
```

打開 http://localhost:3000，第一次啟動會建立一頁範例。

伺服器只聽 127.0.0.1，同網段的其他裝置連不進來。真的需要的話可以自己加
`-H 0.0.0.0`，但建議先看完最後一節。

筆記放在 `data/notion.db` 和 `data/uploads/`，兩個都已經被 git 忽略，重啟或重新
build 都不會影響，刪掉整個資料夾就是重來。

備份請複製整個 `data/` 資料夾，不要只複製 `.db` 檔。這裡的 SQLite 跑在 WAL 模式，
剛寫入的東西會先待在 `notion.db-wal` 裡等待合併，單獨一個 `.db` 檔可能幾乎是空的。

### 關於 API key

也可以完全不碰 `.env.local`，直接點頁首的齒輪設定。送出時會先向 API 驗證過才存進
本機資料庫，下一個請求就生效，不需要重啟。在這裡設定的 key 優先於環境變數，而且
瀏覽器永遠只會拿到最後四碼。

## 編輯器

用 [BlockNote](https://www.blocknotejs.org/)：巢狀區塊、斜線指令、拖曳把手、用
Shiki 上色的程式碼區塊，以及 `/math` 插入 LaTeX 公式。`Ctrl`+`K` 搜尋標題和內文。
停止輸入半秒後自動存檔。

側欄的頁面樹可以拖曳：拖到一列的上三分之一或下三分之一是調整順序，拖到中間三分之一
則是放進那一頁底下變成子頁面。按星號可以把頁面釘到樹上方的「我的最愛」，頁首則會顯示
目前這一頁的所在路徑。

截圖、圖片、影片和 PDF 可以直接貼上或拖進來。檔案會另外存起來、由 `/api/files/`
提供，不會塞進文件的 JSON 裡。

刪除頁面會連同底下的子頁面一起進到側欄最下方的垃圾桶，還原時整棵子樹會一起回來。
如果它的上層頁面是另外被刪掉、而且還在垃圾桶裡，這一頁會還原到最外層並且告訴你。

## AI

四個入口：斜線選單裡的 **Ask AI**、選取文字後工具列上的 AI 按鈕、頁首的摘要與翻譯、
右側的對話面板。

四個走的是同一套流程。修改會以差異標示出現在文件裡，你按下接受之前不會有任何東西
寫進資料庫，等待審核期間自動存檔也會暫停。

對話 agent 有四個工具，只有一個碰得到你的內容：`read_current_page`、`search_pages`、
`read_page` 都是唯讀，`propose_edit` 則是對你正在看的這一頁提出修改建議，它本身不
寫入任何東西，只是把指令交回給編輯器的審核流程。沒有任何工具可以改動其他頁面。

兩條路線都會把頁面引用到的圖片（PNG、JPEG、GIF、WebP，單次最多八張）當成真正的影像
輸入送出去，所以摘要會把你截圖裡的內容算進去，而不是只看到一個空的 `<img>` 標籤。

編輯器內的 AI 以 HTML 溝通，所以有兩樣東西回來時是壞的，會在你接受之後自動修掉：
markdown 表格會變成沒有儲存格的表格區塊，公式會變成段落裡的一串 `$$...$$`。實作在
`src/lib/editor-cleanup.ts`。

## 專案結構

見上方英文版的 Layout。

`npm run demo` 會重錄那張 GIF：建置、用暫存目錄裡一個全新的資料庫跑起來（所以你的
筆記不可能入鏡）、用腳本操作 Chromium，再用 ffmpeg 轉檔。AI 的部分會真的呼叫 API，
而且走 Sonnet 而不是預設的 Opus，因為它多想一秒，GIF 就多一秒。

## 模型

兩條路線都預設 `claude-opus-5-5`。要換就改 `src/lib/ai/models.ts`，或設
`CLAUDE_CHAT_MODEL` / `CLAUDE_EDITOR_MODEL`。Opus 是最貴的選項，
`claude-sonnet-5-5` 大約一半價格，`claude-haiku-5-5` 只有零頭。

## 為什麼用了兩套 SDK

`api/ai/chat` 用官方的 `@anthropic-ai/sdk`，自己跑 tool use 迴圈，這樣比較容易把
每一步透過 SSE 串到瀏覽器。

`api/ai/editor` 用 Vercel 的 `@ai-sdk/anthropic`，因為 `@blocknote/xl-ai` 是建在
AI SDK 上的，它的串流和差異預覽協定必須照規格走。`ai` 固定在 v6、搭配
`@ai-sdk/anthropic` v3 也是同樣的原因：升到 v7 會讓相依樹裡同時存在兩份 `ai`，而
協定壞掉的方式從錯誤訊息完全看不出來。動過這些版本記得跑一次 `npm ls ai`。

## 它不做什麼

沒有帳號，也沒有權限。它假設只有一個人、一台電腦，所以伺服器綁在 localhost。

同一頁開兩個分頁不會自動合併。內文帶版本號，用過期版本送出的存檔會被拒絕，第二個
分頁不可能無聲無息蓋掉第一個。這時會跳出一條提示，先讓你把這邊的內容複製到剪貼簿，
再重新載入。

搜尋是 `LIKE` 全表掃描，這是刻意的。SQLite 的 FTS5 不會斷中文：預設斷詞器把一整串
中文當成一個詞，什麼都搜不到；trigram 斷詞器至少要三個字，兩個字的詞一樣搜不到。
全表掃描理論上比較慢，實際上才是對的。大概要到好幾千頁才會開始有感。

沒有分享，沒有即時協作，沒有手機 app。

## 授權

GPL-3.0，因為 `@blocknote/xl-ai` 的授權是 GPL-3.0 OR PROPRIETARY（BlockNote 核心
是 MPL-2.0）。若要閉源散佈，得向 BlockNote 取得商用授權，或自己重寫一套差異預覽層。

與 Notion Labs, Inc. 無關，也未獲其背書。「Notion」是該公司的商標，這裡只是參考了
它的介面配置。
