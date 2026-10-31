/**
 * Runtime smoke test.
 *
 * There is no headless browser in this environment, so we bundle the app with esbuild and run
 * it inside jsdom with the API stubbed out. This catches the failures that matter: crashes on
 * mount, exceptions on route changes, and pages that render nothing.
 *
 *   node scripts/smoke.mjs           # offline mode (bundled snapshot)
 *   node scripts/smoke.mjs --live    # talk to the real API through the dev server
 *
 * Output lands in .smoke/ (git-ignored).
 */
import { build } from "esbuild";
import { JSDOM, VirtualConsole } from "jsdom";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const outDir = path.join(root, ".smoke");
mkdirSync(outDir, { recursive: true });

const LIVE = process.argv.includes("--live");
const LIVE_BASE = process.env.SMOKE_BASE ?? "http://127.0.0.1:5173";

await build({
  absWorkingDir: root,
  entryPoints: ["src/main.tsx"],
  bundle: true,
  format: "iife",
  target: "es2020",
  outfile: path.join(outDir, "app.js"),
  jsx: "automatic",
  define: { "process.env.NODE_ENV": '"development"' },
  loader: { ".css": "empty", ".woff": "empty", ".woff2": "empty", ".jpg": "empty", ".svg": "empty" },
  logLevel: "error",
});

const errors = [];
const virtualConsole = new VirtualConsole();
virtualConsole.on("jsdomError", (error) => errors.push(`jsdom: ${error.message}`));
virtualConsole.on("error", (...args) => errors.push(`console.error: ${args.map(String).join(" ")}`));
virtualConsole.on("log", (...args) => {
  const message = args.map(String).join(" ");
  if (message.startsWith("[tessera]")) console.log(message);
});

const dom = new JSDOM(`<!doctype html><html><head></head><body><div id="root"></div></body></html>`, {
  url: `${LIVE ? LIVE_BASE : "http://localhost"}/`,
  pretendToBeVisual: true,
  runScripts: "dangerously",
  virtualConsole,
});

const { window } = dom;
if (LIVE) {
  window.fetch = (input, init = {}) => {
    const url = typeof input === "string" ? new URL(input, LIVE_BASE).toString() : input;
    const { signal: _signal, ...rest } = init;
    return fetch(url, rest);
  };
} else {
  window.fetch = async (url) => {
    if (String(url).includes("/health")) return { ok: false, json: async () => ({}) };
    return { ok: false, status: 503, text: async () => "{}" };
  };
}
window.Element.prototype.scrollTo = function scrollTo() {};
window.HTMLElement.prototype.scrollIntoView = function scrollIntoView() {};
window.matchMedia = () => ({
  matches: false,
  addListener() {},
  removeListener() {},
  addEventListener() {},
  removeEventListener() {},
});
window.ResizeObserver = class {
  observe() {}
  unobserve() {}
  disconnect() {}
};

const { readFileSync } = await import("node:fs");
try {
  window.eval(readFileSync(path.join(outDir, "app.js"), "utf8"));
} catch (error) {
  errors.push(`bundle: ${error.stack ?? error}`);
}

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const text = () => window.document.body.textContent.replace(/\s+/g, " ");
const click = (element) => {
  if (!element) return false;
  element.dispatchEvent(new window.MouseEvent("click", { bubbles: true, cancelable: true }));
  return true;
};

/** Waits specifically for the shell: the sign-in page is still mounted while the token
 *  request is in flight, so "still on login" is not yet an answer right after a click. */
async function waitForApp(maxMs) {
  const started = Date.now();
  while (Date.now() - started < maxMs) {
    await wait(150);
    if (window.document.querySelector(".app-frame")) return true;
  }
  return Boolean(window.document.querySelector(".app-frame"));
}

async function waitForMount(maxMs) {
  const started = Date.now();
  while (Date.now() - started < maxMs) {
    await wait(150);
    if (window.document.querySelector(".app-frame")) return "app";
    if (window.document.querySelector(".signin")) return "login";
    if (window.document.querySelector(".rk-hero")) return "landing";
  }
  return null;
}

const mounted = await waitForMount(LIVE ? 12000 : 6000);
if (process.argv.includes("--dump")) {
  console.log("--- first paint text ---\n" + text().slice(0, 1600) + "\n---");
}
if (!mounted) errors.push("nothing mounted: not the landing page, the sign-in spread or the shell");

if (process.argv.includes("--dump") && mounted === "landing") {
  console.log("--- first visit ---\n" + text() + "\n---");
}

// A first visit opens the public landing page, which offers the way in.
if (mounted !== "landing") errors.push("a first visit did not open the landing page");
if (mounted === "landing") {
  if (!/your week,\s*solved/i.test(text())) errors.push("the landing page is missing its headline");
  if (window.document.querySelectorAll(".rk-ledger-row").length < 4)
    errors.push("the proof ledger is not reading the workspace");
  if (!/189/.test(text())) errors.push("the landing page is not reading real dataset numbers");
  const signIn = [...window.document.querySelectorAll(".rk-hero .rk-cta a")].find((a) =>
    /sign in/i.test(a.textContent || ""),
  );
  if (!signIn) errors.push("the landing hero has no sign-in button");
  if (signIn) {
    click(signIn);
    const landed = await waitForMount(LIVE ? 12000 : 6000);
    if (landed !== "login") errors.push(`landing sign-in went to ${landed ?? "nothing"} instead of the sign-in page`);
  }
  if (!window.document.querySelector(".sf-new button")) errors.push("no demo entry point on the sign-in page");
  click(window.document.querySelector(".sf-new button"));
  const entered = await waitForApp(LIVE ? 12000 : 5000);
  if (!entered) errors.push("signing in from a first visit did not open the workspace");
}

const routes = [
  "/",
  "/overview",
  "/landing",
  "/mosaic",
  "/ripple",
  "/approvals",
  "/exams",
  "/operations",
  "/discovery",
  "/availability",
  "/people",
  "/bookings",
  "/intelligence",
  "/reports",
  "/departments",
  "/groups",
  "/locations",
  "/settings",
  "/definitely-not-a-route",
  "/login",
];

const report = [];
for (const route of routes) {
  if (route !== "/") {
    window.history.pushState({}, "", route);
    window.dispatchEvent(new window.PopStateEvent("popstate"));
    await wait(260);
  }
  const body = text();
  report.push({ route, chars: body.length, nodes: window.document.querySelectorAll("*").length });
  // /login is deliberately one form and one line of copy — the reference design is that
  // sparse. Every other route has panels to fill.
  const floor = route === "/login" ? 120 : 250;
  if (body.length < floor) errors.push(`${route} rendered almost nothing (${body.length} chars)`);
  if (route === "/" && !/Mosaic|board/i.test(body)) {
    errors.push("/ did not land on the calendar board");
    if (process.argv.includes("--dump")) console.log("ROOT TEXT:", body.slice(0, 700), "| path:", window.location.pathname);
  }
  if (route === "/login") {
    if (!/sign in/i.test(body)) errors.push("/login is missing the sign-in card");
    if (!window.document.querySelector("#email") || !window.document.querySelector("#password")) {
      errors.push("/login is missing its two fields");
    }
    if (window.document.querySelector(".app-frame")) errors.push("/login rendered the app shell");
  }
  if (/Cannot read propert|is not a function|Minified React error/i.test(body)) {
    errors.push(`${route} rendered an error string`);
  }
}

/* --------------------------------------------------------------- interactions */
// jsdom has no layout, but clicks, state and effects are real. Each check returns a
// human-readable failure instead of throwing.
async function interaction(label, run) {
  try {
    const problem = await run();
    if (problem) errors.push(`${label}: ${problem}`);
    else console.log(`  ok  ${label}`);
  } catch (error) {
    errors.push(`${label}: threw ${error.message}`);
  }
}

const go = async (route) => {
  window.history.pushState({}, "", route);
  window.dispatchEvent(new window.PopStateEvent("popstate"));
  await wait(320);
};

/** Some checks sign out; every shell-dependent check makes sure a session exists first. */
async function ensureSignedIn() {
  if (window.document.querySelector(".app-frame")) return;
  await go("/login");
  click(window.document.querySelector(".sf-new button"));
  await waitForApp(6000);
}

console.log("\ninteractions");
await interaction("sidebar collapses", async () => {
  await ensureSignedIn();
  await go("/");
  const toggle = window.document.querySelector(".rail-collapse");
  if (!click(toggle)) return "no collapse control";
  await wait(120);
  return window.document.querySelector(".app-frame.is-collapsed") ? "" : "frame did not collapse";
});

await interaction("mosaic tile opens the session card", async () => {
  await ensureSignedIn();
  await go("/mosaic");
  const tile = window.document.querySelector(".board-grid .tile");
  if (!tile) return "no session tiles rendered";
  click(tile);
  await wait(160);
  return window.document.querySelector(".event-popover") ? "" : "popover did not open";
});

await interaction("mosaic switches perspective", async () => {
  await ensureSignedIn();
  await go("/mosaic");
  const select = [...window.document.querySelectorAll("select")].find((el) =>
    [...el.options].some((option) => option.value === "rooms"),
  );
  if (!select) return "no perspective control";
  select.value = "rooms";
  select.dispatchEvent(new window.Event("change", { bubbles: true }));
  await wait(220);
  const heads = [...window.document.querySelectorAll(".board-head-cell")].map((el) => el.textContent);
  return heads.length > 8 ? "" : `room perspective rendered ${heads.length} columns`;
});

await interaction("natural-language booking opens", async () => {
  await ensureSignedIn();
  await go("/bookings");
  const trigger = [...window.document.querySelectorAll("button")].find((el) => /natural-language/i.test(el.textContent));
  if (!click(trigger)) return "no natural-language button";
  await wait(200);
  return window.document.querySelector("#nl-text") ? "" : "modal did not open";
});

await interaction("drag-and-reflow proposes a validated move", async () => {
  await ensureSignedIn();
  await go("/mosaic");
  const tiles = [...window.document.querySelectorAll(".board-grid .tile")].filter((el) => !el.classList.contains("add-slot"));
  const tile = tiles[2];
  if (!tile) return "not enough session tiles to drag";
  // jsdom ships no DataTransfer: give the events the shape React reads.
  class DataTransfer {
    constructor() { this.data = {}; this.effectAllowed = ""; this.dropEffect = ""; }
    setData(type, value) { this.data[type] = value; }
    getData(type) { return this.data[type] ?? ""; }
  }
  const transfer = new DataTransfer();
  const fire = (el, type) => {
    const event = new window.Event(type, { bubbles: true, cancelable: true });
    Object.defineProperty(event, "dataTransfer", { value: transfer });
    el.dispatchEvent(event);
  };
  fire(tile, "dragstart");
  await wait(200);
  const cells = [...window.document.querySelectorAll(".drop-cell")];
  if (!cells.length) return "no drop targets appeared while dragging";
  const target = cells[Math.min(cells.length - 1, 20)];
  fire(target, "dragover");
  await wait(220);
  const previewed = Boolean(window.document.querySelector(".drag-ghost"));
  fire(target, "drop");
  await wait(320);
  const panel = window.document.querySelector(".change-panel");
  if (!panel) return "drop produced no change panel";
  return /valid|warning|conflict|blocked/i.test(panel.textContent) ? "" : "panel missing a verdict";
});

await interaction("sign-in page signs a demo identity into the board", async () => {
  await ensureSignedIn();
  await go("/login");
  if (process.argv.includes("--dump")) console.log("--- login text ---\n" + text() + "\n---");
  const identity = window.document.querySelector(".sf-new button");
  if (!identity) return "no demo entry point on the sign-in page";
  click(identity);
  await waitForApp(LIVE ? 9000 : 4000);
  const shell = window.document.querySelector(".app-frame");
  if (!shell) return "did not enter the workspace";
  return window.location.pathname === "/" || window.location.pathname === "/mosaic" ? "" : `landed on ${window.location.pathname}`;
});

await interaction("sign out returns to the spread", async () => {
  await go("/mosaic");
  const profile = window.document.querySelector(".profile-chip");
  if (!click(profile)) return "no profile control";
  await wait(120);
  const signOut = [...window.document.querySelectorAll(".popover.menu button")].find((el) => /sign out/i.test(el.textContent));
  if (!click(signOut)) return "no sign-out action";
  await wait(700);
  if (window.document.querySelector(".app-frame")) return "the shell is still mounted";
  return /sign in/i.test(text()) ? "" : "did not land on the sign-in page";
});

await interaction("password sign-in rejects bad credentials", async () => {
  await go("/login");
  const set = (element, value) => {
    const proto = element instanceof window.HTMLTextAreaElement ? window.HTMLTextAreaElement : window.HTMLInputElement;
    Object.getOwnPropertyDescriptor(proto.prototype, "value").set.call(element, value);
    element.dispatchEvent(new window.Event("input", { bubbles: true }));
  };
  const email = window.document.querySelector("#email");
  const password = window.document.querySelector("#password");
  if (!email || !password) return "form fields missing";
  set(email, "nobody@cit.edu");
  set(password, "wrong-password");
  window.document.querySelector(".sf-card form").dispatchEvent(new window.Event("submit", { bubbles: true, cancelable: true }));
  await wait(500);
  const error = window.document.querySelector(".sf-error");
  if (!error) return "no error was shown";
  return /not match|not reachable|failed/i.test(error.textContent) ? "" : `unexpected error copy: ${error.textContent}`;
});

if (LIVE) {
  await interaction("password sign-in reaches the live API", async () => {
    // sign out first so we are on the spread with no session
    await go("/mosaic");
    click(window.document.querySelector(".profile-chip"));
    await wait(120);
    click([...window.document.querySelectorAll(".popover.menu button")].find((el) => /sign out/i.test(el.textContent)));
    await wait(600);
    await go("/login");
    const set = (element, value) => {
      Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set.call(element, value);
      element.dispatchEvent(new window.Event("input", { bubbles: true }));
    };
    set(window.document.querySelector("#email"), "admin@cit.edu");
    set(window.document.querySelector("#password"), "Tessera@2027");
    window.document.querySelector(".sf-card form").dispatchEvent(new window.Event("submit", { bubbles: true, cancelable: true }));
    await wait(4000);
    if (!window.document.querySelector(".app-frame")) {
      const err = window.document.querySelector(".sf-error")?.textContent ?? "no error shown";
      return `still on the sign-in page (${err})`;
    }
    // the badge is the contract: .conn-badge.live only renders while the API is answering
    return window.document.querySelector(".conn-badge.live")
      ? ""
      : "signed in but the workspace is not reading live data";
  });
}

await interaction("intelligence answers a question", async () => {
  await ensureSignedIn();
  await go("/intelligence");
  const input = window.document.querySelector("input[aria-label='Ask TESSERA']");
  if (!input) return "no question input";
  const before = window.document.querySelectorAll(".ai-msg.ai").length;
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
  setter.call(input, "which labs are free on Monday?");
  input.dispatchEvent(new window.Event("input", { bubbles: true }));
  await wait(80);
  const form = input.closest("form");
  const submit = form?.querySelector("button[type='submit']");
  if (!submit || submit.disabled) return "send button stayed disabled";
  click(submit);
  await wait(900);
  const after = window.document.querySelectorAll(".ai-msg.ai").length;
  if (after <= before) return "no answer appeared in the transcript";
  const lastText = [...window.document.querySelectorAll(".ai-msg.ai .ai-bubble")].pop()?.textContent ?? "";
  return lastText.length > 20 ? "" : `answer was empty (${lastText.length} chars)`;
});

console.log("\nroute render report");
for (const row of report) {
  console.log(`  ${row.route.padEnd(24)} ${String(row.nodes).padStart(5)} nodes  ${String(row.chars).padStart(6)} chars`);
}

if (errors.length) {
  console.error(`\nSMOKE FAILURES (${LIVE ? "live" : "snapshot"} mode)`);
  for (const error of errors.slice(0, 12)) console.error(" -", error);
  process.exit(1);
}
console.log(`\nsmoke passed — every route rendered in ${LIVE ? "live" : "snapshot"} mode`);
