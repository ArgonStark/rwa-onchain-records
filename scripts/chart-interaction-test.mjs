// Drives the system Chrome to verify chart interactivity: crosshair tooltip,
// wheel zoom, and a touch pan. Usage: node scripts/chart-interaction-test.mjs "<chartParam>" <tag>
import puppeteer from "puppeteer-core";

const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const chartParam = process.argv[2] || "Hyperliquid HIP-3|SPCX";
const tag = process.argv[3] || "spcx";
const url = `http://localhost:3737/?chart=${encodeURIComponent(chartParam)}`;

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: true,
  args: ["--force-device-scale-factor=2", "--window-size=900,820"],
});
const page = await browser.newPage();
await page.setViewport({ width: 900, height: 820, deviceScaleFactor: 2 });
await page.goto(url, { waitUntil: "networkidle2", timeout: 30000 });
await page.waitForSelector("canvas", { timeout: 15000 });
await new Promise((r) => setTimeout(r, 1500)); // let series/fit settle

const canvas = await page.$("canvas");
const box = await canvas.boundingBox();
const cx = Math.round(box.x + box.width * 0.5);
const cy = Math.round(box.y + box.height * 0.28); // price pane

// 1) HOVER -> crosshair + DIY tooltip
await page.mouse.move(cx - 40, cy);
await page.mouse.move(cx, cy, { steps: 10 });
await new Promise((r) => setTimeout(r, 400));
const tipText = await page.evaluate(() => {
  const tips = [...document.querySelectorAll("div")].filter(
    (d) => d.style && d.style.display === "block" && /≈|\$|Open interest|Mark/.test(d.innerHTML),
  );
  return tips.length ? tips[0].textContent : null;
});
await page.screenshot({ path: `/tmp/p3-${tag}-hover.png` });
console.log("HOVER tooltip:", tipText ? JSON.stringify(tipText.slice(0, 120)) : "NOT FOUND");

// 2) ZOOM via wheel (capture visible range before/after)
const rangeBefore = await page.evaluate(() => window.__lwcRange?.() ?? null);
await page.mouse.move(cx, cy);
for (let i = 0; i < 6; i++) {
  await page.mouse.wheel({ deltaY: -120 });
  await new Promise((r) => setTimeout(r, 60));
}
await new Promise((r) => setTimeout(r, 400));
await page.screenshot({ path: `/tmp/p3-${tag}-zoom.png` });
console.log("ZOOM: wheel applied (see screenshot)");

// 3) TOUCH pan: emulate a touch device and drag
const client = await page.target().createCDPSession();
await client.send("Emulation.setEmitTouchEventsForMouse", { enabled: true, configuration: "mobile" });
await page.touchscreen.tap(cx, cy).catch(() => {});
// touch drag
await client.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: cx + 80, y: cy }] });
await client.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: cx - 40, y: cy }] });
await client.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
await new Promise((r) => setTimeout(r, 500));
await page.screenshot({ path: `/tmp/p3-${tag}-touch.png` });
console.log("TOUCH: drag dispatched (see screenshot)");

await browser.close();
console.log("done:", tag);
