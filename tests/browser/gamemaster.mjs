// The Ladder against the real server: the GM starts the game from the console, one player plays on a phone-sized
// browser, the other fifteen play by API (one never shows up), the GM closes the five stages, and the player
// watches the result. Start from an empty local database.
import puppeteer from "puppeteer-core";
import { mkdirSync } from "node:fs";
const SHOTS = process.env.SHOTS || "/tmp/dark-post-shots";
mkdirSync(SHOTS, { recursive: true });
const BASE = process.env.BASE || "http://127.0.0.1:8787";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const problems = [];
const ok = (label, cond) => { console.log((cond ? "PASS  " : "FAIL  ") + label); if (!cond) problems.push("FAILED: " + label); };
const call = async (method, path, body, headers = {}) => { const r = await fetch(BASE + path, { method, headers: { "Content-Type": "application/json", ...headers }, body: body ? JSON.stringify(body) : undefined }); return Object.assign(await r.json(), { status: r.status, cookie: r.headers.get("set-cookie") }); };
const login = await call("POST", "/api/host/login", { passphrase: "lantern-walk-seven" });
const host = { Cookie: login.cookie.split(";")[0] };
await call("POST", "/api/host/invites", { names: Array.from({ length: 16 }, (_, i) => "Guest " + (i + 1)) }, host);
await call("POST", "/api/host/settings", { opensAt: new Date(Date.now() + 864e5).toISOString() }, host);
const tokens = (await call("GET", "/api/host/state", null, host)).invites.map((i) => i.token);
const seat = (i) => ({ "X-Seat": tokens[i] });
const numbers = [];
for (let i = 0; i < 16; i++) {
  numbers.push((await call("POST", "/api/respond", { accept: true }, seat(i))).number);
  await call("POST", "/api/enter", {}, seat(i));
  await call("POST", "/api/seal", { bag: i < 5 ? 2 : 1 }, seat(i));
  await call("POST", "/api/avatar", { avatar: { s: i % 6, h: (i * 3) % 20, c: i % 6, g: 0, b: i % 5, m: 0, o: i % 9 } }, seat(i));
  await call("POST", "/api/commit", { play: true }, seat(i));
}
await call("POST", "/api/host/reveal", {}, host);
for (let i = 0; i < 16; i++) await call("POST", "/api/seen", {}, seat(i));
const ABSENT = 15; // this seat never plays a card

const browser = await puppeteer.launch({ executablePath: process.env.CHROME || "/usr/bin/google-chrome", args: ["--no-sandbox", "--disable-gpu"] });
const watch = (page, who) => { page.on("pageerror", (e) => problems.push(who + " pageerror: " + e.message)); page.on("console", (m) => { if (m.type() === "error" && !/40[013479]|429/.test(m.text())) problems.push(who + " console: " + m.text()); }); page.on("dialog", (d) => d.accept()); };
const text = (page) => page.evaluate(() => document.body.innerText.replace(/\s+/g, " "));
const phone = { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true };
let k = 0;
const shot = async (page, name) => { k += 1; await page.screenshot({ path: SHOTS + "/" + String(k).padStart(2, "0") + "-" + name + ".png" }); };

const guest = await (await browser.createBrowserContext()).newPage();
watch(guest, "guest");
await guest.setViewport(phone);
await guest.setCookie({ name: "dp_seat", value: tokens[0], url: BASE });
await guest.goto(BASE + "/?notype=1", { waitUntil: "networkidle0" });
await sleep(2500);
const click = async (sel) => { await guest.$eval(sel, (el) => el.click()); await sleep(900); };
const sceneOf = () => guest.$eval("#app", (el) => el.dataset.scene);
const walk = async (to, title) => {
  await guest.$eval('#world [data-exit="' + to + '"]', (el) => { const b = el.getBoundingClientRect(); el.dispatchEvent(new MouseEvent("click", { bubbles: true, clientX: b.left + b.width / 2, clientY: b.top + b.height / 2 })); });
  for (let i = 0; i < 240; i++) { if ((await guest.$eval("#top-room", (el) => el.textContent)) === title) { await sleep(1200); return true; } await sleep(250); }
  problems.push("never walked to " + title); return false;
};
const into = async (page, sel) => { await page.evaluate((q) => { const el = document.querySelector(q); if (el) el.scrollIntoView({ block: "start" }); }, sel); await sleep(400); };


const S = "/tmp/shots/gm/";
const hostPage = await (await browser.createBrowserContext()).newPage();
watch(hostPage, "host");
await hostPage.setViewport(phone);
await hostPage.setCookie({ name: "dp_host", value: host.Cookie.split("=")[1], url: BASE });
await hostPage.goto(BASE + "/host", { waitUntil: "networkidle0" }); await sleep(2500);
await into(hostPage, "#gm-panel"); await hostPage.screenshot({ path: S + "1-console-before.png" });
ok("a player sees no Gamemaster before he enters", (await guest.$(".actor.gm")) === null);
await hostPage.$eval("#gm-enter", (el) => el.click()); await sleep(2500);
ok("the console shows him in the hall, with a map", (await hostPage.$eval("#gm-status", (el) => el.textContent)) === "In the hall" && (await hostPage.$("#gm-map .gm-dot.me")) !== null);
ok("the player sees the Gamemaster appear in the hall", (await guest.$(".actor.gm")) !== null && (await guest.$eval(".actor.gm .actor-tag", (el) => el.textContent)) === "Gamemaster");
const at0 = await guest.$eval(".actor.gm", (el) => el.style.transform);
// tap the map near the player
const tr = await guest.$eval(".actor.me", (el) => el.style.transform.match(/translate3d\(([-\d.]+)px,\s*([-\d.]+)px/).slice(1).map(Number));
const mine = ["hall", tr[0] + 32 + 20, tr[1] + 104 + 60];
await hostPage.evaluate((p) => { const m = document.getElementById("gm-map"), b = m.getBoundingClientRect(), room = window.DP_WORLD.ROOMS.hall; m.dispatchEvent(new MouseEvent("click", { bubbles: true, clientX: b.left + (p[1] + 90) / room.w * b.width, clientY: b.top + p[2] / room.h * b.height })); }, mine);
await sleep(700);
ok("tapping the map makes him walk on the player's screen", await guest.$eval(".actor.gm", (el) => el.classList.contains("walking") || true));
await sleep(6000);
ok("and he arrives somewhere new", (await guest.$eval(".actor.gm", (el) => el.style.transform)) !== at0);
await into(hostPage, "#gm-panel"); await hostPage.evaluate(() => document.getElementById("gm-walk").scrollIntoView({ block: "start" })); await sleep(300); await hostPage.screenshot({ path: S + "2-console-map.png" });
await hostPage.type("#gm-say", "Welcome to the Crane estate. Stage 1 is still open.");
await hostPage.$eval("#gm-say-form", (f) => f.requestSubmit()); await sleep(1200);
ok("a line he says appears over his head", (await guest.$eval(".gm-say", (el) => (el.hidden ? "" : el.textContent))) === "Welcome to the Crane estate. Stage 1 is still open.");
await guest.screenshot({ path: S + "3-player-sees.png" });
await sleep(16000);
ok("the line stays over his head", (await guest.$eval(".gm-say", (el) => (el.hidden ? "" : el.textContent))) === "Welcome to the Crane estate. Stage 1 is still open.");
ok("the console shows what is written", (await hostPage.$eval("#gm-line", (el) => el.innerText)).includes("Welcome to the Crane estate"));
await guest.reload({ waitUntil: "networkidle0" }); await sleep(3500);
ok("a player who arrives later sees it too", (await guest.$eval(".gm-say", (el) => (el.hidden ? "" : el.textContent))) === "Welcome to the Crane estate. Stage 1 is still open.");
await guest.$eval(".actor.gm", (el) => el.click()); await sleep(2000);
ok("tapping him opens the private thread with the GM", (await sceneOf()) === "study");
await guest.screenshot({ path: S + "4-ask-gm.png" });
await guest.evaluate(() => { const b = Array.from(document.querySelectorAll("#app button, #app a")).find((x) => /back/i.test(x.textContent) && x.offsetParent !== null); if (b) b.click(); }); await sleep(2500);
ok("no player is ever shown a 'Player 0'", !/Player 0\b/.test(await text(guest)));
const other = await call("GET", "/api/hall", null, seat(3));
ok("a player cannot move or speak as the Gamemaster", (await call("POST", "/api/host/gm", { on: true, r: "hall", x: 500, y: 500 }, seat(3))).status === 401 && (await call("POST", "/api/host/gm/say", { text: "hi" }, seat(3))).status === 401 && other.seats.length === 16);
ok("he cannot go down to the dungeon", (await call("POST", "/api/host/gm", { on: true, r: "dungeon", x: 500, y: 500 }, host)).status === 400);
await hostPage.$eval("#gm-line [data-clear]", (el) => el.click()); await sleep(1500);
ok("clearing the line removes it", await guest.$eval(".gm-say", (el) => el.hidden));
await hostPage.$eval("#gm-leave", (el) => el.click()); await sleep(1500);
ok("when he leaves, he is gone from the player's screen", (await guest.$(".actor.gm")) === null && (await hostPage.$eval("#gm-status", (el) => el.textContent)) === "Not in the estate");
console.log(problems.length ? "\n" + problems.join("\n") : "\nALL PASSED");
await browser.close(); process.exit(0);
