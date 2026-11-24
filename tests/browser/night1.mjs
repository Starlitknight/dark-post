// Six Vaults against the real server: the host starts the night, one guest plays in a phone-sized browser,
// the others play by API, the host closes the vaults, and the guest watches the result.
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
await call("POST", "/api/host/invites", { names: ["Maya", "Arjun", "Leila", "Tomas", "Ines", "Kofi"] }, host);
await call("POST", "/api/host/settings", { opensAt: new Date(Date.now() + 864e5).toISOString() }, host);
const tokens = (await call("GET", "/api/host/state", null, host)).invites.map((i) => i.token);
const seat = (i) => ({ "X-Seat": tokens[i] });
const numbers = [];
for (let i = 0; i < 6; i++) {
  numbers.push((await call("POST", "/api/respond", { accept: true }, seat(i))).number);
  await call("POST", "/api/enter", {}, seat(i));
  await call("POST", "/api/seal", { bag: i < 2 ? 2 : 1 }, seat(i));
  await call("POST", "/api/avatar", { avatar: { s: i % 6, h: i, c: i, g: 0, b: 0, m: 0, o: i } }, seat(i));
}
await call("POST", "/api/host/reveal", {}, host);
for (let i = 0; i < 6; i++) await call("POST", "/api/seen", {}, seat(i));

const browser = await puppeteer.launch({ executablePath: process.env.CHROME || "/usr/bin/google-chrome", args: ["--no-sandbox", "--disable-gpu"] });
const watch = (page, who) => { page.on("pageerror", (e) => problems.push(who + " pageerror: " + e.message)); page.on("console", (m) => { if (m.type() === "error" && !/40[13479]|429/.test(m.text())) problems.push(who + " console: " + m.text()); }); page.on("dialog", (d) => d.accept()); };
const text = (page) => page.evaluate(() => document.body.innerText.replace(/\s+/g, " "));
const guestCtx = await browser.createBrowserContext();
const guest = await guestCtx.newPage();
watch(guest, "guest");
await guest.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
await guest.goto(BASE + "/i/" + tokens[0] + "?notype=1", { waitUntil: "networkidle0" });
await sleep(2000);
const click = async (sel) => { await guest.$eval(sel, (el) => el.click()); await sleep(900); };
// no travel from the menu any more: tap a door sign and wait until the player has walked through it
const walk = async (to, title) => {
  await guest.$eval('#world [data-exit="' + to + '"]', (el) => { const b = el.getBoundingClientRect(); el.dispatchEvent(new MouseEvent("click", { bubbles: true, clientX: b.left + b.width / 2, clientY: b.top + b.height / 2 })); });
  for (let i = 0; i < 240; i++) { if ((await guest.$eval("#top-room", (el) => el.textContent)) === title) { await sleep(1200); return true; } await sleep(250); }
  problems.push("never walked to " + title); return false;
};
const back = async () => { await click('[data-act="hall"], [data-act="go"][data-scene="hall"]'); await sleep(600); };
ok("before the night, the hall is as it was", (await guest.$$(".actor")).length === 16 && (await guest.$eval("#now-a", (el) => el.textContent)) === "The bags are open");
await click("#menu-btn");
ok("and the menu has no match on it", (await guest.$(".menu-night")) === null);
await click('[data-act="menuClose"]');

// the host starts the night from the console
const hostCtx = await browser.createBrowserContext();
const hostPage = await hostCtx.newPage();
watch(hostPage, "host");
await hostPage.setViewport({ width: 1280, height: 900 });
await hostPage.goto(BASE + "/host", { waitUntil: "networkidle0" });
await hostPage.type("#pass", "lantern-walk-seven"); await hostPage.click("#gate-go"); await sleep(1500);
const pad = (x) => String(x).padStart(2, "0");
const ends = new Date(Date.now() + 6 * 3600e3);
await hostPage.$eval("#night-ends", (el, v) => { el.value = v; }, `${ends.getFullYear()}-${pad(ends.getMonth() + 1)}-${pad(ends.getDate())}T${pad(ends.getHours())}:${pad(ends.getMinutes())}`);
await hostPage.$eval("#night-form", (f) => f.requestSubmit()); await sleep(1800);
let t = await hostPage.$eval("#night-box", (el) => el.innerText);
ok("the host starts Night 1 and sees every clue and the vaults", t.includes("Night 1 is being played.") && t.includes("0 of 6 players have opened") && t.includes("Vault 2: 10 gold") && (await hostPage.$$("#night-box tbody tr")).length === 6);

// the guest
await sleep(13000); // the hall checks for news every few seconds
ok("the hall's clock turns to the match without a reload", (await guest.$eval("#now-a", (el) => el.textContent)) === "Night 1: Six Vaults" && (await guest.$eval("#now-b", (el) => el.textContent)) === "The vaults close" && (await guest.$eval("#now-do", (el) => el.textContent)).includes("Collect clues."));
await click("#menu-btn");
ok("the menu puts tonight's match on top", (await guest.$eval(".menu-night", (el) => el.textContent)).includes("Six Vaults"));
await click(".menu-night"); await sleep(1200);
ok("the first look at the night is the picture briefing", (await guest.$eval("#app", (el) => el.dataset.scene)) === "vbrief" && (await text(guest)).includes("Six vaults."));
for (let i = 0; i < 7; i++) await click('[data-act="vbNext"]');
ok("its last picture is the prizes", (await text(guest)).includes("win 5, 3 and 1 coins") && (await guest.$eval("#vb-next", (el) => el.textContent)) === "Got it");
await guest.screenshot({ path: SHOTS + "/nr-brief.png" });
await click('[data-act="vbNext"]'); await sleep(1200);
t = await text(guest);
const own = (await call("GET", "/api/night", null, seat(0))).clue;
ok("tonight's page gives the rules, the clock and this player's clue", t.includes("Three are empty.") && t.includes("10, 5 and 2 gold") && t.includes("THE VAULTS CLOSE IN") && t.includes(own) && t.includes("They may lie."));
ok("and sends the player to the arena to open vaults", t.includes("Its door is at the top of the hall.") && (await guest.$('[data-act="goto"]')) === null && (await guest.$('[data-act="vaultPick"]')) === null);
await guest.screenshot({ path: SHOTS + "/nr-tonight.png" });
await back();
ok("the player walks to the shop, and its sign says Open", (await walk("shop", "The shop")) && (await guest.$eval("#world .map-art", (el) => el.textContent.includes("Open"))));
await guest.screenshot({ path: SHOTS + "/nr-shop-room.png" });
await click("#hud-action"); await sleep(1200);
ok("the shop sells one clue for a coin", (await text(guest)).includes("ONE CLUE · 1 COIN") && (await text(guest)).includes("You hold 20 coins."));
await click('[data-act="clueBuy"]'); await sleep(800);
t = await text(guest);
const mine = await call("GET", "/api/night", null, seat(0));
ok("buying shows the second clue and takes the coin", t.includes(mine.bought) && t.includes("You hold 19 coins.") && mine.bought !== mine.clue);
await back();
ok("the player stands in the shop", (await guest.$eval("#top-room", (el) => el.textContent)) === "The shop" && (await guest.$eval("#top-coins", (el) => el.textContent)) === "19 coins");
ok("then back through the hall to the arena", (await walk("hall", "The hall")) && (await walk("arena", "The arena")));
ok("the arena offers tonight's match", (await guest.$eval("#hud-action", (el) => !el.hidden && el.textContent)) === "Play tonight's match");
await click("#hud-action"); await sleep(1500);
ok("the arena opens on the vaults, with both clues above them", (await guest.$$('[data-act="vaultPick"]')).length === 6 && (await guest.$$(".clue")).length === 2 && await guest.$eval('[data-act="vaultSeal"]', (b) => b.disabled));
await click('[data-act="vaultPick"][data-v="1"]'); await click('[data-act="vaultPick"][data-v="4"]');
ok("two vaults chosen: the button names them", (await guest.$eval('[data-act="vaultSeal"]', (b) => !b.disabled && b.textContent)) === "Open Vault 1 and Vault 4" && (await guest.$$(".vault.on")).length === 2);
await click('[data-act="vaultPick"][data-v="2"]');
ok("a third choice replaces the first", (await guest.$eval('[data-act="vaultSeal"]', (b) => b.textContent)) === "Open Vault 2 and Vault 4");
const before = await guest.$eval('[data-act="throwCycle"][data-i="0"] b', (el) => el.textContent);
await click('[data-act="throwCycle"][data-i="0"]');
ok("a throw changes when tapped", (await guest.$eval('[data-act="throwCycle"][data-i="0"] b', (el) => el.textContent)) !== before && (await guest.$$('[data-act="throwCycle"]')).length === 5);
await guest.$eval('[data-act="vaultSeal"]', (el) => el.scrollIntoView()); await sleep(300);
await guest.screenshot({ path: SHOTS + "/nr-open.png" });
await click('[data-act="vaultSeal"]');
ok("it asks before opening, and says it is final", (await text(guest)).includes("OPEN THEM?") && (await text(guest)).includes("It is final."));
await click('[data-act="vaultSealYes"]'); await sleep(800);
t = await text(guest);
ok("the vaults are sealed and nothing inside is shown", t.includes("SEALED") && t.includes("VAULT 2 AND VAULT 4") && !/10 gold\b/i.test(t.replace("10, 5 and 2 gold", "").replace(mine.clue, "").replace(mine.bought, "")) && (await guest.$('[data-act="vaultPick"]')) === null);
await back();
ok("the arena's set is six vaults, and the clock says to wait", (await guest.$eval("#top-room", (el) => el.textContent)) === "The arena" && (await guest.$eval("#world .map-art", (el) => el.querySelectorAll("circle").length >= 18)));
await guest.screenshot({ path: SHOTS + "/nr-arena.png" });

// the others: one takes the two best, one ties with nothing and loses the throw
await call("POST", "/api/night/open", { vaults: [2, 3], throws: [..."rpsrp"] }, seat(1));
await call("POST", "/api/night/open", { vaults: [2, 5], throws: [..."rpsrp"] }, seat(2));
await call("POST", "/api/night/open", { vaults: [3, 5], throws: [..."rpsrp"] }, seat(3));
await call("POST", "/api/night/open", { vaults: [1, 6], throws: [..."rrrrr"] }, seat(4));
await call("POST", "/api/night/open", { vaults: [4, 6], throws: [..."ppppp"] }, seat(5));
await hostPage.reload({ waitUntil: "networkidle0" }); await sleep(1500);
ok("the host sees who opened what, and their gold", (await hostPage.$eval("#night-box", (el) => el.innerText)).includes("6 of 6 players have opened"));
await hostPage.screenshot({ path: SHOTS + "/nr-host-open.png", fullPage: true });
await hostPage.click('[data-night="end"]'); await sleep(1800);
t = await hostPage.$eval("#night-box", (el) => el.innerText);
ok("the host closes the vaults and is told who is out", t.includes("Night 1 is over.") && t.includes("Player " + numbers[4]) && t.includes("is out."));
await hostPage.screenshot({ path: SHOTS + "/nr-host-done.png", fullPage: true });

await sleep(13000);
ok("the guest is taken to the result without a reload", (await text(guest)).includes("Night 1 is over.") && (await guest.$('[data-act="vNext"]')) !== null);
await click('[data-act="vNext"]'); await sleep(1200);
t = await text(guest);
ok("the six vaults are shown, with this player's two marked", (await guest.$$(".vault.open")).length === 6 && (await guest.$$(".vault.open.on")).length === 2 && t.includes("YOU: 10 GOLD"));
await click('[data-act="vNext"]'); await sleep(1500);
t = await text(guest);
ok("then the gold and the prizes", (await guest.$$(".tier")).length === 5 && t.includes("+5 COINS") && t.includes("You win 1 coin."));
await click('[data-act="vNext"]'); await sleep(2500);
t = await text(guest);
ok("then who is out, with the throws", t.includes("PLAYER " + numbers[4] + " IS OUT") && t.includes("tied for last on 0 gold") && (await guest.$$(".round")).length === 2);
await guest.screenshot({ path: SHOTS + "/nr-out.png" });
await click('[data-act="vDone"]'); await sleep(2000);
ok("and back to the hall, with the prize counted and the clock moved on", (await guest.$eval("#top-coins", (el) => el.textContent)) === "20 coins" && (await guest.$eval("#now-a", (el) => el.textContent)) === "The bags are open");
await guest.reload({ waitUntil: "networkidle0" }); await sleep(1500);
ok("the result is not shown twice", (await guest.$("#vr")) === null && (await guest.$$(".actor")).length >= 1);

// the player who is out
const outCtx = await browser.createBrowserContext();
const gone = await outCtx.newPage();
watch(gone, "out");
await gone.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
await gone.goto(BASE + "/i/" + tokens[4] + "?notype=1", { waitUntil: "networkidle0" }); await sleep(2500);
await gone.$eval('[data-act="vNext"]', (el) => el.click()); await sleep(600); await gone.$eval('[data-act="vNext"]', (el) => el.click()); await sleep(600); await gone.$eval('[data-act="vNext"]', (el) => el.click()); await sleep(1200);
ok("the player who lost is told plainly", (await text(gone)).includes("YOU ARE OUT"));
await gone.screenshot({ path: SHOTS + "/nr-you-out.png" });
await gone.$eval('[data-act="vDone"]', (el) => el.click()); await sleep(2000);
ok("and can still walk the hall, with the clock saying so", (await gone.$eval("#now-do", (el) => el.textContent)).includes("You are out of the game."));
console.log(problems.length ? "\nPROBLEMS:\n" + problems.join("\n") : "\nNO PROBLEMS");
await browser.close();
process.exit(problems.length ? 1 : 0);
