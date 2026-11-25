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

// the GM starts the game from the console
const hostPage = await (await browser.createBrowserContext()).newPage();
watch(hostPage, "host");
await hostPage.setViewport(phone);
await hostPage.setCookie({ name: "dp_host", value: host.Cookie.split("=")[1], url: BASE });
await hostPage.goto(BASE + "/host", { waitUntil: "networkidle0" });
await sleep(1500);
let t = await hostPage.$eval("#night-panel", (el) => el.innerText);
ok("the console has the game, ready to start", !(await hostPage.$eval("#night-panel", (el) => el.hidden)) && /Game 1: The Ladder/i.test(t) && (await hostPage.$eval("#night-form button", (el) => el.textContent)) === "Start Game 1: The Ladder");
await into(hostPage, "#night-panel"); await shot(hostPage, "gm-start");
await hostPage.$eval("#night-form", (f) => f.requestSubmit()); await sleep(2000);
t = await hostPage.$eval("#night-box", (el) => el.innerText);
ok("the GM starts it and sees stage 1 open with nobody sealed", t.includes("Stage 1 of 5 is open") && t.includes("0 of 16 players have sealed") && (await hostPage.$$("#night-box tbody tr")).length === 16);

// the player is told, walks to the arena, hears the rules
for (let i = 0; i < 40 && (await sceneOf()) !== "gamecall"; i++) await sleep(250);
await sleep(4500);
t = await text(guest);
ok("every screen announces Game 1: The Ladder", (await sceneOf()) === "gamecall" && t.includes("The Ladder") && t.includes("Make your way to the arena"));
await shot(guest, "call");
await click('[data-act="callDone"]'); await sleep(6500);
ok("the arena shows the cards, not the covered set", (await walk("arena", "The arena")) && (await guest.$eval("#world .map-art image", (el) => el.getAttribute("href"))) === "/art/rooms/arena-ladder.webp");
await sleep(800);
ok("the attendant offers the rules", (await guest.$eval("#npc-talk", (el) => el.innerText)).includes("Welcome to Game 1: The Ladder"));
await shot(guest, "arena");
await click('[data-act="introRules"]'); await sleep(900);
const lines = [];
for (let i = 1; i <= 8; i++) { await sleep(450); lines.push(await guest.$eval("#vb-line", (el) => el.textContent)); if (i === 1 || i === 3) await shot(guest, "rule-" + i); await click("#vb-next"); }
ok("the rules say the Ace is high, twice", lines.length === 8 && lines[0].includes("The Ace is the highest: it beats the King.") && lines[2].includes("Ace beats King."));
await sleep(1500);
await click('[data-act="talkClose"]');
await guest.keyboard.down("ArrowUp"); await sleep(1500); await guest.keyboard.up("ArrowUp"); await sleep(700);
ok("at the cards, the player is offered the table", (await guest.$eval("#hud-action", (el) => (el.hidden ? "" : el.textContent))) === "Play your cards");
await click("#hud-action"); await sleep(1500);

const coinsOf = async (i) => (await call("GET", "/api/hall", null, seat(i))).coins;
const before = await coinsOf(0);
t = await guest.$eval("#sched", (el) => el.innerText);
ok("stage 1 shows three opponents and fifteen cards, the Ace marked high", t.includes("STAGE 1 OF 5") || t.includes("Stage 1 of 5") ? (await guest.$$(".ld-opp")).length === 3 && (await guest.$$(".ld-card:not([disabled])")).length === 15 && (await guest.$eval('.ld-card[data-c="A"]', (el) => el.innerText)).toLowerCase().includes("high") : false);
for (const c of ["9", "K", "4"]) { await click('.ld-card[data-c="' + c + '"]'); }
await click('.ld-boost[data-i="0"]');
await into(guest, ".ld-board"); await shot(guest, "stage1-laid");
await into(guest, ".ld-hand"); await shot(guest, "stage1-hand");
await click('[data-act="ldSeal"]'); await sleep(900);
ok("the cards are sealed and the boost cost one coin", (await guest.$(".ld-sealed")) !== null && (await coinsOf(0)) === before - 1);

// the others play by API: random cards they still hold
const playOthers = async (stage) => {
  for (let i = 1; i < 16; i++) {
    if (i === ABSENT) continue;
    const v = await call("GET", "/api/night", null, seat(i));
    const hand = v.hand.slice().sort(() => Math.random() - 0.5);
    const r = await call("POST", "/api/night/seal", { plays: v.opponents[stage - 1].map((opp, j) => ({ opp, card: hand[j] })) }, seat(i));
    if (r.status !== 200) problems.push("seat " + i + " could not seal stage " + stage + ": " + r.error);
  }
};
await playOthers(1);
await hostPage.reload({ waitUntil: "networkidle0" }); await sleep(1200);
t = await hostPage.$eval("#night-box", (el) => el.innerText);
ok("the GM sees fifteen sealed and who has not", t.includes("15 of 16 players have sealed") && t.includes("Not yet: Player " + numbers[ABSENT]));
await into(hostPage, "#night-panel"); await shot(hostPage, "gm-stage1");
await hostPage.$eval('[data-night="stage"]', (el) => el.click()); await sleep(2000);
ok("the GM closes stage 1 and stage 2 opens", (await hostPage.$eval("#night-box", (el) => el.innerText)).includes("Stage 2 of 5 is open"));

for (let i = 0; i < 64 && !(await guest.$(".ld-shown")); i++) await sleep(250);
await sleep(1500);
t = await guest.$eval("#sched", (el) => el.innerText);
ok("the player's screen turns the cards by itself", (await guest.$(".ld-shown")) !== null && /the cards are turned/i.test(t) && (await guest.$$(".ld-duel")).length === 3);
await into(guest, ".ld-shown"); await shot(guest, "stage1-turned");
await click('[data-act="ldSeen"]'); await sleep(900);
ok("stage 2: twelve cards left, one boost left", (await guest.$$(".ld-card:not([disabled])")).length === 12 && (await guest.$eval(".ld-boosts", (el) => el.textContent)).includes("1 of 2"));
await into(guest, ".ld-board"); await shot(guest, "stage2");
const used = (await call("GET", "/api/night", null, seat(0))).used;
ok("the absent player was given their three lowest cards, for all to see", used[numbers[ABSENT]].slice().sort().join() === ["2", "3", "4"].join());

for (let s = 2; s <= 5; s++) {
  const free = await guest.$$eval(".ld-card:not([disabled])", (els) => els.map((x) => x.getAttribute("data-c")));
  for (const c of free.slice(-3)) await click('.ld-card[data-c="' + c + '"]');
  await click('[data-act="ldSeal"]'); await sleep(600);
  await playOthers(s);
  await call("POST", "/api/host/night/stage", {}, host);
  if (s < 5) {
    for (let i = 0; i < 64 && !(await guest.$(".ld-shown")); i++) await sleep(250);
    await sleep(800);
    if (s === 2) { await into(guest, ".ladder"); await shot(guest, "ladder-after-2"); }
    await click('[data-act="ldSeen"]'); await sleep(700);
  }
}
for (let i = 0; i < 80 && (await sceneOf()) !== "vreveal"; i++) await sleep(250);
await sleep(1200);
ok("when stage 5 closes the player is taken to the result", (await sceneOf()) === "vreveal" && (await text(guest)).includes("Game 1 is over."));
await click('[data-act="vNext"]'); await sleep(1500);
ok("first the last three duels", (await guest.$$(".ld-duel")).length === 3 && /the last cards are turned/i.test(await text(guest)));
await shot(guest, "last-duels");
await click('[data-act="vNext"]'); await sleep(1500);
const v = await call("GET", "/api/night", null, seat(0));
t = await text(guest);
ok("then the final ladder, the prizes and who is out", /You finished/i.test(t) && (await guest.$$(".rung")).length === 16 && (await guest.$$(".rung-prize")).length === 3 && (v.result.out == null || t.toLowerCase().includes(v.result.out === v.you ? "you are out" : "player " + v.result.out + " is out")));
console.log("ladder width:", await guest.evaluate(() => { const l = document.querySelector("#vr .ladder"), c = l.parentElement; const cs = getComputedStyle(c); return [l.offsetWidth, c.offsetWidth, cs.display, cs.alignItems, cs.justifyItems, getComputedStyle(l).width, getComputedStyle(l.firstChild).maxWidth].join(" "); }));
await shot(guest, "final");
await into(guest, ".v-outcard"); await shot(guest, "out");
await hostPage.reload({ waitUntil: "networkidle0" }); await sleep(1200);
t = await hostPage.$eval("#night-box", (el) => el.innerText);
ok("the GM sees the game is over, the prizes and who is out", t.includes("The Ladder is over") && t.includes("+5 coins") && (v.result.out == null || t.includes("is out")));
await into(hostPage, "#night-panel"); await shot(hostPage, "gm-over");
await click('[data-act="vDone"]'); await sleep(2500);
ok("and the player is back in the hall", (await sceneOf()) === "hall");

console.log(problems.length ? "\n" + problems.join("\n") : "\nALL PASSED");
await browser.close();
process.exit(problems.length ? 1 : 0);
