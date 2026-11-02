/** Regression checks for the assembly intro and reveal lifecycle. */
import assert from "node:assert/strict";
import { build } from "esbuild";
import { JSDOM, VirtualConsole } from "jsdom";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const bundle = await build({
  absWorkingDir: root, entryPoints: ["src/main.tsx"], bundle: true, write: false,
  format: "iife", target: "es2020", jsx: "automatic",
  define: { "process.env.NODE_ENV": '"development"', "import.meta.env": JSON.stringify({ MODE: "test", DEV: true, PROD: false }) },
  loader: { ".css": "empty", ".woff": "empty", ".woff2": "empty", ".jpg": "empty", ".svg": "empty" },
  logLevel: "error",
});
const code = bundle.outputFiles[0].text;
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function until(fn, message, timeout = 2500) {
  const start = Date.now();
  while (!fn()) {
    if (Date.now() - start > timeout) throw new Error(message);
    await wait(20);
  }
}
async function setup({ delayed = false, reduced = false, saved = false, fastTimeout = false } = {}) {
  const consoleErrors = [];
  const virtualConsole = new VirtualConsole();
  virtualConsole.on("jsdomError", (error) => consoleErrors.push(error.message));
  virtualConsole.on("error", (...args) => consoleErrors.push(args.join(" ")));
  const dom = new JSDOM('<div id="root"></div>', { url: "http://localhost/landing", pretendToBeVisual: true, runScripts: "dangerously", virtualConsole });
  const w = dom.window;
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  if (!delayed) release();
  w.fetch = async () => { await gate; return { ok: false, status: 503, json: async () => ({}), text: async () => "{}" }; };
  w.AnimationEvent = w.Event; // React otherwise expects a WebKit-prefixed event in jsdom.
  w.matchMedia = () => ({ matches: reduced, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} });
  w.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
  w.Element.prototype.scrollTo = function () {};
  w.HTMLElement.prototype.scrollIntoView = function () {};
  if (saved) w.localStorage.setItem("tessera.motion", "reduced");
  if (fastTimeout) {
    const setTimeout = w.setTimeout.bind(w);
    w.setTimeout = (fn, ms, ...args) => setTimeout(fn, ms === 3400 ? 50 : ms, ...args);
  }
  w.eval(code);
  return { w, dom, release, consoleErrors };
}
function done(t) {
  assert.deepEqual(t.consoleErrors, []);
  t.dom.window.close();
}

function finishAnimation(t) {
  const clock = t.w.document.querySelector(".pre-clock");
  assert(clock, "animation clock not mounted");
  const event = new t.w.Event("animationend", { bubbles: true });
  Object.defineProperty(event, "animationName", { value: "pre-clock" });
  clock.dispatchEvent(event);
}

// Neither a ready workspace nor the completed assembly alone may open the site.
{
  const t = await setup({ delayed: true });
  await until(() => t.w.document.querySelector(".pre-clock"), "intro not mounted");
  assert.equal(t.w.document.querySelectorAll(".pre-piece").length, 25, "brand pieces missing");
  assert(!t.w.document.querySelector("video"), "old video is still used");
  finishAnimation(t);
  await until(() => t.w.document.querySelector(".pre-status")?.textContent.includes("Preparing"), "no waiting status");
  assert(!t.w.document.querySelector(".app-reveal.is-open"), "opened before workspace was ready");
  t.release();
  await until(() => t.w.document.querySelector(".app-reveal.is-open"), "did not open after both completed");
  await until(() => !t.w.document.querySelector(".pre"), "did not remove the splash");
  done(t);
}
{
  const t = await setup();
  await until(() => t.w.document.querySelector(".app-reveal"), "workspace not ready");
  assert(!t.w.document.querySelector(".app-reveal.is-open"), "opened before animation ended");
  finishAnimation(t);
  await until(() => t.w.document.querySelector(".app-reveal.is-open"), "animation end did not reveal");
  done(t);
}
for (const mode of ["timeout", "skip", "system-reduced", "saved-reduced"]) {
  const t = await setup({ fastTimeout: mode === "timeout", reduced: mode === "system-reduced", saved: mode === "saved-reduced" });
  await until(() => t.w.document.querySelector(".pre") || t.w.document.querySelector(".app-reveal.is-open"), "intro did not mount");
  if (mode === "skip") {
    await until(() => t.w.document.querySelector(".pre-skip"), "skip not mounted");
    t.w.document.querySelector(".pre-skip").click();
  }
  if (mode.endsWith("reduced")) assert(!t.w.document.querySelector(".pre-clock"), "reduced motion still animated");
  await until(() => t.w.document.querySelector(".app-reveal.is-open"), `${mode} did not reveal`);
  await until(() => !t.w.document.querySelector(".pre"), `${mode} splash did not clear`);
  done(t);
}
console.log("Intro lifecycle: assembly completion, delayed workspace, fallback, skip and reduced motion passed.");
