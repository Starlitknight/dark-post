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
await call("POST", "/api/host/night/ends", { endsAt: new Date(Date.now() + 5 * 3600000).toISOString() }, host); await sleep(2500);
t = await guest.$eval("#top-stage", (el) => (el.hidden ? "" : el.innerText.replace(/\s+/g, " ")));
ok("the top bar counts down to the stage closing and sends the player to the arena", /stage 1 closes in 04:59:\d\d/i.test(t) && /go to the arena and play your cards/i.test(t));
await shot(guest, "top-bar");
ok("the arena shows the cards, not the covered set", (await walk("arena", "The arena")) && (await guest.$eval("#world .map-art image", (el) => el.getAttribute("href"))) === "/art/rooms/arena-ladder.webp");
await sleep(800);
ok("the attendant offers the rules", (await guest.$eval("#npc-talk", (el) => el.innerText)).includes("Welcome to Game 1: The Ladder"));
await shot(guest, "arena");
await click('[data-act="introRules"]'); await sleep(900);
const lines = [];
for (let i = 1; i <= 10; i++) { await sleep(450); lines.push(await guest.$eval("#vb-line", (el) => el.textContent)); if (i === 1 || i >= 8) await shot(guest, "rule-" + i); await click("#vb-next"); }
ok("the rules say the Ace is high, twice", lines.length === 10 && lines[7].includes("The lowest ranked player is eliminated.") && lines[8].includes("walk to the yellow symbol in the arena") && lines[9].includes("strike deals") && lines[0].includes("The Ace is the highest: it beats the King.") && lines[2].includes("Ace beats King."));
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
await click('[data-act="ldAsk"]'); await click('[data-act="ldSeal"]'); await sleep(900);
await guest.evaluate(() => { const b = Array.from(document.querySelectorAll("#app button, #app a")).find((x) => /back/i.test(x.textContent) && x.offsetParent !== null); if (b) b.click(); }); await sleep(2500);
ok("once submitted, the top bar says so", /you have submitted/i.test(await guest.$eval("#top-stage", (el) => el.innerText)));
await shot(guest, "top-bar-done");
await click("#top-stage"); await sleep(1800);
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
ok("the player sees who has submitted: only themselves so far", (await guest.$eval(".ld-subs", (el) => el.innerText)).toLowerCase().includes("submitted · 1 of 16") && (await guest.$$(".sub.done")).length === 1);
await into(guest, ".ld-subs"); await shot(guest, "submitted");
await playOthers(1);
for (let i = 0; i < 40 && (await guest.$$(".sub.done")).length < 15; i++) await sleep(250);
ok("and the ticks fill in as the others submit", (await guest.$$(".sub.done")).length === 15);
await shot(guest, "submitted-15");
for (let i = 0; i < 40 && (await guest.$$(".ld-live .ld-duel:not(.wait)")).length < 2; i++) await sleep(250);
t = await guest.$eval(".ld-live", (el) => el.innerText);
ok("each duel is over as the opponent submits: won or lost and their card are shown at once", (await guest.$$(".ld-live .ld-duel:not(.wait)")).length >= 2 && (await guest.$$(".ld-live .ld-duel:not(.wait) .ld-them .pcard:not(.down):not(.ghost)")).length >= 2 && (await guest.$$(".ld-live .ld-them .pcard.down")).length === 0 && /won|lost|level/i.test(t) && (await guest.$(".ld-card")) === null);
await into(guest, ".ld-live"); await shot(guest, "live-duels");
ok("the ladder is live", /live/i.test(await guest.$eval("#sched", (el) => el.innerText)) && (await guest.$(".ld-livecap")) !== null);
await hostPage.reload({ waitUntil: "networkidle0" }); await sleep(1200);
t = await hostPage.$eval("#night-box", (el) => el.innerText);
ok("the GM sees fifteen sealed and who has not", t.includes("15 of 16 players have sealed") && t.includes("Not yet: Player " + numbers[ABSENT]));
await into(hostPage, "#night-panel"); await shot(hostPage, "gm-stage1");
t = await hostPage.$eval("#night-box", (el) => el.innerText);
ok("the GM sees every player's sealed cards and last-online time in Eastern time", (await hostPage.$$(".choice")).length === 16 && /9 \+2 vs P\d+ · K vs P\d+ · 4 vs P\d+/.test(t) && t.includes("Nothing submitted yet") && /Last online: \w+ \d+, \d+:\d\d [AP]M ET/.test(t));
await into(hostPage, ".choices-h"); await shot(hostPage, "gm-choices");
await hostPage.$eval('[data-night="stage"]', (el) => el.click()); await sleep(2000);
ok("the GM closes stage 1 and stage 2 opens", (await hostPage.$eval("#night-box", (el) => el.innerText)).includes("Stage 2 of 5 is open"));

// the stage reveal plays for every player, over whatever they were doing
for (let i = 0; i < 40 && !(await guest.$("#mega")); i++) await sleep(250);
ok("the stage reveal opens by itself", (await guest.$("#mega")) !== null);
await sleep(1700); await shot(guest, "mega-title");
ok("it opens on the stage's name", /Stage 1/.test(await guest.$eval("#mega", (el) => el.innerText)) && /cards are turned/i.test(await guest.$eval("#mega", (el) => el.innerText)));
for (let i = 0; i < 40 && !(await guest.$(".mg-wall")); i++) await sleep(250);
ok("every duel of the stage is laid face down: 24", (await guest.$$(".mg-duel")).length === 24 && (await guest.$$(".mg-duel.mine")).length === 3 && (await guest.$eval(".mg-wall", (el) => el.scrollWidth <= el.clientWidth + 1 && el.getBoundingClientRect().right <= window.innerWidth)));
await sleep(2600); await shot(guest, "mega-wall-half");
for (let i = 0; i < 60 && (await guest.$$(".mg-duel.turned")).length < 24; i++) await sleep(250);
ok("and every one is turned, forfeits marked", (await guest.$$(".mg-duel.turned")).length === 24 && (await guest.$$(".mg-card.forfeit")).length === 3 && /24 of 24 turned · 3 forfeited/i.test(await guest.$eval("#mg-tally", (el) => el.textContent)));
await sleep(500); await shot(guest, "mega-wall");
for (let i = 0; i < 40 && !(await guest.$(".mg-upset")); i++) await sleep(250);
await sleep(1200);
ok("then the talk of the stage", (await guest.$(".mg-upset")) !== null);
await shot(guest, "mega-upset");
for (let i = 0; i < 40 && !(await guest.$(".mg-ladder")); i++) await sleep(250);
await sleep(2200); await shot(guest, "mega-ladder-half");
await sleep(3200);
ok("then the ladder: sixteen rows, the player marked, last place in danger", (await guest.$$(".mg-row")).length === 16 && (await guest.$$(".mg-row.you")).length === 1 && (await guest.$$(".mg-row.last")).length === 1 && (await guest.$$(".mg-row.top")).length === 3);
await shot(guest, "mega-ladder");
await guest.$eval("#mega-done", (el) => el.click()); await sleep(700);
ok("it closes, and is not shown again", (await guest.$("#mega")) === null && (await guest.evaluate(() => Object.keys(localStorage).filter((k) => k.indexOf("dp_mega_") === 0).map((k) => localStorage.getItem(k)).join())) === "1");
await hostPage.reload({ waitUntil: "networkidle0" }); await sleep(1500);
ok("the GM sees who has been shown the reveal", /Stage 1 reveal: seen by 1 of 16\. Not yet: Player/.test(await hostPage.$eval("#night-box", (el) => el.innerText)));
ok("no player is sent that list", !("reveal" in (await call("GET", "/api/night", null, seat(0)))) && (await call("GET", "/api/host/activity", null, seat(0))).error !== undefined);
// the later stages of this test are played without it
await guest.evaluate(() => { Object.keys(localStorage).filter((k) => k.indexOf("dp_mega_") === 0).forEach((k) => localStorage.setItem(k, "99")); });

for (let i = 0; i < 64 && !(await guest.$(".ld-shown")); i++) await sleep(250);
await sleep(1500);
t = await guest.$eval("#sched", (el) => el.innerText);
ok("the player's screen turns the cards by itself", (await guest.$(".ld-shown")) !== null && /the cards are turned/i.test(t) && (await guest.$$(".ld-duel")).length === 3);
await into(guest, ".ld-shown"); await shot(guest, "stage1-turned");
ok("the stage's talking point is shown with the result", (await guest.$(".ld-shown .upset")) !== null && /Biggest upset|Strongest card to fall/i.test(await guest.$eval(".upset", (el) => el.innerText)));
await guest.evaluate(() => document.querySelector(".upset").scrollIntoView({ block: "center" })); await sleep(300); await shot(guest, "upset");
await click('[data-act="ldSeen"]'); await sleep(900);
ok("stage 2: twelve cards left, one boost left", (await guest.$$(".ld-card:not([disabled])")).length === 12 && (await guest.$eval(".ld-boosts", (el) => el.textContent)).includes("1 of 2"));
ok("the bottom three of the ladder are marked as the danger zone", (await guest.$$(".rung.danger")).length === 3 && (await guest.$(".danger-line")) !== null);
await guest.evaluate(() => document.querySelector(".danger-line").scrollIntoView({ block: "center" })); await sleep(300); await shot(guest, "danger");
await guest.evaluate(() => { const b = Array.from(document.querySelectorAll("#app button, #app a")).find((x) => /back/i.test(x.textContent) && x.offsetParent !== null); if (b) b.click(); }); await sleep(2500);
await click("#bell-btn"); await sleep(500);
ok("the bell now goes straight to the table", (await guest.$('.bell-row.todo[data-scene="arena"]')) !== null);
ok("the bell offers the stage reveal, to watch again", /Stage 1 results are in/.test(await guest.$eval("#menu", (el) => el.innerText)) && (await guest.$('.bell-row[data-act="megaNow"]')) !== null);
await guest.$eval('.bell-row[data-act="megaNow"]', (el) => el.click());
for (let i = 0; i < 24 && !(await guest.$("#mega")); i++) await sleep(250);
ok("and plays it from there", (await guest.$("#mega")) !== null);
await guest.$eval("#mega-skip", (el) => el.click()); await sleep(700);
await guest.evaluate(() => { Object.keys(localStorage).filter((k) => k.indexOf("dp_mega_") === 0).forEach((k) => localStorage.setItem(k, "99")); });
await shot(guest, "bell-shortcut");
await click('.bell-row.todo[data-scene="arena"]'); await sleep(1800);
ok("and it opens the play screen", (await sceneOf()) === "arena" && (await guest.$$(".ld-card:not([disabled])")).length === 12);
await into(guest, ".ld-board"); await shot(guest, "stage2");
const used = (await call("GET", "/api/night", null, seat(0))).used;
ok("the absent player was given their three lowest cards, for all to see", used[numbers[ABSENT]].slice().sort().join() === ["2", "3", "4"].join());

for (let s = 2; s <= 5; s++) {
  const free = await guest.$$eval(".ld-card:not([disabled])", (els) => els.map((x) => x.getAttribute("data-c")));
  for (const c of free.slice(-3)) await click('.ld-card[data-c="' + c + '"]');
  await click('[data-act="ldAsk"]'); await click('[data-act="ldSeal"]'); await sleep(600);
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
