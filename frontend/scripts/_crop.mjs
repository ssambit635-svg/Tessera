import puppeteer from "puppeteer-core";
const browser = await puppeteer.launch({
  executablePath: "/tmp/chromium", headless: "shell", protocolTimeout: 60000,
  env: { ...process.env, LD_LIBRARY_PATH: "/tmp" },
  args: ["--no-sandbox","--no-zygote","--single-process","--disable-gpu","--disable-dev-shm-usage","--hide-scrollbars","--font-render-hinting=none"],
});
const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 3 });
await page.goto("http://127.0.0.1:5173/login", { waitUntil: "networkidle2" });
await new Promise(r => setTimeout(r, 1600));
await page.screenshot({ path: ".smoke/brand-zoom.png", clip: { x: 44, y: 22, width: 210, height: 50 } });
await page.screenshot({ path: ".smoke/seats-zoom.png", clip: { x: 536, y: 612, width: 400, height: 70 } });
await browser.close();
