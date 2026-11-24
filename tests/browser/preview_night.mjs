// The merged game: Six Vaults in the new art, in preview mode, on a phone and on a desktop screen.
import puppeteer from "puppeteer-core";
import { mkdirSync } from "node:fs";
const SHOTS = process.env.SHOTS || "/tmp/dark-post-shots";
mkdirSync(SHOTS, { recursive: true });
const base = process.env.BASE || "http://127.0.0.1:8787";
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await puppeteer.launch({ executablePath: process.env.CHROME || "/usr/bin/google-chrome", args: ["--no-sandbox", "--disable-gpu"] });
const errors = [];
for (const [tag, w, h, mobile] of [["mp", 390, 844, true], ["md", 1440, 900, false]]) {
  const page = await browser.newPage();
  page.on("pageerror", (e) => errors.push(tag + " pageerror: " + e.message));
  page.on("console", (m) => { if (m.type() === "error") errors.push(tag + " console: " + m.text().slice(0, 200)); });
  await page.setViewport({ width: w, height: h, deviceScaleFactor: mobile ? 2 : 1, isMobile: mobile, hasTouch: mobile });
  let n = 0;
  const snap = async (name) => page.screenshot({ path: `${SHOTS}/${tag}${String(++n).padStart(2, "0")}-${name}.png` });
  const click = (sel) => page.$eval(sel, (el) => el.click());
  const has = (sel) => page.$(sel).then((x) => !!x);
  const until = async (sel, ms = 12000) => { for (let t = 0; t < ms; t += 150) { if (await has(sel)) return true; await wait(150); } throw new Error(tag + " never saw " + sel); };
  const back = async () => { await click('[data-act="hall"], [data-act="go"][data-scene="hall"]'); await until("#world .map-art"); await wait(900); };
  const enter = async (room) => { await page.evaluate((r) => window.DP_PREVIEW.enter(r), room); await wait(2600); };
  const step = async (name, fn) => { try { await fn(); } catch (e) { errors.push(tag + " " + name + ": " + e.message.slice(0, 160)); await snap("FAILED-" + name); } };
  await page.goto(base + "/?demo=hall&revealed=1&notype=1", { waitUntil: "networkidle0" });
  await step("hall", async () => { await until("#world .map-art"); await wait(1500); await snap("hall"); });
  await step("menu", async () => { await click("#menu-btn"); await wait(500); await snap("menu"); await click('[data-act="menuClose"]'); await page.evaluate(() => window.DP_PREVIEW.startNight()); await wait(1500); await snap("after-start"); });
  await step("tonight", async () => { await until('[data-act="vbSkip"]'); await snap("briefing"); await click('[data-act="vbSkip"]'); await until(".vb-grid"); await wait(900); await snap("tonight"); await back(); await snap("hall-night"); });
  await step("menu-night", async () => { await click("#menu-btn"); await wait(500); await snap("menu-night"); await click('[data-act="menuClose"]'); await wait(300); });
  await step("shop", async () => { await enter("shop"); await snap("shop-room"); await click("#hud-action"); await until("#shop .s-card"); await wait(900); await snap("shop"); await click('[data-act="clueBuy"]'); await wait(800); await snap("shop-bought"); await back(); });
  await step("arena", async () => { await enter("hall"); await enter("arena"); await snap("arena-room"); await click("#hud-action"); await until(".vaults"); await wait(900); await snap("arena-page"); });
  await step("open", async () => {
    await click('[data-act="vaultPick"][data-v="3"]'); await wait(150); await click('[data-act="vaultPick"][data-v="4"]'); await wait(150); await click('[data-act="throwCycle"][data-i="0"]'); await wait(200);
    await page.evaluate(() => document.querySelector(".vaults").scrollIntoView()); await wait(300); await snap("arena-picked");
    await click('[data-act="vaultSeal"]'); await wait(300); await page.evaluate(() => document.querySelector('[data-act="vaultSealYes"]').scrollIntoView({ block: "center" })); await wait(200); await snap("arena-confirm");
    await click('[data-act="vaultSealYes"]'); await wait(900); await snap("arena-sealed"); await back(); await snap("arena-room-after");
  });
  await step("reveal", async () => {
    await page.evaluate(() => window.DP_PREVIEW.endNight()); await until(".v-gate"); await wait(700); await snap("reveal-gate");
    await click('[data-act="vNext"]'); await wait(1500); await snap("reveal-vaults");
    await click('[data-act="vNext"]'); await wait(1800); await snap("reveal-gold");
    await click('[data-act="vNext"]'); await wait(3200); await snap("reveal-out");
    await click('[data-act="vDone"]'); await until("#world .map-art"); await wait(1200); await snap("after-night");
  });
  await step("players", async () => { await click("#menu-btn"); await wait(400); await click('.menu-tile[data-scene="players"]'); await wait(1000); await snap("players-after"); });
  console.log(tag, "shots:", n);
  await page.close();
}
console.log("errors:", errors.length ? errors : "none");
await browser.close();
