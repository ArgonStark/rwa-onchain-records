// Screenshot each analytics chart card for visual verification.
import puppeteer from "puppeteer-core";
const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const OUT = process.argv[2] || "/tmp/analytics";
import { mkdirSync } from "node:fs";
mkdirSync(OUT, { recursive: true });

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: true,
  args: ["--window-size=1200,1000"],
});
const page = await browser.newPage();
await page.setViewport({ width: 1200, height: 1000, deviceScaleFactor: 1.5 });
await page.goto("http://localhost:3000/", { waitUntil: "networkidle2", timeout: 60000 });
await new Promise((r) => setTimeout(r, 3500)); // let charts fetch + render

// For each card, find the bordered container that holds a heading with this text.
const targets = [
  ["treemap", "OI / VOLUME TREEMAP"],
  ["stream", "ASSET-CLASS SHARE OVER TIME"],
  ["calendar", "DAILY NOTIONAL — CALENDAR"],
  ["bump", "VENUE RANK BY RWA OI"],
  ["basis", "PERP – SPOT BASIS"],
  ["sameasset", "SAME ASSET, EVERY VENUE"],
];

for (const [tag, text] of targets) {
  // scroll the card into view (triggers any lazy measurement), then report
  // ABSOLUTE document coords (rect + scroll offset) — puppeteer clip is in
  // document space, not viewport space.
  const box = await page.evaluate(async (t) => {
    const heads = [...document.querySelectorAll("h2,h3")];
    const h = heads.find((el) => el.textContent && el.textContent.includes(t));
    if (!h) return null;
    let probe = h.parentElement;
    while (probe && !probe.className?.includes?.("border")) probe = probe.parentElement;
    const card = probe || h.closest("section") || h.parentElement;
    card.scrollIntoView();
    await new Promise((r) => setTimeout(r, 300));
    const r = card.getBoundingClientRect();
    return {
      x: Math.max(0, r.x + window.scrollX),
      y: Math.max(0, r.y + window.scrollY),
      width: Math.min(1200, r.width),
      height: r.height,
    };
  }, text);
  if (!box) {
    console.log(tag, "NOT FOUND");
    continue;
  }
  await new Promise((r) => setTimeout(r, 400));
  try {
    await page.screenshot({ path: `${OUT}/${tag}.png`, clip: box });
    console.log(tag, "OK", JSON.stringify(box));
  } catch (e) {
    console.log(tag, "SHOT FAIL", e.message);
  }
}

await browser.close();
