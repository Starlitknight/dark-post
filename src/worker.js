// Dark Post: game server.
// One Durable Object holds the whole season: invitations, player numbers,
// sealed bag choices, the opening-night reveal and the host's settings.

import { DurableObject } from "cloudflare:workers";

import { makePuzzle, sameAnswer, seedOf } from "./puzzles.js";
import "../public/ladder.js";
import * as TREASURY from "./treasury.js";
import { GOLD, RULES, clueText, dealClues, spareClue, shopClue, validThrows, settle } from "./vaults.js";

const SEATS = 16;
const BAG1_COINS = 5;
const BAG2_POT = 40;
const SEAT_COOKIE = "dp_seat";
const HOST_COOKIE = "dp_host";
const COOKIE_AGE = 60 * 60 * 24 * 120;
const MAX_LOGIN_FAILS = 5;
const RESIGNED = -1; // in the "out" column: gave up their place before playing, and watches
const WORD_LENGTH = 5;
const WORD_MAX_FAILS = 5; // wrong words from one address before that address waits
const WORD_WRONG_PER_HOUR = 40; // wrong words from everywhere before the door shuts for the hour
const WORD_AVOID = ["ASS", "FUC", "FUK", "SHI", "CUN", "DIC", "COC", "FAG", "NIG", "SEX", "TIT", "PIS", "CUM", "KKK", "NAZ", "RAP", "SLU", "WHO", "DAM", "HEL"];
const LOCK_MS = 15 * 60 * 1000;
// The same rules are in public/_headers for the files Cloudflare serves without the Worker.
const SECURITY_HEADERS = {
  "Content-Security-Policy": "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self' wss:; frame-ancestors 'none'; base-uri 'none'; form-action 'none'",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "no-referrer",
};
const MESSAGE_MAX = 600;
const MESSAGE_GAP_MS = 700;
const AVATAR_LIMITS = { s: 6, h: 24, c: 9, g: 4, b: 5, m: 4, o: 9, t: 4, x: 9, e: 2, f: 2 };
const WORLD_ROOMS = ["hall", "arena", "puzzle", "betting", "studio", "sky", "dungeon", "gallery", "shop"];
// The three cells in the dungeon, as rectangles of its floor. public/world.js draws the same ones.
const CELLS = [[90, 162, 470, 462], [560, 162, 940, 462], [1030, 162, 1410, 462]];
const DAY_MS = 24 * 60 * 60 * 1000;
const LADDER = globalThis.LADDER;
// A bet on your own score in The Ladder: what one coin pays when placed in stage 1, 2, 3 and 4, and the most a player may stake.
const BET_PAYS = [5, 4, 3, 2];
const BET_MAX = 3;
// A coin on someone else's duel: the stake, what a right pick returns, and how many such bets a player may place in a stage.
const DUEL_BET = { stake: 1, pays: 2, perStage: 3 };
// The treasury: what every seated player is paid when it opens, and how many times one player may try the passcode.
const TREASURY_PAY = 5;
const TREASURY_TRIES = 3;
const GAME_DAY_STARTS_UTC_MS = 5 * 60 * 60 * 1000; // midnight EST is 05:00 UTC
const PUZZLE_TRIES = 3;
const PUZZLE_REWARD = 1;
// A deal: each player stakes this many coins and seals Cooperate (c) or Betray (b).
// The table gives what each one gains or loses, first player then second.
const DEAL_STAKE = 2;
const DEAL_PAY = { cc: [1, 1], cb: [-2, 2], bc: [2, -2], bb: [-1, -1] };
const WORLD_MAX = 2000;
const GM = 0; // the Gamemaster's number in messages
const NEXT_NAME = "The first game"; // what the clock calls the round after the bags, until the GM names it

const DEFAULT_LETTER = {
  kicker: "Dark Post",
  headline: "You have been chosen.",
  body: [
    "Your name appears in the will of A. Crane, along with fifteen others. He left the line for his heir blank. Whoever passes his test will inherit his entire estate, valued at $100 million.",
    "I will send a car for you at dusk. If you accept, get in.",
    "Bring nothing. Tell no one.",
  ].join("\n\n"),
  closing: "Doors open {opens}. Reply by {reply}.",
  signature: "—GM",
};

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // Personal links were how players came in at first. Now there is one address for everyone and each
    // player types their own word, so an old link only leads to the front page.
    if (url.pathname.startsWith("/i/")) {
      return new Response(null, { status: 302, headers: { Location: new URL("/", url).toString(), "Cache-Control": "no-store", ...SECURITY_HEADERS } });
    }

    if (url.pathname.startsWith("/api/")) {
      const stub = env.GAME.get(env.GAME.idFromName("season-1"));
      return stub.fetch(request);
    }

    return env.ASSETS.fetch(request);
  },
};

export class Game extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.sql = ctx.storage.sql;
    this.sql.exec(`CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT)`);
    this.sql.exec(`CREATE TABLE IF NOT EXISTS invites (
      token TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      note TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'invited',
      number INTEGER,
      bag INTEGER,
      coins INTEGER,
      created_at INTEGER,
      opened_at INTEGER,
      responded_at INTEGER,
      entered_at INTEGER,
      sealed_at INTEGER,
      seen_reveal INTEGER NOT NULL DEFAULT 0
    )`);
    this.sql.exec(`CREATE TABLE IF NOT EXISTS host_sessions (id TEXT PRIMARY KEY, created_at INTEGER)`);
    // Added after the first release: a portrait for each player, and the rooms' messages.
    const columns = this.sql.exec(`PRAGMA table_info(invites)`).toArray().map((c) => c.name);
    if (!columns.includes("avatar")) this.sql.exec(`ALTER TABLE invites ADD COLUMN avatar TEXT`);
    this.sql.exec(`CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      room TEXT NOT NULL,
      from_n INTEGER NOT NULL,
      to_n INTEGER,
      parent INTEGER,
      body TEXT NOT NULL,
      at INTEGER NOT NULL,
      removed INTEGER NOT NULL DEFAULT 0
    )`);
    this.sql.exec(`CREATE INDEX IF NOT EXISTS messages_room ON messages (room, id)`);
    this.sql.exec(`CREATE TABLE IF NOT EXISTS reads (
      who TEXT NOT NULL,
      key TEXT NOT NULL,
      last_id INTEGER NOT NULL,
      PRIMARY KEY (who, key)
    )`);
    this.sql.exec(`CREATE TABLE IF NOT EXISTS places (number INTEGER PRIMARY KEY, room TEXT NOT NULL, x REAL NOT NULL, y REAL NOT NULL, at INTEGER NOT NULL)`);
    // Coins won or lost after the bags (puzzles, deals), kept apart from the bag's own payout.
    if (!columns.includes("extra")) this.sql.exec(`ALTER TABLE invites ADD COLUMN extra INTEGER NOT NULL DEFAULT 0`);
    // Who was standing in the cell when a thing was said there. Only they may read it.
    const messageColumns = this.sql.exec(`PRAGMA table_info(messages)`).toArray().map((c) => c.name);
    if (!messageColumns.includes("heard")) this.sql.exec(`ALTER TABLE messages ADD COLUMN heard TEXT`);
    this.sql.exec(`CREATE TABLE IF NOT EXISTS puzzle_tries (number INTEGER NOT NULL, day INTEGER NOT NULL, tries INTEGER NOT NULL DEFAULT 0, solved INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (number, day))`);
    // News every player is told about, shown behind the bell. So far: a player solved the day's puzzle.
    this.sql.exec(`CREATE TABLE IF NOT EXISTS notices (id INTEGER PRIMARY KEY AUTOINCREMENT, kind TEXT NOT NULL, n INTEGER NOT NULL, day INTEGER NOT NULL, at INTEGER NOT NULL)`);
    // The puzzle can be held: it then stays the same until the GM releases it, instead of changing at midnight.
    // Decided once, the first time this code runs. A game that already has players starts held, because the GM
    // asked on 24 Nov 2026 that the puzzle in play stays until he says so. A new game starts with the daily change.
    if (this.get("puzzle_hold", "") === "") {
      const playing = this.sql.exec(`SELECT COUNT(*) AS n FROM invites WHERE status = 'accepted'`).one().n > 0;
      if (playing) this.set("puzzle_held_day", String(this.today()));
      this.set("puzzle_hold", playing ? "1" : "0");
    }
    // Decided once, 25 Nov 2026: the second puzzle (three sums) was replaced by the six keys while it was in
    // play and before anyone had solved it. Tries spent on the old one are handed back, so everyone starts
    // the new one with three. A player who had already solved it keeps that.
    if (this.get("puzzle_keys_swap", "") === "") {
      this.sql.exec(`DELETE FROM puzzle_tries WHERE day = ? AND solved = 0`, this.puzzleDay());
      this.set("puzzle_keys_swap", "1");
    }
    this.sql.exec(`CREATE TABLE IF NOT EXISTS deals (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      day INTEGER NOT NULL,
      a INTEGER NOT NULL,
      b INTEGER NOT NULL,
      a_choice TEXT NOT NULL,
      b_choice TEXT,
      a_net INTEGER,
      b_net INTEGER,
      status TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      settled_at INTEGER
    )`);
    this.sql.exec(`CREATE TABLE IF NOT EXISTS doorlog (id INTEGER PRIMARY KEY AUTOINCREMENT, number INTEGER NOT NULL, cell INTEGER NOT NULL, at INTEGER NOT NULL)`);
    // Night 1 and after: who is out, and what each player holds and did on the night being played.
    if (!columns.includes("out")) this.sql.exec(`ALTER TABLE invites ADD COLUMN out INTEGER NOT NULL DEFAULT 0`);
    // One address for everyone: each player signs in with a word of five letters instead of a personal link.
    if (!columns.includes("code")) this.sql.exec(`ALTER TABLE invites ADD COLUMN code TEXT`);
    // After the tour each player is asked once: play for the whole week, or give up the place and watch.
    if (!columns.includes("committed")) this.sql.exec(`ALTER TABLE invites ADD COLUMN committed INTEGER NOT NULL DEFAULT 0`);
    for (const row of this.sql.exec(`SELECT token FROM invites WHERE code IS NULL OR code = ''`).toArray()) {
      this.sql.exec(`UPDATE invites SET code = ? WHERE token = ?`, this.newWord(), row.token);
    }
    this.sql.exec(`CREATE TABLE IF NOT EXISTS night_plays (
      number INTEGER PRIMARY KEY,
      clue INTEGER NOT NULL,
      bought INTEGER,
      a INTEGER,
      b INTEGER,
      throws TEXT,
      opened_at INTEGER,
      seen INTEGER NOT NULL DEFAULT 0
    )`);
    // The Ladder: what each player has sealed for a stage, and what they have been shown.
    this.sql.exec(`CREATE TABLE IF NOT EXISTS ladder_seals (number INTEGER NOT NULL, stage INTEGER NOT NULL, plays TEXT NOT NULL, at INTEGER NOT NULL, PRIMARY KEY (number, stage))`);
    // a piece of news can name a second player: the two who have dueled, or the one being waited on
    try { this.sql.exec(`ALTER TABLE notices ADD COLUMN m INTEGER NOT NULL DEFAULT 0`); } catch (e) {}
    // The treasury: which characters of the passcode a player has earned, their unfinished grids, and their tries at the door.
    this.sql.exec(`CREATE TABLE IF NOT EXISTS treasury_known (number INTEGER NOT NULL, slot INTEGER NOT NULL, at INTEGER NOT NULL, PRIMARY KEY (number, slot))`);
    this.sql.exec(`CREATE TABLE IF NOT EXISTS treasury_work (number INTEGER NOT NULL, slot INTEGER NOT NULL, cells TEXT NOT NULL, at INTEGER NOT NULL, PRIMARY KEY (number, slot))`);
    this.sql.exec(`CREATE TABLE IF NOT EXISTS treasury_tries (id INTEGER PRIMARY KEY AUTOINCREMENT, number INTEGER NOT NULL, guess TEXT NOT NULL, at INTEGER NOT NULL)`);
    // A coin on a duel between two other players. status: open, won, lost, level.
    this.sql.exec(`CREATE TABLE IF NOT EXISTS duel_bets (id INTEGER PRIMARY KEY AUTOINCREMENT, number INTEGER NOT NULL, stage INTEGER NOT NULL, a INTEGER NOT NULL, b INTEGER NOT NULL, pick INTEGER NOT NULL, stake INTEGER NOT NULL, status TEXT NOT NULL DEFAULT 'open', paid INTEGER NOT NULL DEFAULT 0, at INTEGER NOT NULL)`);
    // A player's one bet on their own final score in The Ladder.
    this.sql.exec(`CREATE TABLE IF NOT EXISTS ladder_bets (number INTEGER PRIMARY KEY, score INTEGER NOT NULL, stake INTEGER NOT NULL, stage INTEGER NOT NULL, mult INTEGER NOT NULL, paid INTEGER NOT NULL DEFAULT 0, at INTEGER NOT NULL)`);
    this.sql.exec(`CREATE TABLE IF NOT EXISTS ladder_players (number INTEGER PRIMARY KEY, seen_stage INTEGER NOT NULL DEFAULT 0, seen INTEGER NOT NULL DEFAULT 0)`);
    // Decided once, 25 Nov 2026: stage 1 of the first game of The Ladder, started with no closing time,
    // closes at 9 PM Eastern that evening. The GM can change or remove the time from the console.
    if (this.get("stage1_close_9pm", "") === "") {
      this.set("stage1_close_9pm", "1");
      const night = this.night();
      const at = Date.parse("2026-11-26T02:00:00.000Z");
      if (night && night.game === "ladder" && night.status === "open" && night.stage === 1 && !night.endsAt && Date.now() < at) {
        this.set("night", JSON.stringify({ ...night, endsAt: new Date(at).toISOString() }));
        ctx.storage.setAlarm(at + 2000);
      }
    }
    this.ctx = ctx;
    this.lastPost = new Map();
  }

  // Woken at a stage's closing time, so it closes on time even when nobody has the game open.
  async alarm() {
    this.maybeEndNight();
  }

  // ---------- small helpers ----------

  get(key, fallback = null) {
    const rows = this.sql.exec(`SELECT value FROM settings WHERE key = ?`, key).toArray();
    return rows.length ? rows[0].value : fallback;
  }

  set(key, value) {
    this.sql.exec(
      `INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
      key,
      String(value),
    );
  }

  letter() {
    const saved = this.get("letter");
    if (!saved) return { ...DEFAULT_LETTER };
    try {
      return { ...DEFAULT_LETTER, ...JSON.parse(saved) };
    } catch {
      return { ...DEFAULT_LETTER };
    }
  }

  phase() {
    return this.get("phase", "open");
  }

  showChoices() {
    return this.get("show_choices", "1") === "1";
  }

  // Five random letters. Not a dictionary word: sixteen real words can be guessed, sixteen of these cannot.
  newWord() {
    for (;;) {
      let word = "";
      for (let i = 0; i < WORD_LENGTH; i++) word += "ABCDEFGHIJKLMNOPQRSTUVWXYZ"[randomInt(26)];
      if (WORD_AVOID.some((bad) => word.includes(bad))) continue;
      if (!this.sql.exec(`SELECT 1 FROM invites WHERE code = ?`, word).toArray().length) return word;
    }
  }

  // Asked once, on first reaching the hall: play for the week, or resign the place and watch.
  async commit(request) {
    const inv = this.inHall(request);
    if (!inv) return json({ error: "You are not in the hall yet." }, 403);
    if (inv.committed || inv.out) return json({ error: "You have already answered." }, 409);
    const body = await readJson(request);
    if (body.play !== true && body.play !== false) return json({ error: "Choose to play or to resign." }, 400);
    this.sql.exec(`UPDATE invites SET committed = 1, out = ? WHERE token = ?`, body.play ? 0 : RESIGNED, inv.token);
    this.broadcast({ t: "news" });
    return json({ ok: true, playing: body.play });
  }

  // A player types their word on the front page. A right word puts their seat on this device.
  async claim(request, url) {
    const body = await readJson(request);
    const word = String(body.word || "").toUpperCase().replace(/[^A-Z]/g, "");
    const who = (request.headers.get("CF-Connecting-IP") || "local").replace(/[^0-9A-Fa-f:.]/g, "").slice(0, 45) || "local";
    const failsKey = "word_fails:" + who, lockKey = "word_locked_until:" + who;
    const hourKey = "word_wrong:" + Math.floor(Date.now() / 3600000);
    if (Date.now() < Number(this.get(lockKey, "0"))) return json({ error: "Too many wrong words. Wait fifteen minutes and try again." }, 429);
    // Guessing from many addresses at once: stop taking words for the rest of the hour.
    if (Number(this.get(hourKey, "0")) >= WORD_WRONG_PER_HOUR) return json({ error: "The door is shut for a little while. Try again within the hour." }, 429);
    const rows = word.length === WORD_LENGTH ? this.sql.exec(`SELECT token FROM invites WHERE code = ?`, word).toArray() : [];
    if (!rows.length) {
      const fails = Number(this.get(failsKey, "0")) + 1;
      this.set(hourKey, Number(this.get(hourKey, "0")) + 1);
      if (fails >= WORD_MAX_FAILS) {
        this.set(failsKey, 0);
        this.set(lockKey, Date.now() + LOCK_MS);
      } else {
        this.set(failsKey, fails);
      }
      return json({ error: "That is not a word I gave anyone." }, 401);
    }
    this.set(failsKey, 0);
    return json({ ok: true }, 200, { "Set-Cookie": cookie(SEAT_COOKIE, rows[0].token, COOKIE_AGE, url) });
  }

  seat(request) {
    const token =
      cleanToken(request.headers.get("X-Seat") || "") ||
      cleanToken(new URL(request.url).searchParams.get("s") || "") ||
      cleanToken(readCookie(request, SEAT_COOKIE));
    if (!token) return null;
    const rows = this.sql.exec(`SELECT * FROM invites WHERE token = ?`, token).toArray();
    return rows.length ? rows[0] : null;
  }

  inviteByToken(token) {
    const rows = this.sql.exec(`SELECT * FROM invites WHERE token = ?`, cleanToken(token)).toArray();
    return rows.length ? rows[0] : null;
  }

  acceptedCount() {
    return this.sql.exec(`SELECT COUNT(*) AS n FROM invites WHERE status = 'accepted'`).one().n;
  }

  hostAuthed(request) {
    const id = readCookie(request, HOST_COOKIE);
    if (!id) return false;
    return this.sql.exec(`SELECT id FROM host_sessions WHERE id = ?`, id).toArray().length > 0;
  }

  // If the host asked for it, the bags open by themselves at the opening time.
  maybeAutoReveal() {
    if (this.phase() !== "open" || this.get("auto_open", "0") !== "1") return;
    const at = Date.parse(this.get("opens_at", "") || "");
    if (!Number.isNaN(at) && Date.now() >= at) this.doReveal();
  }

  // ---------- routing ----------

  async fetch(request) {
    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method;
    try {
      // Take the whole body in now, so a route that ignores it leaves nothing unread behind.
      if (method === "POST") {
        const text = await request.text();
        request = new Request(request.url, { method, headers: request.headers, body: text });
      }
      this.maybeAutoReveal();
      this.maybeEndNight();

      if (path === "/api/me" && method === "GET") return this.me(request);
      if (path === "/api/respond" && method === "POST") return this.respond(request);
      if (path === "/api/enter" && method === "POST") return this.enter(request);
      if (path === "/api/seal" && method === "POST") return this.seal(request);
      if (path === "/api/seen" && method === "POST") return this.seen(request);
      if (path === "/api/avatar" && method === "POST") return this.saveAvatar(request);
      if (path === "/api/hall" && method === "GET") return this.hall(request);
      if (path === "/api/live") return this.live(request);
      if (path === "/api/move" && method === "POST") return this.move(request);
      if (path === "/api/messages" && method === "GET") return this.readMessages(request, url);
      if (path === "/api/messages" && method === "POST") return this.postMessage(request);
      if (path === "/api/puzzle" && method === "GET") return this.puzzle(request);
      if (path === "/api/puzzle" && method === "POST") return this.puzzleAnswer(request);
      if (path === "/api/notices/seen" && method === "POST") return this.noticesSeen(request);
      if (path === "/api/deals" && method === "GET") return this.deals(request);
      if (path === "/api/deal" && method === "POST") return this.dealOffer(request);
      if (path === "/api/deal/answer" && method === "POST") return this.dealAnswer(request);
      if (path === "/api/doorlog" && method === "GET") return this.doorLog(request);
      if (path === "/api/night" && method === "GET") return this.nightGet(request);
      if (path === "/api/night/buy" && method === "POST") return this.nightBuy(request);
      if (path === "/api/night/open" && method === "POST") return this.nightOpen(request);
      if (path === "/api/night/seen" && method === "POST") return this.nightSeen(request);
      if (path === "/api/night/seal" && method === "POST") return this.ladderSeal(request);
      if (path === "/api/bet" && method === "GET") return this.betGet(request);
      if (path === "/api/bet" && method === "POST") return this.betPlace(request);
      if (path === "/api/bet/duel" && method === "POST") return this.duelBetPlace(request);
      if (path === "/api/treasury" && method === "GET") return this.treasuryGet(request);
      if (path === "/api/treasury/puzzle" && method === "GET") return this.treasuryPuzzle(request, url);
      if (path === "/api/treasury/work" && method === "POST") return this.treasuryWork(request);
      if (path === "/api/treasury/solve" && method === "POST") return this.treasurySolve(request);
      if (path === "/api/treasury/help" && method === "POST") return this.treasuryHelp(request);
      if (path === "/api/treasury/open" && method === "POST") return this.treasuryOpen(request);
      if (path === "/api/night/stage-seen" && method === "POST") return this.ladderStageSeen(request);

      if (path === "/api/claim" && method === "POST") return this.claim(request, url);
      if (path === "/api/commit" && method === "POST") return this.commit(request);
      if (path === "/api/host/login" && method === "POST") return this.hostLogin(request, url);
      if (path === "/api/host/logout" && method === "POST") return this.hostLogout(request, url);
      if (path === "/api/host/state" && method === "GET") return this.hostState(request);
      if (path.startsWith("/api/host/")) {
        if (!this.hostAuthed(request)) return json({ error: "Sign in as host first." }, 401);
        if (path === "/api/host/invites" && method === "POST") return this.hostCreateInvites(request);
        if (path === "/api/host/invite/update" && method === "POST") return this.hostUpdateInvite(request);
        if (path === "/api/host/invite/delete" && method === "POST") return this.hostDeleteInvite(request);
        if (path === "/api/host/invite/reset" && method === "POST") return this.hostResetInvite(request);
        if (path === "/api/host/invite/reword" && method === "POST") return this.hostRewordInvite(request);
        if (path === "/api/host/settings" && method === "POST") return this.hostSettings(request);
        if (path === "/api/host/reveal" && method === "POST") return this.hostReveal();
        if (path === "/api/host/unreveal" && method === "POST") return this.hostUnreveal();
        if (path === "/api/host/messages" && method === "GET") return this.hostReadMessages(url);
        if (path === "/api/host/messages" && method === "POST") return this.hostPostMessage(request);
        if (path === "/api/host/message/remove" && method === "POST") return this.hostRemoveMessage(request);
        if (path === "/api/host/activity" && method === "GET") return this.hostActivity();
        if (path === "/api/host/puzzle" && method === "POST") return this.hostPuzzle(request);
        if (path === "/api/host/coins" && method === "POST") return this.hostCoins(request);
        if (path === "/api/host/night/start" && method === "POST") return this.hostNightStart(request);
        if (path === "/api/host/night/end" && method === "POST") return this.hostNightEnd();
        if (path === "/api/host/night/stage" && method === "POST") return this.hostLadderStage();
        if (path === "/api/host/night/ends" && method === "POST") return this.hostLadderEnds(request);
        if (path === "/api/host/gm" && method === "GET") return json(this.hostGmView());
        if (path === "/api/host/gm" && method === "POST") return this.hostGmMove(request);
        if (path === "/api/host/gm/say" && method === "POST") return this.hostGmSay(request);
        if (path === "/api/host/treasury" && method === "POST") return this.hostTreasury(request);
        if (path === "/api/host/night/reset" && method === "POST") return this.hostNightReset();
        if (path === "/api/host/out" && method === "POST") return this.hostOut(request);
      }
      return json({ error: "Not found." }, 404);
    } catch (err) {
      return json({ error: "Something went wrong on the server.", detail: String(err && err.message) }, 500);
    }
  }

  // ---------- guest ----------

  me(request) {
    const inv = this.seat(request);
    if (!inv) return json({ state: "none" });

    if (!inv.opened_at) {
      this.sql.exec(`UPDATE invites SET opened_at = ? WHERE token = ?`, Date.now(), inv.token);
    }

    const phase = this.phase();
    let state;
    if (inv.status === "accepted") {
      state = this.playerState(inv, phase);
    } else if (phase === "revealed") {
      state = "closed";
    } else if (inv.status === "declined") {
      state = "declined";
    } else if (this.acceptedCount() >= SEATS) {
      state = "full";
    } else {
      state = "letter";
    }

    const out = {
      state,
      phase,
      name: inv.name,
      number: inv.number,
      bag: inv.bag,
      coins: inv.coins,
      extra: inv.extra || 0,
      out: inv.out || 0,
      avatar: parseAvatar(inv.avatar),
      seats: SEATS,
      bag1Coins: BAG1_COINS,
      bag2Pot: BAG2_POT,
      opensAt: this.get("opens_at", ""),
      replyBy: this.get("reply_by", ""),
      letter: this.letter(),
    };
    if (inv.status === "accepted" && phase === "revealed") out.reveal = this.publicReveal();
    return json(out);
  }

  // Where an accepted player stands: door, bags, portrait, reveal, then the hall.
  playerState(inv, phase) {
    if (!inv.entered_at) return "number";
    if (phase !== "revealed" && inv.bag == null) return "choose";
    if (!inv.avatar) return "avatar";
    if (phase === "revealed" && !inv.seen_reveal) return "reveal";
    return "hall";
  }

  // A player who may walk the hall and use its rooms.
  inHall(request) {
    const inv = this.seat(request);
    if (!inv || inv.status !== "accepted" || !inv.avatar || !inv.entered_at) return null;
    if (this.phase() !== "revealed" && inv.bag == null) return null;
    return inv;
  }

  // What players are allowed to see once the bags are open.
  publicReveal() {
    const full = JSON.parse(this.get("reveal", "null"));
    if (!full) return null;
    const out = {
      at: full.at,
      pot: full.pot,
      bag1Coins: full.bag1Coins,
      bag1Count: full.bag1Count,
      bag2Count: full.bag2Count,
      bag2Share: full.bag2Share,
      leftover: full.leftover,
      unsealedCount: full.unsealed.length,
      showChoices: this.showChoices(),
    };
    if (out.showChoices) {
      out.order = full.order;
      out.unsealed = full.unsealed;
      out.results = full.results;
    }
    return out;
  }

  async respond(request) {
    const inv = this.seat(request);
    if (!inv) return json({ error: "This invitation was not recognised." }, 403);
    const body = await readJson(request);
    if (this.phase() === "revealed") return json({ error: "The game has already begun." }, 409);

    if (body.accept === false) {
      if (inv.status === "accepted") return json({ error: "You have already entered." }, 409);
      this.sql.exec(
        `UPDATE invites SET status = 'declined', responded_at = ? WHERE token = ?`,
        Date.now(),
        inv.token,
      );
      return json({ ok: true });
    }

    if (inv.status === "accepted") return json({ ok: true, number: inv.number });
    if (this.acceptedCount() >= SEATS) return json({ error: "Every seat has been taken." }, 409);

    // Draw a number at random from the ones nobody holds yet.
    const used = new Set(
      this.sql.exec(`SELECT number FROM invites WHERE number IS NOT NULL`).toArray().map((r) => r.number),
    );
    const free = [];
    for (let n = 1; n <= SEATS; n++) if (!used.has(n)) free.push(n);
    const number = free[randomInt(free.length)];
    this.sql.exec(
      `UPDATE invites SET status = 'accepted', number = ?, responded_at = ? WHERE token = ?`,
      number,
      Date.now(),
      inv.token,
    );
    return json({ ok: true, number });
  }

  enter(request) {
    const inv = this.seat(request);
    if (!inv || inv.status !== "accepted") return json({ error: "Accept the invitation first." }, 403);
    if (!inv.entered_at) {
      this.sql.exec(`UPDATE invites SET entered_at = ? WHERE token = ?`, Date.now(), inv.token);
    }
    return json({ ok: true });
  }

  async seal(request) {
    const inv = this.seat(request);
    if (!inv || inv.status !== "accepted") return json({ error: "Accept the invitation first." }, 403);
    if (this.phase() === "revealed") return json({ error: "The bags are already open." }, 409);
    if (inv.bag != null) return json({ error: "Your choice is already sealed." }, 409);
    const body = await readJson(request);
    const bag = Number(body.bag);
    if (bag !== 1 && bag !== 2) return json({ error: "Choose Bag 1 or Bag 2." }, 400);
    const now = Date.now();
    this.sql.exec(
      `UPDATE invites SET bag = ?, sealed_at = ?, entered_at = COALESCE(entered_at, ?) WHERE token = ?`,
      bag,
      now,
      now,
      inv.token,
    );
    return json({ ok: true });
  }

  seen(request) {
    const inv = this.seat(request);
    if (!inv) return json({ error: "This invitation was not recognised." }, 403);
    if (this.phase() === "revealed") {
      this.sql.exec(`UPDATE invites SET seen_reveal = 1 WHERE token = ?`, inv.token);
    }
    return json({ ok: true });
  }

  async saveAvatar(request) {
    const inv = this.seat(request);
    if (!inv || inv.status !== "accepted") return json({ error: "Accept the invitation first." }, 403);
    const phase = this.phase();
    if (phase !== "revealed" && inv.bag == null) return json({ error: "Take a bag first." }, 409);
    if (phase === "revealed" && inv.avatar) return json({ error: "Faces are fixed once the bags are open." }, 409);
    const body = await readJson(request);
    const avatar = cleanAvatar(body.avatar);
    if (!avatar) return json({ error: "That face could not be read." }, 400);
    this.sql.exec(`UPDATE invites SET avatar = ? WHERE token = ?`, JSON.stringify(avatar), inv.token);
    this.broadcast({ t: "news" });
    return json({ ok: true });
  }

  hall(request) {
    const inv = this.inHall(request);
    if (!inv) return json({ error: "You are not in the hall yet." }, 403);
    const phase = this.phase();
    const reveal = phase === "revealed" ? this.publicReveal() : null;
    const showCoins = !!(reveal && reveal.showChoices);
    this.expireDeals();
    const players = this.sql
      .exec(`SELECT number, avatar, coins, extra, sealed_at, out FROM invites WHERE status = 'accepted' AND avatar IS NOT NULL`)
      .toArray();
    const byNumber = new Map(players.map((p) => [p.number, p]));
    const tally = (query) => new Map(this.sql.exec(query).toArray().map((r) => [r.n, r.c]));
    const solved = tally(`SELECT number AS n, COUNT(*) AS c FROM puzzle_tries WHERE solved = 1 GROUP BY number`);
    const dealsA = tally(`SELECT a AS n, COUNT(*) AS c FROM deals WHERE status = 'done' GROUP BY a`);
    const dealsB = tally(`SELECT b AS n, COUNT(*) AS c FROM deals WHERE status = 'done' GROUP BY b`);
    const lastSeen = tally(`SELECT number AS n, at AS c FROM places`);
    const seats = [];
    for (let n = 1; n <= SEATS; n++) {
      const p = byNumber.get(n);
      const seat = { number: n, avatar: p ? parseAvatar(p.avatar) : null };
      if (p) {
        // the card behind each portrait in the gallery
        seat.since = p.sealed_at;
        seat.seen = lastSeen.get(n) || p.sealed_at;
        seat.solved = solved.get(n) || 0;
        seat.deals = (dealsA.get(n) || 0) + (dealsB.get(n) || 0);
        if (p.out) seat.out = p.out;
        if ((showCoins || n === inv.number) && phase === "revealed") seat.coins = (p.coins || 0) + (p.extra || 0);
      }
      seats.push(seat);
    }
    const casts = this.sql.exec(`SELECT id, from_n, body, at FROM messages WHERE room = 'table' AND removed = 0 ORDER BY id DESC LIMIT 1`).toArray();

    const who = "p" + inv.number;
    const marks = new Map(
      this.sql.exec(`SELECT key, last_id FROM reads WHERE who = ?`, who).toArray().map((r) => [r.key, r.last_id]),
    );
    const mark = (key) => marks.get(key) || 0;
    const count = (query, ...args) => this.sql.exec(query, ...args).one().n;
    const unread = {
      table: count(`SELECT COUNT(*) AS n FROM messages WHERE room = 'table' AND id > ? AND from_n != ?`, mark("table"), inv.number),
      study: count(`SELECT COUNT(*) AS n FROM messages WHERE room = 'study' AND to_n = ? AND from_n = ? AND id > ?`, inv.number, GM, mark("study")),
      board: count(`SELECT COUNT(*) AS n FROM messages WHERE room = 'board' AND id > ? AND from_n != ?`, mark("board"), inv.number),
      whispers: 0,
      deals: count(`SELECT COUNT(*) AS n FROM deals WHERE status = 'open' AND b = ? AND day = ?`, inv.number, this.today()),
    };

    // One line per whisper thread: who it is with, the last words, and what is unread.
    const threads = new Map();
    const rows = this.sql
      .exec(`SELECT id, from_n, to_n, body, at, removed FROM messages WHERE room = 'whisper' AND (from_n = ? OR to_n = ?) ORDER BY id ASC`, inv.number, inv.number)
      .toArray();
    for (const m of rows) {
      const other = m.from_n === inv.number ? m.to_n : m.from_n;
      const t = threads.get(other) || { with: other, last: "", at: 0, unread: 0 };
      t.last = m.removed ? "" : m.body.slice(0, 80);
      t.at = m.at;
      if (m.from_n === other && m.id > mark("w:" + other)) t.unread += 1;
      threads.set(other, t);
    }
    const whispers = [...threads.values()].sort((a, b) => b.at - a.at);
    unread.whispers = whispers.reduce((sum, t) => sum + t.unread, 0);

    return json({
      you: inv.number,
      phase,
      opensAt: this.get("opens_at", ""),
      // true only when the bags will open by themselves at that time; the game shows a countdown only then
      autoOpen: this.get("auto_open", "0") === "1",
      nextAt: this.get("next_at", ""),
      nextName: this.get("next_name", NEXT_NAME),
      canEditFace: phase !== "revealed",
      needsCommit: !inv.committed && !inv.out,
      // rooms the GM has opened. The betting room stays shut until the GM opens it.
      bettingOpen: this.bettingOpen(),
      // while The Ladder is played the betting room takes bets on a player's own score, and nothing else
      bets: this.betsBrief(inv),
      treasury: this.treasuryBrief(inv),
      // behind the bell: news about the other players, newest first, and how far this player has read
      // what the GM has announced: the latest three and how many in all. They stay here after they are read.
      gm: {
        total: count(`SELECT COUNT(*) AS n FROM messages WHERE room = 'board' AND from_n = ? AND parent IS NULL AND removed = 0`, GM),
        notes: this.sql
          .exec(`SELECT id, body, at FROM messages WHERE room = 'board' AND from_n = ? AND parent IS NULL AND removed = 0 ORDER BY id DESC LIMIT 3`, GM)
          .toArray()
          .map((m) => ({ id: m.id, body: m.body.slice(0, 240), at: m.at, fresh: m.id > mark("board") })),
      },
      notices: this.noticesFor(inv),
      noticeMark: mark("notices"),
      // this player's own standing on today's puzzle, so the game can nudge only those who have not done it
      puzzle: this.puzzleStanding(inv),
      pos: this.positions(),
      online: this.onlineNumbers(),
      seats,
      unread,
      whispers,
      coins: this.balance(inv),
      banked: inv.extra || 0,
      lastCast: casts.length ? { id: casts[0].id, from: casts[0].from_n, body: casts[0].body.slice(0, 200), at: casts[0].at } : null,
      cell: this.cellOf(inv.number),
      // a player may change their character until the bags open
      canEditFace: this.phase() !== "revealed",
      out: inv.out || 0,
      night: this.nightBrief(inv),
    });
  }

  // The rows of one room or thread that this player may read.
  roomQuery(inv, room, withN) {
    if (room === "table") return { key: "table", where: `room = 'table'`, args: [] };
    if (room === "board") return { key: "board", where: `room = 'board'`, args: [] };
    if (room === "study") return { key: "study", where: `room = 'study' AND to_n = ?`, args: [inv.number] };
    if (room === "whisper") {
      if (!Number.isInteger(withN) || withN < 1 || withN > SEATS || withN === inv.number) return null;
      return {
        key: "w:" + withN,
        where: `room = 'whisper' AND ((from_n = ? AND to_n = ?) OR (from_n = ? AND to_n = ?))`,
        args: [inv.number, withN, withN, inv.number],
      };
    }
    return null;
  }

  readMessages(request, url) {
    const inv = this.inHall(request);
    if (!inv) return json({ error: "You are not in the hall yet." }, 403);
    const roomName = url.searchParams.get("room") || "";
    const cell = /^cell[1-9]$/.test(roomName) ? Number(roomName.slice(4)) : 0;
    if (cell && this.cellOf(inv.number) !== cell) return json({ error: "You are not standing in that cell." }, 403);
    // In a cell you can read only what was said while you were standing there.
    const q = cell
      ? { key: roomName, where: `room = ? AND (',' || heard || ',') LIKE ?`, args: [roomName, "%," + inv.number + ",%"] }
      : this.roomQuery(inv, roomName, Number(url.searchParams.get("with")));
    if (!q) return json({ error: "That room does not exist." }, 400);
    const after = Math.max(0, Number(url.searchParams.get("after")) || 0);
    const rows = this.sql
      .exec(`SELECT * FROM (SELECT * FROM messages WHERE ${q.where} AND id > ? ORDER BY id DESC LIMIT 200) ORDER BY id ASC`, ...q.args, after)
      .toArray();
    if (rows.length) {
      this.sql.exec(
        `INSERT INTO reads (who, key, last_id) VALUES (?, ?, ?) ON CONFLICT(who, key) DO UPDATE SET last_id = MAX(last_id, excluded.last_id)`,
        "p" + inv.number,
        q.key,
        rows[rows.length - 1].id,
      );
    }
    return json({ messages: rows.map(publicMessage) });
  }

  async postMessage(request) {
    const inv = this.inHall(request);
    if (!inv) return json({ error: "You are not in the hall yet." }, 403);
    const body = await readJson(request);
    const text = String(body.body || "").replace(/\s+$/g, "").replace(/^\s+/g, "");
    if (!text) return json({ error: "Write something first." }, 400);
    if (text.length > MESSAGE_MAX) return json({ error: `Keep it under ${MESSAGE_MAX} characters.` }, 400);
    const now = Date.now();
    if (now - (this.lastPost.get(inv.number) || 0) < MESSAGE_GAP_MS) return json({ error: "Slow down a little." }, 429);

    const room = String(body.room || "");
    if (inv.out && room !== "study") return json({ error: "You are out of the game. You can still ask the GM." }, 403);
    let to = null;
    let heard = null;
    if (room === "whisper") {
      to = Number(body.with);
      const other = this.sql
        .exec(`SELECT number, out FROM invites WHERE status = 'accepted' AND avatar IS NOT NULL AND number = ?`, Number.isInteger(to) ? to : -1)
        .toArray();
      if (!other.length || to === inv.number) return json({ error: "That player has not arrived yet." }, 400);
      if (other[0].out) return json({ error: "That player is out of the game." }, 400);
    } else if (room === "study") {
      to = inv.number;
    } else if (room === "board") {
      return json({ error: "Only the GM posts on the notice board." }, 403);
    } else if (/^cell[1-9]$/.test(room)) {
      const cell = Number(room.slice(4));
      if (this.cellOf(inv.number) !== cell) return json({ error: "You are not standing in that cell." }, 403);
      heard = this.cellMates(cell).join(",");
    } else if (room !== "table") {
      return json({ error: "That room does not exist." }, 400);
    }
    this.lastPost.set(inv.number, now);
    this.sql.exec(`INSERT INTO messages (room, from_n, to_n, parent, body, at, heard) VALUES (?, ?, ?, NULL, ?, ?, ?)`, room, inv.number, to, text, now, heard);
    const id = this.sql.exec(`SELECT last_insert_rowid() AS id`).one().id;
    this.broadcast({ t: "news" });
    return json({ ok: true, id });
  }

  // ---------- days, coins, and where a player stands ----------

  // The game's day turns over at the hour the bags open, so "today" is the same for every time zone.
  // The game's day runs midnight to midnight, Eastern Standard Time (UTC-5): the same clock the players see.
  dayAnchor() {
    return GAME_DAY_STARTS_UTC_MS;
  }

  today() {
    return Math.floor((Date.now() - this.dayAnchor()) / DAY_MS);
  }

  dayEnds() {
    return (this.today() + 1) * DAY_MS + this.dayAnchor();
  }

  // ---------- which puzzle is in play ----------

  // The puzzle has its own day. While the GM holds it, that day does not move. Released, it moves on at
  // each midnight EST from wherever it was, so the kinds still take their turns in order.
  puzzleHeld() {
    return this.get("puzzle_hold", "0") === "1";
  }

  puzzleDay() {
    if (this.puzzleHeld()) {
      const held = Number(this.get("puzzle_held_day", ""));
      return Number.isFinite(held) && held > 0 ? held : this.today();
    }
    return this.today() - (Number(this.get("puzzle_lag", "0")) || 0);
  }

  // When the puzzle in play ends. Nobody knows while it is held.
  puzzleEnds() {
    return this.puzzleHeld() ? 0 : this.dayEnds();
  }

  // The GM holds the puzzle, releases it, or starts the next one now.
  async hostPuzzle(request) {
    const body = await readJson(request);
    const day = this.puzzleDay();
    if (body.next === true) {
      // one puzzle forward, whether held or not
      if (this.puzzleHeld()) this.set("puzzle_held_day", String(day + 1));
      else this.set("puzzle_lag", String(this.today() - (day + 1)));
    } else if (body.hold === true) {
      this.set("puzzle_held_day", String(day));
      this.set("puzzle_hold", "1");
    } else if (body.hold === false) {
      // the same puzzle stays until the next midnight EST, then the daily change carries on from here
      this.set("puzzle_lag", String(this.today() - day));
      this.set("puzzle_hold", "0");
    } else {
      return json({ error: "Say whether to hold the puzzle or start the next one." }, 400);
    }
    this.broadcast({ t: "news" });
    return json({ ok: true, held: this.puzzleHeld() });
  }

  // What a player holds: the bag's payout, plus everything won or lost since.
  balance(inv) {
    return this.phase() === "revealed" ? (inv.coins || 0) + (inv.extra || 0) : null;
  }

  addCoins(number, amount) {
    this.sql.exec(`UPDATE invites SET extra = extra + ? WHERE number = ? AND status = 'accepted'`, amount, number);
  }

  playerByNumber(n) {
    const rows = this.sql.exec(`SELECT * FROM invites WHERE status = 'accepted' AND avatar IS NOT NULL AND number = ?`, Number.isInteger(n) ? n : -1).toArray();
    return rows.length ? rows[0] : null;
  }

  // Which dungeon cell a player is standing in, if any.
  cellOf(number) {
    const rows = this.sql.exec(`SELECT room, x, y FROM places WHERE number = ?`, number).toArray();
    return rows.length ? cellAt(rows[0].room, rows[0].x, rows[0].y) : 0;
  }

  cellMates(cell) {
    return this.sql
      .exec(`SELECT number, room, x, y FROM places`)
      .toArray()
      .filter((p) => cellAt(p.room, p.x, p.y) === cell)
      .map((p) => p.number)
      .sort((a, b) => a - b);
  }

  // ---------- the puzzle room ----------

  // Every player gets the same puzzle each day, so nobody draws an easier one.
  // The kinds take turns from the first day a puzzle is asked for: code, sums, cipher, sequence.
  puzzleFor(number, day) {
    let salt = this.get("puzzle_salt", "");
    if (!salt) {
      salt = randomToken(12);
      this.set("puzzle_salt", salt);
    }
    const start = day * DAY_MS + this.dayAnchor();
    let first = Number(this.get("puzzle_first", ""));
    if (!first) {
      first = start;
      this.set("puzzle_first", first);
    }
    const turn = Math.max(0, Math.round((start - first) / DAY_MS));
    return makePuzzle(salt + ":" + day, turn);
  }

  puzzleRow(number, day) {
    const rows = this.sql.exec(`SELECT tries, solved FROM puzzle_tries WHERE number = ? AND day = ?`, number, day).toArray();
    return rows.length ? rows[0] : { tries: 0, solved: 0 };
  }

  // A number that changes whenever the puzzle on screen changes: a new day, a different kind, different clues.
  puzzleMark(p) {
    return seedOf(p.type + JSON.stringify(p.data));
  }

  puzzleView(inv) {
    const day = this.puzzleDay();
    const p = this.puzzleFor(inv.number, day);
    const row = this.puzzleRow(inv.number, day);
    return {
      type: p.type,
      title: p.title,
      ask: p.ask,
      data: p.data,
      tries: row.tries,
      left: Math.max(0, PUZZLE_TRIES - row.tries),
      solved: !!row.solved,
      answer: row.solved || row.tries >= PUZZLE_TRIES ? p.answer : undefined,
      // which puzzle this is: sent back with an answer, so an answer to a puzzle that has been replaced is not counted
      no: this.puzzleMark(p),
      day,
      held: this.puzzleHeld(),
      resetAt: this.puzzleEnds(),
      reward: PUZZLE_REWARD,
      paid: this.phase() === "revealed",
    };
  }

  puzzle(request) {
    const inv = this.inHall(request);
    if (!inv) return json({ error: "You are not in the hall yet." }, 403);
    return json(this.puzzleView(inv));
  }

  async puzzleAnswer(request) {
    const inv = this.inHall(request);
    if (!inv) return json({ error: "You are not in the hall yet." }, 403);
    if (inv.out) return json({ error: "You are out of the game." }, 403);
    const body = await readJson(request);
    const day = this.puzzleDay();
    // the page was showing a puzzle that has since been replaced: do not spend a try on the new one
    if (body.no != null && Number(body.no) !== this.puzzleMark(this.puzzleFor(inv.number, day))) return json({ error: "The puzzle has changed. Here it is." }, 409);
    const row = this.puzzleRow(inv.number, day);
    if (row.solved) return json({ error: "You have already solved today's puzzle." }, 409);
    if (row.tries >= PUZZLE_TRIES) return json({ error: "No tries left today." }, 409);
    if (!String(body.answer || "").trim()) return json({ error: "Type an answer first." }, 400);
    const right = sameAnswer(body.answer, this.puzzleFor(inv.number, day).answer);
    this.sql.exec(
      `INSERT INTO puzzle_tries (number, day, tries, solved) VALUES (?, ?, 1, ?)
       ON CONFLICT(number, day) DO UPDATE SET tries = tries + 1, solved = excluded.solved`,
      inv.number,
      day,
      right ? 1 : 0,
    );
    if (right) {
      this.addCoins(inv.number, PUZZLE_REWARD);
      // every other player is told, so those who have not tried today are nudged to
      this.sql.exec(`INSERT INTO notices (kind, n, day, at) VALUES ('solved', ?, ?, ?)`, inv.number, day, Date.now());
      this.broadcast({ t: "news" });
    }
    return json(Object.assign({ right }, this.puzzleView(inv)));
  }

  // The latest news for one player. A player is not told that they solved the puzzle themselves.
  // A duel being decided is news for everyone, and "mine" marks it for the two who fought it.
  // "Player X is waiting for you" goes to the one player being waited on.
  noticesFor(inv) {
    const today = this.puzzleDay();
    const me = inv.number;
    return this.sql
      .exec(`SELECT id, kind, n, m, day, at FROM notices WHERE (kind IN ('solved', 'tfound', 'thelp', 'topen') AND n != ?) OR kind = 'duel' OR (kind IN ('wait', 'betwon', 'betlost', 'betlevel', 'tsolved') AND m = ?) ORDER BY id DESC LIMIT 60`, me, me)
      .toArray()
      .map((r) => {
        const x = { id: r.id, kind: r.kind, n: r.n, at: r.at, today: r.day === today };
        if (r.kind === "duel") { x.m = r.m; x.mine = r.n === me || r.m === me; if (x.mine) x.n = r.n === me ? r.m : r.n; }
        return x;
      });
  }

  puzzleStanding(inv) {
    const row = this.puzzleRow(inv.number, this.puzzleDay());
    return { solved: !!row.solved, left: Math.max(0, PUZZLE_TRIES - row.tries), reward: PUZZLE_REWARD };
  }

  // The player opened the bell: everything up to this piece of news has been read.
  async noticesSeen(request) {
    const inv = this.inHall(request);
    if (!inv) return json({ error: "You are not in the hall yet." }, 403);
    const body = await readJson(request);
    const newest = this.sql.exec(`SELECT COALESCE(MAX(id), 0) AS m FROM notices`).one().m;
    const upTo = Math.min(newest, Math.max(0, Math.floor(Number(body.upTo) || 0)));
    if (upTo > 0) {
      this.sql.exec(
        `INSERT INTO reads (who, key, last_id) VALUES (?, 'notices', ?) ON CONFLICT(who, key) DO UPDATE SET last_id = MAX(last_id, excluded.last_id)`,
        "p" + inv.number,
        upTo,
      );
    }
    return json({ ok: true, noticeMark: upTo });
  }

  // ---------- the betting room: two players, two sealed choices ----------

  // Offers nobody answered by the end of their day are returned to the player who made them.
  expireDeals() {
    const today = this.today();
    for (const d of this.sql.exec(`SELECT id, a FROM deals WHERE status = 'open' AND day < ?`, today).toArray()) {
      this.addCoins(d.a, DEAL_STAKE);
      this.sql.exec(`UPDATE deals SET status = 'expired', settled_at = ? WHERE id = ?`, Date.now(), d.id);
    }
  }

  dealtToday(number) {
    return this.sql.exec(`SELECT COUNT(*) AS n FROM deals WHERE status = 'done' AND day = ? AND (a = ? OR b = ?)`, this.today(), number, number).one().n > 0;
  }

  dealsView(inv) {
    this.expireDeals();
    const me = this.sql.exec(`SELECT * FROM invites WHERE token = ?`, inv.token).one();
    const n = me.number;
    const today = this.today();
    const open = this.sql.exec(`SELECT id, b FROM deals WHERE status = 'open' AND a = ?`, n).toArray();
    const incoming = this.sql.exec(`SELECT id, a FROM deals WHERE status = 'open' AND b = ? AND day = ?`, n, today).toArray();
    const past = this.sql.exec(`SELECT * FROM deals WHERE status != 'open' AND (a = ? OR b = ?) ORDER BY id DESC LIMIT 12`, n, n).toArray();
    const others = this.sql.exec(`SELECT number FROM invites WHERE status = 'accepted' AND avatar IS NOT NULL AND out = 0 AND number != ? ORDER BY number`, n).toArray();
    return {
      open: (this.phase() === "revealed") && this.bettingOpen(),
      stake: DEAL_STAKE,
      pay: DEAL_PAY,
      balance: this.balance(me),
      doneToday: this.dealtToday(n),
      resetAt: this.dayEnds(),
      mine: open.length ? { id: open[0].id, with: open[0].b } : null,
      incoming: incoming.map((d) => ({ id: d.id, from: d.a })),
      players: others.map((p) => p.number),
      past: past.map((d) => {
        const first = d.a === n;
        return {
          id: d.id,
          with: first ? d.b : d.a,
          status: d.status,
          mine: first ? d.a_choice : d.b_choice,
          theirs: d.status === "done" ? (first ? d.b_choice : d.a_choice) : null,
          net: d.status === "done" ? (first ? d.a_net : d.b_net) : 0,
          at: d.settled_at || d.created_at,
        };
      }),
    };
  }

  // Only the GM opens the betting room.
  bettingOpen() {
    return this.get("betting_open", "0") === "1";
  }

  deals(request) {
    const inv = this.inHall(request);
    if (!inv) return json({ error: "You are not in the hall yet." }, 403);
    return json(this.dealsView(inv));
  }

  async dealOffer(request) {
    const inv = this.inHall(request);
    if (!inv) return json({ error: "You are not in the hall yet." }, 403);
    const body = await readJson(request);
    this.expireDeals();
    if (inv.out) return json({ error: "You are out of the game." }, 403);
    if (!this.bettingOpen()) return json({ error: "The betting room is closed." }, 409);
    if (this.phase() !== "revealed") return json({ error: "The betting room opens when the bags open." }, 409);
    const choice = body.choice === "c" || body.choice === "b" ? body.choice : null;
    if (!choice) return json({ error: "Choose Cooperate or Betray." }, 400);
    const other = this.playerByNumber(Number(body.to));
    if (!other || other.number === inv.number || other.out) return json({ error: "Choose another player who is still in the game." }, 400);
    if (this.dealtToday(inv.number)) return json({ error: "You have already made your deal today." }, 409);
    if (this.sql.exec(`SELECT COUNT(*) AS n FROM deals WHERE status = 'open' AND a = ?`, inv.number).one().n) return json({ error: "You already have an offer waiting." }, 409);
    if (this.balance(inv) < DEAL_STAKE) return json({ error: `You need ${DEAL_STAKE} coins to make a deal.` }, 409);
    this.addCoins(inv.number, -DEAL_STAKE);
    this.sql.exec(`INSERT INTO deals (day, a, b, a_choice, status, created_at) VALUES (?, ?, ?, ?, 'open', ?)`, this.today(), inv.number, other.number, choice, Date.now());
    this.broadcast({ t: "news" });
    return json(this.dealsView(inv));
  }

  async dealAnswer(request) {
    const inv = this.inHall(request);
    if (!inv) return json({ error: "You are not in the hall yet." }, 403);
    const body = await readJson(request);
    this.expireDeals();
    if (!this.bettingOpen()) return json({ error: "The betting room is closed." }, 409);
    const rows = this.sql.exec(`SELECT * FROM deals WHERE id = ? AND status = 'open'`, Number(body.id) || 0).toArray();
    if (!rows.length) return json({ error: "That offer is no longer open." }, 404);
    const d = rows[0];
    const now = Date.now();
    // the player who made the offer may take it back
    if (body.cancel) {
      if (d.a !== inv.number) return json({ error: "That is not your offer." }, 403);
      this.addCoins(d.a, DEAL_STAKE);
      this.sql.exec(`UPDATE deals SET status = 'cancelled', settled_at = ? WHERE id = ?`, now, d.id);
      return json(this.dealsView(inv));
    }
    if (d.b !== inv.number) return json({ error: "That offer is not for you." }, 403);
    if (body.decline) {
      this.addCoins(d.a, DEAL_STAKE);
      this.sql.exec(`UPDATE deals SET status = 'declined', settled_at = ? WHERE id = ?`, now, d.id);
      this.broadcast({ t: "news" });
      return json(this.dealsView(inv));
    }
    const choice = body.choice === "c" || body.choice === "b" ? body.choice : null;
    if (!choice) return json({ error: "Choose Cooperate or Betray." }, 400);
    if (inv.out) return json({ error: "You are out of the game." }, 403);
    if (this.dealtToday(inv.number)) return json({ error: "You have already made your deal today." }, 409);
    if (this.dealtToday(d.a)) return json({ error: "That player has already made a deal today." }, 409);
    if (this.balance(inv) < DEAL_STAKE) return json({ error: `You need ${DEAL_STAKE} coins to make a deal.` }, 409);
    const key = d.a_choice + choice;
    const aNet = DEAL_PAY[key][0];
    const bNet = DEAL_PAY[key][1];
    this.addCoins(d.a, DEAL_STAKE + aNet); // the first player's stake comes back, changed by the result
    this.addCoins(d.b, bNet);
    this.sql.exec(`UPDATE deals SET status = 'done', b_choice = ?, a_net = ?, b_net = ?, settled_at = ? WHERE id = ?`, choice, aNet, bNet, now, d.id);
    this.broadcast({ t: "news" });
    return json(Object.assign({ result: { with: d.a, mine: choice, theirs: d.a_choice, net: bNet } }, this.dealsView(inv)));
  }

  // ---------- the night's match: Six Vaults ----------

  night() {
    return JSON.parse(this.get("night", "null"));
  }

  nightResult() {
    return JSON.parse(this.get("night_result", "null"));
  }

  // Everyone still in the game, by number.
  activeNumbers() {
    return this.sql
      .exec(`SELECT number FROM invites WHERE status = 'accepted' AND avatar IS NOT NULL AND out = 0 ORDER BY number`)
      .toArray()
      .map((r) => r.number);
  }

  // A player's row for the night. Someone who walks in after it began is handed a clue nobody holds yet.
  nightRow(inv, night) {
    let rows = this.sql.exec(`SELECT * FROM night_plays WHERE number = ?`, inv.number).toArray();
    if (!rows.length && night && night.status === "open" && !inv.out) {
      const taken = this.sql.exec(`SELECT clue FROM night_plays`).toArray().map((r) => r.clue);
      const clue = spareClue(taken);
      if (!clue) return null;
      this.sql.exec(`INSERT INTO night_plays (number, clue) VALUES (?, ?)`, inv.number, clue);
      rows = this.sql.exec(`SELECT * FROM night_plays WHERE number = ?`, inv.number).toArray();
    }
    return rows.length ? rows[0] : null;
  }

  // The few lines every screen needs: is a night on, when does it end, has this player opened, is there a result to watch.
  nightBrief(inv) {
    const night = this.night();
    if (!night) return null;
    if (night.game === "ladder") return this.ladderBrief(inv, night);
    const row = this.nightRow(inv, night);
    return {
      n: night.n,
      game: night.game,
      status: night.status,
      endsAt: night.endsAt || "",
      opened: !!(row && row.a),
      unseen: night.status === "done" && !!row && !row.seen,
    };
  }

  // What is told to everyone once the night is over.
  publicResult() {
    const r = this.nightResult();
    if (!r) return null;
    return { layout: r.layout, plays: r.plays, gold: r.gold, rank: r.rank, prize: r.prize, last: r.last, duel: r.duel, out: r.out, undecided: r.undecided };
  }

  nightView(inv) {
    const night = this.night();
    if (!night) return { on: false, rules: RULES, coins: this.balance(inv), out: inv.out || 0 };
    if (night.game === "ladder") return this.ladderView(inv, night);
    const row = this.nightRow(inv, night);
    const coins = this.balance(inv);
    const view = {
      on: true,
      n: night.n,
      game: night.game,
      status: night.status,
      endsAt: night.endsAt || "",
      rules: RULES,
      you: inv.number,
      out: inv.out || 0,
      playing: !!row,
      clue: row ? clueText(row.clue) : "",
      bought: row && row.bought ? clueText(row.bought) : "",
      opened: row && row.a ? [row.a, row.b] : null,
      throws: row && row.throws ? row.throws.split("") : null,
      coins,
      canBuy: !!row && night.status === "open" && !row.bought && !row.a && (coins || 0) >= RULES.cluePrice,
    };
    if (night.status === "done") {
      view.result = this.publicResult();
      view.seen = row ? !!row.seen : true;
    }
    return view;
  }

  nightGet(request) {
    const inv = this.inHall(request);
    if (!inv) return json({ error: "You are not in the hall yet." }, 403);
    return json(this.nightView(inv));
  }

  // The night's player, or the reason they cannot act.
  nightPlayer(request) {
    const inv = this.inHall(request);
    if (!inv) return { error: json({ error: "You are not in the hall yet." }, 403) };
    if (inv.out) return { error: json({ error: "You are out of the game." }, 403) };
    const night = this.night();
    if (!night || night.status !== "open" || night.game === "ladder") return { error: json({ error: "No match is being played right now." }, 409) };
    const row = this.nightRow(inv, night);
    if (!row) return { error: json({ error: "You are not in tonight's match." }, 409) };
    return { inv, night, row };
  }

  // The shop: one more true clue, for a coin.
  async nightBuy(request) {
    const p = this.nightPlayer(request);
    if (p.error) return p.error;
    if (p.row.a) return json({ error: "You have already opened your vaults." }, 409);
    if (p.row.bought) return json({ error: "The shop sells each player one clue." }, 409);
    if ((this.balance(p.inv) || 0) < RULES.cluePrice) return json({ error: "A clue costs " + RULES.cluePrice + " coin. You do not have it." }, 409);
    this.addCoins(p.inv.number, -RULES.cluePrice);
    this.sql.exec(`UPDATE night_plays SET bought = ? WHERE number = ?`, shopClue(p.row.clue), p.inv.number);
    this.broadcast({ t: "news" });
    return json(this.nightView(this.inHall(request)));
  }

  // Open two vaults. It is sealed and final, and nobody is shown what was inside until the night ends.
  async nightOpen(request) {
    const p = this.nightPlayer(request);
    if (p.error) return p.error;
    if (p.row.a) return json({ error: "You have already opened your vaults." }, 409);
    const body = await readJson(request);
    const picks = Array.isArray(body.vaults) ? body.vaults.map(Number) : [];
    if (picks.length !== RULES.open || picks.some((v) => !Number.isInteger(v) || v < 1 || v > RULES.vaults) || picks[0] === picks[1]) {
      return json({ error: "Choose two different vaults." }, 400);
    }
    if (!validThrows(body.throws)) return json({ error: "Seal five throws: rock, paper or scissors." }, 400);
    picks.sort((x, y) => x - y);
    this.sql.exec(`UPDATE night_plays SET a = ?, b = ?, throws = ?, opened_at = ? WHERE number = ?`, picks[0], picks[1], body.throws.join(""), Date.now(), p.inv.number);
    this.broadcast({ t: "news" });
    return json(this.nightView(this.inHall(request)));
  }

  nightSeen(request) {
    const inv = this.inHall(request);
    if (!inv) return json({ error: "You are not in the hall yet." }, 403);
    this.sql.exec(`UPDATE night_plays SET seen = 1 WHERE number = ?`, inv.number);
    this.sql.exec(`UPDATE ladder_players SET seen = 1 WHERE number = ?`, inv.number);
    return json({ ok: true });
  }

  maybeEndNight() {
    const night = this.night();
    if (!night || night.status !== "open" || !night.endsAt) return;
    const at = Date.parse(night.endsAt);
    if (!Number.isNaN(at) && Date.now() >= at) night.game === "ladder" ? this.closeLadderStage() : this.endNight();
  }

  // Close the vaults: count the gold, pay the three highest amounts, and send one player home.
  endNight() {
    const night = this.night();
    if (!night || night.status !== "open" || night.game === "ladder") return null;
    const players = this.activeNumbers();
    const plays = {};
    const shown = {};
    for (const r of this.sql.exec(`SELECT * FROM night_plays WHERE a IS NOT NULL`).toArray()) {
      if (!players.includes(r.number)) continue;
      plays[r.number] = { a: r.a, b: r.b, throws: (r.throws || "").split("") };
      shown[r.number] = [r.a, r.b];
    }
    const coins = {};
    for (const p of this.sql.exec(`SELECT number, coins, extra FROM invites WHERE status = 'accepted' AND out = 0`).toArray()) coins[p.number] = (p.coins || 0) + (p.extra || 0);
    const result = settle(players, plays, coins);
    for (const n of players) if (result.prize[n]) this.addCoins(n, result.prize[n]);
    if (result.out != null) this.sql.exec(`UPDATE invites SET out = ? WHERE number = ?`, night.n, result.out);
    this.set("night_result", JSON.stringify({ ...result, plays: shown, players, endedAt: Date.now() }));
    this.set("night", JSON.stringify({ ...night, status: "done" }));
    this.broadcast({ t: "news" });
    return result;
  }

  async hostNightStart(request) {
    const body = await readJson(request);
    if (this.phase() !== "revealed") return json({ error: "Open the bags first. Players need coins for the shop." }, 409);
    const before = this.night();
    if (before && before.status === "open") return json({ error: "A match is already being played." }, 409);
    const players = this.activeNumbers();
    if (players.length < 2) return json({ error: "A match needs at least two players." }, 409);
    let endsAt = "";
    if (body.endsAt) {
      const at = Date.parse(String(body.endsAt));
      if (Number.isNaN(at)) return json({ error: "That date could not be read." }, 400);
      if (at <= Date.now()) return json({ error: "The vaults must close in the future." }, 400);
      endsAt = new Date(at).toISOString();
    }
    if (body.game === "ladder") return this.startLadder(before, players, endsAt, body);
    this.sql.exec(`DELETE FROM night_plays`);
    const hands = dealClues(players);
    for (const n of players) this.sql.exec(`INSERT INTO night_plays (number, clue) VALUES (?, ?)`, n, hands[n]);
    this.set("night", JSON.stringify({ n: (before ? before.n : 0) + 1, game: "vaults", status: "open", startedAt: Date.now(), endsAt }));
    this.set("night_result", "null");
    this.broadcast({ t: "news" });
    return json({ ok: true, players: players.length });
  }

  hostNightEnd() {
    const night = this.night();
    if (!night || night.status !== "open") return json({ error: "No match is being played." }, 409);
    if (night.game === "ladder") return json({ error: "The Ladder ends when its last stage is closed." }, 409);
    this.endNight();
    return json({ ok: true, result: this.publicResult() });
  }

  // Undo the night, for testing: prizes and clue money go back, and whoever it sent home returns.
  hostNightReset() {
    const night = this.night();
    if (!night) return json({ ok: true });
    if (night.game === "ladder") return this.resetLadder(night);
    const result = this.nightResult();
    if (result) for (const n of Object.keys(result.prize || {})) if (result.prize[n]) this.addCoins(Number(n), -result.prize[n]);
    for (const r of this.sql.exec(`SELECT number FROM night_plays WHERE bought IS NOT NULL`).toArray()) this.addCoins(r.number, RULES.cluePrice);
    this.sql.exec(`UPDATE invites SET out = 0 WHERE out = ?`, night.n);
    this.sql.exec(`DELETE FROM night_plays`);
    this.set("night", JSON.stringify(night.n > 1 ? { n: night.n - 1, game: night.game, status: "done" } : null));
    this.set("night_result", "null");
    this.broadcast({ t: "news" });
    return json({ ok: true });
  }

  // The GM sends a player home, or brings one back. Also settles a tie the throws and the coins could not.
  async hostOut(request) {
    const body = await readJson(request);
    const n = Number(body.number);
    const rows = this.sql.exec(`SELECT number, out FROM invites WHERE status = 'accepted' AND number = ?`, Number.isInteger(n) ? n : -1).toArray();
    if (!rows.length) return json({ error: "That player is not in the game." }, 400);
    const night = this.night();
    const mark = body.out === false ? 0 : Math.max(1, night ? night.n : 1);
    this.sql.exec(`UPDATE invites SET out = ? WHERE number = ?`, mark, n);
    const result = this.nightResult();
    if (result && mark && result.out == null && (result.undecided || []).includes(n)) {
      result.out = n;
      result.undecided = [];
      this.set("night_result", JSON.stringify(result));
    }
    this.broadcast({ t: "news" });
    return json({ ok: true });
  }

  hostNightView() {
    const night = this.night();
    if (!night) return null;
    if (night.game === "ladder") return this.hostLadderView(night);
    const rows = this.sql.exec(`SELECT * FROM night_plays ORDER BY number`).toArray();
    return {
      ...night,
      layout: GOLD,
      players: rows.map((r) => ({
        n: r.number,
        clue: clueText(r.clue),
        bought: r.bought ? clueText(r.bought) : "",
        opened: r.a ? [r.a, r.b] : null,
        gold: r.a ? GOLD[r.a - 1] + GOLD[r.b - 1] : null,
        throws: r.throws || "",
      })),
      result: this.nightResult(),
    };
  }

  // ---------- Game: The Ladder ----------
  // The rules live in public/ladder.js, shared with the players' screens. Here: who has sealed what, and the closing of stages.

  ladderDuels() {
    return JSON.parse(this.get("ladder_duels", "[]"));
  }

  // The cards each player has already played, from the stages that are closed. Everyone may see these.
  ladderUsed(players, duels) {
    const used = {};
    for (const n of players) used[n] = [];
    for (const d of duels) {
      if (used[d.a]) used[d.a].push(d.ca);
      if (used[d.b]) used[d.b].push(d.cb);
    }
    return used;
  }

  ladderBoostsSpent(n, duels) {
    return duels.reduce((k, d) => k + (d.a === n && d.ba ? 1 : 0) + (d.b === n && d.bb ? 1 : 0), 0);
  }

  ladderSealOf(n, stage) {
    const rows = this.sql.exec(`SELECT plays FROM ladder_seals WHERE number = ? AND stage = ?`, n, stage).toArray();
    return rows.length ? JSON.parse(rows[0].plays) : null;
  }

  // The duels of the open stage that are already decided, because both players have submitted.
  // They count on the ladder at once. Their cards stay face down until the stage closes.
  ladderLive(night) {
    if (night.status !== "open") return [];
    const seals = new Map(this.sql.exec(`SELECT number, plays FROM ladder_seals WHERE stage = ?`, night.stage).toArray().map((r) => [r.number, JSON.parse(r.plays)]));
    const per = LADDER.RULES.perStage, out = [];
    for (const pairs of LADDER.rounds(night.players).slice((night.stage - 1) * per, night.stage * per)) {
      for (const [a, b] of pairs) {
        const pa = (seals.get(a) || []).find((p) => p.opp === b), pb = (seals.get(b) || []).find((p) => p.opp === a);
        if (pa && pb) out.push({ stage: night.stage, a, b, ca: pa.card, cb: pb.card, ba: pa.boost ? 1 : 0, bb: pb.boost ? 1 : 0 });
      }
    }
    return out;
  }

  // The talk of a closed stage. First choice, a true upset: a win where the winning card ranks below the losing
  // one (a 2 over a Joker, or a boosted card over a higher one), the wider the gap the better. A higher card nearly
  // always wins, so when there is no upset it is the strongest card that fell, by the narrowest margin.
  ladderUpset(duels, stage) {
    const rank = (c) => (LADDER.isJoker(c) ? 15 : LADDER.power(c));
    let upset = null, fall = null;
    for (const d of duels) {
      if (d.stage !== stage) continue;
      if (d.fa || d.fb) continue; // a forfeit is nobody's upset
      const r = LADDER.duel(d.ca, d.ba, d.cb, d.bb);
      if (!r) continue;
      const w = r > 0 ? [d.a, d.ca, d.ba] : [d.b, d.cb, d.bb], l = r > 0 ? [d.b, d.cb, d.bb] : [d.a, d.ca, d.ba];
      const x = { stage, w: w[0], cw: w[1], bw: w[2], l: l[0], cl: l[1], bl: l[2], gap: rank(l[1]) - rank(w[1]), high: rank(l[1]) };
      if (x.gap > 0 && (!upset || x.gap > upset.gap)) upset = x;
      if (!fall || x.high > fall.high || (x.high === fall.high && x.gap > fall.gap)) fall = x;
    }
    const pick = upset || fall;
    return pick ? { kind: upset ? "upset" : "fall", stage, w: pick.w, cw: pick.cw, bw: pick.bw, l: pick.l, cl: pick.cl, bl: pick.bl } : null;
  }

  ladderSubmitted(night) {
    const rows = this.sql.exec(`SELECT number FROM ladder_seals WHERE stage = ?`, night.stage).toArray().map((r) => r.number);
    return night.players.filter((n) => rows.includes(n));
  }

  ladderPlayer(n) {
    const rows = this.sql.exec(`SELECT * FROM ladder_players WHERE number = ?`, n).toArray();
    return rows.length ? rows[0] : null;
  }

  ladderBrief(inv, night) {
    const row = this.ladderPlayer(inv.number);
    return {
      n: night.n,
      game: "ladder",
      status: night.status,
      endsAt: night.endsAt || "",
      stage: night.stage,
      opened: night.status === "open" && !!row && !!this.ladderSealOf(inv.number, night.stage),
      // how many have submitted this stage: the play screen redraws when it changes
      subs: night.status === "open" ? this.ladderSubmitted(night).length : 0,
      unseen: night.status === "done" && !!row && !row.seen,
    };
  }

  ladderView(inv, night) {
    const players = night.players;
    const you = inv.number;
    const row = this.ladderPlayer(you);
    const playing = !!row && players.includes(you);
    const duels = this.ladderDuels();
    const used = this.ladderUsed(players, duels);
    const results = [];
    for (let s = 1; s <= night.stages; s++) {
      const mine = duels.filter((d) => d.stage === s && (d.a === you || d.b === you));
      if (!mine.length) continue;
      results.push({
        stage: s,
        duels: mine.map((d) => {
          const am = d.a === you;
          const s = LADDER.score(d);
          return { opp: am ? d.b : d.a, mine: am ? d.ca : d.cb, theirs: am ? d.cb : d.ca, mb: am ? d.ba : d.bb, tb: am ? d.bb : d.ba, r: am ? s[0] : s[1], mf: (am ? d.fa : d.fb) ? 1 : 0, tf: (am ? d.fb : d.fa) ? 1 : 0 };
        }),
      });
    }
    const sealed = playing && night.status === "open" ? this.ladderSealOf(you, night.stage) : null;
    const liveDuels = this.ladderLive(night);
    const submitted = night.status === "open" ? this.ladderSubmitted(night) : [];
    // this stage's duels for this player. Once both have submitted the duel is over, and the two who fought it
    // are shown each other's card at once. Nobody else is shown those cards until the stage closes.
    const live = playing && night.status === "open" ? (LADDER.stagesFor(players, you)[night.stage - 1] || []).map((opp) => {
      const d = liveDuels.find((x) => (x.a === you && x.b === opp) || (x.b === you && x.a === opp));
      if (!d) return { opp, r: null, oppIn: submitted.includes(opp) };
      const r = LADDER.duel(d.ca, d.ba, d.cb, d.bb);
      return { opp, r: d.a === you ? r : -r, oppIn: true, theirs: d.a === you ? d.cb : d.ca, tb: d.a === you ? d.bb : d.ba };
    }) : [];
    const coins = this.balance(inv);
    const held = sealed ? sealed.filter((p) => p.boost).length * LADDER.RULES.boostPrice : 0;
    const result = night.status === "done" ? this.nightResult() : null;
    return {
      on: true,
      game: "ladder",
      n: night.n,
      status: night.status,
      you,
      playing,
      out: inv.out || 0,
      endsAt: night.endsAt || "",
      stage: night.stage,
      stages: night.stages,
      opponents: playing ? LADDER.stagesFor(players, you) : [],
      hand: playing ? LADDER.CARDS.filter((c) => !used[you].includes(c)) : [],
      sealed,
      boostsLeft: playing ? LADDER.RULES.boosts - this.ladderBoostsSpent(you, duels) : 0,
      coins,
      // what could be spent on boosts if this stage's cards were laid again: the coins held by the seal count
      purse: (coins || 0) + held,
      used,
      results,
      // who has submitted cards for this stage. Everyone may see who; nobody is shown which cards.
      submitted,
      upset: this.ladderUpset(duels, night.status === "open" ? night.stage - 1 : night.stages),
      live,
      liveCount: liveDuels.length,
      seenStage: playing ? row.seen_stage : night.stage,
      table: LADDER.table(players, duels.concat(liveDuels)),
      rules: LADDER.RULES,
      result: result ? { out: result.out, last: result.last, prizes: result.prizes } : null,
      seen: row ? !!row.seen : true,
      bet: (() => { const b = this.betOf(you); const mine = LADDER.table(players, duels).find((r) => r.n === you); return b ? { score: b.score, stake: b.stake, mult: b.mult, pays: b.stake * b.mult, won: night.status === "done" && !!mine ? mine.pts === b.score : null } : null; })(),
    };
  }

  // Seal a card against each of this stage's opponents. It can be laid again until the stage closes.
  // A boost is paid for when it is sealed, and handed back if it is taken off.
  async ladderSeal(request) {
    const inv = this.inHall(request);
    if (!inv) return json({ error: "You are not in the hall yet." }, 403);
    if (inv.out) return json({ error: "You are out of the game." }, 403);
    const night = this.night();
    if (!night || night.game !== "ladder" || night.status !== "open") return json({ error: "No stage is open right now." }, 409);
    const you = inv.number;
    if (!this.ladderPlayer(you) || !night.players.includes(you)) return json({ error: "You are not in this game." }, 409);
    const body = await readJson(request);
    const opps = LADDER.stagesFor(night.players, you)[night.stage - 1] || [];
    const duels = this.ladderDuels();
    const used = this.ladderUsed(night.players, duels)[you];
    const given = Array.isArray(body.plays) ? body.plays : [];
    const plays = [];
    for (const opp of opps) {
      const p = given.find((x) => x && Number(x.opp) === opp);
      if (!p || !LADDER.CARDS.includes(p.card)) return json({ error: "Play one card against each opponent." }, 400);
      if (used.includes(p.card)) return json({ error: "You have already played the " + LADDER.label(p.card) + "." }, 400);
      if (plays.some((x) => x.card === p.card)) return json({ error: "Each card can be played once." }, 400);
      if (p.boost && LADDER.isJoker(p.card)) return json({ error: "A Joker cannot be boosted. Take the +2 off it." }, 400);
      plays.push({ opp, card: p.card, boost: p.boost ? 1 : 0 });
    }
    if (this.ladderSealOf(you, night.stage)) return json({ error: "You have already submitted your cards for this stage. They cannot be changed." }, 409);
    const want = plays.filter((p) => p.boost).length;
    if (this.ladderBoostsSpent(you, duels) + want > LADDER.RULES.boosts) return json({ error: "You can boost " + LADDER.RULES.boosts + " cards in the whole game." }, 400);
    const cost = want * LADDER.RULES.boostPrice;
    if (cost > 0 && (this.balance(inv) || 0) < cost) return json({ error: "A boost costs " + LADDER.RULES.boostPrice + " coin. You do not have it." }, 409);
    if (cost) this.addCoins(you, -cost);
    this.sql.exec(`INSERT INTO ladder_seals (number, stage, plays, at) VALUES (?, ?, ?, ?)`, you, night.stage, JSON.stringify(plays), Date.now());
    // a duel is decided the moment both players have submitted: the two are told, and it is news for the rest.
    // An opponent who has not submitted is told that this player is waiting for them.
    const day = this.puzzleDay();
    for (const opp of opps) {
      const theirs = this.ladderSealOf(opp, night.stage);
      this.sql.exec(`INSERT INTO notices (kind, n, m, day, at) VALUES (?, ?, ?, ?, ?)`, theirs ? "duel" : "wait", you, opp, day, Date.now());
      if (theirs) {
        const mine = plays.find((p) => p.opp === opp), other = theirs.find((p) => p.opp === you);
        if (mine && other) this.settleDuelBets(night.stage, you, opp, LADDER.duel(mine.card, mine.boost, other.card, other.boost));
      }
    }
    // the moment every player still in the game has sealed, the cards are turned and the next stage opens
    const out = new Set(this.sql.exec(`SELECT number FROM invites WHERE out != 0`).toArray().map((r) => r.number));
    if (night.players.every((n) => out.has(n) || !!this.ladderSealOf(n, night.stage))) this.closeLadderStage();
    else this.broadcast({ t: "news" });
    return json(this.ladderView(this.inHall(request), this.night()));
  }

  ladderStageSeen(request) {
    const inv = this.inHall(request);
    if (!inv) return json({ error: "You are not in the hall yet." }, 403);
    const night = this.night();
    if (!night || night.game !== "ladder") return json({ error: "No game is being played." }, 409);
    const closed = night.status === "done" ? night.stages : night.stage - 1;
    this.sql.exec(`UPDATE ladder_players SET seen_stage = ? WHERE number = ?`, closed, inv.number);
    return json(this.ladderView(inv, night));
  }

  startLadder(before, players, endsAt, body) {
    const minutes = Number(body.stageMinutes);
    const stageMinutes = Number.isFinite(minutes) && minutes > 0 ? Math.min(minutes, 7 * 24 * 60) : 0;
    if (!endsAt && stageMinutes) endsAt = new Date(Date.now() + stageMinutes * 60000).toISOString();
    this.sql.exec(`DELETE FROM ladder_seals`);
    this.sql.exec(`DELETE FROM ladder_players`);
    this.sql.exec(`DELETE FROM ladder_bets`);
    this.sql.exec(`DELETE FROM duel_bets`);
    this.sql.exec(`DELETE FROM notices WHERE kind IN ('duel', 'wait', 'betwon', 'betlost', 'betlevel')`);
    for (const n of players) this.sql.exec(`INSERT INTO ladder_players (number) VALUES (?)`, n);
    this.set("ladder_duels", "[]");
    this.set("night", JSON.stringify({ n: (before ? before.n : 0) + 1, game: "ladder", status: "open", startedAt: Date.now(), endsAt, stage: 1, stages: LADDER.stageCount(players), players, stageMinutes }));
    this.set("night_result", "null");
    this.broadcast({ t: "news" });
    return json({ ok: true, players: players.length });
  }

  // Close the stage: every sealed card is turned. A player who sealed nothing forfeits: they lose all their duels of the stage and their lowest cards are burned.
  // After the last stage the ladder is final: the top three are paid and the bottom player goes home.
  closeLadderStage() {
    const night = this.night();
    if (!night || night.game !== "ladder" || night.status !== "open") return null;
    const players = night.players;
    const duels = this.ladderDuels();
    const used = this.ladderUsed(players, duels);
    const laid = {};
    for (const n of players) {
      const opps = LADDER.stagesFor(players, n)[night.stage - 1] || [];
      const hand = LADDER.CARDS.filter((c) => !used[n].includes(c));
      const seal = this.ladderSealOf(n, night.stage);
      const ok = seal && opps.every((o) => seal.some((p) => p.opp === o && hand.includes(p.card)));
      laid[n] = {};
      if (ok) for (const p of seal) laid[n][p.opp] = [p.card, p.boost ? 1 : 0];
      else LADDER.lowest(hand, opps.length).forEach((c, i) => { laid[n][opps[i]] = [c, 0, 1]; }); // forfeit: lowest cards burned
    }
    const per = LADDER.RULES.perStage;
    for (const pairs of LADDER.rounds(players).slice((night.stage - 1) * per, night.stage * per)) {
      for (const [a, b] of pairs) duels.push({ stage: night.stage, a, b, ca: laid[a][b][0], cb: laid[b][a][0], ba: laid[a][b][1], bb: laid[b][a][1], ...(laid[a][b][2] ? { fa: 1 } : {}), ...(laid[b][a][2] ? { fb: 1 } : {}) });
    }
    this.set("ladder_duels", JSON.stringify(duels));
    // any coin still riding on a duel of this stage is settled now (a duel a no-show was part of)
    for (const d of duels) if (d.stage === night.stage) this.settleDuelBets(d.stage, d.a, d.b, d.fa && d.fb ? 0 : LADDER.score(d)[0]);
    if (night.stage >= night.stages) {
      const table = LADDER.table(players, duels);
      const lp = LADDER.lastPlace(players, duels);
      const prizes = {};
      LADDER.RULES.prizes.forEach((coins, i) => { if (table[i]) prizes[table[i].n] = coins; });
      for (const n of Object.keys(prizes)) this.addCoins(Number(n), prizes[n]);
      this.settleBets(table);
      if (lp.out != null) this.sql.exec(`UPDATE invites SET out = ? WHERE number = ?`, night.n, lp.out);
      this.set("night_result", JSON.stringify({ game: "ladder", out: lp.out, last: lp.last, undecided: lp.out == null ? lp.level : [], prizes, prize: prizes, endedAt: Date.now() }));
      this.set("night", JSON.stringify({ ...night, status: "done", endsAt: "" }));
    } else {
      const endsAt = night.stageMinutes ? new Date(Date.now() + night.stageMinutes * 60000).toISOString() : "";
      // the treasury can be set to open the moment the first stage closes
      if (night.stage === 1) this.treasuryStartIfArmed();
      if (endsAt) this.ctx.storage.setAlarm(Date.parse(endsAt) + 2000);
      this.set("night", JSON.stringify({ ...night, stage: night.stage + 1, endsAt }));
    }
    this.broadcast({ t: "news" });
    return this.night();
  }

  // Set, change or remove the time the open stage closes by itself.
  async hostLadderEnds(request) {
    const night = this.night();
    if (!night || night.game !== "ladder" || night.status !== "open") return json({ error: "No stage is open." }, 409);
    const body = await readJson(request);
    let endsAt = "";
    if (body.endsAt) {
      const at = Date.parse(body.endsAt);
      if (Number.isNaN(at) || at <= Date.now()) return json({ error: "Choose a time that is still to come." }, 400);
      endsAt = new Date(at).toISOString();
      this.ctx.storage.setAlarm(at + 2000);
    }
    this.set("night", JSON.stringify({ ...night, endsAt }));
    this.broadcast({ t: "news" });
    return json({ ok: true, endsAt });
  }

  hostLadderStage() {
    const night = this.night();
    if (!night || night.game !== "ladder" || night.status !== "open") return json({ error: "No stage is open." }, 409);
    const after = this.closeLadderStage();
    return json({ ok: true, status: after.status, stage: after.stage });
  }

  // Undo the game, for testing: prizes and boost coins go back, and whoever it sent home returns.
  resetLadder(night) {
    const result = this.nightResult();
    if (result) for (const n of Object.keys(result.prizes || {})) this.addCoins(Number(n), -result.prizes[n]);
    const duels = this.ladderDuels();
    for (const n of night.players) {
      let spent = this.ladderBoostsSpent(n, duels);
      if (night.status === "open") spent += (this.ladderSealOf(n, night.stage) || []).filter((p) => p.boost).length;
      if (spent) this.addCoins(n, spent * LADDER.RULES.boostPrice);
    }
    for (const b of this.sql.exec(`SELECT * FROM ladder_bets`).toArray()) this.addCoins(b.number, b.stake - b.paid);
    this.sql.exec(`DELETE FROM notices WHERE kind IN ('duel', 'wait', 'betwon', 'betlost', 'betlevel')`);
    for (const b of this.sql.exec(`SELECT * FROM duel_bets`).toArray()) this.addCoins(b.number, b.stake - b.paid);
    this.sql.exec(`DELETE FROM duel_bets`);
    this.sql.exec(`DELETE FROM ladder_bets`);
    this.sql.exec(`UPDATE invites SET out = 0 WHERE out = ?`, night.n);
    this.sql.exec(`DELETE FROM ladder_seals`);
    this.sql.exec(`DELETE FROM ladder_players`);
    this.set("ladder_duels", "[]");
    this.set("night", JSON.stringify(night.n > 1 ? { n: night.n - 1, game: "vaults", status: "done" } : null));
    this.set("night_result", "null");
    this.broadcast({ t: "news" });
    return json({ ok: true });
  }

  hostLadderView(night) {
    const duels = this.ladderDuels();
    return {
      ...night,
      sealed: night.status === "open" ? night.players.filter((n) => !!this.ladderSealOf(n, night.stage)) : [],
      table: LADDER.table(night.players, duels.concat(this.ladderLive(night))),
      bets: this.sql.exec(`SELECT number, score, stake, stage, mult, paid FROM ladder_bets ORDER BY number`).toArray(),
      duelBets: this.sql.exec(`SELECT number, stage, a, b, pick, status, paid FROM duel_bets ORDER BY id`).toArray(),
      // For the GM alone: every card each player has sealed or played, and when they were last in the estate.
      // This is sent only on the host's own routes, never to a player.
      choices: (() => {
        const seen = new Map(this.sql.exec(`SELECT number, at FROM places`).toArray().map((r) => [r.number, r.at]));
        return night.players.map((n) => ({
          n,
          seen: seen.get(n) || 0,
          sealed: night.status === "open" ? this.ladderSealOf(n, night.stage) : null,
          played: duels.filter((d) => d.a === n || d.b === n).map((d) => {
            const am = d.a === n;
            const s = LADDER.score(d);
            return { stage: d.stage, opp: am ? d.b : d.a, card: am ? d.ca : d.cb, boost: am ? d.ba : d.bb, r: am ? s[0] : s[1], forfeit: (am ? d.fa : d.fb) ? 1 : 0 };
          }),
        }));
      })(),
      result: this.nightResult(),
    };
  }

  // ---------- the betting room during The Ladder: a bet on your own final score ----------
  // One bet a player, final once placed. A right guess pays the stake times the stage's number:
  // the earlier the bet, the more it pays. No bets once the last stage has opened.

  betOf(n) {
    const rows = this.sql.exec(`SELECT * FROM ladder_bets WHERE number = ?`, n).toArray();
    return rows.length ? rows[0] : null;
  }

  // Are bets being taken on this game at all (even if this stage is too late)?
  betsOn() {
    const night = this.night();
    return !!night && night.game === "ladder" && this.bettingOpen();
  }

  betsBrief(inv) {
    if (!this.betsOn()) return null;
    const night = this.night();
    const stage = night.status === "open" ? night.stage : night.stages;
    return { taking: night.status === "open" && stage <= BET_PAYS.length, stage, placed: !!this.betOf(inv.number) };
  }

  betView(inv) {
    const night = this.night();
    if (!this.betsOn()) return { on: false, coins: this.balance(inv) };
    const players = night.players;
    const duels = this.ladderDuels();
    const row = LADDER.table(players, duels.concat(this.ladderLive(night))).find((r) => r.n === inv.number);
    const playing = !!row && !!this.ladderPlayer(inv.number);
    const played = row ? row.w + row.l + row.t : 0;
    const left = playing ? players.length - 1 - played : 0;
    const stage = night.status === "open" ? night.stage : night.stages + 1;
    const bet = this.betOf(inv.number);
    const done = night.status === "done";
    return {
      on: true,
      n: night.n,
      you: inv.number,
      playing,
      out: inv.out || 0,
      done,
      stage,
      stages: night.stages,
      pays: BET_PAYS,
      mult: stage <= BET_PAYS.length ? BET_PAYS[stage - 1] : 0,
      taking: !done && stage <= BET_PAYS.length && playing && !inv.out && !bet,
      maxStake: BET_MAX,
      coins: this.balance(inv),
      pts: row ? row.pts : 0,
      left,
      low: row ? row.pts - left : 0,
      high: row ? row.pts + left : 0,
      bet: bet ? { score: bet.score, stake: bet.stake, stage: bet.stage, mult: bet.mult, pays: bet.stake * bet.mult, won: done ? row.pts === bet.score : null, paid: bet.paid } : null,
      duels: this.duelBetView(inv, night),
    };
  }

  betGet(request) {
    const inv = this.inHall(request);
    if (!inv) return json({ error: "You are not in the hall yet." }, 403);
    return json(this.betView(inv));
  }

  async betPlace(request) {
    const inv = this.inHall(request);
    if (!inv) return json({ error: "You are not in the hall yet." }, 403);
    if (inv.out) return json({ error: "You are out of the game." }, 403);
    const v = this.betView(inv);
    if (!v.on) return json({ error: "The betting room is closed." }, 409);
    if (v.bet) return json({ error: "You have already placed your bet. It cannot be changed." }, 409);
    if (!v.playing) return json({ error: "You are not in this game." }, 409);
    if (!v.taking) return json({ error: "Bets are closed for this game." }, 409);
    const body = await readJson(request);
    const score = Number(body.score);
    const stake = Number(body.stake);
    if (!Number.isInteger(score) || score < v.low || score > v.high) return json({ error: "Choose a score you can still finish on: from " + v.low + " to " + v.high + "." }, 400);
    if (!Number.isInteger(stake) || stake < 1 || stake > BET_MAX) return json({ error: "Bet 1, 2 or " + BET_MAX + " coins." }, 400);
    if ((v.coins || 0) < stake) return json({ error: "You do not have " + stake + " coins." }, 409);
    this.addCoins(inv.number, -stake);
    this.sql.exec(`INSERT INTO ladder_bets (number, score, stake, stage, mult, at) VALUES (?, ?, ?, ?, ?, ?)`, inv.number, score, stake, v.stage, v.mult, Date.now());
    this.broadcast({ t: "news" });
    return json(this.betView(this.inHall(request)));
  }

  // ----- a coin on someone else's duel -----
  // Open until both of the two have submitted. A right pick returns two coins, a level duel returns the coin, a wrong pick loses it.
  // r is the duel's result from a's side.
  settleDuelBets(stage, a, b, r) {
    const day = this.puzzleDay();
    for (const bet of this.sql.exec(`SELECT * FROM duel_bets WHERE status = 'open' AND stage = ? AND ((a = ? AND b = ?) OR (a = ? AND b = ?))`, stage, a, b, b, a).toArray()) {
      const winner = r > 0 ? a : r < 0 ? b : 0;
      const status = !winner ? "level" : winner === bet.pick ? "won" : "lost";
      const paid = status === "won" ? bet.stake * DUEL_BET.pays : status === "level" ? bet.stake : 0;
      if (paid) this.addCoins(bet.number, paid);
      this.sql.exec(`UPDATE duel_bets SET status = ?, paid = ? WHERE id = ?`, status, paid, bet.id);
      // n carries the picked player, so the line can name the duel without a lookup
      this.sql.exec(`INSERT INTO notices (kind, n, m, day, at) VALUES (?, ?, ?, ?, ?)`, "bet" + status, bet.pick, bet.number, day, Date.now());
    }
  }

  duelBetView(inv, night) {
    if (!night || night.game !== "ladder") return null;
    const me = inv.number;
    const mine = this.sql.exec(`SELECT a, b, pick, stake, status, paid, stage FROM duel_bets WHERE number = ? ORDER BY id DESC`, me).toArray();
    let open = [];
    if (night.status === "open") {
      const subs = this.ladderSubmitted(night);
      const per = LADDER.RULES.perStage;
      for (const pairs of LADDER.rounds(night.players).slice((night.stage - 1) * per, night.stage * per)) {
        for (const [a, b] of pairs) {
          if (a === me || b === me) continue; // never your own duel
          if (subs.includes(a) && subs.includes(b)) continue; // already decided
          if (mine.some((x) => x.stage === night.stage && ((x.a === a && x.b === b) || (x.a === b && x.b === a)))) continue;
          open.push({ a, b, aIn: subs.includes(a), bIn: subs.includes(b) });
        }
      }
    }
    const used = mine.filter((x) => x.stage === night.stage).length;
    return { stake: DUEL_BET.stake, pays: DUEL_BET.pays, perStage: DUEL_BET.perStage, left: Math.max(0, DUEL_BET.perStage - used), open, mine };
  }

  async duelBetPlace(request) {
    const inv = this.inHall(request);
    if (!inv) return json({ error: "You are not in the hall yet." }, 403);
    if (inv.out) return json({ error: "You are out of the game." }, 403);
    const night = this.night();
    if (!this.betsOn() || night.status !== "open") return json({ error: "The betting room is closed." }, 409);
    const body = await readJson(request);
    const a = Number(body.a), b = Number(body.b), pick = Number(body.pick);
    const v = this.duelBetView(inv, night);
    const duel = v.open.find((d) => (d.a === a && d.b === b) || (d.a === b && d.b === a));
    if (!duel) return json({ error: "That duel is not open for bets. It may just have been decided." }, 409);
    if (pick !== duel.a && pick !== duel.b) return json({ error: "Pick one of the two players." }, 400);
    if (!v.left) return json({ error: "You can bet on " + DUEL_BET.perStage + " duels in a stage." }, 409);
    if ((this.balance(inv) || 0) < DUEL_BET.stake) return json({ error: "A bet costs " + DUEL_BET.stake + " coin. You do not have it." }, 409);
    this.addCoins(inv.number, -DUEL_BET.stake);
    this.sql.exec(`INSERT INTO duel_bets (number, stage, a, b, pick, stake, at) VALUES (?, ?, ?, ?, ?, ?, ?)`, inv.number, night.stage, duel.a, duel.b, pick, DUEL_BET.stake, Date.now());
    this.broadcast({ t: "news" });
    return json(this.betView(this.inHall(request)));
  }

  // The game is over: every bet on the right score is paid.
  settleBets(table) {
    for (const b of this.sql.exec(`SELECT * FROM ladder_bets WHERE paid = 0`).toArray()) {
      const row = table.find((r) => r.n === b.number);
      if (!row || row.pts !== b.score) continue;
      this.addCoins(b.number, b.stake * b.mult);
      this.sql.exec(`UPDATE ladder_bets SET paid = ? WHERE number = ?`, b.stake * b.mult, b.number);
    }
  }

  // ---------- the treasury: one passcode, sixteen puzzles ----------
  // The GM chooses a passcode of sixteen letters. Every player is given one place in it and a picture-logic
  // puzzle of their own; solving it tells them the letter in their place. They tell the others (or do not),
  // and anyone may try the whole passcode at the door. When it opens, every player is paid.
  // The passcode and the grids live only in this game's storage. They are not in the code.

  treasury() {
    return JSON.parse(this.get("treasury", "null"));
  }

  treasuryMake(code, players) {
    const order = players.slice();
    for (let i = order.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; }
    // the grids follow from the passcode alone, so the GM can check all of them before opening the treasury
    let base = 2166136261;
    for (const ch of code) base = Math.imul(base ^ ch.charCodeAt(0), 16777619) >>> 0;
    base = (base % 1000000) + 1;
    const grids = code.split("").map((ch, i) => TREASURY.letterGrid(ch, base + i * 31).map((r) => r.join("")));
    // order[slot] is the player who holds that place; a place nobody holds is open to everyone from the start
    return { on: true, startedAt: Date.now(), code, order: code.split("").map((_, i) => order[i] || 0), grids, help: code.split("").map((_, i) => (order[i] ? 0 : 1)), opened: null, reward: TREASURY_PAY };
  }

  treasuryStartIfArmed() {
    const code = this.get("treasury_armed", "");
    if (!code || this.treasury()) return;
    this.set("treasury_armed", "");
    this.treasuryBegin(code);
  }

  treasuryBegin(code) {
    this.sql.exec(`DELETE FROM treasury_known`);
    this.sql.exec(`DELETE FROM treasury_work`);
    this.sql.exec(`DELETE FROM treasury_tries`);
    this.sql.exec(`DELETE FROM notices WHERE kind IN ('tfound', 'thelp', 'topen', 'tsolved')`);
    this.set("treasury", JSON.stringify(this.treasuryMake(code, this.activeNumbers())));
    this.broadcast({ t: "news" });
  }

  treasuryBrief(inv) {
    const t = this.treasury();
    if (!t || !t.on) return null;
    const slot = t.order.indexOf(inv.number);
    const found = new Set(this.sql.exec(`SELECT k.number FROM treasury_known k`).toArray().map((r) => r.number));
    return { on: true, opened: !!t.opened, slot, solved: slot >= 0 && this.treasuryKnows(inv.number, slot), found: t.order.filter((n) => n && this.treasuryKnows(n, t.order.indexOf(n))).length, of: t.order.length };
  }

  treasuryKnows(number, slot) {
    return this.sql.exec(`SELECT 1 FROM treasury_known WHERE number = ? AND slot = ?`, number, slot).toArray().length > 0;
  }

  treasuryTriesLeft(number) {
    return Math.max(0, TREASURY_TRIES - this.sql.exec(`SELECT COUNT(*) AS c FROM treasury_tries WHERE number = ?`, number).one().c);
  }

  treasuryView(inv) {
    const t = this.treasury();
    if (!t || !t.on) return { on: false };
    const me = inv.number;
    const known = this.sql.exec(`SELECT slot FROM treasury_known WHERE number = ?`, me).toArray().map((r) => r.slot);
    const owners = new Set(this.sql.exec(`SELECT number, slot FROM treasury_known`).toArray().filter((r) => t.order[r.slot] === r.number).map((r) => r.slot));
    return {
      on: true,
      you: me,
      length: t.code.length,
      reward: t.reward,
      pot: t.reward * this.treasurySeats().length,
      mine: t.order.indexOf(me),
      // each place: who holds it, whether they have found their character, and whether its puzzle is open to all
      slots: t.order.map((n, i) => ({ holder: n, found: owners.has(i), help: !!t.help[i] })),
      // the characters this player has earned, by solving their own puzzle or someone else's
      letters: known.map((slot) => ({ slot, letter: t.code[slot] })),
      triesLeft: this.treasuryTriesLeft(me),
      tries: TREASURY_TRIES,
      opened: t.opened ? { by: t.opened.by, at: t.opened.at, code: t.code } : null,
      out: inv.out || 0,
    };
  }

  treasurySeats() {
    return this.sql.exec(`SELECT number FROM invites WHERE status = 'accepted' AND avatar IS NOT NULL ORDER BY number`).toArray().map((r) => r.number);
  }

  treasuryActor(request) {
    const inv = this.inHall(request);
    if (!inv) return { error: json({ error: "You are not in the hall yet." }, 403) };
    const t = this.treasury();
    if (!t || !t.on) return { error: json({ error: "The treasury is not open for play." }, 409) };
    return { inv, t };
  }

  treasuryGet(request) {
    const inv = this.inHall(request);
    if (!inv) return json({ error: "You are not in the hall yet." }, 403);
    return json(this.treasuryView(inv));
  }

  // May this player work on the puzzle of this place? Their own, or one whose holder asked for help.
  treasuryMay(t, number, slot) {
    return Number.isInteger(slot) && slot >= 0 && slot < t.code.length && (t.order[slot] === number || !!t.help[slot]);
  }

  treasuryPuzzle(request, url) {
    const a = this.treasuryActor(request);
    if (a.error) return a.error;
    const slot = Number(url.searchParams.get("slot"));
    if (!this.treasuryMay(a.t, a.inv.number, slot)) return json({ error: "That puzzle is not open to you." }, 403);
    const grid = a.t.grids[slot].map((r) => r.split("").map(Number));
    const work = this.sql.exec(`SELECT cells FROM treasury_work WHERE number = ? AND slot = ?`, a.inv.number, slot).toArray();
    const solved = this.treasuryKnows(a.inv.number, slot);
    return json({ slot, holder: a.t.order[slot], size: TREASURY.SIZE, clues: TREASURY.clues(grid), work: work.length ? work[0].cells : "", solved, letter: solved ? a.t.code[slot] : null, grid: solved ? a.t.grids[slot] : null });
  }

  async treasuryWork(request) {
    const a = this.treasuryActor(request);
    if (a.error) return a.error;
    const body = await readJson(request);
    const slot = Number(body.slot), cells = String(body.cells || "");
    if (!this.treasuryMay(a.t, a.inv.number, slot)) return json({ error: "That puzzle is not open to you." }, 403);
    if (!/^[012]{100}$/.test(cells)) return json({ error: "That is not a grid." }, 400);
    this.sql.exec(`INSERT INTO treasury_work (number, slot, cells, at) VALUES (?, ?, ?, ?) ON CONFLICT(number, slot) DO UPDATE SET cells = excluded.cells, at = excluded.at`, a.inv.number, slot, cells, Date.now());
    return json({ ok: true });
  }

  // A finished grid. Right: the player learns the letter of that place. The holder is told too, if someone else solved it.
  async treasurySolve(request) {
    const a = this.treasuryActor(request);
    if (a.error) return a.error;
    const body = await readJson(request);
    const slot = Number(body.slot), cells = String(body.cells || "");
    const me = a.inv.number, t = a.t;
    if (!this.treasuryMay(t, me, slot)) return json({ error: "That puzzle is not open to you." }, 403);
    if (!/^[012]{100}$/.test(cells)) return json({ error: "That is not a grid." }, 400);
    const want = t.grids[slot].join("");
    const got = cells.replace(/2/g, "0"); // a square marked "empty" counts as empty
    if (got !== want) return json({ ok: false, error: "Not yet. Some squares do not match the numbers." });
    const first = !this.treasuryKnows(me, slot);
    if (first) {
      const day = this.puzzleDay(), holder = t.order[slot];
      this.sql.exec(`INSERT OR IGNORE INTO treasury_known (number, slot, at) VALUES (?, ?, ?)`, me, slot, Date.now());
      if (holder === me) this.sql.exec(`INSERT INTO notices (kind, n, m, day, at) VALUES ('tfound', ?, 0, ?, ?)`, me, day, Date.now());
      else if (holder && !this.treasuryKnows(holder, slot)) {
        // the holder is given their character as well, and told who cracked it
        this.sql.exec(`INSERT OR IGNORE INTO treasury_known (number, slot, at) VALUES (?, ?, ?)`, holder, slot, Date.now());
        this.sql.exec(`INSERT INTO notices (kind, n, m, day, at) VALUES ('tsolved', ?, ?, ?, ?)`, me, holder, day, Date.now());
      }
      this.broadcast({ t: "news" });
    }
    return json({ ok: true, slot, letter: t.code[slot], place: slot + 1, grid: t.grids[slot] });
  }

  // The holder of a place opens their puzzle to everyone, or closes it again.
  async treasuryHelp(request) {
    const a = this.treasuryActor(request);
    if (a.error) return a.error;
    const body = await readJson(request);
    const slot = a.t.order.indexOf(a.inv.number);
    if (slot < 0) return json({ error: "You hold no place in the passcode." }, 409);
    const on = body.on ? 1 : 0;
    if (a.t.help[slot] !== on) {
      a.t.help[slot] = on;
      this.set("treasury", JSON.stringify(a.t));
      if (on) this.sql.exec(`INSERT INTO notices (kind, n, m, day, at) VALUES ('thelp', ?, 0, ?, ?)`, a.inv.number, this.puzzleDay(), Date.now());
      this.broadcast({ t: "news" });
    }
    return json(this.treasuryView(a.inv));
  }

  // Try the whole passcode at the door. A player has a few tries. Right: every seated player is paid.
  async treasuryOpen(request) {
    const a = this.treasuryActor(request);
    if (a.error) return a.error;
    const t = a.t, me = a.inv.number;
    if (a.inv.out) return json({ error: "You are out of the game." }, 403);
    if (t.opened) return json({ error: "The treasury is already open." }, 409);
    const body = await readJson(request);
    const guess = TREASURY.letters(body.code);
    if (guess.length !== t.code.length) return json({ error: "The passcode has " + t.code.length + " letters." }, 400);
    if (!this.treasuryTriesLeft(me)) return json({ error: "You have used your " + TREASURY_TRIES + " tries. Someone else must try." }, 409);
    this.sql.exec(`INSERT INTO treasury_tries (number, guess, at) VALUES (?, ?, ?)`, me, guess, Date.now());
    if (guess !== t.code) {
      const right = guess.split("").filter((ch, i) => ch === t.code[i]).length;
      return json({ ok: false, right, triesLeft: this.treasuryTriesLeft(me) });
    }
    t.opened = { by: me, at: Date.now() };
    this.set("treasury", JSON.stringify(t));
    for (const n of this.treasurySeats()) this.addCoins(n, t.reward);
    this.sql.exec(`INSERT INTO notices (kind, n, m, day, at) VALUES ('topen', ?, 0, ?, ?)`, me, this.puzzleDay(), Date.now());
    this.broadcast({ t: "news" });
    return json({ ok: true, view: this.treasuryView(this.inHall(request)) });
  }

  // The GM: open the treasury now, arm it to open when stage 1 closes, or take it away.
  async hostTreasury(request) {
    const body = await readJson(request);
    if (body.off) {
      const t = this.treasury();
      if (t && t.opened) for (const n of this.treasurySeats()) this.addCoins(n, -t.reward);
      this.set("treasury", "null");
      this.set("treasury_armed", "");
      this.broadcast({ t: "news" });
      return json({ ok: true });
    }
    const code = TREASURY.letters(body.code);
    if (code.length !== 16) return json({ error: "The passcode must be exactly 16 letters, A to Z. This one has " + code.length + "." }, 400);
    if (this.treasury()) return json({ error: "A treasury is already in play. Take it away first." }, 409);
    if (body.arm) { this.set("treasury_armed", code); return json({ ok: true, armed: true }); }
    this.set("treasury_armed", "");
    this.treasuryBegin(code);
    return json({ ok: true, started: true });
  }

  hostTreasuryView() {
    const t = this.treasury();
    const armed = this.get("treasury_armed", "");
    if (!t) return { on: false, armed: armed ? armed : "" };
    const known = this.sql.exec(`SELECT number, slot FROM treasury_known`).toArray();
    return {
      on: true, code: t.code, startedAt: t.startedAt, opened: t.opened,
      slots: t.order.map((n, i) => ({ place: i + 1, letter: t.code[i], holder: n, found: known.some((k) => k.slot === i && k.number === n), help: !!t.help[i], also: known.filter((k) => k.slot === i && k.number !== n).map((k) => k.number) })),
      tries: this.sql.exec(`SELECT number, guess, at FROM treasury_tries ORDER BY id DESC LIMIT 40`).toArray(),
    };
  }

  // ---------- the Gamemaster's figure in the estate ----------
  // The GM can stand in a room as a figure of their own, steered from the console. It is kept with the players'
  // places under the number 0, so every page is told where it is the same way it is told about players.
  // It never goes down to the dungeon, where standing in a cell means something.

  gmPlace() {
    const r = this.sql.exec(`SELECT room, x, y FROM places WHERE number = 0`).toArray();
    return r.length ? [r[0].room, r[0].x, r[0].y] : null;
  }

  hostGmView() {
    return { gm: this.gmPlace(), line: this.get("gm_line", ""), pos: this.positions(), online: this.onlineNumbers() };
  }

  async hostGmMove(request) {
    const body = await readJson(request);
    if (!body.on) {
      this.sql.exec(`DELETE FROM places WHERE number = 0`);
      this.broadcast({ t: "gmoff" });
      return json(this.hostGmView());
    }
    const room = String(body.r || "");
    const x = Math.round(Number(body.x) * 10) / 10, y = Math.round(Number(body.y) * 10) / 10;
    if (!WORLD_ROOMS.includes(room) || room === "dungeon") return json({ error: "The Gamemaster cannot stand there." }, 400);
    if (!Number.isFinite(x) || !Number.isFinite(y) || x < 0 || y < 0 || x > WORLD_MAX || y > WORLD_MAX) return json({ error: "That is outside the set." }, 400);
    this.sql.exec(
      `INSERT INTO places (number, room, x, y, at) VALUES (0, ?, ?, ?, ?) ON CONFLICT(number) DO UPDATE SET room = excluded.room, x = excluded.x, y = excluded.y, at = excluded.at`,
      room, x, y, Date.now(),
    );
    this.broadcast({ t: "m", n: 0, r: room, x, y });
    return json(this.hostGmView());
  }

  // The line over the Gamemaster's head. It is kept and stays there, in whatever room he stands,
  // until the GM writes another or clears it with an empty one.
  async hostGmSay(request) {
    const body = await readJson(request);
    const text = String(body.text || "").trim().slice(0, 160);
    this.set("gm_line", text);
    this.broadcast({ t: "gmsay", text });
    return json({ ok: true, line: text });
  }

  // ---------- the dungeon: who went down, and when ----------

  doorLog(request) {
    const inv = this.inHall(request);
    if (!inv) return json({ error: "You are not in the hall yet." }, 403);
    const entries = this.sql.exec(`SELECT number, cell, at FROM doorlog ORDER BY id DESC LIMIT 40`).toArray();
    const now = {};
    for (let c = 1; c <= CELLS.length; c++) now[c] = this.cellMates(c);
    return json({ entries: entries.map((e) => ({ n: e.number, cell: e.cell, at: e.at })), now, mine: this.cellOf(inv.number) });
  }

  // ---------- live: who is in the hall right now, and where they walk ----------

  positions() {
    const out = {};
    for (const p of this.sql.exec(`SELECT number, room, x, y FROM places`).toArray()) out[p.number] = [p.room, p.x, p.y];
    return out;
  }

  onlineNumbers() {
    const seen = new Set();
    for (const ws of this.ctx.getWebSockets()) {
      const tag = ws.deserializeAttachment();
      if (tag && tag.n) seen.add(tag.n);
    }
    return [...seen];
  }

  broadcast(message, except) {
    const text = JSON.stringify(message);
    for (const ws of this.ctx.getWebSockets()) {
      if (ws === except) continue;
      try {
        ws.send(text);
      } catch {
        // a socket that has gone away is cleaned up when it closes
      }
    }
  }

  savePosition(number, room, x, y) {
    x = Number(x);
    y = Number(y);
    if (!WORLD_ROOMS.includes(room)) return null;
    if (!Number.isFinite(x) || !Number.isFinite(y) || x < 0 || y < 0 || x > WORLD_MAX || y > WORLD_MAX) return null;
    x = Math.round(x * 10) / 10;
    y = Math.round(y * 10) / 10;
    const cell = cellAt(room, x, y);
    if (cell && cell !== this.cellOf(number)) this.sql.exec(`INSERT INTO doorlog (number, cell, at) VALUES (?, ?, ?)`, number, cell, Date.now());
    this.sql.exec(
      `INSERT INTO places (number, room, x, y, at) VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(number) DO UPDATE SET room = excluded.room, x = excluded.x, y = excluded.y, at = excluded.at`,
      number,
      room,
      x,
      y,
      Date.now(),
    );
    return [room, x, y];
  }

  live(request) {
    if (request.headers.get("Upgrade") !== "websocket") return json({ error: "Expected a live connection." }, 426);
    const inv = this.inHall(request);
    if (!inv) return json({ error: "You are not in the hall yet." }, 403);
    const pair = new WebSocketPair();
    const client = pair[0];
    const server = pair[1];
    const wasHere = this.onlineNumbers().includes(inv.number);
    this.ctx.acceptWebSocket(server);
    server.serializeAttachment({ n: inv.number, at: 0, count: 0 });
    server.send(JSON.stringify({ t: "hi", online: this.onlineNumbers(), pos: this.positions(), gmLine: this.get("gm_line", "") }));
    if (!wasHere) this.broadcast({ t: "on", n: inv.number }, server);
    return new Response(null, { status: 101, webSocket: client });
  }

  async move(request) {
    const inv = this.inHall(request);
    if (!inv) return json({ error: "You are not in the hall yet." }, 403);
    const body = await readJson(request);
    const at = this.savePosition(inv.number, String(body.r || ""), body.x, body.y);
    if (!at) return json({ error: "That is outside the set." }, 400);
    this.broadcast({ t: body.t === "r" ? "r" : "m", n: inv.number, r: at[0], x: at[1], y: at[2] });
    return json({ ok: true });
  }

  webSocketMessage(ws, raw) {
    const tag = ws.deserializeAttachment();
    if (!tag || !tag.n || typeof raw !== "string" || raw.length > 200) return;
    // At most 12 messages a second from one connection.
    const now = Date.now();
    if (now - tag.at > 1000) {
      tag.at = now;
      tag.count = 0;
    }
    tag.count += 1;
    ws.serializeAttachment(tag);
    if (tag.count > 12) return;
    let m;
    try {
      m = JSON.parse(raw);
    } catch {
      return;
    }
    if (m.t !== "m" && m.t !== "p" && m.t !== "r") return;
    const at = this.savePosition(tag.n, String(m.r || ""), m.x, m.y);
    if (at) this.broadcast({ t: m.t, n: tag.n, r: at[0], x: at[1], y: at[2] }, ws);
  }

  webSocketClose(ws) {
    this.leftLive(ws);
  }

  webSocketError(ws) {
    this.leftLive(ws);
  }

  leftLive(ws) {
    const tag = ws.deserializeAttachment();
    try {
      ws.close(1000, "bye");
    } catch {
      // already closed
    }
    if (!tag || !tag.n) return;
    const others = this.ctx.getWebSockets().some((other) => {
      if (other === ws) return false;
      const t = other.deserializeAttachment();
      return t && t.n === tag.n;
    });
    if (!others) this.broadcast({ t: "off", n: tag.n }, ws);
  }

  // ---------- host ----------

  async hostLogin(request, url) {
    const body = await readJson(request);
    const pass = String(body.passphrase || "");
    const existing = this.get("host_hash");
    // Counted for each address, so a player guessing passphrases locks out themselves and not the GM.
    const who = (request.headers.get("CF-Connecting-IP") || "local").replace(/[^0-9A-Fa-f:.]/g, "").slice(0, 45) || "local";
    const failsKey = "login_fails:" + who, lockKey = "login_locked_until:" + who;

    if (!existing) {
      if (pass.length < 8) return json({ error: "Choose a passphrase of at least 8 characters." }, 400);
      const salt = randomToken(16);
      this.set("host_salt", salt);
      this.set("host_hash", await hashPass(pass, salt));
    } else {
      const lockedUntil = Number(this.get(lockKey, "0"));
      if (Date.now() < lockedUntil) {
        return json({ error: "Too many wrong attempts. Wait fifteen minutes and try again." }, 429);
      }
      const hash = await hashPass(pass, this.get("host_salt", ""));
      if (hash !== existing) {
        const fails = Number(this.get(failsKey, "0")) + 1;
        if (fails >= MAX_LOGIN_FAILS) {
          this.set(failsKey, 0);
          this.set(lockKey, Date.now() + LOCK_MS);
        } else {
          this.set(failsKey, fails);
        }
        return json({ error: "That passphrase is not correct." }, 401);
      }
      this.set(failsKey, 0);
    }

    const id = randomToken(24);
    this.sql.exec(`INSERT INTO host_sessions (id, created_at) VALUES (?, ?)`, id, Date.now());
    return json({ ok: true }, 200, { "Set-Cookie": cookie(HOST_COOKIE, id, COOKIE_AGE, url) });
  }

  hostLogout(request, url) {
    const id = readCookie(request, HOST_COOKIE);
    if (id) this.sql.exec(`DELETE FROM host_sessions WHERE id = ?`, id);
    return json({ ok: true }, 200, { "Set-Cookie": cookie(HOST_COOKIE, "", 0, url) });
  }

  hostState(request) {
    const hasHost = !!this.get("host_hash");
    if (!this.hostAuthed(request)) return json({ authed: false, hasHost });
    const invites = this.sql
      .exec(`SELECT * FROM invites ORDER BY created_at ASC, name ASC`)
      .toArray()
      .map((r) => ({
        token: r.token,
        name: r.name,
        note: r.note,
        status: r.status,
        number: r.number,
        bag: r.bag,
        coins: r.coins,
        opened: !!r.opened_at,
        entered: !!r.entered_at,
        sealed: r.bag != null,
        extra: r.extra || 0,
        out: r.out || 0,
        avatar: parseAvatar(r.avatar),
        committed: !!r.committed,
        word: r.code,
      }));
    const gmMark = (key) => {
      const rows = this.sql.exec(`SELECT last_id FROM reads WHERE who = 'gm' AND key = ?`, key).toArray();
      return rows.length ? rows[0].last_id : 0;
    };
    const study = {};
    for (const m of this.sql.exec(`SELECT id, to_n FROM messages WHERE room = 'study' AND from_n != ?`, GM).toArray()) {
      if (m.id > gmMark("study:" + m.to_n)) study[m.to_n] = (study[m.to_n] || 0) + 1;
    }
    const inbox = {
      study,
      board: this.sql.exec(`SELECT COUNT(*) AS n FROM messages WHERE room = 'board' AND from_n != ? AND id > ?`, GM, gmMark("board")).one().n,
      table: this.sql.exec(`SELECT COUNT(*) AS n FROM messages WHERE room = 'table' AND from_n != ? AND id > ?`, GM, gmMark("table")).one().n,
      whispers: this.sql.exec(`SELECT COUNT(*) AS n FROM messages WHERE room = 'whisper' AND id > ?`, gmMark("whispers")).one().n,
      cells: this.sql.exec(`SELECT COUNT(*) AS n FROM messages WHERE room LIKE 'cell%' AND id > ?`, gmMark("cells")).one().n,
    };
    return json({
      authed: true,
      hasHost,
      seats: SEATS,
      bag1Coins: BAG1_COINS,
      bag2Pot: BAG2_POT,
      phase: this.phase(),
      opensAt: this.get("opens_at", ""),
      replyBy: this.get("reply_by", ""),
      nextAt: this.get("next_at", ""),
      nextName: this.get("next_name", NEXT_NAME),
      autoOpen: this.get("auto_open", "0") === "1",
      wrongWords: Number(this.get("word_wrong:" + Math.floor(Date.now() / 3600000), "0")),
      bettingOpen: this.bettingOpen(),
      showChoices: this.showChoices(),
      letter: this.letter(),
      defaultLetter: DEFAULT_LETTER,
      invites,
      inbox,
      night: this.night(),
      reveal: JSON.parse(this.get("reveal", "null")),
    });
  }

  // Everything the rooms record: today's puzzle and every player's answer, every deal, and the door log.
  // For the GM alone: what each player has done, so the most and least active can be told apart.
  hostActive(players) {
    const count = (sql, ...args) => new Map(this.sql.exec(sql, ...args).toArray().map((r) => [r.n, r.c]));
    const seen = new Map(this.sql.exec(`SELECT number, at FROM places`).toArray().map((r) => [r.number, r.at]));
    const online = this.onlineNumbers();
    const whispers = count(`SELECT from_n AS n, COUNT(*) AS c FROM messages WHERE room = 'whisper' AND removed = 0 GROUP BY from_n`);
    const partners = count(`SELECT from_n AS n, COUNT(DISTINCT to_n) AS c FROM messages WHERE room = 'whisper' AND removed = 0 GROUP BY from_n`);
    const casts = count(`SELECT from_n AS n, COUNT(*) AS c FROM messages WHERE room = 'table' AND removed = 0 GROUP BY from_n`);
    const asks = count(`SELECT from_n AS n, COUNT(*) AS c FROM messages WHERE room = 'study' AND removed = 0 AND from_n != 0 GROUP BY from_n`);
    const solved = count(`SELECT number AS n, COUNT(*) AS c FROM puzzle_tries WHERE solved = 1 GROUP BY number`);
    const tried = count(`SELECT number AS n, COUNT(*) AS c FROM puzzle_tries WHERE tries > 0 GROUP BY number`);
    const deals = count(`SELECT a AS n, COUNT(*) AS c FROM deals GROUP BY a`);
    const stages = count(`SELECT number AS n, COUNT(*) AS c FROM ladder_seals GROUP BY number`);
    const bets = count(`SELECT number AS n, COUNT(*) AS c FROM ladder_bets GROUP BY number`);
    const now = Date.now();
    return players.map((p) => {
      const n = p.number, at = seen.get(n) || 0, hours = at ? (now - at) / 3600000 : Infinity;
      const x = {
        n, seen: at, online: online.includes(n),
        whispers: whispers.get(n) || 0, partners: partners.get(n) || 0, casts: casts.get(n) || 0, asks: asks.get(n) || 0,
        solved: solved.get(n) || 0, tried: tried.get(n) || 0, deals: deals.get(n) || 0, stages: stages.get(n) || 0, bet: bets.get(n) || 0,
      };
      // one number to sort by: playing counts most, then talking, then simply being around
      x.score = x.stages * 4 + x.bet * 2 + x.solved * 3 + Math.max(0, x.tried - x.solved) + x.deals * 2 +
        Math.min(10, x.whispers) + x.partners * 2 + x.casts * 2 + x.asks +
        (x.online ? 5 : hours < 1 ? 4 : hours < 6 ? 3 : hours < 24 ? 1 : 0);
      return x;
    }).sort((a, b) => b.score - a.score || b.seen - a.seen);
  }

  hostActivity() {
    this.expireDeals();
    const day = this.puzzleDay();
    const players = this.sql.exec(`SELECT number, name FROM invites WHERE status = 'accepted' AND avatar IS NOT NULL ORDER BY number`).toArray();
    const solvedEver = new Map(this.sql.exec(`SELECT number AS n, COUNT(*) AS c FROM puzzle_tries WHERE solved = 1 GROUP BY number`).toArray().map((r) => [r.n, r.c]));
    const sample = players.length ? this.puzzleFor(players[0].number, day) : null;
    const cells = {};
    for (let c = 1; c <= CELLS.length; c++) cells[c] = this.cellMates(c);
    return json({
      resetAt: this.dayEnds(),
      puzzle: {
        held: this.puzzleHeld(),
        endsAt: this.puzzleEnds(),
        title: sample ? sample.title : "",
        players: players.map((p) => {
          const row = this.puzzleRow(p.number, day);
          return { n: p.number, tries: row.tries, solved: !!row.solved, answer: this.puzzleFor(p.number, day).answer, total: solvedEver.get(p.number) || 0 };
        }),
      },
      deals: this.sql
        .exec(`SELECT * FROM deals ORDER BY id DESC LIMIT 80`)
        .toArray()
        .map((d) => ({ id: d.id, a: d.a, b: d.b, aChoice: d.a_choice, bChoice: d.b_choice, aNet: d.a_net, bNet: d.b_net, status: d.status, at: d.settled_at || d.created_at })),
      doors: this.sql.exec(`SELECT number, cell, at FROM doorlog ORDER BY id DESC LIMIT 80`).toArray().map((e) => ({ n: e.number, cell: e.cell, at: e.at })),
      cells,
      board: {
        pos: this.positions(),
        online: this.onlineNumbers(),
        players: this.sql.exec(`SELECT number, name, avatar, out FROM invites WHERE status = 'accepted' AND avatar IS NOT NULL ORDER BY number`).toArray()
          .map((r) => ({ n: r.number, name: r.name, avatar: parseAvatar(r.avatar), out: r.out || 0 })),
        // accepted and numbered, but still in the opening
        arriving: this.sql.exec(`SELECT number, name FROM invites WHERE status = 'accepted' AND avatar IS NULL AND number IS NOT NULL ORDER BY number`).toArray()
          .map((r) => ({ n: r.number, name: r.name })),
        seats: SEATS,
      },
      night: this.hostNightView(),
      active: this.hostActive(players),
      treasury: this.hostTreasuryView(),
    });
  }

  // The GM gives or takes coins by hand: a prize, a penalty, or the result of a night played off the site.
  async hostCoins(request) {
    const body = await readJson(request);
    if (this.phase() !== "revealed") return json({ error: "Nobody holds coins until the bags open." }, 409);
    const amount = Number(body.amount);
    if (!Number.isInteger(amount) || amount === 0 || Math.abs(amount) > 999) return json({ error: "Give a whole number of coins, like 3 or -2." }, 400);
    const player = this.playerByNumber(Number(body.number));
    if (!player) return json({ error: "That player has not arrived." }, 400);
    if (this.balance(player) + amount < 0) return json({ error: `Player ${player.number} only holds ${this.balance(player)}.` }, 409);
    this.addCoins(player.number, amount);
    this.broadcast({ t: "news" });
    return json({ ok: true, coins: this.balance(player) + amount });
  }

  async hostCreateInvites(request) {
    const body = await readJson(request);
    const names = (Array.isArray(body.names) ? body.names : [])
      .map((n) => String(n).trim().slice(0, 60))
      .filter(Boolean)
      .slice(0, 40);
    if (!names.length) return json({ error: "Enter at least one name." }, 400);
    let t = Date.now();
    for (const name of names) {
      this.sql.exec(
        `INSERT INTO invites (token, name, created_at, code) VALUES (?, ?, ?, ?)`,
        randomToken(16),
        name,
        t++,
        this.newWord(),
      );
    }
    return json({ ok: true, created: names.length });
  }

  async hostUpdateInvite(request) {
    const body = await readJson(request);
    const inv = this.inviteByToken(String(body.token || ""));
    if (!inv) return json({ error: "That invitation no longer exists." }, 404);
    const name = body.name != null ? String(body.name).trim().slice(0, 60) || inv.name : inv.name;
    const note = body.note != null ? String(body.note).trim().slice(0, 280) : inv.note;
    this.sql.exec(`UPDATE invites SET name = ?, note = ? WHERE token = ?`, name, note, inv.token);
    return json({ ok: true });
  }

  // A new word for one player. It also signs that player out everywhere, in case the old word got out.
  async hostRewordInvite(request) {
    const body = await readJson(request);
    const inv = this.inviteByToken(String(body.token || ""));
    if (!inv) return json({ error: "That invitation no longer exists." }, 404);
    const word = this.newWord();
    this.sql.exec(`UPDATE invites SET code = ?, token = ? WHERE token = ?`, word, randomToken(16), inv.token);
    return json({ ok: true, word });
  }

  async hostDeleteInvite(request) {
    const body = await readJson(request);
    const inv = this.inviteByToken(String(body.token || ""));
    if (!inv) return json({ ok: true });
    if (this.phase() === "revealed" && inv.status === "accepted") {
      return json({ error: "Undo the reveal before removing a player." }, 409);
    }
    this.forgetPlayer(inv.number);
    this.sql.exec(`DELETE FROM invites WHERE token = ?`, inv.token);
    return json({ ok: true });
  }

  // A seat that is freed must not leave its old messages for the next player who draws that number.
  forgetPlayer(number) {
    if (number == null) return;
    this.sql.exec(`DELETE FROM messages WHERE from_n = ? OR to_n = ?`, number, number);
    this.sql.exec(`DELETE FROM reads WHERE who = ? OR key = ? OR key = ?`, "p" + number, "w:" + number, "study:" + number);
    this.sql.exec(`DELETE FROM places WHERE number = ?`, number);
    this.sql.exec(`DELETE FROM puzzle_tries WHERE number = ?`, number);
    this.sql.exec(`DELETE FROM notices WHERE n = ?`, number);
    this.sql.exec(`DELETE FROM doorlog WHERE number = ?`, number);
    this.sql.exec(`DELETE FROM night_plays WHERE number = ?`, number);
    for (const d of this.sql.exec(`SELECT id, a FROM deals WHERE status = 'open' AND b = ?`, number).toArray()) this.addCoins(d.a, DEAL_STAKE);
    this.sql.exec(`DELETE FROM deals WHERE a = ? OR b = ?`, number, number);
  }

  async hostResetInvite(request) {
    const body = await readJson(request);
    if (this.phase() === "revealed") return json({ error: "Undo the reveal before resetting a seat." }, 409);
    const inv = this.inviteByToken(String(body.token || ""));
    if (!inv) return json({ ok: true });
    this.forgetPlayer(inv.number);
    this.sql.exec(
      `UPDATE invites SET status = 'invited', number = NULL, bag = NULL, coins = NULL, extra = 0, out = 0, committed = 0, avatar = NULL,
       responded_at = NULL, entered_at = NULL, sealed_at = NULL, seen_reveal = 0 WHERE token = ?`,
      inv.token,
    );
    return json({ ok: true });
  }

  async hostSettings(request) {
    const body = await readJson(request);
    if (body.letter && typeof body.letter === "object") {
      const clean = {};
      for (const key of Object.keys(DEFAULT_LETTER)) {
        if (body.letter[key] != null) clean[key] = String(body.letter[key]).slice(0, 4000);
      }
      this.set("letter", JSON.stringify({ ...this.letter(), ...clean }));
    }
    if (body.nextName != null) this.set("next_name", String(body.nextName).trim().slice(0, 40) || NEXT_NAME);
    for (const [field, key] of [["opensAt", "opens_at"], ["replyBy", "reply_by"], ["nextAt", "next_at"]]) {
      if (body[field] != null) {
        const value = String(body[field]);
        if (value && Number.isNaN(Date.parse(value))) return json({ error: "That date could not be read." }, 400);
        this.set(key, value ? new Date(value).toISOString() : "");
      }
    }
    if (body.autoOpen != null) this.set("auto_open", body.autoOpen ? "1" : "0");
    if (body.bettingOpen != null) this.set("betting_open", body.bettingOpen ? "1" : "0");
    if (body.showChoices != null) this.set("show_choices", body.showChoices ? "1" : "0");
    return json({ ok: true });
  }

  hostReadMessages(url) {
    const room = url.searchParams.get("room");
    const withN = Number(url.searchParams.get("with"));
    let rows;
    let key = room;
    if (room === "table" || room === "board") {
      rows = this.sql.exec(`SELECT * FROM messages WHERE room = ? ORDER BY id ASC`, room).toArray();
    } else if (room === "whispers") {
      rows = this.sql.exec(`SELECT * FROM messages WHERE room = 'whisper' ORDER BY id ASC`).toArray();
    } else if (room === "cells") {
      rows = this.sql.exec(`SELECT * FROM messages WHERE room LIKE 'cell%' ORDER BY id ASC`).toArray();
    } else if (room === "study" && Number.isInteger(withN) && withN >= 1 && withN <= SEATS) {
      rows = this.sql.exec(`SELECT * FROM messages WHERE room = 'study' AND to_n = ? ORDER BY id ASC`, withN).toArray();
      key = "study:" + withN;
    } else {
      return json({ error: "That room does not exist." }, 400);
    }
    rows = rows.slice(-500);
    if (rows.length) {
      this.sql.exec(
        `INSERT INTO reads (who, key, last_id) VALUES ('gm', ?, ?) ON CONFLICT(who, key) DO UPDATE SET last_id = MAX(last_id, excluded.last_id)`,
        key,
        rows[rows.length - 1].id,
      );
    }
    return json({ messages: rows.map(publicMessage) });
  }

  async hostPostMessage(request) {
    const body = await readJson(request);
    const text = String(body.body || "").trim();
    if (!text) return json({ error: "Write something first." }, 400);
    if (text.length > MESSAGE_MAX * 3) return json({ error: "That is too long." }, 400);
    const room = String(body.room || "");
    let to = null;
    let parent = null;
    if (room === "study") {
      to = Number(body.to);
      if (!Number.isInteger(to) || to < 1 || to > SEATS) return json({ error: "Choose a player." }, 400);
    } else if (room === "board") {
      if (body.parent != null) {
        parent = Number(body.parent);
        const found = this.sql.exec(`SELECT id FROM messages WHERE room = 'board' AND parent IS NULL AND id = ?`, parent).toArray();
        if (!found.length) return json({ error: "That question no longer exists." }, 404);
      }
    } else if (room !== "table") {
      return json({ error: "That room does not exist." }, 400);
    }
    this.sql.exec(`INSERT INTO messages (room, from_n, to_n, parent, body, at) VALUES (?, ?, ?, ?, ?, ?)`, room, GM, to, parent, text, Date.now());
    this.broadcast({ t: "news" });
    return json({ ok: true });
  }

  async hostRemoveMessage(request) {
    const body = await readJson(request);
    this.sql.exec(`UPDATE messages SET removed = 1 WHERE id = ?`, Number(body.id) || 0);
    return json({ ok: true });
  }

  doReveal() {
    const players = this.sql
      .exec(`SELECT token, number, bag FROM invites WHERE status = 'accepted' AND out >= 0 ORDER BY number ASC`)
      .toArray();
    if (!players.length) return false;

    const inBag2 = players.filter((p) => p.bag === 2);
    const share = inBag2.length ? Math.floor(BAG2_POT / inBag2.length) : 0;
    const payout = (p) => (p.bag === 1 ? BAG1_COINS : p.bag === 2 ? share : 0);
    for (const p of players) {
      this.sql.exec(`UPDATE invites SET coins = ?, seen_reveal = 0 WHERE token = ?`, payout(p), p.token);
    }

    // The order in which the Bag 2 players are read out, fixed once for everyone.
    const order = inBag2.map((p) => p.number);
    for (let i = order.length - 1; i > 0; i--) {
      const j = randomInt(i + 1);
      [order[i], order[j]] = [order[j], order[i]];
    }

    this.set(
      "reveal",
      JSON.stringify({
        at: new Date().toISOString(),
        pot: BAG2_POT,
        bag1Coins: BAG1_COINS,
        bag1Count: players.filter((p) => p.bag === 1).length,
        bag2Count: inBag2.length,
        bag2Share: share,
        leftover: inBag2.length ? BAG2_POT - share * inBag2.length : BAG2_POT,
        unsealed: players.filter((p) => p.bag == null).map((p) => p.number),
        order,
        results: players.map((p) => ({ number: p.number, bag: p.bag, coins: payout(p) })),
      }),
    );
    this.set("phase", "revealed");
    this.broadcast({ t: "news" });
    return true;
  }

  hostReveal() {
    if (this.phase() === "revealed") return json({ ok: true });
    if (!this.doReveal()) return json({ error: "Nobody has entered yet." }, 409);
    return json({ ok: true });
  }

  hostUnreveal() {
    this.set("phase", "open");
    this.set("reveal", "null");
    this.set("auto_open", "0");
    this.sql.exec(`UPDATE invites SET coins = NULL, seen_reveal = 0`);
    return json({ ok: true });
  }
}

// ---------- shared utilities ----------

function json(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff", ...extraHeaders },
  });
}

async function readJson(request) {
  try {
    return (await request.json()) || {};
  } catch {
    return {};
  }
}

function parseAvatar(value) {
  if (!value) return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

// A portrait is seven small whole numbers. Anything else is refused.
function cleanAvatar(value) {
  if (!value || typeof value !== "object") return null;
  const out = {};
  for (const [key, max] of Object.entries(AVATAR_LIMITS)) {
    const n = value[key] == null ? 0 : Number(value[key]);
    if (!Number.isInteger(n) || n < 0 || n >= max) return null;
    out[key] = n;
  }
  return out;
}

function publicMessage(m) {
  return {
    id: m.id,
    room: m.room,
    from: m.from_n,
    to: m.to_n,
    parent: m.parent,
    body: m.removed ? "" : m.body,
    removed: !!m.removed,
    at: m.at,
    heard: m.heard || undefined,
  };
}

// Which dungeon cell a point is in: 1, 2 or 3, or 0 for none.
function cellAt(room, x, y) {
  if (room !== "dungeon") return 0;
  for (let i = 0; i < CELLS.length; i++) {
    const c = CELLS[i];
    if (x >= c[0] && x <= c[2] && y >= c[1] && y <= c[3]) return i + 1;
  }
  return 0;
}

function cleanToken(value) {
  return String(value || "").replace(/[^A-Za-z0-9_-]/g, "").slice(0, 64);
}

function cookie(name, value, maxAge, url) {
  const secure = url && url.protocol === "https:" ? "; Secure" : "";
  return `${name}=${value}; Path=/; Max-Age=${maxAge}; HttpOnly${secure}; SameSite=Lax`;
}

function readCookie(request, name) {
  const header = request.headers.get("Cookie") || "";
  for (const part of header.split(";")) {
    const [k, ...rest] = part.trim().split("=");
    if (k === name) return rest.join("=");
  }
  return "";
}

function randomToken(bytes) {
  const buf = new Uint8Array(bytes);
  crypto.getRandomValues(buf);
  let s = "";
  for (const b of buf) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function randomInt(max) {
  // Uniform integer in [0, max) without modulo bias.
  const limit = Math.floor(0x100000000 / max) * max;
  const buf = new Uint32Array(1);
  do {
    crypto.getRandomValues(buf);
  } while (buf[0] >= limit);
  return buf[0] % max;
}

async function hashPass(pass, salt) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", enc.encode(pass), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt: enc.encode(salt), iterations: 10000, hash: "SHA-256" },
    key,
    256,
  );
  return [...new Uint8Array(bits)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
