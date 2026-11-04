/**
 * Record the landing film: a real session of the app, captured in a real browser.
 *
 *   npm run dev                              # in one terminal
 *   CHROME_PATH=/path/to/chrome node scripts/film.mjs
 *
 * Optional: FFMPEG=/path/to/ffmpeg (defaults to `ffmpeg` on PATH); FILM_BASE to
 * point at another origin (default http://127.0.0.1:5173).
 *
 * How it works: Chrome's screencast stream (CDP) hands us a JPEG every time the
 * page paints, with its own timestamp. We save those frames, then let ffmpeg
 * rebuild the take from the timestamps — so the film plays at the speed the
 * session actually happened, not at a guessed frame rate.
 *
 * The take: sign in as the admin seat → open a session off the board → filter
 * the estate → ask the assistant for a free lab → read the reports → home.
 *
 * Output: frontend/public/media/tessera-product-film.{mp4,jpg}
 */
import { spawn } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import puppeteer from "puppeteer-core";

const CHROME_PATH = process.env.CHROME_PATH;
if (!CHROME_PATH) {
  console.error("Set CHROME_PATH to a Chromium/Chrome binary.");
  process.exit(1);
}
const FFMPEG = process.env.FFMPEG ?? "ffmpeg";
const BASE = process.env.FILM_BASE ?? "http://127.0.0.1:5173";
const WIDTH = 1440;
const HEIGHT = 810;

const root = new URL("../", import.meta.url).pathname;
const framesDir = `${root}.film-frames/`;
const output = `${root}public/media/tessera-product-film.mp4`;
const poster = `${root}public/media/tessera-product-film.jpg`;

rmSync(framesDir, { recursive: true, force: true });
mkdirSync(framesDir, { recursive: true });

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/* ------------------------------------------------------------ the pointer */
/* A screen recording without a cursor is unreadable: you cannot see what was
   clicked. This draws one, and it is the only thing the script adds to the app. */
const CURSOR = () => {
  const style = document.createElement("style");
  style.textContent = `
    #tx-cur{position:fixed;left:0;top:0;width:26px;height:26px;z-index:2147483647;pointer-events:none;
      transform:translate3d(1230px,740px,0);transition:transform 620ms cubic-bezier(.3,.86,.24,1);
      will-change:transform;filter:drop-shadow(0 2px 4px rgba(0,0,0,.45));}
    #tx-cur .tip{position:absolute;inset:0;transition:transform 110ms ease;transform-origin:6px 4px;}
    #tx-cur.is-down .tip{transform:scale(.85);}
    #tx-cur svg{display:block;overflow:visible;}
    .tx-pulse{position:fixed;z-index:2147483646;pointer-events:none;width:14px;height:14px;margin:-7px 0 0 -7px;
      border-radius:50%;border:1.5px solid rgba(255,255,255,.8);opacity:0;
      animation:tx-ping 620ms cubic-bezier(.16,1,.3,1) forwards;}
    @keyframes tx-ping{0%{opacity:.85;transform:scale(.35)}100%{opacity:0;transform:scale(5)}}
  `;
  document.head.appendChild(style);
  const el = document.createElement("div");
  el.id = "tx-cur";
  el.innerHTML = `<span class="tip"><svg width="26" height="26" viewBox="0 0 26 26" fill="none">
      <path d="M6.5 3.6 19.9 12.9l-6.1 1.1-3.1 5.4z" fill="#ffffff" stroke="#0d0d10" stroke-width="1.2" stroke-linejoin="round"/>
    </svg></span>`;
  document.body.appendChild(el);
  window.__tx = {
    move(x, y, ms = 620) {
      el.style.transitionDuration = `${ms}ms`;
      el.style.transform = `translate3d(${x - 5}px, ${y - 3}px, 0)`;
    },
    down() { el.classList.add("is-down"); },
    up() { el.classList.remove("is-down"); },
    pulse(x, y) {
      const pulse = document.createElement("div");
      pulse.className = "tx-pulse";
      pulse.style.left = `${x}px`;
      pulse.style.top = `${y}px`;
      document.body.appendChild(pulse);
      setTimeout(() => pulse.remove(), 680);
    },
  };
};

/* ------------------------------------------------------------- the browser */
const browser = await puppeteer.launch({
  executablePath: CHROME_PATH,
  headless: "shell",
  protocolTimeout: 180_000,
  args: [
    "--no-sandbox", "--no-zygote", "--single-process", "--disable-gpu",
    "--disable-dev-shm-usage", "--hide-scrollbars", "--font-render-hinting=none",
    "--force-device-scale-factor=1", "--disable-lcd-text",
    "--autoplay-policy=no-user-gesture-required",
  ],
});

const page = await browser.newPage();
await page.setViewport({ width: WIDTH, height: HEIGHT, deviceScaleFactor: 1 });
const client = await page.createCDPSession();

const cursorTo = async (x, y, ms = 620) => {
  await page.evaluate((x, y, ms) => window.__tx.move(x, y, ms), x, y, ms);
  await sleep(ms + 60);
};

const pressAt = async (x, y) => {
  await page.evaluate((x, y) => { window.__tx.down(); window.__tx.pulse(x, y); }, x, y);
};

/** Click a selector: the pointer travels to it, then the element is clicked. */
const click = async (selector, nth = 0, hold = 0) => {
  const handles = await page.$$(selector);
  const handle = handles[nth];
  if (!handle) throw new Error(`missing ${selector}[${nth}]`);
  const box = await handle.boundingBox();
  if (box) {
    const x = box.x + box.width / 2;
    const y = box.y + box.height / 2;
    await cursorTo(x, y);
    if (hold) await sleep(hold);
    await pressAt(x, y);
  }
  await handle.click();
  await page.evaluate(() => window.__tx.up());
  await sleep(280);
};

/** Click a destination in the rail by its visible label. */
const clickNav = async (label) => {
  const point = await page.evaluate((label) => {
    const el = [...document.querySelectorAll("a")].find((a) => a.textContent.trim() === label);
    if (!el) return null;
    const rect = el.getBoundingClientRect();
    return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
  }, label);
  if (!point) throw new Error(`no nav link ${label}`);
  await cursorTo(point.x, point.y, 540);
  await pressAt(point.x, point.y);
  await page.evaluate((label) => {
    const el = [...document.querySelectorAll("a")].find((a) => a.textContent.trim() === label);
    el?.click();
  }, label);
  await page.evaluate(() => window.__tx.up());
  await sleep(360);
};

/* ---------------------------------------------------------------- the take */
await page.goto(`${BASE}/login`, { waitUntil: "networkidle2" });
await page.waitForSelector(".sf-identity", { timeout: 30_000 });
await sleep(7600); // the sign-in spread settles
await page.evaluate(CURSOR);
await page.evaluate(() => window.__tx.move(1230, 740, 0));
await sleep(300);

const frames = [];
let capturing = true;
client.on("Page.screencastFrame", async ({ data, metadata, sessionId }) => {
  if (capturing) {
    const index = String(frames.length).padStart(5, "0");
    writeFileSync(`${framesDir}f${index}.jpg`, Buffer.from(data, "base64"));
    frames.push({ file: `f${index}.jpg`, ts: metadata.timestamp });
  }
  try { await client.send("Page.screencastFrameAck", { sessionId }); } catch { /* closed */ }
});

await client.send("Page.startScreencast", {
  format: "jpeg", quality: 84, maxWidth: WIDTH, maxHeight: HEIGHT, everyNthFrame: 1,
});
await sleep(1100); // a beat on the sign-in page before anything moves

await click(".sf-identity", 0, 420); // step in as the admin seat
await page.waitForSelector(".mosaic-page", { timeout: 30_000 });
await sleep(2700);

const tiles = await page.$$(".tile"); // open a session straight off the board
const tile = tiles[9];
const tileBox = await tile.boundingBox();
await cursorTo(tileBox.x + tileBox.width / 2, tileBox.y + tileBox.height * 0.4, 900);
await sleep(650);
await pressAt(tileBox.x + tileBox.width / 2, tileBox.y + tileBox.height * 0.4);
await tile.click();
await page.evaluate(() => window.__tx.up());
await sleep(2100);

await clickNav("Resource Discovery"); // discover a room, filtered live
await sleep(1500);
await click(".filter-input input", 0, 360);
await page.keyboard.type("lab", { delay: 145 });
await sleep(1500);

await clickNav("TESSERA Intelligence"); // ask in plain language
await sleep(1700);
await click('input[placeholder^="Ask about"]', 0, 420);
await page.keyboard.type("Find a free lab tomorrow", { delay: 64 });
await sleep(420);
await page.keyboard.press("Enter");
await sleep(3200);

await clickNav("Reports & Analytics"); // the numbers, then home
await sleep(2400);
await clickNav("Mosaic Board");
await sleep(2100);

capturing = false;
await sleep(400);
await client.send("Page.stopScreencast").catch(() => {});
await browser.close();

/* ------------------------------------------------------------- the encode */
if (frames.length < 10) {
  console.error(`Only ${frames.length} frames captured — is the dev server running?`);
  process.exit(1);
}

const gaps = frames.slice(1).map((frame, index) => frame.ts - frames[index].ts);
const median = [...gaps].sort((a, b) => a - b)[Math.floor(gaps.length / 2)];
const durations = gaps.map((gap) => Math.max(0.008, Math.min(3, gap))).concat(median);
const total = durations.reduce((sum, value) => sum + value, 0);

const list = frames
  .map((frame, index) => `file '${framesDir}${frame.file}'\nduration ${durations[index].toFixed(4)}\n`)
  .join("");
writeFileSync(`${framesDir}list.txt`, `${list}file '${framesDir}${frames.at(-1).file}'\n`);

const fadeOut = Math.max(0, total - 0.9).toFixed(2);
const run = (args) =>
  new Promise((resolve, reject) => {
    const child = spawn(FFMPEG, args, { stdio: "inherit" });
    child.on("error", reject);
    child.on("close", (code) => (code === 0 ? resolve() : reject(new Error(`ffmpeg exited ${code}`))));
  });

await run([
  "-y", "-loglevel", "error",
  "-f", "concat", "-safe", "0", "-i", `${framesDir}list.txt`,
  "-vf", `fps=30,scale=${WIDTH}:${HEIGHT}:flags=lanczos,format=yuv420p,fade=t=in:st=0:d=0.55,fade=t=out:st=${fadeOut}:d=0.85`,
  "-c:v", "libx264", "-preset", "slow", "-crf", "26",
  "-profile:v", "high", "-level", "4.0", "-pix_fmt", "yuv420p",
  "-movflags", "+faststart", "-an", output,
]);
await run(["-y", "-loglevel", "error", "-ss", "3.2", "-i", output, "-frames:v", "1", "-q:v", "4", poster]);

console.log(`\nfilm: ${output}  (${total.toFixed(1)}s, ${frames.length} frames)`);
console.log(`poster: ${poster}`);
