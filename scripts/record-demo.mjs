/**
 * Records docs/demo.gif.
 *
 * Runs the app against a throwaway database in the system temp directory, so
 * nothing from your own workspace can end up in the recording. Playwright
 * captures the browser viewport only — no desktop, no window chrome.
 *
 *   npm run demo
 *
 * Needs the Chromium that Playwright ships (`npx playwright install chromium`)
 * and ffmpeg on PATH. The AI steps make real Claude API calls, so a key must be
 * configured; it is read from the environment and never written anywhere.
 */
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync, mkdirSync, readdirSync, readFileSync, existsSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { chromium } from "playwright";

const PORT = 3789;
const BASE = `http://127.0.0.1:${PORT}`;
const ROOT = path.resolve(import.meta.dirname, "..");
const OUT = path.join(ROOT, "docs", "demo.gif");

const workDir = mkdtempSync(path.join(tmpdir(), "notion-mock-demo-"));
const videoDir = path.join(workDir, "video");

/** `.env.local` is gitignored; we only read it, never copy it anywhere. */
function loadEnvLocal() {
  const file = path.join(ROOT, ".env.local");
  if (!existsSync(file)) return {};
  const out = {};
  for (const line of readFileSync(file, "utf8").split("\n")) {
    const match = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
    if (match) out[match[1]] = match[2].replace(/^["']|["']$/g, "");
  }
  return out;
}

const env = {
  ...process.env,
  ...loadEnvLocal(),
  NOTION_MOCK_DB: path.join(workDir, "demo.db"),
  NOTION_MOCK_UPLOADS: path.join(workDir, "uploads"),
  PORT: String(PORT),
  // Every second Claude spends rewriting the page is a second of GIF. Sonnet
  // gets through a page this size in a fraction of the time Opus takes, and
  // the recording is about the flow, not about which model answered.
  CLAUDE_EDITOR_MODEL: process.env.CLAUDE_EDITOR_MODEL ?? "claude-sonnet-5-5",
};

if (!env.ANTHROPIC_API_KEY) {
  console.error("沒有 ANTHROPIC_API_KEY，AI 的分鏡會錄不到。請先設定後再執行。");
  process.exit(1);
}

/**
 * `shell` defaults on because npm is a batch file on Windows and will not spawn
 * without it. ffmpeg must opt out: cmd.exe splits the filtergraph argument at
 * the `;` inside it, and ffmpeg then treats the remainder as an output file.
 */
function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: "inherit", shell: true, ...options });
    child.on("exit", (code) => (code === 0 ? resolve() : reject(new Error(`${command} 失敗 (${code})`))));
  });
}

/**
 * A server left over from an earlier run would answer on this port with its own
 * database, and the recording would silently capture that instead. Refuse to
 * start rather than record the wrong thing.
 */
async function assertPortFree() {
  try {
    await fetch(BASE, { signal: AbortSignal.timeout(2000) });
  } catch {
    return;
  }
  throw new Error(
    `埠 ${PORT} 已經有東西在跑（可能是上一次沒收乾淨的伺服器）。` +
      `請先關掉再重試，Windows 可用：npx kill-port ${PORT}`,
  );
}

async function waitForServer() {
  for (let i = 0; i < 90; i++) {
    try {
      if ((await fetch(BASE)).ok) return;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error("伺服器啟動逾時");
}

/** Types at a readable pace — instant text looks like a glitch in a GIF. */
async function type(page, text, delay = 45) {
  await page.keyboard.type(text, { delay });
}

const pause = (page, ms) => page.waitForTimeout(ms);

/**
 * Puts the cursor in a new paragraph at the end of the document.
 *
 * Arrow keys will not get you out of a code block — they move within its text —
 * so after one, the only reliable way back to normal flow is clicking the empty
 * space beneath the last block, which BlockNote turns into a fresh paragraph.
 */
async function appendParagraph(page) {
  const editor = page.locator(".bn-editor");
  const box = await editor.boundingBox();
  await page.mouse.click(box.x + box.width / 2, box.y + box.height - 8);
  await pause(page, 400);
}

let server;
let activePage;
let activeBrowser;
let keepCapture = null;
try {
  await assertPortFree();

  console.log("1/4 建置…");
  await run("npm", ["run", "build"], { cwd: ROOT, env });

  console.log("2/4 啟動伺服器…");
  server = spawn("npm", ["run", "start", "--", "--port", String(PORT)], {
    cwd: ROOT,
    env,
    shell: true,
    stdio: "ignore",
  });
  await waitForServer();

  console.log("3/4 錄製…");
  const browser = await chromium.launch();
  activeBrowser = browser;
  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    deviceScaleFactor: 1,
    recordVideo: { dir: videoDir, size: { width: 1280, height: 800 } },
  });
  const page = await context.newPage();
  activePage = page;

  await page.goto(BASE, { waitUntil: "networkidle" });
  await pause(page, 1200);

  // --- a new page, title and a line of body text ---
  await page.locator('[title="新增頁面"]').first().click();
  await page.waitForURL(/\/page\//);
  await pause(page, 800);

  await page.getByPlaceholder("無標題").click();
  await type(page, "Rate limiting 筆記");
  await pause(page, 500);

  await page.locator(".bn-editor").click();
  await type(page, "三種常見做法，先記重點。");
  await page.keyboard.press("Enter");
  await pause(page, 700);

  // --- a LaTeX block ---
  // Math comes before the code block on purpose: arrow keys do not escape a
  // code block, so anything typed after one lands inside it.
  await type(page, "/math", 70);
  await pause(page, 900);
  await page.keyboard.press("Enter");
  await pause(page, 500);
  await type(page, "r_{\\text{eff}} = \\min(r, \\tfrac{b}{\\Delta t})", 40);
  await page.keyboard.press("Escape");
  await pause(page, 1800);

  // --- slash menu into a code block, so the highlighting shows ---
  // Clicking the padding under the last block is BlockNote's own way of
  // starting a fresh paragraph at the end of the document.
  await appendParagraph(page);
  await type(page, "/code", 70);
  await pause(page, 900);
  await page.keyboard.press("Enter");
  await pause(page, 600);
  await type(
    page,
    "def allow(bucket, now):\n    bucket.refill(now)\n    return bucket.take(1)",
    35,
  );
  await pause(page, 1800);

  // --- let the AI rewrite the page, then accept its diff ---
  // This goes through the header button rather than the chat panel on purpose:
  // the chat agent has to *decide* to call propose_edit, so scripting it is a
  // coin flip. The header button drives the identical preview-and-accept flow
  // with one deterministic click.
  await page.getByRole("button", { name: "整頁摘要" }).click();
  await pause(page, 1500);

  // xl-ai renders its own 接受 in a floating menu over the document, so go by
  // the attribute the review bar's own button carries rather than by label.
  const accept = page.locator("[data-ai-accept]");
  await accept.waitFor({ timeout: 240_000 });
  await pause(page, 3500);
  await accept.click();
  await pause(page, 3500);

  await context.close();
  await browser.close();

  console.log("4/4 轉成 GIF…");
  const webm = readdirSync(videoDir).find((f) => f.endsWith(".webm"));
  if (!webm) throw new Error("找不到錄影檔");
  const source = path.join(videoDir, webm);
  mkdirSync(path.dirname(OUT), { recursive: true });

  // The capture cost real API calls. From here on, a failure keeps the raw
  // video so the conversion can be retried without recording it again.
  keepCapture = source;

  // Two passes: build a palette from the whole clip, then map onto it.
  // A single pass picks a palette per frame and the result dithers badly.
  //
  // `setpts` plays the capture back faster. Typing at a readable pace and
  // waiting on the API make for several minutes of video, and a minute of GIF
  // is already past what GitHub will serve comfortably.
  async function encode({ speed, fps, width }) {
    const filters = `setpts=${speed}*PTS,fps=${fps},scale=${width}:-1:flags=lanczos`;
    const palette = path.join(workDir, "palette.png");
    await run(
      "ffmpeg",
      ["-y", "-i", source, "-vf", `${filters},palettegen=stats_mode=diff`, palette],
      { shell: false },
    );
    await run(
      "ffmpeg",
      [
        "-y", "-i", source, "-i", palette,
        "-lavfi", `${filters} [x]; [x][1:v] paletteuse=dither=bayer:bayer_scale=3`,
        OUT,
      ],
      { shell: false },
    );
    return statSync(OUT).size;
  }

  const LIMIT = 10 * 1024 * 1024;
  const settings = [
    { speed: 0.5, fps: 12, width: 960 },
    { speed: 0.4, fps: 10, width: 880 },
    { speed: 0.3, fps: 8, width: 760 },
  ];

  let size = 0;
  for (const [index, setting] of settings.entries()) {
    size = await encode(setting);
    if (size <= LIMIT) break;
    if (index < settings.length - 1) {
      console.log(`  ${(size / 1024 / 1024).toFixed(1)} MB 太大，再壓一次…`);
    }
  }

  keepCapture = null;
  console.log(`完成：${OUT}（${(size / 1024 / 1024).toFixed(1)} MB）`);
  if (size > LIMIT) console.warn("仍然超過 10MB，考慮縮短分鏡。");
} catch (error) {
  console.error("\n錄製失敗：", error);
  // A still of the moment it gave up is worth more than the stack trace.
  try {
    const shot = path.join(ROOT, "demo-failure.png");
    await activePage?.screenshot({ path: shot });
    console.error(`失敗當下的畫面：${shot}`);
  } catch {
    /* page already gone */
  }
  process.exitCode = 1;
} finally {
  // A browser left open after a failed step keeps its video file locked, which
  // then blocks the cleanup below and leaves headless shells running.
  try {
    await activeBrowser?.close();
  } catch {
    /* already gone */
  }

  // `shell: true` means `server.pid` is the shell, not next itself, so killing
  // it leaves the server holding the database file open.
  if (server?.pid) {
    try {
      if (process.platform === "win32") {
        spawn("taskkill", ["/pid", String(server.pid), "/T", "/F"], { stdio: "ignore" });
      } else {
        process.kill(-server.pid);
      }
    } catch {
      /* already gone */
    }
  }
  // Windows keeps the file handle for a moment after the process dies, and a
  // failed cleanup must not hide the error that got us here.
  await new Promise((r) => setTimeout(r, 2000));
  if (keepCapture) {
    console.warn(`\n錄影保留在 ${keepCapture}`);
    console.warn("轉檔可以直接拿它重試，不必再錄一次（會花 API 費用）。");
    console.warn(`用完請手動刪除 ${workDir}`);
  } else {
    try {
      rmSync(workDir, { recursive: true, force: true });
    } catch {
      console.warn(`暫存目錄留在 ${workDir}，可手動刪除`);
    }
  }
}
