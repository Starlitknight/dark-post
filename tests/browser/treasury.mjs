// The treasury against the real server: the GM opens it from the console, one player solves their grid on a
// phone-sized browser, the others solve by API, and the passcode opens the door. Start from an empty local database.
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


const CODE = "QUIETLITTLEWORDS"; // a passcode for this test only
const S = SHOTS + "/";
// solve a dealt board, and tap each piece round to where it belongs
const T = await import("/home/claude/dark-post/src/treasury.js");
const turnsTo = (from, to) => { let k = 0, m = from; while (m !== to && k < 4) { m = T.turn(m); k++; } return k; };
const tapBoard = async (now, want, lo, hi) => { for (let i = lo; i < hi; i++) for (let k = turnsTo(now[i], want[i]); k > 0; k--) await guest.$eval('.tr-tile[data-i="' + i + '"]', (el) => el.click()); };

// the GM opens the treasury from the console
const hostPage = await (await browser.createBrowserContext()).newPage();
watch(hostPage, "host");
await hostPage.setViewport(phone);
await hostPage.setCookie({ name: "dp_host", value: host.Cookie.split("=")[1], url: BASE });
await hostPage.goto(BASE + "/host", { waitUntil: "networkidle0" }); await sleep(2000);
await into(hostPage, "#treasury-panel"); await hostPage.screenshot({ path: S + "01-gm-before.png" });
await hostPage.type("#treasury-code", "quiet little words");
await hostPage.$eval("#treasury-form", (f) => f.requestSubmit()); await sleep(2500);
let t = await hostPage.$eval("#treasury-box", (el) => el.innerText);
ok("the GM opens the treasury and sees all sixteen places", t.includes("The treasury is in play") && t.includes(CODE) && (await hostPage.$$("#treasury-box tbody tr")).length === 16);
await into(hostPage, "#treasury-panel"); await hostPage.screenshot({ path: S + "02-gm-in-play.png" });

// the player: the bell, the walk, the rules
await sleep(3500);
ok("the bell tells the player to solve their puzzle", await (async () => { await click("#bell-btn"); const r = await guest.$eval("#menu", (el) => el.innerText); await click('[data-act="menuClose"]'); return /Solve your puzzle for the treasury/i.test(r) && !/Solve today/i.test(r); })());
await walk("puzzle", "Puzzle room"); await sleep(1500);
ok("the attendant explains the treasury", /The treasury holds 80 coins/i.test(await guest.$eval("#npc-talk", (el) => el.innerText)));
await guest.screenshot({ path: S + "03-room.png" });
await guest.$eval('#npc-talk [data-act="talkGo"], #npc-talk .btn', (el) => el.click()); await sleep(1800);
ok("the puzzle room is the treasury", (await sceneOf()) === "puzzle" && (await guest.$eval(".room-head h1", (el) => el.textContent)) === "The treasury");
const lines = [];
for (let i = 1; i <= 5; i++) { await sleep(350); lines.push(await guest.$eval(".bt-line", (el) => el.textContent)); await guest.screenshot({ path: S + "0" + (3 + i) + "-rule-" + i + ".png" }); await click('[data-act="trNext"]'); }
ok("five picture rules, one idea each", lines.length === 5 && lines[0].includes("80 coins") && lines[2].includes("Tap a piece to turn it") && lines[3].includes("glow gold") && lines[4].includes("every player gets 5 coins"));
await sleep(500);
t = await text(guest);
ok("the treasury shows sixteen places, none filled, and the player's own puzzle", (await guest.$$(".tr-slot")).length === 16 && (await guest.$$(".tr-slot.sure")).length === 0 && /0 of 16 letters have been found/i.test(t) && /Solve my puzzle/i.test(t));
ok("paying coins for the answer is offered beside the puzzle", /Or pay 3 coins/i.test(await guest.$eval(".tr-mine .tr-buy", (el) => el.innerText)) && /You have \d+ coins?/.test(await guest.$eval(".tr-mine .tr-buy", (el) => el.innerText)));
await guest.screenshot({ path: S + "09-treasury.png" });

// solve the board by tapping pieces
const v0 = await call("GET", "/api/treasury", null, seat(0));
const pz = await call("GET", "/api/treasury/puzzle?slot=" + v0.mine, null, seat(0));
const dealt = T.unhex(pz.start), want = T.unhex(T.solve(pz.start));
await click('[data-act="trSolve"]'); await sleep(1200);
ok("the board opens: 63 pieces, a battery, most without power", (await guest.$$("button.tr-tile")).length === 63 && (await guest.$$(".tr-tile.src")).length === 1 && (await guest.$$(".tr-tile.lit")).length < 22);
ok("and again under the board", (await guest.$('.tr-solve .tr-buy [data-act="trBuy"]')) !== null);
await guest.screenshot({ path: S + "10-grid-empty.png" });
await tapBoard(dealt, want, 0, 35);
await sleep(400); await guest.screenshot({ path: S + "11-grid-half.png" });
ok("it cannot be finished early", await guest.$eval('[data-act="trCheck"]', (el) => el.disabled));
await click('[data-act="trBack"]'); await sleep(900); await click('[data-act="trSolve"]'); await sleep(1500);
ok("work in progress is kept", (await call("GET", "/api/treasury/puzzle?slot=" + v0.mine, null, seat(0))).work === T.hex(want.slice(0, 35).concat(dealt.slice(35))));
await tapBoard(dealt, want, 35, 63);
await sleep(400);
ok("every piece has power", (await guest.$$(".tr-tile.lit")).length === 63 && !(await guest.$eval('[data-act="trCheck"]', (el) => el.disabled)));
await guest.screenshot({ path: S + "12-grid-full.png" });
await click('[data-act="trCheck"]'); await sleep(1200);
t = await guest.$eval(".tr-done", (el) => el.innerText);
ok("the letter and its place are revealed", t.includes(CODE[v0.mine]) && t.includes("goes in place " + (v0.mine + 1)));
await guest.screenshot({ path: S + "13-letter.png" });
await click('[data-act="trBack"]'); await sleep(1200);
ok("the treasury now shows the earned letter in gold", (await guest.$$(".tr-slot.sure")).length === 1 && (await guest.$eval(".tr-slot.sure b", (el) => el.textContent)) === CODE[v0.mine] && /Go to the broadcast room/i.test(await text(guest)));

// the others: one asks for help, the rest solve their own
await call("POST", "/api/treasury/help", { on: true }, seat(1));
for (let i = 2; i < 16; i++) { const vi = await call("GET", "/api/treasury", null, seat(i)); const pi = await call("GET", "/api/treasury/puzzle?slot=" + vi.mine, null, seat(i)); const r = await call("POST", "/api/treasury/solve", { slot: vi.mine, cells: T.solve(pi.start) }, seat(i)); if (!r.ok) problems.push("seat " + i + " could not solve"); }
await sleep(9000);
t = await text(guest);
ok("a player who asked for help is listed, and the count has moved", /asking for help/i.test(t) && /15 of 16 letters have been found/i.test(t) && (await guest.$$(".tr-holder.found")).length === 15);
await guest.screenshot({ path: S + "14-treasury-progress.png" });
await click('.tr-helprow [data-act="trSolve"]'); await sleep(1200);
const v1 = await call("GET", "/api/treasury", null, seat(1)), p1 = await call("GET", "/api/treasury/puzzle?slot=" + v1.mine, null, seat(0)), w1 = T.unhex(T.solve(p1.start));
await tapBoard(T.unhex(p1.start), w1, 0, 63);
await click('[data-act="trCheck"]'); await sleep(1200);
ok("helping solves the other player's puzzle for both", /You both have this letter now/i.test(await guest.$eval(".tr-done", (el) => el.innerText)) && (await call("GET", "/api/treasury", null, seat(1))).letters.length === 1);
await click('[data-act="trBack"]'); await sleep(1200);

// type the letters the others "announced", and try the door
const typeIn = async (i, ch) => { const box = await guest.$('.tr-in[data-slot="' + i + '"]'); if (!box) return false; await box.focus(); await sleep(80); await guest.keyboard.type(ch); await sleep(80); return true; };
for (let i = 0; i < 16; i++) await typeIn(i, i === 15 ? "Z" : CODE[i]);
await sleep(400);
const wrongFirst = (await guest.$('.tr-in[data-slot="15"]')) !== null;
await guest.screenshot({ path: S + "15-typed.png" });
if (wrongFirst) {
  await click('[data-act="trTry"]'); await click('[data-act="trTry"]'); await sleep(1200);
  ok("a wrong passcode costs a try", /2 tries left/i.test(await text(guest)));
  await typeIn(15, CODE[15]); await sleep(300);
  ok("a place can be retyped", (await guest.$eval('.tr-in[data-slot="15"]', (el) => el.value)) === CODE[15]);
}
const before = (await call("GET", "/api/hall", null, seat(7))).coins;
await click('[data-act="trTry"]'); await click('[data-act="trTry"]');
for (let i = 0; i < 40 && !(await guest.$(".tr-open")); i++) await sleep(100);
await guest.evaluate(() => window.scrollTo(0, 0));
ok("the door opening plays, the first time", (await guest.$(".tr-open.play .tr-ov .door")) !== null);
ok("the player who entered the passcode is in the scene, and credited", (await guest.$(".tr-open .tr-walker svg")) !== null && /You opened the treasury/i.test(await guest.$eval(".tr-by", (el) => el.textContent)) && /Congratulations, everyone/i.test(await guest.$eval(".tr-congrats", (el) => el.textContent)));
await sleep(500); await guest.screenshot({ path: S + "16a-walk.png" });
await sleep(1500); await guest.screenshot({ path: S + "16b-wheel.png" });
await sleep(1500); await guest.screenshot({ path: S + "16c-opening.png" });
await sleep(1200); await guest.screenshot({ path: S + "16d-credit.png" });
await sleep(2000);
ok("the game remembers that this player has seen it", (await call("GET", "/api/treasury", null, seat(0))).opened.seen === true && (await call("GET", "/api/treasury", null, seat(7))).opened.seen === false);
t = await text(guest);
ok("the right passcode opens the treasury for everyone", /The treasury is open/i.test(t) && t.includes("QUIET LITTLE WORDS") && /turning out his pockets/i.test(t) && (await call("GET", "/api/hall", null, seat(7))).coins === before + 5);
await guest.evaluate(() => window.scrollTo(0, 0)); await guest.screenshot({ path: S + "16-open.png" });
await sleep(9500);
ok("afterwards the card stands still", (await guest.$(".tr-open")) !== null && (await guest.$(".tr-open.play")) === null);
await guest.$eval('[data-act="trReplay"]', (el) => el.click()); await sleep(300);
ok("and it can be watched again", (await guest.$(".tr-open.play")) !== null);
// every player is offered the door opening in the bell, and it plays over any room
const h7 = (await call("GET", "/api/hall", null, seat(7))).treasury;
ok("the hall tells a player who has not watched it yet", h7.opened === true && h7.openSeen === false && h7.openedBy > 0 && (await call("GET", "/api/hall", null, seat(0))).treasury.openSeen === true);
await guest.evaluate(() => { const b = document.createElement("button"); b.setAttribute("data-act", "trOpenNow"); b.style.display = "none"; document.getElementById("app").appendChild(b); b.click(); b.remove(); });
for (let i = 0; i < 30 && !(await guest.$("#tr-over")); i++) await sleep(150);
ok("asked for from the bell, it plays over the room", (await guest.$("#tr-over .tr-open.play .tr-ov .door")) !== null);
await sleep(6300); await guest.screenshot({ path: S + "17-over.png" });
await guest.$eval('[data-act="trOverClose"]', (el) => el.click()); await sleep(300);
ok("and closes", (await guest.$("#tr-over")) === null);
await hostPage.reload({ waitUntil: "networkidle0" }); await sleep(1500);
ok("the GM sees who opened it", /The treasury was opened by/i.test(await hostPage.$eval("#treasury-box", (el) => el.innerText)));
console.log(problems.length ? "\n" + problems.join("\n") : "\nALL PASSED");
await browser.close();
process.exit(problems.length ? 1 : 0);
