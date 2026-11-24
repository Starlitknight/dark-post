// The merged game against the real server: a new player's whole first visit in the new screens,
// every menu page, changing the character, the bags opening, and a walk through every room.
import puppeteer from "puppeteer-core";
import { mkdirSync } from "node:fs";
const SHOTS = process.env.SHOTS || "/tmp/dark-post-shots";
mkdirSync(SHOTS, { recursive: true });
const BASE = process.env.BASE || "http://127.0.0.1:8787";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const problems = [];
const ok = (label, cond) => { console.log((cond ? "PASS  " : "FAIL  ") + label); if (!cond) problems.push("FAILED: " + label); };
const call = async (method, path, body, headers = {}) => { const r = await fetch(BASE + path, { method, headers: { "Content-Type": "application/json", ...headers }, body: body ? JSON.stringify(body) : undefined }); return Object.assign(await r.json().catch(() => ({})), { status: r.status, cookie: r.headers.get("set-cookie") || "" }); };
const login = await call("POST", "/api/host/login", { passphrase: "lantern-walk-seven" });
const host = { Cookie: login.cookie.split(";")[0] };
await call("POST", "/api/host/invites", { names: ["Maya", "Arjun", "Leila", "Tomas"] }, host);
await call("POST", "/api/host/settings", { opensAt: new Date(Date.now() + 864e5).toISOString() }, host);
const tokens = (await call("GET", "/api/host/state", null, host)).invites.map((i) => i.token);
const seat = (i) => ({ "X-Seat": tokens[i] });
for (let i = 1; i < 4; i++) {
  await call("POST", "/api/respond", { accept: true }, seat(i));
  await call("POST", "/api/enter", {}, seat(i));
  await call("POST", "/api/seal", { bag: i < 2 ? 2 : 1 }, seat(i));
  await call("POST", "/api/avatar", { avatar: { s: i % 6, h: i, c: i, g: 0, b: 0, m: 0, o: i } }, seat(i));
}
const browser = await puppeteer.launch({ executablePath: process.env.CHROME || "/usr/bin/google-chrome", args: ["--no-sandbox", "--disable-gpu"] });
const page = await browser.newPage();
page.on("pageerror", (e) => problems.push("pageerror: " + e.message));
page.on("console", (m) => { if (m.type() === "error" && !/40[13479]|429/.test(m.text())) problems.push("console: " + m.text().slice(0, 200)); });
page.on("requestfailed", (r) => { if (!/ws$|\/live/.test(r.url())) problems.push("request failed: " + r.url().replace(BASE, "")); });
page.on("response", (r) => { if (r.status() === 404) problems.push("404: " + r.url().replace(BASE, "")); });
await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
await page.goto(BASE + "/i/" + tokens[0] + "?notype=1", { waitUntil: "networkidle0" });
await sleep(1500);
const scene = () => page.evaluate(() => document.getElementById("app") ? document.getElementById("app").dataset.scene : document.querySelector("[data-scene]") && document.body.innerHTML.length ? (document.querySelector("#root, main, body > div") || {}).dataset?.scene : "");
const sceneOf = () => page.evaluate(() => { const el = [...document.querySelectorAll("body > *")].find((x) => x.dataset && x.dataset.scene); return el ? el.dataset.scene : ""; });
const text = () => page.evaluate(() => document.body.innerText.replace(/\s+/g, " "));
const tryClick = (sel) => page.evaluate((s) => { const el = [...document.querySelectorAll(s)].find((x) => !x.disabled && !x.inert && !x.closest("[inert]") && x.offsetParent !== null); if (el) { el.click(); return true; } return false; }, sel);
let n = 0; const seen = [];
const snap = async (name) => page.screenshot({ path: `${SHOTS}/mf${String(++n).padStart(2, "0")}-${name}.png` });
const order = ['[data-act="openLetter"]', '[data-act="accept"]', '[data-act="enter"]', '[data-act="draw"]', '[data-act="seal"]', '[data-act="sealAsk"]', '[data-act="pick"][data-bag="1"]:not(.on)', '[data-act="saveFace"]', '[data-act="tourNext"]', '#go', '[data-act="advance"]', '[data-act="hall"]'];
let last = "";
for (let i = 0; i < 90; i++) {
  const s = await sceneOf();
  if (s !== last) { seen.push(s); await sleep(700); await snap(s || "none"); last = s; }
  if (s === "hall") break;
  if (s === "face" && !(await page.$(".face.on, .preset.on, [data-act=preset].on"))) await tryClick('[data-act="preset"]');
  let done = false;
  for (const sel of order) { if (await tryClick(sel)) { done = true; break; } }
  if (!done) await page.mouse.click(195, 420);
  await sleep(s === "draw" ? 2500 : 700);
}
console.log("screens:", seen.join(" > "));
ok("a new player gets from the envelope to the hall on the real server", last === "hall" && seen[0] === "envelope" && seen[1] === "letter" && seen[2] === "welcome" && seen.length >= 9);
await sleep(1500);
ok("the hall has the player and the clock", (await page.$$(".actor")).length >= 4 && (await page.$eval("#now-a", (el) => el.textContent)).length > 3);
const me = await call("GET", "/api/me", null, seat(0));
ok("the server has the bag sealed and a character saved", me.state === "hall" && !!me.avatar && (me.bag === 1 || me.sealed === true || me.choice === 1 || me.bag != null));

// every menu page
for (const [id, word] of [["whispers", "Messages"], ["study", "GM"], ["players", "Players"], ["table", "Broadcast"], ["standings", "Standings"], ["guide", "How to play"]]) {
  await tryClick("#menu-btn"); await sleep(500);
  const opened = await tryClick(`.menu-sheet [data-scene="${id}"], .menu-sheet [data-id="${id}"]`); await sleep(1200);
  const t = await text();
  ok("menu page opens: " + word, opened && (await sceneOf()) === id && t.length > 40);
  await snap("page-" + id);
  if (id === "players") {
    await tryClick(`[data-act="card"][data-n="${me.number}"]`); await sleep(700);
    ok("my own card offers to change my character before the bags open", (await page.$('[data-act="editFace"]')) !== null);
    await snap("card-mine");
    await tryClick('[data-act="cardClose"]'); await sleep(300);
  }
  await tryClick('[data-act="hall"], [data-act="go"][data-scene="hall"]'); await sleep(900);
}

// a private message, typed and sent in the page
await tryClick("#menu-btn"); await sleep(500); await tryClick('.menu-sheet [data-scene="whispers"]'); await sleep(1000);
await tryClick('[data-act="seat"], .thread, [data-with]'); await sleep(1000);
await page.type("#msg", "Are you with me?"); await tryClick("#msg-send"); await sleep(1200);
await page.type("#msg", "Second line"); await page.keyboard.press("Enter"); await sleep(1200);
const said = await page.$eval("#msgs", (el) => el.innerText);
ok("a private message sends by the button and by Enter", said.includes("Are you with me?") && said.includes("Second line"));
ok("and the host can read it", JSON.stringify(await call("GET", "/api/host/messages?room=whispers", null, host)).includes("Are you with me?"));
await tryClick('[data-act="go"][data-scene="whispers"]'); await sleep(600); await tryClick('[data-act="hall"], [data-act="go"][data-scene="hall"]'); await sleep(900);

// the host opens the bags
await call("POST", "/api/host/reveal", {}, host);
await sleep(14000);
let s = await sceneOf();
ok("the bags opening reaches the player without a reload", s !== "hall" || (await text()).toLowerCase().includes("bags are open"));
await snap("reveal-" + s);
for (let i = 0; i < 40 && (await sceneOf()) !== "hall"; i++) { if (!(await tryClick('[data-act="seen"]')) && !(await tryClick('[data-act="next"]')) && !(await tryClick('[data-act="hall"]')) && !(await tryClick('[data-act="advance"]'))) await page.mouse.click(195, 420); await sleep(900); if (i % 4 === 0) await snap("reveal-step"); }
ok("and the reveal ends back in the hall", (await sceneOf()) === "hall");
await sleep(1500);
const after = await call("GET", "/api/hall", null, seat(0));
ok("after the bags open, the character is locked", after.canEditFace === false && after.phase === "revealed");
ok("the coin chip matches the server", (await page.$eval("#top-coins", (el) => el.textContent)) === (after.coins === 1 ? "1 coin" : after.coins + " coins"));

ok("the hall has six doors, and none to a dungeon or an observatory", (await page.$$eval("#world [data-exit]", (els) => els.map((e) => e.getAttribute("data-exit")).sort().join(","))) === "arena,betting,gallery,puzzle,shop,studio");
// every room, on foot
const walk = async (to, title) => {
  const there = await page.evaluate((to) => { const el = document.querySelector('#world [data-exit="' + to + '"]'); if (!el) return false; const b = el.getBoundingClientRect(); el.dispatchEvent(new MouseEvent("click", { bubbles: true, clientX: b.left + b.width / 2, clientY: b.top + b.height / 2 })); return true; }, to);
  if (!there) return false;
  for (let i = 0; i < 240; i++) { if ((await page.$eval("#top-room", (el) => el.textContent)) === title) { await sleep(1300); return true; } await sleep(250); }
  return false;
};
// The arena, the betting room and the shop are closed: a member of staff says so, and there is nothing to press.
// The puzzle room is open: its attendant offers today's puzzle, and solving it pays.
const talk = () => page.evaluate(() => { const b = document.getElementById("npc-talk"); return b && !b.hidden ? b.innerText.replace(/\s+/g, " ") : ""; });
const closed = { arena: "GM is preparing the next game", betting: "closed for bets right now", shop: "shop is closed right now" };
for (const [id, title] of [["arena", "The arena"], ["puzzle", "Puzzle room"], ["betting", "Betting room"], ["studio", "Broadcast room"], ["gallery", "Gallery"], ["shop", "The shop"]]) {
  const got = await walk(id, title);
  if (got && closed[id]) {
    await snap("room-" + id);
    const t = await talk();
    ok(title + ": a member of staff says it is closed, with no number on them and nothing to press", t.includes(closed[id]) && t.includes("HOUSE STAFF") && (await page.$eval("#hud-action", (el) => el.hidden)) && (await page.$("#world .mark")) === null && (await page.$eval(".actor.npc", (el) => !/\d/.test(el.textContent))));
    await tryClick('[data-act="talkClose"]'); await sleep(300);
  } else if (got && id === "puzzle") {
    await sleep(700); await snap("room-puzzle");
    const offer = await talk();
    const answer = (await call("GET", "/api/host/activity", null, host)).puzzle.players.find((p) => p.n === me.number).answer;
    const before = (await call("GET", "/api/hall", null, seat(0))).coins;
    await tryClick('.npc-talk [data-scene="puzzle"]'); await sleep(1400);
    await snap("puzzle");
    await page.type("#pz-answer", String(answer)); await tryClick("#pz-send"); await sleep(1600);
    const shown = await page.evaluate(() => { const r = document.querySelector("#pz-result.win"); return r ? r.innerText.replace(/\s+/g, " ").toUpperCase() : ""; });
    await snap("puzzle-solved");
    await tryClick('[data-act="pzDone"]'); await sleep(400);
    const solved = shown.includes("PUZZLE SOLVED") && shown.includes("+1 COIN") && (await page.$("#pz-result")) === null && (await text()).includes("Solved.");
    ok("a second answer the same day is refused by the server", (await call("POST", "/api/puzzle", { answer: String(answer) }, seat(0))).status === 409);
    const now = (await call("GET", "/api/hall", null, seat(0))).coins;
    ok("the attendant offers today's puzzle, and solving it pays one coin (" + before + " to " + now + ")", offer.includes("haven’t done today’s puzzle") && solved && now === before + 1);
    await tryClick('[data-act="hall"], [data-act="go"][data-scene="hall"]'); await sleep(1500);
    ok("the game clock at the top shows Eastern time", /^\d{1,2}:\d\d [AP]M E[SD]T$/.test(await page.$eval("#top-clock", (el) => el.textContent)));
    ok("the coin shows at once, and the attendant says the puzzle is done", (await page.$eval("#top-coins", (el) => el.textContent)) === now + " coins" && (await talk()).includes("have done today’s puzzle"));
    await tryClick('[data-act="talkClose"]'); await sleep(300);
  } else {
    let used = false, inside = "";
    if (got) { await snap("room-" + id); used = await tryClick("#hud-action"); await sleep(1300); inside = await sceneOf(); await snap("in-" + id); await tryClick('[data-act="hall"], [data-act="go"][data-scene="hall"]'); await sleep(900); }
    ok("walks into " + title + (inside ? " and opens its page (" + inside + ")" : ""), got && (used || id === "gallery"));
  }
  if (got && !(await walk("hall", "The hall"))) { problems.push("could not walk back from " + title); break; }
}
console.log(problems.length ? "\nPROBLEMS:\n" + [...new Set(problems)].join("\n") : "\nNO PROBLEMS");
await browser.close();
process.exit(problems.length ? 1 : 0);
