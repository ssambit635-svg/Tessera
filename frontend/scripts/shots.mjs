/**
 * Screenshot the sign-in page and every workspace route with a real browser.
 *
 * Optional tooling: it needs a Chromium binary. Set CHROME_PATH to point at one
 * (the sandbox build used during development lives at /tmp/chromium).
 *
 *   npm run dev                       # in one terminal
 *   CHROME_PATH=/path/to/chrome node scripts/shots.mjs [width] [height]
 *
 * Images land in .smoke/ (git-ignored).
 */
import { mkdirSync } from "node:fs";
import puppeteer from "puppeteer-core";

const executablePath = process.env.CHROME_PATH;
if (!executablePath) {
  console.error("Set CHROME_PATH to a Chromium/Chrome binary.");
  process.exit(1);
}

const base = process.env.SHOT_BASE ?? "http://127.0.0.1:5173";
const width = Number(process.argv[2] ?? 1440);
const height = Number(process.argv[3] ?? 900);
const outDir = new URL("../.smoke/", import.meta.url).pathname;
mkdirSync(outDir, { recursive: true });

const ROUTES = [
  ["", "login"],
  ["mosaic", "board"],
  ["overview", "overview"],
  ["ripple", "ripple"],
  ["discovery", "discovery"],
  ["availability", "availability"],
  ["people", "people"],
  ["bookings", "bookings"],
  ["intelligence", "intelligence"],
  ["reports", "reports"],
  ["departments", "departments"],
  ["groups", "groups"],
  ["locations", "locations"],
  ["settings", "settings"],
];

const browser = await puppeteer.launch({
  executablePath,
  headless: "shell",
  protocolTimeout: 60000,
  env: { ...process.env, LD_LIBRARY_PATH: process.env.CHROME_LIBS ?? "/tmp" },
  args: [
    "--no-sandbox",
    "--no-zygote",
    "--single-process",
    "--disable-gpu",
    "--disable-dev-shm-usage",
    "--hide-scrollbars",
    "--font-render-hinting=none",
  ],
});

const page = await browser.newPage();
await page.setViewport({ width, height });

// The sign-in page, exactly as a first-time visitor sees it.
await page.goto(`${base}/login`, { waitUntil: "networkidle2" });
await new Promise((resolve) => setTimeout(resolve, 1200));
await page.screenshot({ path: `${outDir}login-${width}.png` });
console.log(`login-${width}.png`);

// Step in as the first demo identity so the shell is reachable.
const identities = await page.$$(".sf-identities .sf-identity");
if (identities[0]) await identities[0].click();
await new Promise((resolve) => setTimeout(resolve, 2200));

for (const [route, name] of ROUTES) {
  if (!route) continue;
  await page.goto(`${base}/${route}`, { waitUntil: "networkidle2" });
  await new Promise((resolve) => setTimeout(resolve, 1400));
  await page.screenshot({ path: `${outDir}${name}-${width}.png` });
  console.log(`${name}-${width}.png`);
}

await browser.close();
