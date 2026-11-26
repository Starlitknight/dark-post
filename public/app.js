// Dark Post: the guest site.
// The game speaks one short line at a time, typed out on a black screen, and
// moves through short scenes. The player's real state always comes from the server.
(function () {
  "use strict";

  var DP = window.DP;
  var ART = window.DP_ART;
  var AV = window.DP_AVATAR;
  var esc = DP.esc;
  var root = document.getElementById("app");
  var query = new URLSearchParams(location.search);
  var demo = query.get("demo");
  var token = ""; // seats are held in a cookie now; personal links are gone
  var switching = !!query.get("switch"); // ?switch=1: type a different word on this device
  var reduced = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var instant = reduced || !!query.get("notype");

  var me = null;
  var ui = { scene: "", pick: 0, confirm: false, declineAsk: false, drawn: false, drawing: false, tour: 0, stamped: false, k: 4, busy: false, withN: 0, face: null, tab: "hair", cell: 0, card: 0, pz: null, deals: null, dealTo: 0, dealPick: null, dealResult: null, night: null, v: null, vstep: 0 };
  var hall = null; // seats, unread counts and whisper threads, from the server
  var room = null; // the chat room that is open, if any
  var lastKey = "";
  var timers = [];
  var ticker = null;
  var poller = null;
  var toastTimer = null;

  // The order of play: the letter, then ARRIVE, then INTRO and the choice, then a character, then the tour and the hall.
  var ARRIVE = ["welcome", "draw"];
  var INTRO = ["sixteen", "title", "coins", "bags", "bag1", "bag2"];
  var RULES = ["bags", "bag1", "bag2"];
  var REVEAL = ["gate", "crowd1", "crowd", "you"];
  var HALL = ["gamecall", "tour", "hall", "table", "onair", "whispers", "whisper", "study", "board", "players", "standings", "arena", "puzzle", "deal", "sky", "shop", "doorlog", "cell", "tonight", "vbrief", "vreveal", "guide", "ledger", "face", "look"].concat(RULES);

  // ---------- talking to the server ----------

  function api(method, path, body) {
    if (demo) return demoApi(method, path, body);
    return fetch(path, {
      method: method,
      credentials: "same-origin",
      cache: "no-store",
      headers: { "Content-Type": "application/json", "X-Seat": token },
      body: body ? JSON.stringify(body) : undefined,
    }).then(
      function (res) {
        return res
          .json()
          .catch(function () {
            return {};
          })
          .then(function (data) {
            if (!res.ok) throw new Error(data.error || "Something went wrong. Try again.");
            return data;
          });
      },
      function () {
        throw new Error("Could not reach Dark Post. Check your connection and try again.");
      }
    );
  }

  // The word typed on the front page. A right one puts this player's seat on the device.
  function claimWord() {
    var input = $("word"), note = $("word-note");
    if (!input || ui.busy) return;
    var word = input.value.toUpperCase().replace(/[^A-Z]/g, "");
    if (word.length !== 5) { note.textContent = "Your word has five letters."; note.classList.add("bad"); return; }
    ui.busy = true;
    note.classList.remove("bad");
    note.textContent = "One moment.";
    api("POST", "/api/claim", { word: word })
      .then(function () {
        switching = false;
        if (query.get("switch") && window.history && history.replaceState) history.replaceState(null, "", location.pathname);
        if (demo) { me = demoMake("letter"); return render(); }
        return load();
      })
      .catch(function (err) { note.textContent = err.message; note.classList.add("bad"); input.select(); })
      .then(function () { ui.busy = false; });
  }

  function load() {
    return api("GET", "/api/me").then(function (data) {
      me = data;
      render();
    });
  }

  function act(method, path, body, before) {
    if (ui.busy) return Promise.resolve();
    ui.busy = true;
    return api(method, path, body)
      .then(function () {
        if (before) before();
        return load();
      })
      .catch(function (err) {
        toast(err.message);
        return load().catch(function () {});
      })
      .then(function () {
        ui.busy = false;
      });
  }

  function toast(message) {
    var old = document.querySelector(".toast");
    if (old) old.remove();
    var el = document.createElement("div");
    el.className = "toast";
    el.setAttribute("role", "alert");
    el.textContent = message;
    document.body.appendChild(el);
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () {
      el.remove();
    }, 3200);
  }

  // ---------- small helpers ----------

  function $(id) {
    return document.getElementById(id);
  }

  // A tab left open and untouched slows down, then stops asking the server for news.
  var lastActive = Date.now();
  var pollTick = 0;
  ["pointerdown", "keydown", "touchstart"].forEach(function (name) {
    document.addEventListener(name, function () { lastActive = Date.now(); }, { passive: true });
  });

  function quiet() {
    if (document.hidden) return true;
    var idle = Date.now() - lastActive;
    pollTick += 1;
    if (idle > 15 * 60000) return true;
    if (idle > 3 * 60000) return pollTick % 6 !== 0;
    return false;
  }

  function later(fn, ms) {
    var t = setTimeout(fn, ms);
    timers.push(t);
    return t;
  }

  function clearTimers() {
    timers.forEach(clearTimeout);
    timers = [];
    clearInterval(ticker);
    clearInterval(poller);
    room = null;
    if (stage) cancelAnimationFrame(stage.raf);
    stage = null;
    actors = {};
    stopNarration();
  }

  function share(k) {
    return k > 0 ? Math.floor(me.bag2Pot / k) : 0;
  }

  function plural(n, one, many) {
    return n + " " + (n === 1 ? one : many);
  }

  function introKey() {
    return "dp_intro_" + (token || "seat");
  }

  function introSeen() {
    if (demo) return false;
    try {
      return window.localStorage.getItem(introKey()) === "1";
    } catch (e) {
      return false;
    }
  }

  function markIntroSeen() {
    if (demo) return;
    try {
      window.localStorage.setItem(introKey(), "1");
    } catch (e) {}
  }

  function show(id) {
    var el = $(id);
    if (el) {
      el.classList.add("on");
      el.inert = false;
      if (id === "go") {
        var next = root.querySelector(".brief-next");
        if (next) next.hidden = true;
      }
    }
  }

  // Has this device already heard a given line? Used so rooms introduce themselves once.
  function heard(key) {
    if (demo) return !!heard.memo[key];
    try {
      return window.localStorage.getItem("dp_heard_" + key + "_" + (token || "seat")) === "1";
    } catch (e) {
      return !!heard.memo[key];
    }
  }
  heard.memo = {};

  function markHeard(key) {
    heard.memo[key] = true;
    if (demo) return;
    try {
      window.localStorage.setItem("dp_heard_" + key + "_" + (token || "seat"), "1");
    } catch (e) {}
  }

  // Type a line the first time; show it at once on later visits.
  function sayOnce(key, lines, opts) {
    opts = opts || {};
    var before = heard(key);
    markHeard(key);
    if (before) {
      opts.quick = true;
      narrate([lines[lines.length - 1]], opts);
    } else narrate(lines, opts);
  }

  function clock(at) {
    return new Date(at).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  }

  function seatOf(n) {
    if (!hall) return null;
    for (var i = 0; i < hall.seats.length; i++) if (hall.seats[i].number === n) return hall.seats[i];
    return null;
  }

  var faceMemo = {};
  function faceHTML(n) {
    if (n === 0) return AV.executor ? AV.executor() : AV.gm();
    var seat = seatOf(n);
    if (!seat || !seat.avatar) return AV.silhouette();
    var key = n + JSON.stringify(seat.avatar);
    if (!faceMemo[key]) faceMemo[key] = AV.draw(seat.avatar, { label: "Player " + n });
    return faceMemo[key];
  }

  function who(n) {
    return n === 0 ? "GM" : n === me.number ? "You" : "Player " + n;
  }

  // The game is updated while pages are open. Every minute and a half this page asks whether the files it is
  // made of have changed on the server. If they have, it is running old code, so it loads itself again: but only
  // while the player is standing in a room with nothing open and nothing half typed, or is not looking at the page.
  var codeSeen = {}, codeStale = false;
  var CODE_FILES = ["/app.js", "/world.js", "/avatar.js", "/ladder.js", "/play.css", "/app.css"];
  function codeIdle() {
    if (document.hidden) return true;
    var el = document.activeElement;
    if (el && /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName)) return false;
    if (ui.busy || !stage || !stage.room || stage.entering) return false; // only in the walking world, never on a game or rules screen
    if ($("menu") && !$("menu").hidden) return false;
    var talk = $("npc-talk");
    return !(talk && !talk.hidden);
  }
  function codeCheck() {
    if (demo || typeof fetch !== "function") return;
    if (codeStale) { if (codeIdle()) window.location.reload(); return; }
    CODE_FILES.forEach(function (f) {
      fetch(f, { method: "HEAD", cache: "no-store" }).then(function (r) {
        var tag = r.ok && r.headers.get("ETag");
        if (!tag) return;
        if (!codeSeen[f]) codeSeen[f] = tag;
        else if (codeSeen[f] !== tag) codeStale = true;
      }).catch(function () {});
    });
  }
  setTimeout(codeCheck, 4000);
  setInterval(codeCheck, 90000);
  setInterval(function () { if (codeStale && codeIdle()) window.location.reload(); }, 3000);

  function loadHall() {
    return api("GET", "/api/hall").then(function (data) {
      hall = data;
      syncWallet();
      setTimeout(megaCheck, 600);
      return data;
    });
  }

  // ---------- the narrator ----------
  // Text is typed a letter at a time straight onto the screen, with no box
  // around it. Tap to finish a line, tap again for the next one.

  var nar = { lines: [], i: 0, timer: null, typing: false, finish: null, opts: {} };

  function stopNarration() {
    clearTimeout(nar.timer);
    nar.lines = [];
    nar.typing = false;
    nar.finish = null;
    nar.opts = {};
  }

  function narrate(lines, opts) {
    stopNarration();
    nar.lines = lines;
    nar.i = 0;
    nar.opts = opts || {};
    typeLine();
  }

  function setMore(on) {
    var more = $("more");
    if (more) more.classList.toggle("on", !!on);
  }

  function typeLine() {
    var el = $("say");
    if (!el) return;
    var text = nar.lines[nar.i];
    var sr = document.createElement("span");
    sr.className = "sr";
    sr.textContent = text.replace(/\n/g, " ");
    var typed = document.createElement("span");
    typed.className = "typed";
    typed.setAttribute("aria-hidden", "true");
    var letters = [];
    var quick = instant || nar.opts.quick;
    if (quick) typed.textContent = text;
    else {
      text.split(/(\s+)/).forEach(function (part) {
        if (!part) return;
        if (/^\s+$/.test(part)) {
          typed.appendChild(document.createTextNode(part));
          return;
        }
        var word = document.createElement("span");
        word.className = "narrated-word";
        Array.from(part).forEach(function (character) {
          var glyph = document.createElement("span");
          glyph.style.visibility = "hidden";
          glyph.textContent = character;
          word.appendChild(glyph);
          letters.push(glyph);
        });
        typed.appendChild(word);
      });
    }
    el.replaceChildren(sr, typed);
    var pos = 0;
    nar.typing = true;
    setMore(false);
    if (nar.opts.onStart) nar.opts.onStart(nar.i);

    function done() {
      clearTimeout(nar.timer);
      while (pos < letters.length) letters[pos++].style.visibility = "visible";
      nar.typing = false;
      nar.finish = null;
      var last = nar.i >= nar.lines.length - 1;
      if (nar.opts.onLine) nar.opts.onLine(nar.i);
      if (last && nar.opts.onEnd) nar.opts.onEnd();
      if (nar.opts.auto) {
        // In the hall the lines move on by themselves, then clear.
        nar.timer = setTimeout(function () {
          if (!last) {
            nar.i += 1;
            typeLine();
          } else if (nar.opts.fade) {
            typed.textContent = "";
            el.children[0].textContent = "";
          }
        }, last ? nar.opts.auto + 1200 : nar.opts.auto);
        return;
      }
      setMore(!last || nar.opts.tap);
    }

    function tick() {
      var letter = letters[pos++];
      if (!letter) return done();
      letter.style.visibility = "visible";
      if (pos === letters.length) return done();
      var wait = /[.!?]/.test(letter.textContent) ? 150 : /[,;:]/.test(letter.textContent) ? 85 : 23;
      nar.timer = setTimeout(tick, wait);
    }

    nar.finish = done;
    if (quick) return done();
    tick();
  }

  // A tap on the scene: finish the line, or move on.
  function advance() {
    if (nar.lines.length) {
      if (nar.typing && nar.finish) return nar.finish();
      if (nar.i < nar.lines.length - 1) {
        nar.i += 1;
        return typeLine();
      }
    }
    var scene = SCENES[currentScene()];
    if (scene && scene.onTap) return scene.onTap();
    if (scene && scene.tap && scene.next) go(typeof scene.next === "function" ? scene.next() : scene.next);
  }

  function sayHTML(extraClass) {
    return (
      '<div class="say-wrap"><p class="say' + (extraClass ? " " + extraClass : "") + '" id="say" aria-live="polite"></p>' +
      '<span class="say-more" id="more" aria-hidden="true"></span></div>'
    );
  }

  // ---------- pieces ----------

  // The bag payout is secret until opening. Banked puzzle winnings are already yours.
  function balance() {
    if (hall && hall.you === me.number && hall.phase === me.phase)
      return hall.coins != null ? hall.coins : hall.banked || 0;
    return (me.phase === "revealed" ? me.coins || 0 : 0) + (me.extra || 0);
  }

  function walletMarkup(id) {
    return '<span class="chip coin wallet" data-wallet' + (id ? ' id="' + id + '"' : '') +
      ' role="status" aria-live="polite">' + plural(balance(), "coin", "coins") + '</span>';
  }

  function syncWallet() {
    if (!me) return;
    var label = plural(balance(), "coin", "coins");
    root.querySelectorAll("[data-wallet]").forEach(function (el) {
      if (el.textContent !== label) el.textContent = label;
    });
  }

  function topbar() {
    return '<div class="topbar"><b>Player ' + esc(me.number) + '</b>' + walletMarkup() + '</div>';
  }

  function bagButton(n) {
    var on = ui.pick === n;
    return (
      '<button type="button" class="bag' + (on ? " on" : "") + '" data-act="pick" data-bag="' + n + '" aria-pressed="' + on + '">' +
      ART.bag(n) +
      '<span class="bag-coins">' + (n === 1 ? me.bag1Coins : me.bag2Pot) + "</span>" +
      '<span class="bag-terms">' + (n === 1 ? "Guaranteed" : "Shared") + "</span>" +
      "</button>"
    );
  }

  function sealHTML() {
    if (!ui.pick) return '<button type="button" class="btn" disabled>Choose a bag</button>';
    if (!ui.confirm) return '<button type="button" class="btn" data-act="sealAsk">Take Bag ' + ui.pick + "</button>";
    return (
      '<div class="seal-row"><button type="button" class="btn" data-act="seal">Take Bag ' + ui.pick + '. It is final.</button>' +
      '<button type="button" class="btn ghost" data-act="sealNo">Back</button></div>'
    );
  }

  function splitHTML() {
    var pips = "";
    for (var i = 1; i <= me.seats; i++) pips += "<i></i>";
    return (
      '<div class="split later" id="split">' +
      '<div class="pips" id="pips" aria-hidden="true">' + pips + "</div>" +
      '<p class="split-if">If <b id="split-k"></b> take it</p>' +
      '<p class="split-out"><b id="split-n"></b><span>each</span></p>' +
      '<input type="range" id="split-range" min="1" max="' + me.seats + '" step="1" value="' + ui.k + '" aria-label="How many players take Bag 2">' +
      "</div>"
    );
  }

  function drawSplit() {
    var range = $("split-range");
    if (!range) return;
    var k = Number(range.value);
    ui.k = k;
    $("split-k").textContent = k;
    $("split-n").textContent = share(k);
    Array.prototype.forEach.call($("pips").children, function (pip, i) {
      pip.className = i < k ? "on" : "";
    });
  }

  function letterActions() {
    return ui.declineAsk
      ? '<p class="letter-confirm">Decline your invitation? I may offer your seat to someone else.</p>' +
          '<button type="button" class="btn-paper" data-act="decline">Yes, decline</button>' +
          '<button type="button" class="btn-desk" data-act="declineNo">Go back</button>'
      : '<button type="button" class="btn-paper" data-act="accept">Accept the invitation</button>' +
          '<button type="button" class="btn-desk" data-act="declineAsk">Decline</button>';
  }

  function slip(title, body, extra) {
    return (
      '<section class="screen letter center"><div class="slip"><h1>' + title + "</h1><p>" + body + "</p></div>" + (extra || "") + "</section>"
    );
  }

  // ---------- scenes ----------

  var SCENES = {
    // The front page. Everyone comes to the same address and types the word they were given.
    none: {
      html: function () {
        return (
          '<section class="screen center word-door">' + ART.wordmark() +
          '<p class="caps">By invitation only.</p>' +
          '<div class="word-box"><label for="word">Enter your word</label>' +
          '<input type="text" id="word" maxlength="5" autocomplete="off" autocapitalize="characters" autocorrect="off" spellcheck="false" enterkeyhint="go" placeholder="•••••" aria-describedby="word-note">' +
          '<button type="button" class="btn" id="word-go" data-act="claim">Enter</button>' +
          '<p class="note" id="word-note" role="status">Five letters. The gamemaster sent it to you.</p></div></section>'
        );
      },
      mount: function () {
        var input = $("word");
        input.addEventListener("input", function () { input.value = input.value.toUpperCase().replace(/[^A-Z]/g, "").slice(0, 5); });
        input.addEventListener("keydown", function (event) { if (event.key === "Enter") { event.preventDefault(); claimWord(); } });
      },
    },

    // What arrives first: an envelope on a dark desk, unopened.
    envelope: {
      html: function () {
        return (
          '<section class="screen envelope-scene">' +
          '<button type="button" class="envelope-open" id="envelope" data-act="openLetter" aria-label="Open the envelope">' +
          '<span class="desk-ring" aria-hidden="true"></span><span class="desk-pencil" aria-hidden="true"></span>' +
          '<svg class="envelope-art" viewBox="0 0 720 500" aria-hidden="true">' +
          '<defs><filter id="env-grain" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="7" result="n"/>' +
          '<feColorMatrix in="n" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 -0.55 0.36" result="g"/><feComposite in="g" in2="SourceGraphic" operator="in" result="gi"/>' +
          '<feMerge><feMergeNode in="SourceGraphic"/><feMergeNode in="gi"/></feMerge></filter>' +
          '<filter id="env-shadow" x="-20%" y="-20%" width="140%" height="150%"><feDropShadow dx="0" dy="18" stdDeviation="16" flood-color="#000" flood-opacity="0.55"/></filter></defs>' +
          '<g transform="rotate(-5 360 250)" filter="url(#env-shadow)"><g filter="url(#env-grain)">' +
          '<rect x="30" y="40" width="660" height="420" fill="#d5d0c3"/>' +
          '<path d="M30 40 360 262 30 460z" fill="#c7c1b2"/><path d="M690 40 360 262 690 460z" fill="#c4beaf"/>' +
          '<path d="M30 460 300 250h120L690 460z" fill="#d3cec1"/>' +
          '<path d="M30 40h660L360 262z" fill="#dedad0"/>' +
          '<path d="M30 40 360 262 690 40" fill="none" stroke="#a9a394" stroke-width="2" opacity=".7"/>' +
          '<path d="M30 460 300 250M690 460 420 250" fill="none" stroke="#b3ad9e" stroke-width="1.5" opacity=".6"/></g>' +
          '<g class="env-seal"><circle cx="360" cy="262" r="40" fill="#8f2015"/><circle cx="360" cy="260" r="38" fill="#c0392b"/>' +
          '<circle cx="360" cy="260" r="28" fill="none" stroke="#a52c1f" stroke-width="3"/>' +
          '<text x="360" y="274" text-anchor="middle" font-family="Georgia, \'Times New Roman\', serif" font-size="40" fill="#a52c1f" stroke="#d65a49" stroke-width=".8">C</text></g>' +
          '</g></svg>' +
          '<span class="envelope-line">It came with no stamp and no sender. Open it.</span></button></section>'
        );
      },
    },

    letter: {
      html: function () {
        return (
          '<section class="screen letter">' +
          DP.letterHTML({ letter: me.letter, name: me.name, opensAt: me.opensAt, replyBy: me.replyBy }) +
          '<div class="letter-actions" id="letter-actions">' + letterActions() + "</div></section>"
        );
      },
    },

    declined: {
      html: function () {
        return slip(
          "YOU DECLINED.",
          "You can still accept from this link if a seat opens before the game begins.",
          '<button type="button" class="btn-desk" data-act="accept">Accept the invitation</button>'
        );
      },
    },

    full: {
      html: function () {
        return slip("EVERY SEAT IS TAKEN.", "Sixteen people answered before you. If a seat opens, this link will let you in.");
      },
    },

    closed: {
      html: function () {
        return slip("THE DOORS HAVE CLOSED.", "The game began without you.");
      },
    },

    // What the game is, in four short beats. The picture changes with each one.
    welcome: {
      html: function () {
        return (
          '<section class="screen scene">' + steps(0) +
          '<div class="scene-art"><div class="w-art" id="w-art">' + welcomeArt(0) + "</div></div>" +
          sayHTML() +
          '<button type="button" class="btn narrow later" id="go" data-act="go" data-scene="draw">Draw my number</button></section>'
        );
      },
      mount: function () {
        narrate(
          ["Welcome to Dark Post. I’m S, your Gamemaster.", "For your own protection, your true identity will be kept a secret. You will play under a number instead."],
          {
            onStart: function (i) {
              var art = $("w-art");
              if (!art || !i) return;
              art.innerHTML = numberArt();

            },
            onEnd: function () { show("go"); },
          }
        );
      },
    },

    // The draw: a light runs round sixteen numbers and stops on yours.
    draw: {
      html: function () {
        return (
          '<section class="screen center s-draw">' + steps(1) + '<div class="scene-art">' + ringHTML() + '</div>' + sayHTML() +
          '<button type="button" class="btn narrow later" id="draw-btn" data-act="draw">Reveal my number</button>' +
          '<button type="button" class="btn narrow later" id="go" data-act="enter">Continue</button></section>'
        );
      },
      mount: function () {
        if (ui.drawn) return landDraw(true);
        narrate(["One of these sixteen numbers is yours."], { onEnd: function () { show("draw-btn"); } });
      },
    },

    // Sixteen players, you are one, and what it takes to stay.
    sixteen: {
      tap: true,
      next: "title",
      html: function () {
        var out = '<section class="screen scene">' + steps(2) + '<div class="scene-art"><div class="crowd b1" id="crowd">';
        var gone = [3, 5, 8, 11, 14].map(function (d) { return ((me.number - 1 + d) % me.seats) + 1; });
        for (var n = 1; n <= me.seats; n++) {
          out +=
            '<span class="pawn' + (n === me.number ? " me" : gone.indexOf(n) >= 0 ? " out" : "") + '" style="animation-delay: ' + (n * 0.04).toFixed(2) + 's">' +
            '<svg viewBox="0 0 40 60" aria-hidden="true"><path d="M11.4 12.6 13 5.6C13.3 4 14.6 3 16.2 3h7.6c1.6 0 2.9 1 3.2 2.6l1.6 7z"/><ellipse cx="20" cy="13.2" rx="15.5" ry="3.1"/><circle cx="20" cy="19.6" r="7.2"/><path d="M3.5 59C3.5 42 9 31 20 31s16.5 11 16.5 28z"/></svg><b>' + (n === me.number ? "You" : n) + "</b></span>";
        }
        return out + '</div><div class="w-art" id="tests-art" hidden>' + testsArt() + "</div></div>" + sayHTML() + '<p class="tap-hint later" id="hint">Tap to continue</p></section>';
      },
      mount: function () {
        narrate([
          "There are 16 players in the house. You are Player " + me.number + ".",
          "Mr. Crane has set multiple tests that the players will attempt.",
          "Pass a test and you are safe. Doing poorly can lead to your elimination, and you will be escorted off the premises.",
          "The last player in the house wins and will be the sole beneficiary of Mr. Crane’s substantial wealth.",
        ], {
          tap: true,
          // the crowd: everyone, then some of them gone, then one left. The tests get their own picture.
          onStart: function (i) {
            var c = $("crowd"), t = $("tests-art");
            if (!c || !t) return;
            c.hidden = i === 1;
            t.hidden = i !== 1;
            if (i !== 1) c.className = "crowd b" + (i === 0 ? 1 : i);
          },
          onLine: function (i) { if (i === 0) show("hint"); },
        });
      },
    },

    title: {
      auto: 1250,
      tap: true,
      next: "coins",
      html: function () {
        return (
          '<section class="screen center s-title"><p class="kicker">Dark Post</p>' +
          '<h1 class="title-card">Opening<br>Night</h1><div class="divider"></div></section>'
        );
      },
    },

    coins: {
      tap: true,
      next: "bags",
      lines: function () {
        return ["Coins are the house currency.", "Earn them from bags, puzzles and deals. Later you can spend them on advantages."];
      },
      html: function () {
        return (
          '<section class="screen scene">' + steps(3) +
          '<div class="scene-art"><div class="coin-spin">' + ART.bigCoin() + "</div></div>" +
          sayHTML() + '<p class="tap-hint later" id="hint">Tap to continue</p></section>'
        );
      },
      mount: function () {
        narrate(SCENES.coins.lines(), { tap: true, onLine: function (i) { if (i === 0) show("hint"); } });
      },
    },

    bags: {
      tap: true,
      next: "bag1",
      html: function () {
        return (
          '<section class="screen scene">' + (me.state === "choose" ? steps(4) : "") +
          '<div class="scene-art pair"><div class="drop">' + ART.bag(1) + '</div><div class="drop d2">' + ART.bag(2) + "</div></div>" +
          sayHTML() + "</section>"
        );
      },
      mount: function () {
        narrate(["Your first choice is between two bags.", "Each player secretly takes one. You’ll see the payout when the bags open."], { tap: true });
      },
    },

    bag1: {
      tap: true,
      next: "bag2",
      html: function () {
        return (
          '<section class="screen scene">' + (me.state === "choose" ? steps(4) : "") +
          '<div class="scene-art solo"><div class="drop">' + ART.bag(1) + "</div></div>" +
          sayHTML() + "</section>"
        );
      },
      mount: function () {
        narrate(["Bag 1 guarantees " + me.bag1Coins + " coins.", "You get the same amount however many players take it."], { tap: true });
      },
    },

    bag2: {
      next: function () {
        return me.state === "choose" ? "choose" : "hall";
      },
      html: function () {
        return (
          '<section class="screen scene">' + (me.state === "choose" ? steps(4) : "") +
          '<div class="scene-art solo" id="art"><div class="drop">' + ART.bag(2) + "</div></div>" +
          sayHTML() +
          '<button type="button" class="btn narrow later" id="go" data-act="next">Continue</button></section>'
        );
      },
      mount: function () {
        narrate(
          ["Bag 2 holds " + me.bag2Pot + " coins in total.", "The players who take it split the coins equally, rounded down."],
          { onEnd: function () { show("go"); } }
        );
      },
    },

    choose: {
      html: function () {
        return (
          '<section class="screen choose">' + topbar() + sayHTML() +
          '<div class="bags' + (ui.pick ? " picked" : "") + '" id="bags">' + bagButton(1) + bagButton(2) + "</div>" +
          '<div class="seal" id="seal">' + sealHTML() + "</div>" +
          '<p class="note center-text">Take a bag before the bags open to receive your coins.</p>' +
          '<div class="foot"><button type="button" class="link" data-act="rules">The rules</button><span class="gm">GM</span></div>' +
          "</section>"
        );
      },
      mount: function () {
        markIntroSeen();
        narrate(["Choose a bag. Once you take it, you cannot change it."], {});
      },
    },

    // The stamp comes down on the bag they chose.
    sealed: {
      tap: true,
      next: "face",
      html: function () {
        return (
          '<section class="screen scene">' +
          '<div class="scene-art"><div class="sealed-art slam">' + ART.bag(me.bag || 1) + '<span class="gold-stamp">TAKEN</span></div></div>' +
          sayHTML() + "</section>"
        );
      },
      mount: function () {
        ui.stamped = false;
        later(function () { narrate(["You took Bag " + (me.bag || 1) + ". Next, choose a disguise."], { tap: true }); }, instant ? 0 : 200);
      },
    },

    // Choose a character: all twenty-four on one screen. Restyling is a second screen, for those who want it.
    face: {
      html: function () {
        if (!ui.face) ui.face = AV.clean(me.avatar || AV.PRESETS[Math.floor(Math.random() * AV.PRESETS.length)]);
        return (
          '<section class="screen face">' +
          (me.state === "hall" ? '<header class="room-head flat"><button type="button" class="link" data-act="hall">\u2190 Back</button></header>' : steps(5) + topbar()) +
          sayHTML() +
          '<div class="hero"><div class="hero-fig" id="face-big">' + AV.sprite(ui.face, me.number) + "</div></div>" +
          '<div class="cast" id="cast">' + castHTML() + "</div>" +
          '<button type="button" class="btn" data-act="saveFace">Use this disguise</button>' +
          '<button type="button" class="link center-self" data-act="go" data-scene="look">Customize my disguise</button></section>'
        );
      },
      mount: function () {
        narrate(["Choose a disguise. This will be your avatar for the game."], {});
      },
    },

    look: {
      html: function () {
        if (!ui.face) ui.face = AV.clean(me.avatar || AV.PRESETS[0]);
        return (
          '<section class="screen face">' +
          '<header class="room-head flat"><button type="button" class="link" data-act="go" data-scene="face">\u2190 Characters</button></header>' +
          '<div class="face-big" id="face-big">' + AV.draw(ui.face, { label: "Your character" }) + "</div>" +
          '<div class="tabs" id="tabs">' + tabsHTML() + "</div>" +
          '<div class="options" id="options">' + optionsHTML() + "</div>" +
          '<button type="button" class="btn" data-act="saveFace">Use this disguise</button></section>'
        );
      },
    },

    // A short tour of the set before the player is let loose in it.
    tour: {
      html: function () {
        return (
          '<section class="screen tour" id="tour">' +
          '<div class="tour-art" id="tour-art" aria-hidden="true"></div><div class="tour-shade" aria-hidden="true"></div>' + steps(6) +
          '<div class="tour-demo" id="tour-demo" aria-hidden="true"></div>' +
          '<div class="tour-text"><p class="tour-kicker" id="tour-k"></p><h1 id="tour-h"></h1>' + sayHTML() + "</div>" +
          '<div class="tour-foot"><button type="button" class="btn" id="tour-next" data-act="tourNext">Next</button>' +
          '<button type="button" class="link" data-act="hall">Skip the tour</button></div></section>'
        );
      },
      onTap: function () { tourNext(); },
      mount: function () {
        ui.tour = 0;
        drawTour();
      },
    },

    // The set: five rooms, each shown full screen. You walk; doors lead from one to the next.
    hall: {
      html: function () {
        return (
          '<section class="screen stage" id="stage">' +
          '<div class="world" id="world"></div>' +
          '<div class="room-name" id="room-name" aria-live="polite"></div>' +
          '<div class="hud-top">' +
          '<div class="hud-chips"><div class="hud-brand">' + ART.wordmark() + '</div><span class="chip gold">Player ' + esc(me.number) + '</span>' + walletMarkup("top-coins") + '<span class="chip here" id="top-room"></span><span class="hud-break"></span>' +
          '<button type="button" class="chip online" id="top-online" data-act="online" aria-haspopup="dialog" aria-expanded="false"><i></i><span id="top-online-n"></span></button>' +
          '<span class="chip clock" id="top-clock" title="Game time. Every time in the game is on this clock."></span>' +
          '<span class="hud-break"></span><button type="button" class="chip stage" id="top-stage" data-act="stageGo" hidden></button></div>' +
          '<button type="button" class="now" id="now" data-act="go" data-scene="tonight" aria-label="The current stage, and what is next">' +
          '<span class="now-row"><i>Current</i><b id="now-a"></b></span>' +
          '<span class="now-row"><i>Next</i><b id="now-b"></b><em id="now-t"></em></span>' +
          '<span class="now-do" id="now-do"></span></button>' +
          "</div>" +
          '<div class="hud-say">' + sayHTML() + "</div>" +
          '<button type="button" class="onair" id="onair" data-act="go" data-scene="table" hidden></button>' +
          '<button type="button" class="onair note" id="note" data-act="noteGo" hidden></button>' +
          '<div class="npc-talk" id="npc-talk" role="dialog" aria-live="polite" hidden></div>' +
          '<div class="commit" id="commit" role="dialog" aria-modal="true" aria-labelledby="commit-h" hidden></div>' +
          '<div class="hud-bottom">' +
          '<button type="button" class="btn hud-action" id="hud-action" data-act="use" hidden></button>' +
          '<button type="button" class="bell-btn" id="bell-btn" data-act="bell" aria-haspopup="dialog" aria-expanded="false" aria-label="Notifications" disabled>' + BELL + '<span id="bell-n"></span></button>' +
          '<button type="button" class="bell-btn msg-btn" id="msg-btn" data-act="go" data-scene="whispers" aria-label="Messages from other players">' + MSG_ICON + '<span id="msg-n"></span></button>' +
          '<button type="button" class="menu-btn" id="menu-btn" data-act="menu" aria-haspopup="dialog" aria-expanded="false" disabled>Menu<span id="menu-n"></span></button>' +
          "</div>" +
          '<div class="menu" id="menu" hidden></div>' +
          "</section>"
        );
      },
      mount: function () {
        stage = { el: $("stage"), world: $("world"), room: "", zoom: 1, camX: 0, camY: 0, raf: 0, last: 0, keys: {}, sig: "", snap: true, sent: 0, entering: null };
        var mine = stage;
        function ready() {
          if (stage !== mine) return;
          if (stage.room) return refreshStage();
          stage.room = spotOf(hall.you)[0];
          var firstVisit = !heard("hall") && !hall.needsCommit; // the question comes first; the walking hint follows a yes
          hintDue = firstVisit; // a pop-up must not cover the hint that is about to be typed
          buildRoom(true);
          hintDue = false;
          if (!stage) return; // building the room found a game beginning, or a result to watch, and left for that screen
          if (firstVisit) {
            markHeard("hall");
            narrate(["Tap the floor to walk. Step through a marked door to enter its room."], { auto: 3200, fade: true });
          }
          stage.last = performance.now();
          stage.raf = requestAnimationFrame(tick);
          if (demo) startBots();
        }
        if (hall && hall.you === me.number) ready();
        function syncRoom() {
          return loadHall().then(ready).catch(function (err) { if (stage === mine) toast(err.message); });
        }
        syncRoom();
        poller = setInterval(function () {
          if (quiet()) return;
          syncRoom();
          pollMe();
        }, 12000);
        ticker = setInterval(drawStatus, 1000);
      },
    },

    // ----- pages that open from the menu, wherever you stand -----

    whispers: {
      html: function () {
        return (
          '<section class="screen room" style="--place: ' + PLACES.whispers.color + '">' + backdrop("hall") +
          '<header class="room-head"><button type="button" class="link" data-act="hall">← Back</button><h1>' + PLACES.whispers.title + "</h1></header>" +
          sayHTML() + '<div class="threads" id="threads"></div></section>'
        );
      },
      mount: function () {
        loadHall()
          .then(function () {
            drawThreads();
            sayOnce("whispers", ["Pick a player to message in private."], {});
          })
          .catch(function (err) { toast(err.message); });
        poller = setInterval(function () {
          if (!quiet()) loadHall().then(drawThreads).catch(function () {});
        }, 8000);
      },
    },

    whisper: {
      html: function () { return roomHTML("whispers", "Player " + ui.withN, "Message Player " + ui.withN, "whispers", ui.withN); },
      mount: function () {
        openRoom({ room: "whisper", withN: ui.withN, key: "whisper", empty: "No messages yet." }, ["Only you, Player " + ui.withN + " and the GM can read this conversation."]);
      },
    },

    study: {
      html: function () { return roomHTML("study", PLACES.study.title, "Ask your question", "hall", 0); },
      mount: function () {
        openRoom({ room: "study", key: "study", empty: "Nothing asked yet." }, ["This conversation is between you and the Gamemaster."]);
      },
    },

    // The notice board: only the GM writes here.
    board: {
      html: function () { return roomHTML("board", PLACES.board.title, "", "hall").replace('class="screen room"', 'class="screen room readonly"'); },
      mount: function () {
        openRoom({ room: "board", key: "board", empty: "Nothing posted yet." }, ["News from the GM. Only the GM writes here."]);
      },
    },

    // Broadcasts: what players have said to everyone. To speak, a player goes to the broadcast room.
    table: {
      html: function () {
        return roomHTML("table", PLACES.table.title, "", "hall")
          .replace('class="screen room"', 'class="screen room readonly"')
          .replace("</section>", '<div class="page-foot broadcast-foot"><p>Walk to the broadcast room to speak to everyone.</p><button type="button" class="link" data-act="go" data-scene="board">GM notices</button></div></section>');
      },
      mount: function () {
        openRoom({ room: "table", key: "table", empty: "Nobody has broadcast yet." }, ["Every player can read these broadcasts."]);
      },
    },

    // Every player: a portrait, and a card behind it.
    players: {
      html: function () {
        return (
          '<section class="screen room page" style="--place: ' + PLACES.players.color + '">' + backdrop("gallery") +
          '<header class="room-head"><button type="button" class="link" data-act="hall">← Back</button><h1>' + PLACES.players.title + "</h1></header>" +
          '<p class="page-note" id="players-note"></p><div class="faces" id="faces"></div><div class="card-wrap" id="card" hidden></div></section>'
        );
      },
      mount: function () {
        loadHall()
          .then(function () {
            drawPlayers();
            if (ui.card) showCard(ui.card);
          })
          .catch(function (err) { toast(err.message); });
        poller = setInterval(function () {
          if (!quiet()) loadHall().then(drawPlayers).catch(function () {});
        }, 12000);
      },
    },

    standings: {
      html: function () {
        return '<section class="screen room page standings-page" style="--place:#d5bb81">' +
          '<header class="room-head"><button type="button" class="link" data-act="hall">← Back</button><h1>Standings</h1></header>' +
          '<div class="standings" id="standings" aria-live="polite"></div></section>';
      },
      mount: function () {
        if (hall) drawStandings();
        function refresh() { return loadHall().then(drawStandings).catch(function () {}); }
        refresh();
        poller = setInterval(function () { if (!quiet()) refresh(); }, 12000);
      },
    },

    // ----- things you do in a room -----

    // The broadcast room: speak to everyone at once.
    onair: {
      html: function () { return roomHTML("table", "On air", "Say it to everyone", "hall"); },
      mount: function () {
        openRoom({ room: "table", key: "onair", empty: "Nobody has broadcast yet." }, ["Send a broadcast here. Every player can read it."]);
      },
    },

    // The arena: what is being played now, and what comes next.
    arena: {
      html: function () {
        return (
          '<section class="screen room page" style="--place: ' + PLACES.arena.color + '">' + backdrop("arena") +
          '<header class="room-head"><button type="button" class="link" data-act="hall">← Back</button><h1>' + PLACES.arena.title + "</h1></header>" +
          '<div class="sched" id="sched"></div></section>'
        );
      },
      mount: function () {
        mountMatch(true);
      },
    },

    // Tonight's match, from the menu: the rules, your clue and the time left. Vaults are opened in the arena.
    tonight: {
      html: function () {
        return (
          '<section class="screen room page" style="--place: ' + PLACES.arena.color + '">' + backdrop("arena") +
          '<header class="room-head"><button type="button" class="link" data-act="hall">← Back</button><h1>' + PLACES.tonight.title + "</h1></header>" +
          '<div class="sched" id="sched"></div></section>'
        );
      },
      mount: function () {
        mountMatch(false);
      },
    },

    // A game is beginning. Shown once to every player, wherever they are, the moment the GM starts it.
    gamecall: {
      html: function () {
        var n = hall && hall.night ? hall.night.n : 1;
        var nth = ["first", "second", "third", "fourth", "fifth", "sixth", "seventh"][n - 1] || "next";
        return '<section class="screen gamecall" id="gamecall"><div class="gc-beams" aria-hidden="true"><i></i><i></i></div>' +
          '<p class="gc-kicker">The Crane Estate</p>' +
          '<h1 class="gc-title">Game ' + n + "</h1>" +
          (isLadder()
            ? '<div class="gc-pic gc-cards">' + ["10", "Q", "A", "X1", "K"].map(function (c) { return cardHTML(c); }).join("") + "</div>"
            : '<div class="gc-pic"><img src="/art/night1/brief-1.webp" alt="Six numbered vault doors"></div>') +
          '<h2 class="gc-name">' + gameName() + "</h2>" +
          '<p class="gc-line">The ' + nth + " game is beginning.</p>" +
          '<p class="gc-go">' + (hall && hall.out ? "Make your way to the arena to watch." : "Make your way to the arena. The attendant has the rules.") + "</p>" +
          '<button type="button" class="btn gc-btn" data-act="callDone">Walk to the arena</button></section>';
      },
      mount: function () {},
    },

    // Tonight's match, one picture at a time. Shown once before the Tonight page, and again on request.
    vbrief: {
      html: function () {
        return '<section class="screen vbrief" id="vbrief"><p class="vb-kicker" id="vb-kicker">Tonight</p>' +
          '<div class="vb-pic" id="vb-pic"></div><p class="vb-line" id="vb-line"></p><div class="vb-dots" id="vb-dots" aria-hidden="true"></div>' +
          '<div class="vb-foot"><button type="button" class="btn" id="vb-next" data-act="vbNext">Next</button>' +
          '<button type="button" class="link" id="vb-skip" data-act="vbSkip">Skip</button></div></section>';
      },
      mount: function () {
        ui.vb = 0;
        if (ui.night && ui.night.on) return drawVB();
        fetchNight().then(function (n) { if (n && n.on) drawVB(); else go("tonight"); }).catch(function () { go("tonight"); });
      },
    },

    // The end of a night, shown once: the vaults, the gold, the prizes, and who is out.
    vreveal: {
      html: function () {
        return '<section class="screen room page vreveal" style="--place: ' + PLACES.arena.color + '">' + backdrop("arena") + '<div class="sched" id="vr"></div></section>';
      },
      mount: function () {
        ui.vstep = 0;
        (hall ? Promise.resolve() : loadHall()).then(fetchNight).then(drawVReveal).catch(function (err) { toast(err.message); go("hall"); });
      },
    },

    // The puzzle room: one puzzle a day, three tries, one coin.
    puzzle: {
      html: function () {
        return (
          '<section class="screen room page" style="--place: ' + PLACES.puzzle.color + '">' + backdrop("puzzle") +
          '<header class="room-head"><button type="button" class="link" data-act="hall">← Back</button><h1>Puzzle of the day</h1></header>' +
          '<div class="sched" id="pz"></div></section>'
        );
      },
      mount: function () {
        // while the treasury is in play, the puzzle room is the treasury and nothing else
        if (treasOn()) return mountTreasury();
        api("GET", "/api/puzzle").then(function (p) { ui.pz = p; drawPuzzle(); }).catch(function (err) { toast(err.message); });
        ticker = setInterval(function () {
          var el = $("pz-reset");
          if (el && ui.pz && !ui.pz.held) el.textContent = span(Math.max(0, ui.pz.resetAt - Date.now()));
        }, 1000);
      },
    },

    // The betting room: two players, two sealed choices.
    deal: {
      html: function () {
        return (
          '<section class="screen room page" style="--place: ' + PLACES.betting.color + '">' + backdrop("betting") +
          '<header class="room-head"><button type="button" class="link" data-act="hall">← Back</button><h1>Make a deal</h1></header>' +
          '<div class="sched" id="deal"></div></section>'
        );
      },
      mount: function () {
        ui.dealTo = 0;
        ui.bt = null;
        ui.dealPick = null;
        ui.dealResult = null;
        function fetchDeals() {
          return (hall ? Promise.resolve() : loadHall()).then(function () {
            // while a game takes bets, the room is for the bet and nothing else
            if (betsOn()) return api("GET", "/api/bet").then(function (v) { ui.bet = v; drawBet(); });
            ui.bet = null;
            return api("GET", "/api/deals").then(function (d) { ui.deals = d; drawDeal(); });
          });
        }
        fetchDeals().catch(function (err) { toast(err.message); });
        poller = setInterval(function () {
          if (!quiet() && !ui.dealPick && !ui.dealTo && !(ui.bt && ui.bt.ask)) fetchDeals().catch(function () {});
        }, 8000);
      },
    },

    // The observatory: sixteen stars, one for each player.
    sky: {
      html: function () {
        return (
          '<section class="screen room sky" style="--place: ' + PLACES.sky.color + '"><div class="sky-art" id="sky-art"></div>' +
          '<header class="room-head clear"><button type="button" class="link" data-act="hall">← Back</button><h1>The sky</h1></header>' +
          '<div class="sky-text">' + sayHTML() + "</div></section>"
        );
      },
      mount: function () {
        loadHall()
          .then(function () {
            $("sky-art").innerHTML = skyHTML();
            narrate(["Sixteen stars. One for each player.", "Yours is gold.", "When a player is eliminated,\ntheir star goes out."], { tap: true });
          })
          .catch(function (err) { toast(err.message); });
      },
    },

    shop: {
      html: function () {
        return (
          '<section class="screen room page" style="--place: ' + PLACES.shop.color + '">' + backdrop("shop") +
          '<header class="room-head"><button type="button" class="link" data-act="hall">← Back</button><h1>' + PLACES.shop.title + "</h1></header>" +
          '<div class="sched" id="shop"></div></section>'
        );
      },
      mount: function () {
        (hall ? Promise.resolve() : loadHall()).then(fetchNight).then(drawShop).catch(function (err) { toast(err.message); });
      },
    },

    // The dungeon: who went down to the cells. Not what was said.
    doorlog: {
      html: function () {
        return (
          '<section class="screen room page" style="--place: ' + PLACES.dungeon.color + '">' + backdrop("dungeon") +
          '<header class="room-head"><button type="button" class="link" data-act="hall">← Back</button><h1>Door log</h1></header>' +
          '<p class="page-note">Everyone can see who went into a cell. Nobody outside it can see what was said.</p><div class="sched" id="doorlog"></div></section>'
        );
      },
      mount: function () {
        function fetchLog() {
          return (hall ? Promise.resolve() : loadHall()).then(function () { return api("GET", "/api/doorlog"); }).then(drawDoorLog);
        }
        fetchLog().catch(function (err) { toast(err.message); });
        poller = setInterval(function () {
          if (!quiet()) fetchLog().catch(function () {});
        }, 10000);
      },
    },

    cell: {
      html: function () {
        return roomHTML("dungeon", "Cell " + ui.cell, "Say it to the cell", "hall").replace("</header>", '</header><p class="page-note" id="cell-mates"></p>');
      },
      mount: function () {
        openRoom({ room: "cell" + ui.cell, key: "cell", empty: "Nothing has been said while you stood here." }, ["Players in this cell and the GM can read what you send here."]);
        api("GET", "/api/doorlog")
          .then(function (d) {
            var mates = (d.now[ui.cell] || []).map(who);
            var el = $("cell-mates");
            if (el) el.textContent = "In this cell now: " + (mates.length ? mates.join(", ") : "nobody") + ".";
          })
          .catch(function () {});
      },
    },

    // How to play, on one page.
    guide: {
      html: function () {
        function card(icon, title, body, extra) {
          return '<div class="g-card"><span class="g-icon">' + icon + '</span><div><h2>' + title + "</h2><p>" + body + "</p>" + (extra || "") + "</div></div>";
        }
        return (
          '<section class="screen room page" style="--place: #FFFFFF">' +
          '<header class="room-head"><button type="button" class="link" data-act="hall">← Back</button><h1>How to play</h1></header>' +
          '<div class="guide">' +
          card(ICON.goal, "How you win", "Sixteen players enter. The last one in the house wins. Everyone plays under a number.") +
          card(ICON.hall, "Walk the house", "Tap or click the floor to walk. You can also use the arrow keys or WASD. Walk through a marked door to enter the next room.") +
          card(ICON.arena, "Pass the tests", "The Gamemaster holds each of Mr. Crane’s tests in the arena, and says when it starts and ends. Doing poorly can eliminate you.") +
          card(ICON.bank, "Earn coins", "Your balance appears at the top of the screen. Your bag and the daily puzzle add to it. Standings shows public coin rankings.", '<button type="button" class="link" data-act="rules">How the two bags work</button>') +
          card(ICON.whispers, "Talk to people", "Messages are private between two players and the GM. To speak to everyone, use the broadcast room.") +
          card(ICON.study, "Ask the Gamemaster", "Open Ask the GM to send a private question. Open Broadcast for public messages and GM notices.") +
          '<button type="button" class="btn ghost" data-act="go" data-scene="tour">Tour the rooms</button>' +
          "</div></section>"
        );
      },
    },

    gate: {
      html: function () {
        return (
          '<section class="screen center">' + sayHTML("big") +
          '<button type="button" class="btn narrow later" id="go" data-act="next">See the payouts</button></section>'
        );
      },
      next: "crowd1",
      mount: function () {
        loadHall().catch(function () {}); // the faces for the next screens
        narrate(["The bags are open."], { onEnd: function () { show("go"); } });
      },
    },

    // Bag 1 first: who took it, and what each of them got.
    crowd1: {
      next: "crowd",
      html: function () { return takenHTML(1); },
      mount: function () { takenSay(1); },
    },

    // Then Bag 2: who took it, and how the pot was split.
    crowd: {
      next: "you",
      html: function () { return takenHTML(2); },
      mount: function () { takenSay(2); },
    },

    you: {
      html: function () {
        return (
          '<section class="screen center s-you">' + sayHTML() +
          '<div class="hold later" id="hold"><b id="hold-n">0</b><span class="caps">' + ((me.coins || 0) === 1 ? "coin" : "coins") + "</span></div>" +
          (me.extra > 0 ? '<p class="hold-more later" id="hold-more">Plus ' + me.extra + " from puzzles. " + ((me.coins || 0) + me.extra) + " in all.</p>" : "") +
          '<button type="button" class="btn narrow later" id="go" data-act="seen">Continue</button></section>'
        );
      },
      mount: function () {
        narrate([me.extra > 0 ? "Your bag gave you" : "You hold"], {
          onEnd: function () {
            show("hold");
            var target = me.coins || 0;
            var n = 0;
            (function up() {
              $("hold-n").textContent = n;
              if (n >= target) return later(function () { if ($("hold-more")) show("hold-more"); show("go"); }, 500);
              n += 1;
              later(up, instant ? 0 : Math.max(40, 420 / Math.max(1, target)));
            })();
          },
        });
      },
    },

    // After the reveal: who holds what. Then back to the hall.
    ledger: {
      html: function () {
        return '<section class="screen after">' + topbar() + '<div id="payouts">' + payoutsHTML() + "</div>" +
          sayHTML() + '<button type="button" class="btn narrow later center-self" id="go" data-act="hall">To the hall</button></section>';
      },
      mount: function () {
        // the faces need the hall's list of players; draw again once it is here
        if (!hall) loadHall().then(function () { var box = $("payouts"); if (box) box.innerHTML = payoutsHTML(); }).catch(function () {});
        later(function () { narrate(["The next round is coming."], { onEnd: function () { show("go"); } }); }, instant ? 0 : 900);
      },
    },
  };

  // Who took one bag, face by face, and what each of them got.
  function takenList(bag) {
    var r = me.reveal || {};
    if (!r.showChoices) return [];
    if (bag === 2) return r.order || [];
    return (r.results || []).filter(function (p) { return p.bag === 1; }).map(function (p) { return p.number; });
  }

  function takenHTML(bag) {
    var r = me.reveal || {};
    var k = (bag === 2 ? r.bag2Count : r.bag1Count) || 0;
    var list = takenList(bag);
    var out = '<section class="screen reveal" id="reveal"><div class="reveal-bag drop">' + ART.bag(bag) + "</div>" + sayHTML();
    var t = 0.1;
    if (k && list.length) {
      var gap = Math.min(0.35, 2.4 / list.length);
      out += '<div class="callout faces">';
      list.forEach(function (n) {
        out += '<b class="' + (n === me.number ? "me" : "") + '" style="animation-delay: ' + t.toFixed(2) + 's"><span class="cface">' + faceHTML(n) + "</span><em>" + (n === me.number ? "You" : n) + "</em></b>";
        t += gap;
      });
      out += "</div>";
    }
    t += 0.5;
    var sum, small;
    if (bag === 1) {
      sum = k ? r.bag1Coins : 0;
      small = k ? (r.bag1Coins === 1 ? "coin each" : "coins each") : "coins paid";
    } else {
      sum = k ? r.pot + " ÷ " + k + " = " + r.bag2Share : r.pot;
      small = k ? (r.pot % k === 0 ? "coins each" : "coins each, rounded down") : "coins stay in the bag";
    }
    out += '<p class="sum" style="animation-delay: ' + t.toFixed(2) + 's">' + sum + "<small>" + small + "</small></p>";
    t += 1.1;
    out += '<button type="button" class="btn narrow" data-act="next" style="animation-delay: ' + t.toFixed(2) + 's">' + (bag === 1 ? "Now Bag 2" : "See my share") + "</button></section>";
    return out;
  }

  function takenSay(bag) {
    var r = me.reveal || {};
    var k = (bag === 2 ? r.bag2Count : r.bag1Count) || 0;
    var line = !k ? "No one took Bag " + bag + "." : takenList(bag).length ? "Bag " + bag + " was taken by" : plural(k, "player", "players") + " took Bag " + bag + ".";
    narrate([line], { onEnd: function () { var el = $("reveal"); if (el) el.classList.add("go"); } });
  }

  // The board after the bags: every player's face, ranked from most coins to fewest.
  function payoutsHTML() {
    var r = me.reveal || {};
    if (!(r.showChoices && r.results)) {
      return '<div class="hold on"><b>' + (me.coins || 0) + '</b><span class="caps">' + ((me.coins || 0) === 1 ? "coin" : "coins") + "</span></div>";
    }
    var rows = r.results.slice().sort(function (a, b) { return b.coins - a.coins || a.number - b.number; });
    var out = '<ol class="payouts">', rank = 0, last = null;
    rows.forEach(function (p, i) {
      if (p.coins !== last) { rank = i + 1; last = p.coins; }
      var mine = p.number === me.number;
      out += '<li class="' + (mine ? "me " : "") + (p.coins ? "" : "empty") + '" style="animation-delay: ' + (i * 0.05).toFixed(2) + 's">' +
        '<span class="pay-rank">' + rank + '</span><span class="pay-face">' + faceHTML(p.number) + "</span>" +
        '<span class="pay-who"><b>' + (mine ? "You" : "Player " + p.number) + "</b><small>" + (p.bag === 1 ? "Bag 1" : p.bag === 2 ? "Bag 2" : "No bag") + "</small></span>" +
        '<span class="pay-coins"><i aria-hidden="true"></i>' + p.coins + "</span></li>";
    });
    return out + "</ol>";
  }

  // ---------- the opening: progress, the welcome pictures, the number draw, the tour ----------

  // Seven small bars along the top of the opening, so players can see how much is left.
  function steps(i) {
    var out = '<div class="steps" role="img" aria-label="Step ' + (i + 1) + ' of 7">';
    for (var k = 0; k < 7; k++) out += '<i class="' + (k < i ? "done" : k === i ? "on" : "") + '"></i>';
    return out + "</div>";
  }

  function welcomeArt(index) {
    return ART.briefing("welcome", index);
  }

  // Sixteen numbered discs in a ring, with one large number in the middle.
  function ringHTML() {
    var out = '<div class="ring' + (ui.drawn ? " done" : "") + '" id="ring">';
    for (var n = 1; n <= me.seats; n++) {
      var a = (-90 + (n - 1) * (360 / me.seats)) * Math.PI / 180;
      out += '<span class="disc' + (ui.drawn && n === me.number ? " mine" : "") + '" style="left: ' + (50 + Math.cos(a) * 43).toFixed(2) + "%; top: " + (50 + Math.sin(a) * 43).toFixed(2) + '%">' + n + "</span>";
    }
    return out + '<div class="ring-mid' + (String(me.number).length > 1 ? " two-digit" : "") + '" id="ring-mid">' + (ui.drawn ? esc(me.number) : "?") + "</div></div>";
  }

  // The light has stopped on this player's number.
  function landDraw(quick) {
    var ring = $("ring");
    if (!ring) return;
    ui.drawn = true;
    ui.drawing = false;
    Array.prototype.forEach.call(ring.querySelectorAll(".disc"), function (d, i) {
      d.classList.remove("lit");
      d.classList.toggle("mine", i + 1 === me.number);
    });
    ring.classList.add("done");
    ring.classList.remove("spinning");
    var mid = $("ring-mid");
    mid.textContent = me.number;
    mid.classList.add("landed");
    $("draw-btn").classList.remove("on");
    $("draw-btn").inert = true;
    later(function () {
      narrate(["You’re Player " + me.number + ". This number is yours for the whole game."], { quick: quick, onEnd: function () { show("go"); } });
    }, quick ? 0 : 700);
  }

  // The draw looks like chance: a light runs round the ring and the big number runs with it, slows, and
  // stops. The number was fixed by the server when the invitation was accepted.
  function runDraw() {
    var ring = $("ring");
    if (!ring || ui.drawing || ui.drawn) return;
    ui.drawing = true;
    $("draw-btn").classList.remove("on");
    $("draw-btn").inert = true;
    stopNarration();
    $("say").textContent = "";
    if (instant) return landDraw(true);
    var discs = ring.querySelectorAll(".disc");
    var mid = $("ring-mid");
    var total = me.seats;
    var from = Math.floor(Math.random() * total);
    var hops = total * 2 + ((me.number - 1 - from) % total + total) % total;
    var k = 0;
    ring.classList.add("spinning");
    (function hop() {
      var at = (from + k) % total;
      Array.prototype.forEach.call(discs, function (d, i) { d.classList.toggle("lit", i === at); });
      mid.textContent = at + 1;
      if (k >= hops) return later(function () { landDraw(false); }, 350);
      k += 1;
      var left = hops - k;
      later(hop, left > 11 ? 55 : 55 + (11 - left) * (11 - left) * 3.4);
    })();
  }

  // Two pictures drawn in bold gold line: a ring of sixteen around an unknown number, and an unknown test on a clock.
  function goldPic(inner, box) {
    return '<svg viewBox="' + (box || "0 0 240 200") + '" class="w-pic gold-pic" aria-hidden="true">' + inner + "</svg>";
  }
  function numberArt() {
    var out = "";
    for (var n = 0; n < 16; n++) {
      var a = (-90 + n * 22.5) * Math.PI / 180;
      out += '<circle cx="' + (120 + Math.cos(a) * 86).toFixed(1) + '" cy="' + (100 + Math.sin(a) * 86).toFixed(1) + '" r="8" fill="none" stroke="#ebd19a" stroke-width="3"/>';
    }
    return goldPic(out + '<circle cx="120" cy="100" r="54" fill="#171a19" stroke="#ebd19a" stroke-width="5"/><text x="120" y="131" font-size="88" class="gold-q">?</text>');
  }
  function testsArt() {
    return goldPic(
      '<g transform="rotate(-7 80 100)"><rect x="20" y="40" width="120" height="120" rx="6" fill="#171a19" stroke="#ebd19a" stroke-width="5"/><text x="80" y="131" font-size="88" class="gold-q">?</text></g>' +
      '<circle cx="190" cy="100" r="40" fill="#171a19" stroke="#ebd19a" stroke-width="5"/><path d="M190 100V66A34 34 0 0 1 219 83Z" fill="#ebd19a"/><circle cx="190" cy="100" r="4.5" fill="#ebd19a"/>' +
      '<path d="M190 48v8M190 144v8M234 100h-8" stroke="#ebd19a" stroke-width="4" stroke-linecap="round"/>', "6 24 236 152");
  }

  var TOUR = [
    { art: "hall", intro: true, title: "The Crane Estate", line: "Welcome to the Crane Estate. Mr. Crane built this game arena specifically to decide his heir. Let me show you around." },
    { art: "hall", place: "hall", line: "The hall connects all six rooms. Tap the floor to walk, then cross a marked doorway." },
    { art: "arena", place: "arena", line: "Mr. Crane’s tests are held here. It is closed until the first one." },
    { art: "puzzle", place: "puzzle", line: "Try the daily puzzle at the terminal. You have three attempts to earn one coin." },
    { art: "betting", place: "betting", line: "The betting room. The dealer will tell you when it opens for bets." },
    { art: "studio", place: "studio", line: "Use the microphone to send a message everyone can read." },
    { art: "gallery", place: "gallery", line: "Tap a portrait to see that player’s card." },
    { art: "shop", place: "shop", line: "The shop is closed for now. It opens when the games start." },
    { art: "hall", menu: true, line: "Open Menu anywhere to message a player, ask me a question or check the standings." },
  ];

  function drawTour() {
    var art = $("tour-art");
    if (!art) return;
    var t = TOUR[ui.tour];
    var p = t.intro ? { title: t.title, color: "#ECD9A4" } : PLACES[t.place] || { title: "The menu", color: "#FFFFFF" };
    art.innerHTML = WORLD.svg(t.art).replace('class="map-art"', 'class="map-art" preserveAspectRatio="xMidYMid slice"');
    art.className = "tour-art" + (t.menu || t.intro ? " dim" : "");

    $("tour-k").textContent = t.intro ? "Welcome" : ui.tour + " of " + (TOUR.length - 1);
    var h = $("tour-h");
    h.textContent = p.title;
    h.style.color = p.color;
    $("tour-demo").innerHTML = t.menu
      ? '<div class="menu-grid">' + ["whispers", "study", "standings"].map(function (id) { return '<span class="menu-tile" style="--place: ' + PLACES[id].color + '"><span class="menu-icon">' + ICON[id] + "</span><b>" + PLACES[id].title + "</b></span>"; }).join("") + '</div><span class="menu-btn fake">Menu</span>'
      : "";
    $("tour-next").textContent = t.intro ? "Show me around" : ui.tour === TOUR.length - 1 ? "Enter the hall" : "Next";
    narrate([t.line], {});
  }

  function tourNext() {
    if (ui.tour >= TOUR.length - 1) return go("hall");
    ui.tour += 1;
    drawTour();
  }

  // ---------- the face maker ----------

  var TABS = [["hair", "Hair"], ["colour", "Colour"], ["skin", "Skin"], ["face", "Face"], ["wear", "Wear"]];

  function tabsHTML() {
    return TABS.map(function (t) {
      return '<button type="button" class="' + (ui.tab === t[0] ? "on" : "") + '" data-act="tab" data-tab="' + t[0] + '" aria-pressed="' + (ui.tab === t[0]) + '">' + t[1] + "</button>";
    }).join("");
  }

  // The twenty-four ready-made characters: two rows of women, two rows of men.
  function castHTML() {
    var mine = JSON.stringify(AV.clean(ui.face));
    return AV.PRESETS.map(function (p, n) {
      var on = JSON.stringify(AV.clean(p)) === mine;
      return (
        '<button type="button" class="opt' + (on ? " on" : "") + '" data-act="preset" data-i="' + n + '" aria-pressed="' + on + '">' +
        AV.draw(p, { ring: on ? "#E0B040" : "#2E2E2E", ringWidth: on ? 5 : 2.5, label: "Character " + (n + 1) }) + "</button>"
      );
    }).join("");
  }

  function miniFace(key, value, label) {
    var a = {};
    for (var k in ui.face) a[k] = ui.face[k];
    a[key] = value;
    var on = ui.face[key] === value;
    return (
      '<button type="button" class="opt' + (on ? " on" : "") + '" data-act="opt" data-k="' + key + '" data-v="' + value + '" aria-pressed="' + on + '">' +
      AV.draw(a, { ring: on ? "#E0B040" : "#3A3A3A", ringWidth: on ? 4 : 2.5, label: label + " " + (value + 1) }) + "</button>"
    );
  }

  function dots(key, colours, label) {
    return colours.map(function (c, i) {
      var on = ui.face[key] === i;
      return '<button type="button" class="opt dot' + (on ? " on" : "") + '" style="background: ' + c + '" data-act="opt" data-k="' + key + '" data-v="' + i + '" aria-pressed="' + on + '" aria-label="' + label + " " + (i + 1) + '"></button>';
    }).join("");
  }

  function optionsHTML() {
    var out = "";
    var i;
    if (ui.tab === "colour") out = dots("c", AV.HAIR, "Hair colour");
    else if (ui.tab === "skin") out = dots("s", AV.SKIN, "Skin");
    else if (ui.tab === "wear") {
      out = dots("o", AV.COAT, "Colour") + '<span class="opt-gap"></span>';
      for (i = 0; i < AV.LIMITS.t; i++) out += miniFace("t", i, "Outfit");
      out += '<span class="opt-gap"></span>';
      for (i = 0; i < AV.LIMITS.x; i++) out += miniFace("x", i, "Extra");
    } else if (ui.tab === "face") {
      for (i = 0; i < AV.LIMITS.f; i++) out += miniFace("f", i, "Build");
      out += '<span class="opt-gap"></span>';
      for (i = 0; i < AV.LIMITS.g; i++) out += miniFace("g", i, "Glasses");
      out += '<span class="opt-gap"></span>';
      for (i = 0; i < AV.LIMITS.b; i++) out += miniFace("b", i, "Beard");
      out += '<span class="opt-gap"></span>';
      for (i = 0; i < AV.LIMITS.m; i++) out += miniFace("m", i, "Mouth");
      out += '<span class="opt-gap"></span>';
      for (i = 0; i < AV.LIMITS.e; i++) out += miniFace("e", i, "Lashes");
    } else {
      for (i = 0; i < AV.LIMITS.h; i++) out += miniFace("h", i, "Hair");
    }
    return out;
  }

  function refreshFace(keepScroll) {
    var big = $("face-big");
    if (!big) return;
    var cast = $("cast");
    if (cast) {
      big.innerHTML = AV.sprite(ui.face, me.number);
      cast.innerHTML = castHTML();
      return;
    }
    var box = $("options");
    var left = box.scrollLeft;
    big.innerHTML = AV.draw(ui.face, { label: "Your character" });
    $("tabs").innerHTML = tabsHTML();
    box.innerHTML = optionsHTML();
    box.scrollLeft = keepScroll ? left : 0;
  }

  // ---------- the set: rooms you walk through ----------

  var WORLD = window.DP_WORLD;
  var SPEED = 230; // world units a second, walking
  function ic(d, extra) {
    return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="' + d + '" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>' + (extra || "") + "</svg>";
  }
  var ICON = {
    hall: ic("M5 21V4h10v17M3 21h18M15 7h4v14", '<circle cx="11.5" cy="12.5" r="1.3" fill="currentColor"/>'),
    arena: ic("M3 8h18v10H3zM7 8V5h10v3M3 13h18M9 18v2M15 18v2"),
    puzzle: ic("M6 11V8a6 6 0 0 1 12 0v3M5 11h14v10H5z", '<circle cx="12" cy="16" r="1.6" fill="currentColor"/>'),
    betting: ic("M4 8h13l-3-3M20 16H7l3 3"),
    studio: ic("M9 6a3 3 0 0 1 6 0v5a3 3 0 0 1-6 0zM5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21M8 21h8"),
    sky: ic("M12 3l2.2 6.8L21 12l-6.8 2.2L12 21l-2.2-6.8L3 12l6.8-2.2z"),
    dungeon: ic("M4 4h16v16H4zM8 4v16M12 4v16M16 4v16"),
    gallery: ic("M4 3h16v18H4zM7.5 6.5h9v11h-9z", '<circle cx="12" cy="10.5" r="1.6" fill="currentColor"/>'),
    shop: ic("M4 9h16l-1.5 11h-13zM8 9V7a4 4 0 0 1 8 0v2"),
    whispers: ic("M3 5h18v14H3zM3.5 6l8.5 7 8.5-7"),
    study: ic("M4 5h16v11H10l-4 4v-4H4zM10 9a2 2 0 1 1 3 1.7c-.6.4-1 .8-1 1.5", '<circle cx="12" cy="14.2" r="0.9" fill="currentColor"/>'),
    standings: ic("M3 21h18M5 18v-6h4v6m1 0V6h4v12m1 0v-9h4v9"),
    board: ic("M3 4h18v14H3zM7 9h6M7 13h10M9 18l-2 3M15 18l2 3"),
    table: ic("M6 9a8.5 8.5 0 0 0 0 6M18 9a8.5 8.5 0 0 1 0 6M9 10.5a3.5 3.5 0 0 0 0 3M15 10.5a3.5 3.5 0 0 1 0 3", '<circle cx="12" cy="12" r="1.5" fill="currentColor"/>'),
    players: ic("M4 20c0-4 3.5-6 8-6s8 2 8 6", '<circle cx="12" cy="8" r="4" fill="none" stroke="currentColor" stroke-width="2"/>'),
    guide: ic("M9.3 9.5a2.8 2.8 0 1 1 4.2 2.4c-.9.5-1.5 1.1-1.5 2.1", '<circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="12" cy="17.3" r="1.2" fill="currentColor"/>'),
    goal: ic("M4 19h16M5 16 3.6 7.6l5 4L12 5l3.4 6.6 5-4L19 16z"),
    out: ic("M5.8 5.8l12.4 12.4", '<circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="2"/>'),
    bank: ic("M5 7v5c0 1.7 3.1 3 7 3s7-1.3 7-3V7M5 12v5c0 1.7 3.1 3 7 3s7-1.3 7-3v-5", '<ellipse cx="12" cy="7" rx="7" ry="3" fill="none" stroke="currentColor" stroke-width="2"/>'),
  };
  // One name and one colour for each thing, used on signs, in the menu, on buttons and on every screen.
  // The first nine are rooms you walk to, for things you do there.
  // The rest are pages that open from the menu, wherever you stand: nobody walks to read or to write.
  var PLACES = {
    hall: { title: "The hall", color: "#FFFFFF" },
    arena: { title: "The arena", color: "#E0B040" },
    puzzle: { title: "Puzzle room", color: "#A98BEA" },
    betting: { title: "Betting room", color: "#4FBF7A" },
    studio: { title: "Broadcast room", color: "#E5544B" },
    sky: { title: "Observatory", color: "#6C9BF2" },
    dungeon: { title: "Dungeon", color: "#E0893C" },
    gallery: { title: "Gallery", color: "#E9A3B4" },
    shop: { title: "The shop", color: "#35C2B0" },
    whispers: { title: "Messages", color: "#35C2B0", art: "hall" },
    study: { title: "Ask the GM", color: "#E5544B", art: "hall" },
    board: { title: "Notice board", color: "#6C9BF2", art: "hall" },
    table: { title: "Broadcast", color: "#E5544B", art: "studio" },
    players: { title: "Players", color: "#E9A3B4", art: "gallery" },
    standings: { title: "Standings", color: "#D4B471", art: "hall" },
    guide: { title: "How to play", color: "#BDBDBD" },
    tonight: { title: "Tonight", color: "#E0B040", art: "arena" },
  };
  var PAGES = ["whispers", "study", "players", "table", "standings", "guide"];
  var actors = {}; // number -> the figure on screen, for players in the room I am in
  var spots = {}; // number -> [room, x, y]: where each player was last seen
  var online = {}; // numbers connected right now
  var stage = null; // the set while it is on screen
  var live = { ws: null, tries: 0, timer: null, wanted: false };
  var spriteMemo = {};

  function badge(n) {
    return n ? '<span class="badge" aria-label="' + n + ' unread">' + n + "</span>" : "";
  }

  function spotOf(n) {
    var s = spots[n] || (hall && hall.pos && hall.pos[n]);
    if (s && WORLD.ROOMS[s[0]]) return s;
    var m = WORLD.marker(n);
    return ["hall", m[0], m[1]];
  }

  function place(a) {
    a.el.style.transform = "translate3d(" + (a.x - 32).toFixed(1) + "px," + (a.y - 104).toFixed(1) + "px,0)";
    a.el.style.zIndex = Math.round(a.y);
  }

  function setWalking(a, on) {
    if (a.walking !== on) {
      a.walking = on;
      a.el.classList.toggle("walking", on);
    }
    if (a.flipped !== a.flip) {
      a.flipped = a.flip;
      a.el.classList.toggle("flip", !!a.flip);
      // The figure is mirrored to face the way it walks, so the number on its chest is mirrored back.
      // This is a plain SVG attribute, not CSS: Safari on iPhone puts a CSS mirror of SVG text in the wrong place.
      var num = a.el.querySelector(".sprite .num");
      if (num) {
        if (a.flip) num.setAttribute("transform", "translate(" + (2 * Number(num.getAttribute("x"))).toFixed(1) + " 0) scale(-1 1)");
        else num.removeAttribute("transform");
      }
    }
  }

  function roomSig() {
    return stage.room + JSON.stringify(hall.seats.map(function (s) { return s.avatar ? [s.avatar, spotOf(s.number)[0] === stage.room] : 0; }));
  }

  // Put a figure on the floor for every player who is in this room.
  // House staff. They are not players: no number, an ivory name plate, the house uniform, and they never move.
  var STAFF = {
    betting: { name: "Dealer", at: [620, 404], look: { f: 1, s: 4, h: 0, c: 1, b: 2, m: 1, o: 8, t: 3 } },
    puzzle: { name: "Attendant", at: [812, 338], look: { s: 1, h: 8, c: 1, e: 1, m: 0, o: 8, t: 3 } },
    arena: { name: "Attendant", at: [905, 965], look: { f: 1, s: 2, h: 11, c: 1, m: 0, o: 8, t: 3 } },
    shop: { name: "Shopkeeper", at: [640, 282], look: { f: 1, s: 0, h: 13, c: 1, b: 4, m: 2, o: 8, t: 3 } },
  };

  // Has a game begun that this player has not been told about?
  function nightCall() {
    var n = hall && hall.night;
    return !!n && n.status === "open" && !heard("call" + n.n);
  }

  // Has this player been given the rules of the game being played?
  // The key carries a letter: when the rules of a running game change, the letter changes and every player is given them again.
  function briefed() {
    var n = hall && hall.night;
    return !n || heard("vbB" + n.n);
  }

  // Which rooms are doing business. The GM decides; players cannot open anything.
  function roomOpen(id) {
    var n = hall && hall.night;
    if (id === "arena") return !!n;
    if (id === "shop") return !!(n && n.status === "open" && n.game !== "ladder");
    if (id === "betting") return !!(hall && hall.bettingOpen);
    return true;
  }

  function staffHTML(id) {
    var st = STAFF[id];
    if (!st) return "";
    return '<button type="button" class="actor npc" data-act="npc" style="transform: translate3d(' + (st.at[0] - 32) + "px," + (st.at[1] - 104) + "px,0); z-index: " + Math.round(st.at[1]) + '" aria-label="' + st.name + ', house staff">' +
      '<span class="actor-tag">' + st.name + '</span><span class="actor-fig">' + AV.sprite(st.look, null) + "</span></button>";
  }

  // What a member of staff says, and what the player can do about it.
  function staffLine(id, pz) {
    var n = hall && hall.night;
    if (id === "betting") {
      if (roomOpen(id) && betsOn()) {
        var bs = hall.bets;
        return bs.placed ? { text: "Your bet is placed. It cannot be changed. It is settled when Game 1 ends.", go: ["deal", "See your bet"] }
          : bs.taking && !hall.out ? { text: "Bets are open on Game 1. Guess the score you will finish on. A bet in this stage pays " + [5, 4, 3, 2][bs.stage - 1] + " coins for every coin.", go: ["deal", "Place a bet"] }
          : hall.night && hall.night.status === "open" && !hall.out ? { text: "Bets on your own score are closed. You can still bet a coin on other players\u2019 duels.", go: ["deal", "Bet on a duel"] }
          : { text: "Bets on Game 1 are closed.", go: ["deal", "How the bets work"] };
      }
      return roomOpen(id)
        ? { text: "The tables are open. Make a deal when you are ready.", go: ["deal", "Make a deal"] }
        : { text: "The betting room is closed for bets right now, but feel free to explore the space. To place bets, check again later, when the games start." };
    }
    if (id === "arena") {
      if (!n) return { text: "The GM is preparing the next game, so this area is closed right now, but feel free to explore." };
      if (n.status !== "open") return { text: "Game " + n.n + " is over. The result is " + (isLadder() ? "on the table." : "at the vaults."), go: ["arena", "See the result"] };
      if (isLadder()) {
        if (!briefed()) return shortRules(n)
          ? { text: "Three things have been added to the rules of Game " + n.n + ". Let me show you. It is quick.", act: ["introRules", "Show me"], solo: true }
          : { text: "Welcome to Game " + n.n + ": The Ladder. Let me show you how it is played.", act: ["introRules", "Show me the rules"], solo: true };
        if (hall.out) return { text: "Game " + n.n + " is being played at the table.", act: ["introRules", "Show me the rules"] };
        return { text: n.opened ? "Your cards for this stage are submitted. The stage closes as soon as everyone has submitted." : "The table is open. Walk to the yellow symbol and play your three cards.", act: ["introRules", "The rules again"] };
      }
      // first visit: welcome, then the vaults, then the rules. Nothing else is offered until the rules are seen.
      if (!briefed()) {
        return ui.intro
          ? { text: "These are the six vaults, in the middle of the arena. Three of them hold gold.", act: ["introRules", "Show me the rules"], solo: true }
          : { text: "Welcome to Game " + n.n + ": Six Vaults. Let me show you the vaults.", act: ["introNext", "Show me"], solo: true };
      }
      if (hall.out) return { text: "Game " + n.n + " is being played at the vaults.", act: ["introRules", "Show me the rules"] };
      if (n.opened) return { text: "Your two vaults are sealed. The result comes when the vaults close.", act: ["introRules", "The rules again"] };
      return { text: "The vaults are open. Walk up to them when you are ready to open two.", act: ["introRules", "The rules again"] };
    }
    if (id === "shop") {
      return roomOpen(id)
        ? { text: "The shop is open.", go: ["shop", "See what is for sale"] }
        : { text: "The shop is closed right now. It will open when the games start." };
    }
    if (id === "puzzle" && treasOn()) {
      var tr = hall.treasury;
      if (tr.opened) return { text: "The treasury is open. Every player was paid.", go: ["puzzle", "See the passcode"] };
      if (tr.slot >= 0 && !tr.solved) return { text: "The treasury holds 80 coins, behind a passcode of 16 letters. One of them is hidden in a puzzle only you have.", go: ["puzzle", "Open my puzzle"] };
      return { text: "You have your letter. Tell the others in the broadcast room. " + tr.found + " of " + tr.of + " letters are found.", go: ["puzzle", "Go to the treasury"] };
    }
    if (id === "puzzle") {
      if (!pz) return { text: "One moment." };
      if (pz.solved) return { text: "I see you have done today’s puzzle. Check again later for a different puzzle." };
      if (pz.left <= 0) return { text: "You have used all three tries on today’s puzzle. Check again later for a different puzzle." };
      return { text: "I see you haven’t done today’s puzzle. Would you like to solve it now?", go: ["puzzle", "Solve it now"], later: "Not now" };
    }
    return null;
  }

  // Asked once, the first time a player stands in the hall: play for the week, or resign and watch.
  function drawCommit() {
    var box = $("commit");
    if (!box || !hall) return;
    if (!hall.needsCommit) { box.hidden = true; return; }
    var sig = ui.resignAsk ? "ask" : "first";
    if (!box.hidden && box.getAttribute("data-sig") === sig) return;
    box.setAttribute("data-sig", sig);
    box.innerHTML = '<div class="commit-card">' + (ui.resignAsk
      ? '<i>Resign</i><h2 id="commit-h">Resign your spot?</h2><p>This cannot be undone. You can still walk the house and watch, but you will not play.</p>' +
        '<button type="button" class="btn red" data-act="commitResign">Yes, resign my spot</button>' +
        '<button type="button" class="btn ghost" data-act="commitBack">Go back</button>'
      : '<i>Before you go on</i><h2 id="commit-h">Will you play?</h2><p>Dark Post lasts seven days. A different game every night, until you are eliminated or you win.</p>' +
        '<button type="button" class="btn" data-act="commitYes">Confirm. I’ll play.</button>' +
        '<button type="button" class="btn ghost" data-act="commitAsk">Resign my spot and spectate instead</button>') + "</div>";
    box.hidden = false;
  }
  function sendCommit(play) {
    if (ui.busy) return;
    ui.busy = true;
    api("POST", "/api/commit", { play: play })
      .then(function () { ui.resignAsk = false; return loadHall(); })
      .then(function () {
        hintDue = play && !heard("hall");
        refreshStage();
        hintDue = false;
        if (!play) return toast("You have resigned your spot. You can still watch.");
        if (!heard("hall")) { markHeard("hall"); narrate(["Tap the floor to walk. Step through a marked door to enter its room."], { auto: 3200, fade: true }); }
      })
      .catch(function (err) { toast(err.message); })
      .then(function () { ui.busy = false; });
  }

  var talkedIn = ""; // the room whose staff has already spoken on this visit
  function drawTalk(id, pz) {
    var box = $("npc-talk"), st = STAFF[id], line = staffLine(id, pz);
    if (!box || !st || !line || !stage || stage.room !== id) return;
    box.innerHTML =
      '<span class="npc-face">' + AV.draw(st.look, { ring: "#EFE8D6", ringWidth: 3, label: st.name }) + "</span>" +
      '<div class="npc-words"><b>' + st.name + "<i>House staff</i></b><p>" + esc(line.text) + '</p><div class="npc-acts">' +
      (line.go ? '<button type="button" class="btn" data-act="go" data-scene="' + line.go[0] + '">' + line.go[1] + "</button>" : "") +
      (line.act ? '<button type="button" class="btn" data-act="' + line.act[0] + '">' + line.act[1] + "</button>" : "") +
      (line.solo ? "" : '<button type="button" class="btn ghost" data-act="talkClose">' + (line.later || "OK") + "</button>") + "</div></div>";
    box.hidden = false;
    // the vaults are ringed while the attendant talks about them; the camera goes to them only on the first showing
    var n = hall && hall.night;
    var pointing = id === "arena" && !!n && n.game !== "ladder" && n.status === "open" && (briefed() ? !n.opened && !hall.out : !!ui.intro);
    showVaults(pointing, pointing && !briefed());
  }

  // The attendant points at the vaults: the camera goes to them and they are ringed in light.
  var VAULTS = { at: [750, 636], box: [538, 486, 424, 300] };
  function showVaults(on, pan) {
    if (!stage) return;
    stage.focus = on && pan ? VAULTS.at : null;
    var glow = $("vault-glow");
    if (on && !glow && stage.world) {
      stage.world.insertAdjacentHTML("beforeend", '<div class="vault-glow" id="vault-glow" style="left:' + VAULTS.box[0] + "px;top:" + VAULTS.box[1] + "px;width:" + VAULTS.box[2] + "px;height:" + VAULTS.box[3] + 'px"><span>The six vaults</span></div>');
    } else if (!on && glow) glow.remove();
  }
  function openTalk(id) {
    if (!STAFF[id]) return;
    if (id !== "puzzle") return drawTalk(id);
    drawTalk(id, ui.pz && (ui.pz.held || ui.pz.resetAt > Date.now()) ? ui.pz : null);
    api("GET", "/api/puzzle").then(function (pz) { ui.pz = pz; if (stage && stage.room === id && !$("npc-talk").hidden) drawTalk(id, pz); }).catch(function () {});
  }
  function closeTalk() {
    var box = $("npc-talk");
    if (box) box.hidden = true;
    showVaults(false);
  }

  function buildActors() {
    var out = "";
    hall.seats.forEach(function (s) {
      var n = s.number;
      if (!s.avatar) {
        if (stage.room === "hall") out += '<div class="actor empty" data-n="' + n + '"><span class="actor-fig">' + AV.shadow(n) + "</span></div>";
        return;
      }
      if (spotOf(n)[0] !== stage.room) return;
      var key = n + JSON.stringify(s.avatar);
      if (!spriteMemo[key]) spriteMemo[key] = AV.sprite(s.avatar, n);
      out +=
        '<button type="button" class="actor' + (n === hall.you ? " me" : "") + '" data-act="actor" data-n="' + n + '" aria-label="' + (n === hall.you ? "You, Player " : "Player ") + n + '">' +
        '<span class="actor-tag"></span><span class="actor-fig">' + spriteMemo[key] + "</span></button>";
    });
    // the Gamemaster, when the GM has walked into this room: a figure of their own, not a player and not staff
    if (spots[0] && spots[0][0] === stage.room) {
      if (!spriteMemo.gm) spriteMemo.gm = AV.executor("sprite");
      out += '<button type="button" class="actor npc gm" data-act="gmTalk" data-n="0" aria-label="The Gamemaster"><span class="actor-tag">Gamemaster</span><span class="gm-say"' + (gmLine ? "" : " hidden") + ">" + esc(gmLine) + '</span><span class="actor-fig">' + spriteMemo.gm + "</span></button>";
    }
    var box = $("actors");
    box.innerHTML = out;
    var old = actors;
    actors = {};
    Array.prototype.forEach.call(box.children, function (el) {
      var n = Number(el.getAttribute("data-n"));
      var empty = el.classList.contains("empty");
      var was = old[n] && !old[n].empty && old[n].room === stage.room ? old[n] : null;
      var p = empty ? WORLD.marker(n) : was ? [was.x, was.y] : spotOf(n).slice(1);
      actors[n] = { n: n, room: stage.room, x: p[0], y: p[1], path: was ? was.path : [], then: was ? was.then : null, el: el, walking: false, flip: was ? was.flip : false, empty: empty };
      place(actors[n]);
    });
    box.insertAdjacentHTML("beforeend", staffHTML(stage.room));
    stage.sig = roomSig();
    dressActors();
  }

  function dressActors() {
    if (!hall || !stage) return;
    var unreadFrom = {};
    hall.whispers.forEach(function (t) { unreadFrom[t.with] = t.unread; });
    hall.seats.forEach(function (s) {
      var a = actors[s.number];
      if (!a || a.empty) return;
      var mine = s.number === hall.you;
      a.el.querySelector(".actor-tag").innerHTML =
        (mine ? "You" : s.number) + (s.coins != null ? "<i>" + s.coins + "</i>" : "") + (unreadFrom[s.number] ? "<b>" + unreadFrom[s.number] + "</b>" : "");
      a.el.classList.toggle("away", !mine && !online[s.number]);
      a.el.classList.toggle("gone", !!s.out);
    });
  }

  // ----- what is happening now, and what is next -----

  function span(ms) {
    var s = Math.floor(ms / 1000);
    var d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
    function two(v) { return v < 10 ? "0" + v : "" + v; }
    return d > 0 ? d + "d " + two(h) + "h " + two(m) + "m" : two(h) + ":" + two(m) + ":" + two(sec);
  }

  // Before the bags open, the next thing is the bags. After, it is the round the host has named.
  function nowNext() {
    var night = hall.night;
    if (night && night.status === "open") {
      var ends = new Date(night.endsAt).getTime();
      var togo = ends - Date.now();
      return {
        revealed: true,
        now: "Game " + night.n + ": " + gameName(),
        next: isLadder() ? "Stage " + (night.stage || 1) + " closes" : "The vaults close",
        at: ends,
        count: isNaN(ends) ? "When the GM says" : togo <= 0 ? "Any moment" : span(togo),
        todo: hall.out ? outLine(hall.out) : isLadder() ? (night.opened ? "Your cards for this stage are submitted. Wait for the stage to close." : "Play your three cards at the table in the arena.") : night.opened ? "Your two vaults are sealed. Wait for the night to end." : "Collect clues. Then open two vaults in the arena.",
      };
    }
    var revealed = hall.phase === "revealed";
    var name = revealed ? hall.nextName || "The first game" : "Bag choice reveal";
    // Before the bags open, a time is shown only when the bags will open by themselves at that time.
    // Otherwise the GM opens them when he chooses, and a countdown would be a promise nobody made.
    var at = new Date(revealed ? hall.nextAt : hall.autoOpen ? hall.opensAt : "").getTime();
    var left = at - Date.now();
    var count = isNaN(at) ? "TBD" : left <= 0 ? (revealed ? "Starting" : "Any moment") : span(left);
    return {
      revealed: revealed,
      now: revealed ? "The bags are open" : "Player onboarding",
      next: name,
      at: at,
      count: count,
      todo: hall.out ? outLine(hall.out) : revealed ? (hall.bettingOpen ? "Solve today’s puzzle or make a deal." : "Solve today’s puzzle. Talk to the other players.") : "You have taken your bag. Try the daily puzzle while you wait.",
    };
  }

  // The game's clock: Eastern time, whatever zone the player is in.
  var clockFormat = null;
  function gameTime() {
    try {
      clockFormat = clockFormat || new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", hour: "numeric", minute: "2-digit", timeZoneName: "short" });
      return clockFormat.format(new Date());
    } catch (err) {
      var d = new Date(Date.now() - 5 * 3600000), h = d.getUTCHours(), m = d.getUTCMinutes();
      return ((h + 11) % 12 + 1) + ":" + (m < 10 ? "0" : "") + m + " " + (h < 12 ? "AM" : "PM") + " EST";
    }
  }

  function outLine(out) {
    return out < 0 ? "You resigned your spot. You can still watch." : "You are out of the game. You can still watch.";
  }

  var nowSeen = "", nowTimer = null;
  function flashNow() {
    var el = $("now");
    if (!el) return;
    el.classList.remove("gone");
    clearTimeout(nowTimer);
    nowTimer = setTimeout(function () { var x = $("now"); if (x) x.classList.add("gone"); }, 3000);
  }

  function menuNowHTML() {
    var s = nowNext();
    return '<button type="button" class="menu-now" data-act="go" data-scene="tonight">' +
      '<span class="now-row"><i>Current</i><b>' + esc(s.now) + '</b></span>' +
      '<span class="now-row"><i>Next</i><b>' + esc(s.next) + '</b><em id="menu-count">' + esc(s.count) + '</em></span>' +
      (s.todo ? '<span class="now-do">' + esc(s.todo) + '</span>' : '') + '</button>';
  }

  function drawStatus() {
    if (!hall) return;
    var s = nowNext();
    var a = $("now-a");
    if (a) {
      a.textContent = s.now;
      $("now-b").textContent = s.next;
      $("now-t").textContent = s.count;
      $("now-do").textContent = s.todo;
      // something new is happening: show the ribbon again for a moment
      var sig = s.now + "|" + s.next;
      if (sig !== nowSeen) { nowSeen = sig; flashNow(); }
    }
    var count = $("menu-count");
    if (count) count.textContent = s.count;
    var ck = $("top-clock");
    if (ck) { var t = gameTime(); if (ck.textContent !== t) ck.textContent = t; }
    // the stage of The Ladder that is open: when it closes, and what this player should do about it
    var st = $("top-stage");
    if (st) {
      var ng = hall && hall.night, line = "";
      if (ng && ng.game === "ladder" && ng.status === "open") {
        var endAt = ng.endsAt ? new Date(ng.endsAt).getTime() : NaN, leftMs = endAt - Date.now();
        var when = isNaN(endAt) ? "Stage " + ng.stage + " is open" : leftMs > 0 ? "Stage " + ng.stage + " closes in " + span(leftMs) : "Stage " + ng.stage + " is closing";
        var doIt = hall.out ? "" : ng.opened ? "You have submitted" : stage && stage.room === "arena" ? "Play your cards at the yellow symbol" : "Go to the arena and play your cards";
        line = "<b>" + esc(when) + "</b>" + (doIt ? "<span>" + esc(doIt) + "</span>" : "");
        st.className = "chip stage" + (ng.opened || hall.out ? " done" : !isNaN(endAt) && leftMs < 3600000 ? " soon" : "");
      }
      if (st.getAttribute("data-line") !== line) { st.setAttribute("data-line", line); st.innerHTML = line; st.hidden = !line; }
    }
    var wall = $("world-clock");
    // The wall says what is happening now. Once the bags are open it counts down to the next round.
    if (wall) {
      var lit = s.revealed ? "<span>Next · " + esc(s.next) + "</span><b>" + esc(s.count) + "</b>" : '<span>Current</span><b class="words">' + esc(s.now) + "</b>";
      if (wall.getAttribute("data-lit") !== lit) { wall.setAttribute("data-lit", lit); wall.innerHTML = lit; }
    }
    syncWallet();
  }

  // The arena's page: now, next, and what this player should be doing.
  function drawSched() {
    var box = $("sched");
    if (!box || !hall) return;
    var s = nowNext();
    var when = isNaN(s.at) ? "" : DP.when(new Date(s.at).toISOString(), true) + ", your time";
    var sig = [s.now, s.next, when, hall.coins, me.bag, hall.nextName, hall.nextAt].join("|");
    if (box.getAttribute("data-sig") !== sig) {
      box.setAttribute("data-sig", sig);
      var later = hall.nextAt ? DP.when(hall.nextAt, true) + ", your time" : "Begins after the bags open.";
      box.innerHTML =
        '<div class="s-card now"><i>Current</i><h2>' + esc(s.now) + "</h2><p>" +
        (s.revealed
          ? (hall.coins != null ? "You hold " + plural(hall.coins, "coin", "coins") + "." : "The coins have been counted.")
          : "Two bags. Every player secretly takes one." + (me.bag ? " You took Bag " + me.bag + "." : "")) +
        "</p>" +
        (s.revealed ? '<button type="button" class="link" data-act="go" data-scene="standings">View standings</button>' : '<button type="button" class="link" data-act="rules">The two bags, again</button>') +
        "</div>" +
        '<div class="s-card next"><i>Next</i><h2>' + esc(s.next) + '</h2><b class="s-count" id="sched-count"></b>' + (when ? "<p>" + esc(when) + "</p>" : "") +
        (s.revealed ? "<p>It is played here, in the arena.</p>" : "") + "</div>" +
        (s.revealed ? "" : '<div class="s-card then"><i>Then</i><h2>' + esc(hall.nextName || "The first game") + "</h2><p>" + esc(later) + "</p></div>") +
        '<div class="s-card todo"><i>What to do now</i><p>' + esc(s.todo) + "</p></div>";
    }
    var c = $("sched-count");
    if (c) c.textContent = s.count;
  }

  // ----- who is online right now -----

  // The other players who have the game open at this moment.
  function onlineOthers() {
    if (!hall) return [];
    return hall.seats.filter(function (s) { return s.avatar && s.number !== hall.you && online[s.number]; }).sort(function (a, b) { return a.number - b.number; });
  }

  function whereLine(n) {
    return "In the " + (PLACES[spotOf(n)[0]] || PLACES.hall).title.replace(/^The /, "").toLowerCase();
  }

  function drawOnline() {
    var el = $("top-online");
    if (!el || !hall) return;
    // the count includes the player looking at it: they are online too
    var n = onlineOthers().length + 1;
    $("top-online-n").textContent = n + " online";
    el.setAttribute("aria-label", plural(n, "player is", "players are") + " online now, counting you. Show who.");
  }

  function onlineHTML() {
    var list = onlineOthers();
    var away = hall.seats.filter(function (s) { return s.avatar && s.number !== hall.you && !online[s.number]; }).length;
    var rows = list.map(function (s) {
      return '<div class="bell-row who"><span class="bell-face">' + faceHTML(s.number) + '<i class="on-dot"></i></span><span class="bell-text"><b>Player ' + s.number + "</b><small>" +
        (s.out ? (s.out < 0 ? "Spectator. " : "Out. ") : "") + esc(whereLine(s.number)) + "</small></span>" +
        (!hall.out && !s.out ? '<button type="button" class="who-msg" data-act="seat" data-n="' + s.number + '">Message</button>' : "") + "</div>";
    });
    return '<div class="menu-sheet bell-sheet" role="dialog" aria-modal="true" aria-labelledby="online-heading">' +
      '<div class="menu-head"><h2 id="online-heading">Online now</h2>' +
      '<button type="button" class="menu-close" data-act="menuClose" aria-label="Close the list">×</button></div>' +
      '<p class="bell-none">' + (list.length ? plural(list.length + 1, "player has", "players have") + " the game open right now, counting you." : "Only you have the game open right now.") + "</p>" +
      '<div class="bell-row who"><span class="bell-face">' + faceHTML(hall.you) + '<i class="on-dot"></i></span><span class="bell-text"><b>Player ' + hall.you + " (you)</b><small>" + esc(whereLine(hall.you)) + "</small></span></div>" +
      rows.join("") +
      (away ? '<p class="bell-none who-away">' + plural(away, "player is", "players are") + " away. Their figures are faded.</p>" : "") +
      "</div>";
  }

  // Someone came or went, or changed room: every place that shows who is online follows.
  function presenceChanged() {
    drawOnline();
    drawPlayers();
    drawThreads();
    redrawMenu();
  }

  // ----- the bell: what this player should do now, and news about the others -----

  var BELL = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3.2a5.8 5.8 0 0 0-5.8 5.8v3.5l-1.9 3.4a1 1 0 0 0 .9 1.5h13.6a1 1 0 0 0 .9-1.5l-1.9-3.4V9A5.8 5.8 0 0 0 12 3.2Z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="M9.7 20.2a2.5 2.5 0 0 0 4.6 0" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>';

  // Can this player still solve today's puzzle?
  function puzzleOpen() {
    var pz = hall && hall.puzzle;
    return !treasOn() && !!pz && !hall.out && !pz.solved && pz.left > 0;
  }

  function solvedToday() {
    return ((hall && hall.notices) || []).filter(function (x) { return x.kind === "solved" && x.today; });
  }

  // The things waiting for this player, most pressing first. Each one has a button that takes them there.
  // The bell's number counts only what the player has not yet been shown. Opening the bell shows everything, so the
  // number clears whether or not they act. A row that is only an offer (once: a bet nobody has to place) is shown one time.
  function todoKey(t) { return "td:" + t.title + "|" + (t.sub || ""); }
  function todoNew() { return todoList().filter(function (t) { return !heard(todoKey(t)); }).length; }
  function todoSeen() { todoList().forEach(function (t) { markHeard(todoKey(t)); }); }
  function todoList() { return todoAll().filter(function (t) { return !t.once || !heard(todoKey(t)) || (stage && stage.bellKeep && stage.bellKeep[todoKey(t)]); }); }

  function todoAll() {
    var out = [], u = hall.unread, n = hall.night;
    // the reveal of the last closed stage can be played, and played again, from the bell
    if (n && n.game === "ladder" && n.status === "open" && n.closed > 0) out.push({ title: "Stage " + n.closed + " results are in", sub: "Every duel turned over, the biggest upset and the ladder.", act: "megaNow", go: megaSeen(n.n) >= n.closed ? "Replay" : "Watch" });
    if (n && n.status === "open" && !n.opened && !hall.out) {
      if (!briefed()) out.push({ title: "Game " + n.n + " has begun", sub: gameName() + ".", walk: "Walk to the arena. The attendant has the rules." });
      // the walk to the table is for the first time; after that the bell goes straight there
      else if (isLadder()) out.push(heard("table" + n.n) ? { title: "Play your three cards", sub: "Game " + n.n + ": The Ladder. Stage " + (n.stage || 1) + ".", scene: "arena", go: "Play" }
        : { title: "Play your three cards", sub: "Game " + n.n + ": The Ladder. Stage " + (n.stage || 1) + ".", walk: "Walk to the table in the arena." });
      else out.push({ title: "Open two vaults", sub: "Game " + n.n + ": Six Vaults. Before the vaults close.", walk: "Walk to the vaults in the arena." });
    }
    if (treasOn() && !hall.treasury.opened) {
      var tz = hall.treasury;
      if (tz.slot >= 0 && !tz.solved) out.push({ title: "Solve your puzzle for the treasury", sub: "It hides one letter of the passcode. " + tz.found + " of " + tz.of + " letters found so far.", walk: "Walk to the puzzle room." });
      else out.push({ once: true, title: "Help open the treasury", sub: tz.found + " of " + tz.of + " letters found. 5 coins for everyone when it opens.", walk: "Share your letter in the broadcast room. The door is in the puzzle room." });
    }
    if (puzzleOpen()) {
      var done = solvedToday().length;
      out.push({ title: "Solve today’s puzzle", sub: "Worth " + plural(hall.puzzle.reward, "coin", "coins") + "." + (done ? " " + plural(done, "player has", "players have") + " solved it." : ""), walk: "Walk to the puzzle room to solve it." });
    }
    if (u.whispers) out.push({ title: plural(u.whispers, "new message", "new messages"), sub: "From " + hall.whispers.filter(function (t) { return t.unread; }).map(function (t) { return who(t.with); }).join(", ") + ".", scene: "whispers", go: "Read" });
    if (u.study) out.push({ title: "The GM wrote to you", sub: "Only you can read it.", scene: "study", go: "Read" });
    if (u.board) out.push({ title: plural(u.board, "new notice", "new notices") + " from the GM", sub: "For every player.", scene: "board", go: "Read" });
    if (u.table) out.push({ title: plural(u.table, "new broadcast", "new broadcasts"), sub: "Said to every player.", scene: "table", go: "Read" });
    if (betsOn() && hall.bets.taking && !hall.bets.placed && !hall.out) out.push({ once: true, title: "Bets are open on your Game 1 score", sub: "Pays " + [5, 4, 3, 2][hall.bets.stage - 1] + " coins a coin in this stage. Less in the next.", walk: "If you want to bet, walk to the betting room." });
    if (hall.bettingOpen && !betsOn() && u.deals && !hall.out) out.push({ title: plural(u.deals, "player offers", "players offer") + " you a deal", sub: "Answer in the betting room.", scene: "deal", go: "Answer" });
    return out;
  }

  function unseenNotices() {
    var mark = hall.noticeMark || 0;
    return (hall.notices || []).filter(function (x) { return x.id > mark && noticeMine(x); }).length;
  }

  var stampFormat = null, dayFormat = null;
  function stamp(at, today) {
    try {
      stampFormat = stampFormat || new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", hour: "numeric", minute: "2-digit", timeZoneName: "short" });
      dayFormat = dayFormat || new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", weekday: "short" });
      return (today ? "Today, " : dayFormat.format(new Date(at)) + ", ") + stampFormat.format(new Date(at));
    } catch (err) {
      return today ? "Today" : ago(at);
    }
  }

  // Are two moments on the same day of the game clock?
  var dateFormat = null;
  function sameGameDay(a, b) {
    try {
      dateFormat = dateFormat || new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", year: "numeric", month: "numeric", day: "numeric" });
      return dateFormat.format(new Date(a)) === dateFormat.format(new Date(b));
    } catch (err) {
      return Math.abs(a - b) < 12 * 3600 * 1000;
    }
  }

  function noticeLine(x) {
    if (x.kind === "duel") return x.mine ? "Your duel with Player " + x.n + " is decided" : "Players " + x.n + " and " + x.m + " have dueled";
    if (x.kind === "wait") return "Player " + x.n + " has submitted against you and is waiting";
    if (x.kind === "tfound") return "Player " + x.n + " found a letter of the passcode";
    if (x.kind === "thelp") return "Player " + x.n + " asks for help with their puzzle";
    if (x.kind === "tsolved") return "Player " + x.n + " solved your puzzle. Your letter is waiting";
    if (x.kind === "topen") return "Player " + x.n + " opened the treasury: 5 coins for everyone";
    if (x.kind === "betwon") return "Your bet on Player " + x.n + " won: +2 coins";
    if (x.kind === "betlost") return "Your bet on Player " + x.n + " lost";
    if (x.kind === "betlevel") return "The duel you bet on was level: your coin is back";
    return "Player " + x.n + (x.today ? " solved today’s puzzle" : " solved the daily puzzle");
  }
  // News that is about this player: it counts on the bell and pops up. Other players' duels are only listed.
  // "Waiting for you" stops mattering once this player has submitted.
  function noticeLive(x) { return x.kind !== "wait" || (hall.night && hall.night.status === "open" && !hall.night.opened); }
  function noticeMine(x) { return x.kind === "solved" || (x.kind === "duel" && x.mine) || (x.kind === "wait" && noticeLive(x)) || /^bet(won|lost|level)$/.test(x.kind) || x.kind === "tsolved" || x.kind === "topen"; }

  function bellHTML() {
    var todo = todoList(), fresh = stage.bellMark || 0;
    var rows = todo.map(function (t) {
      // some things are done in a room, not from here: the row says where to go and has no button
      if (t.walk) return '<div class="bell-row todo walk"><span class="bell-text"><b>' + esc(t.title) + "</b><small>" + esc(t.sub) + '</small><small class="bell-walk">' + esc(t.walk) + "</small></span></div>";
      if (t.act) return '<button type="button" class="bell-row todo" data-act="' + t.act + '"><span class="bell-text"><b>' + esc(t.title) + "</b><small>" + esc(t.sub) + '</small></span><em>' + t.go + "</em></button>";
      return '<button type="button" class="bell-row todo" data-act="go" data-scene="' + t.scene + '"><span class="bell-text"><b>' + esc(t.title) + "</b><small>" + esc(t.sub) + '</small></span><em>' + t.go + "</em></button>";
    });
    // news is shown once: whatever was new when the bell was opened, and gone the next time
    var news = (hall.notices || []).filter(function (x) { return x.id > fresh && noticeLive(x); }).map(function (x) {
      var inner = '<span class="bell-face">' + faceHTML(x.n) + '</span><span class="bell-text"><b>' + esc(noticeLine(x)) + "</b><small>" + esc(stamp(x.at, x.today)) + "</small></span>";
      // a duel of mine: the row opens the table, where both cards are shown
      if (x.kind === "duel" && x.mine) return '<button type="button" class="bell-row news fresh" data-act="go" data-scene="arena">' + inner + "<em>See</em></button>";
      return '<div class="bell-row news' + (x.id > fresh ? " fresh" : "") + '">' + inner + (x.id > fresh ? '<i class="bell-new">New</i>' : "") + "</div>";
    });
    // the GM's notices stay here after they are read: the latest three, and a way to all of them
    var gm = hall.gm || { total: 0, notes: [] };
    var gmRows = gm.notes.filter(function (m) { return m.fresh; }).map(function (m) {
      return '<button type="button" class="bell-row gm' + (m.fresh ? " fresh" : "") + '" data-act="go" data-scene="board"><span class="bell-seal" aria-hidden="true">GM</span><span class="bell-text"><b>' + esc(m.body) + "</b><small>" + esc(stamp(m.at, sameGameDay(m.at, Date.now()))) + "</small></span>" + (m.fresh ? '<i class="bell-new">New</i>' : "") + "</button>";
    });
    return '<div class="menu-sheet bell-sheet" role="dialog" aria-modal="true" aria-labelledby="bell-heading">' +
      '<div class="menu-head"><h2 id="bell-heading">Notifications</h2>' +
      '<button type="button" class="menu-close" data-act="menuClose" aria-label="Close notifications">×</button></div>' +
      '<h3 class="bell-h">To do now' + (todo.length ? "<span>" + todo.length + "</span>" : "") + "</h3>" +
      (rows.length ? rows.join("") : '<p class="bell-none">' + (hall.out ? "Nothing to read right now." : "Nothing is waiting for you. Explore the estate, or talk to the other players.") + "</p>") +
      '<h3 class="bell-h">From the GM</h3>' +
      (gm.total
        ? gmRows.join("") + '<button type="button" class="bell-all" data-act="go" data-scene="board">All GM notices<span>' + gm.total + "</span></button>"
        : '<p class="bell-none">No notices from the GM yet.</p>') +
      '<h3 class="bell-h">News</h3>' +
      (news.length ? news.join("") : '<p class="bell-none">Nothing new.</p>') +
      "</div>";
  }

  // Opening the bell reads the news: tell the server, and stop counting it on the badge.
  function readNotices(opening) {
    var list = hall.notices || [];
    var top = list.length ? list[0].id : 0;
    if (opening) stage.bellMark = hall.noticeMark || 0; // what was new when the bell was opened stays marked New while it is open
    if (top <= (hall.noticeMark || 0)) return;
    hall.noticeMark = top;
    api("POST", "/api/notices/seen", { upTo: top }).catch(function () {});
  }

  // Messages from other players have a button of their own beside the bell, with the number unread.
  // A new one also pops up once, and a tap on the pop-up opens the messages.
  var MSG_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4.5 5.2h15a1.6 1.6 0 0 1 1.6 1.6v9a1.6 1.6 0 0 1-1.6 1.6H12l-4.6 3.6v-3.6H4.5a1.6 1.6 0 0 1-1.6-1.6v-9a1.6 1.6 0 0 1 1.6-1.6Z" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/><path d="M7.5 9.6h9M7.5 13h5.5" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg>';
  var msgSeen = null;
  function drawMsg() {
    var btn = $("msg-btn");
    if (!hall || !hall.unread) return;
    var n = hall.unread.whispers || 0;
    if (btn) {
      $("msg-n").innerHTML = n ? '<span class="badge" aria-label="' + plural(n, "unread message", "unread messages") + '">' + n + "</span>" : "";
      btn.classList.toggle("has", n > 0);
    }
    if (msgSeen != null && n > msgSeen && stage && $("note")) {
      var from = (hall.whispers || []).filter(function (t) { return t.unread; }).map(function (t) { return t.with; });
      var el = $("note");
      if ($("onair")) $("onair").hidden = true;
      el.innerHTML = '<span class="onair-face">' + faceHTML(from[0] || 0) + '</span><span class="onair-text"><i>New message</i><b>' + esc(from.length === 1 ? who(from[0]) + " sent you a message." : "You have " + n + " unread messages.") + "</b><small>Tap to read it.</small></span>";
      el.setAttribute("data-to", "whispers");
      el.hidden = false; el.classList.remove("on"); void el.offsetWidth; el.classList.add("on");
      if (btn) { btn.classList.remove("ring"); void btn.offsetWidth; btn.classList.add("ring"); }
      clearTimeout(noteTimer);
      noteTimer = setTimeout(function () { var x = $("note"); if (x) x.hidden = true; }, 9000);
    }
    msgSeen = n;
  }

  function drawBell() {
    drawMsg();
    var btn = $("bell-btn");
    if (!btn || !hall) return;
    var n = todoNew() + unseenNotices();
    $("bell-n").innerHTML = n ? '<span class="badge" aria-label="' + plural(n, "thing", "things") + ' waiting">' + n + "</span>" : "";
    btn.disabled = false;
  }

  // News pops up once as it happens, and once for anyone who arrives after it happened.
  var noteSeen = null, noteTimer = null, noteRetry = null, hintDue = false;
  function showNotice() {
    if (!hall || !hall.notices || !me || me.state !== "hall") return;
    var list = hall.notices, top = list.length ? list[0].id : 0;
    if (noteSeen == null) noteSeen = hall.noticeMark || 0;
    if (top <= noteSeen) return;
    // not while a question or a panel covers the screen: it would be missed
    var saying = $("say") && $("say").textContent.trim(); // the narrator's line sits where the pop-up goes
    if (stage && (hall.needsCommit || hintDue || saying || ($("menu") && !$("menu").hidden))) {
      // try again shortly, so the pop-up follows as soon as the screen is clear
      clearTimeout(noteRetry);
      noteRetry = setTimeout(showNotice, 2000);
      return;
    }
    var fresh = list.filter(function (x) { return x.id > noteSeen && x.kind === "solved" && x.today; });
    var tnews = list.filter(function (x) { return x.id > noteSeen && (x.kind === "topen" || x.kind === "tsolved" || x.kind === "thelp"); });
    if (tnews.length && stage && $("note")) {
      var tn = tnews[0], elT = $("note");
      noteSeen = top;
      if ($("onair")) $("onair").hidden = true;
      elT.innerHTML = '<span class="onair-face">' + faceHTML(tn.n) + '</span><span class="onair-text"><i>The treasury</i><b>' + esc(noticeLine(tn)) + ".</b><small>" + (tn.kind === "thelp" ? "Tap to help them." : "Tap to see.") + "</small></span>";
      elT.setAttribute("data-to", "puzzle");
      elT.hidden = false; elT.classList.remove("on"); void elT.offsetWidth; elT.classList.add("on");
      clearTimeout(noteTimer);
      noteTimer = setTimeout(function () { var x = $("note"); if (x) x.hidden = true; }, 9000);
      return;
    }
    var duels = list.filter(function (x) { return x.id > noteSeen && x.kind === "duel" && x.mine; });
    var waits = list.filter(function (x) { return x.id > noteSeen && x.kind === "wait" && noticeLive(x); });
    noteSeen = top;
    if (duels.length || waits.length) {
      // the game comes first: a duel of mine is decided, or someone is waiting for my cards
      var who = function (xs) { var ns = xs.map(function (x) { return x.n; }); return ns.length === 1 ? "Player " + ns[0] : "Players " + ns.slice(0, -1).join(", ") + " and " + ns[ns.length - 1]; };
      var d1 = duels.length ? { tag: "Duel decided", line: (duels.length > 1 ? "Your duels with " : "Your duel with ") + who(duels) + (duels.length > 1 ? " are decided." : " is decided."), nudge: "Tap to see the cards.", face: duels[0].n }
        : { tag: "Waiting for you", line: who(waits) + (waits.length > 1 ? " have" : " has") + " submitted against you.", nudge: heard("table" + (hall.night ? hall.night.n : 0)) ? "Tap to play your cards." : "Walk to the arena and submit your cards.", face: waits[0].n };
      var el2 = stage && $("note");
      if (!el2) return; // at the table the duels are on the screen already
      if ($("onair")) $("onair").hidden = true;
      el2.innerHTML = '<span class="onair-face">' + faceHTML(d1.face) + '</span><span class="onair-text"><i>' + d1.tag + "</i><b>" + esc(d1.line) + "</b><small>" + esc(d1.nudge) + "</small></span>";
      el2.setAttribute("data-to", duels.length || heard("table" + (hall.night ? hall.night.n : 0)) ? "arena" : "");
      el2.hidden = false; el2.classList.remove("on"); void el2.offsetWidth; el2.classList.add("on");
      var bell2 = $("bell-btn");
      if (bell2) { bell2.classList.remove("ring"); void bell2.offsetWidth; bell2.classList.add("ring"); }
      clearTimeout(noteTimer);
      noteTimer = setTimeout(function () { var x = $("note"); if (x) x.hidden = true; }, 9000);
      return;
    }
    if (!fresh.length) return;
    var names = fresh.length === 1 ? "Player " + fresh[0].n : fresh.length === 2 ? "Players " + fresh[1].n + " and " + fresh[0].n : "Player " + fresh[0].n + " and " + (fresh.length - 1) + " others";
    var line = names + " solved today’s puzzle.";
    var nudge = puzzleOpen() ? "You haven’t yet. Walk to the puzzle room to try it." : hall.puzzle && hall.puzzle.solved ? "So have you." : "";
    var el = stage && $("note");
    if (!el) return toast(line + (nudge ? " " + nudge : ""));
    if ($("onair")) $("onair").hidden = true;
    el.innerHTML = '<span class="onair-face">' + faceHTML(fresh[0].n) + '</span><span class="onair-text"><i>Puzzle solved</i><b>' + esc(line) + "</b>" + (nudge ? "<small>" + esc(nudge) + "</small>" : "") + "</span>";
    el.hidden = false;
    el.classList.remove("on");
    void el.offsetWidth;
    el.classList.add("on");
    var bell = $("bell-btn");
    if (bell) { bell.classList.remove("ring"); void bell.offsetWidth; bell.classList.add("ring"); }
    clearTimeout(noteTimer);
    noteTimer = setTimeout(function () { var x = $("note"); if (x) x.hidden = true; }, 9000);
  }

  // These are the six things available wherever the player is standing.
  function menuHTML() {
    var u = hall.unread;
    var counts = { whispers: u.whispers, study: u.study, table: u.table };
    var gmTotal = (hall.gm && hall.gm.total) || 0;
    var items = PAGES.map(function (id) {
      return '<button type="button" class="menu-tile" data-act="go" data-scene="' + id + '">' +
        '<span class="menu-icon">' + ICON[id] + '</span><b>' + PLACES[id].title + '</b>' + badge(counts[id]) + '</button>';
    });
    return '<div class="menu-sheet" role="dialog" aria-modal="true" aria-labelledby="menu-heading">' +
      '<div class="menu-head"><h2 id="menu-heading">Menu</h2>' + walletMarkup() +
      '<button type="button" class="menu-close" data-act="menuClose" aria-label="Close menu">×</button></div>' +
      (hall.night ? '<button type="button" class="menu-night" data-act="go" data-scene="tonight"><span><i>' + (hall.night.status === "open" ? "Being played now" : "Finished") + "</i><b>Game " + hall.night.n + " · " + gameName() + "</b></span><small>" + (hall.night.status === "open" ? (isLadder() ? (hall.night.opened ? "Your cards are submitted" : "The ladder and the rules") : hall.night.opened ? "Your vaults are sealed" : "Your clue and the rules") : "See the result") + "</small></button>" : "") +
      menuNowHTML() +
      '<div class="menu-grid">' +
      '<button type="button" class="menu-tile wide" data-act="go" data-scene="board"><span class="menu-icon">' + ICON.board + "</span><b>GM notices</b><small>" + (gmTotal ? plural(gmTotal, "notice", "notices") + ", old and new" : "Nothing posted yet") + "</small>" + badge(u.board) + "</button>" +
      items.join("") + '</div>' +
      '</div>';
  }

  // The overlay holds one of three panels. Each is opened by its own button.
  var OPENERS = { menu: "menu-btn", bell: "bell-btn", online: "top-online" };

  function panelHTML() {
    return stage.menuKind === "bell" ? bellHTML() : stage.menuKind === "online" ? onlineHTML() : menuHTML();
  }

  // Keep the open panel true to the latest news, without losing the button the player is on.
  function redrawMenu() {
    var menu = $("menu");
    if (!menu || menu.hidden || !stage || !hall) return;
    var nextMenu = panelHTML();
    if (menu.renderedMenu === nextMenu) return;
    menu.renderedMenu = nextMenu;
    var focused = document.activeElement;
    var index = Array.prototype.indexOf.call(menu.querySelectorAll("button"), focused);
    menu.innerHTML = nextMenu;
    var sameButton = menu.querySelectorAll("button")[index];
    if (sameButton) sameButton.focus({ preventScroll: true });
  }

  function setMenu(open, kind) {
    var el = $("menu");
    if (!el || (open && (!hall || !stage || !stage.room))) return;
    var wasOpen = !el.hidden;
    var opener = $(stage ? OPENERS[stage.menuKind] || "menu-btn" : "menu-btn");
    if (open) {
      stage.menuKind = OPENERS[kind] ? kind : "menu";
      opener = $(OPENERS[stage.menuKind]);
      if (stage.menuKind === "bell") {
        readNotices(true);
        if ($("note")) $("note").hidden = true;
        // everything listed is now seen; offers shown this time stay on the list until the bell is closed
        stage.bellKeep = {};
        todoList().forEach(function (t) { stage.bellKeep[todoKey(t)] = true; });
        todoSeen();
      }
    }
    if (open) {
      stage.keys = {};
      stage.entering = null;
      var self = actors[hall.you];
      if (self && self.path.length) {
        self.path = [];
        self.then = null;
        setWalking(self, false);
        tellMove(stage.room, [self.x, self.y], "p");
      }
      el.renderedMenu = panelHTML();
      el.innerHTML = el.renderedMenu;
    }
    el.hidden = !open;
    Object.keys(OPENERS).forEach(function (k) { $(OPENERS[k]).setAttribute("aria-expanded", String(open && stage.menuKind === k)); });
    Array.prototype.forEach.call(el.parentNode.children, function (child) {
      if (child !== el) child.inert = open;
    });
    if (open) (el.querySelector(".menu-tile, button.bell-row.todo, .who-msg") || el.querySelector("button")).focus({ preventScroll: true });
    else if (wasOpen) { stage.bellKeep = null; opener.focus({ preventScroll: true }); drawBell(); }
  }

  // Draw the room I am standing in: its art, its people, its light.
  // The arena's set and the shop's sign follow the night's match.
  function dressWorld() {
    var n = hall && hall.night;
    WORLD.setArena(n ? n.game : "");
    WORLD.setShop(!!(n && n.status === "open" && n.game !== "ladder")); // the shop sells clues, and only Six Vaults has them
    WORLD.setBets(betsOn(), hall && hall.bets ? hall.bets.stage : 0);
    return (n ? n.game + ":" + n.status : "") + (hall && hall.bettingOpen ? "+b" : "") + (betsOn() ? "+bets" + hall.bets.stage : "");
  }

  function buildRoom(first) {
    var id = stage.room;
    var R = WORLD.ROOMS[id];
    var extras = "";
    if (id === "hall") {
      extras =
        '<div class="dais"><span class="dais-1">' + ART.bag(1) + '</span><span class="dais-2">' + ART.bag(2) + "</span></div>" +
        '<div class="world-clock" id="world-clock"></div>';
    }
    // In the gallery, every frame holds the face of the player with that number.
    if (R.frames) {
      R.frames.forEach(function (f, i) {
        extras += '<button type="button" class="portrait" data-act="card" data-n="' + (i + 1) + '" style="left: ' + (f[0] - f[2] / 2) + "px; top: " + (f[1] - f[2] / 2) + "px; width: " + f[2] + 'px" aria-label="Player ' + (i + 1) + '">' + faceHTML(i + 1) + "</button>";
      });
    }
    R.spots.forEach(function (s, i) {
      if (s.mark && roomOpen(id)) extras += '<button type="button" class="mark" data-act="use" data-i="' + i + '" style="left: ' + s.mark[0] + "px; top: " + s.mark[1] + "px; --place: " + PLACES[id].color + '" aria-label="' + s.label + '"><span class="mark-gem"></span><span class="mark-n" id="mark-n"></span></button>';
    });
    // Things drawn in front of some players and behind others, like the bars of a cell.
    WORLD.overlays(id).forEach(function (o) { extras += '<div class="world-over" style="z-index: ' + o.z + '">' + o.svg + "</div>"; });
    stage.world.style.width = R.w + "px";
    stage.world.style.height = R.h + "px";
    stage.world.innerHTML =
      (dressWorld(), WORLD.svg(id)) + extras + '<div class="actors" id="actors"></div><div class="world-light">' + WORLD.lightSVG(id) + '</div>';
    stage.snap = true;
    stage.spot = undefined;
    buildActors();
    refreshStage();
    // refreshStage may have left the room for the night's result
    if (!$("top-room")) return;
    // A chip that always says which room this is.
    var here = $("top-room");
    here.textContent = PLACES[id].title;
    here.style.setProperty("--place", PLACES[id].color);
    $("now").hidden = id !== "hall";
    if (id === "hall") flashNow();
    if (!STAFF[id]) { talkedIn = ""; closeTalk(); }
    else if (talkedIn !== id) { talkedIn = id; ui.intro = 0; openTalk(id); }
    offerSpot();
    var name = $("room-name");
    name.textContent = first ? "" : PLACES[id].title;
    camera(0);
    if (!first && !reduced && !instant && stage.world.animate)
      stage.world.animate([{opacity: 0.78}, {opacity: 1}], {duration: 160, easing: "ease-out"});
  }

  var gmLine = ""; // what is written over the Gamemaster's head, wherever he stands
  var DUELS_SPOT = { scene: "arena", label: "See your duels" };

  // The one big button offers whatever can be used from where the player stands.
  function offerSpot() {
    if (!stage || !stage.room) return;
    var a = actors[me.number];
    var at = a ? [a.x, a.y] : spotOf(me.number).slice(1);
    var spot = roomOpen(stage.room) ? WORLD.spotAt(stage.room, at[0], at[1]) : null;
    // the vaults are not offered until the attendant has given the rules
    if (spot && stage.room === "arena" && hall.night && hall.night.status === "open" && !briefed()) spot = null;
    // a player who has submitted can look at their duels from anywhere in the estate, not only at the table
    if (!spot && hall.night && isLadder() && hall.night.status === "open" && hall.night.opened && !hall.out) spot = DUELS_SPOT;
    if (spot === stage.spot) return;
    stage.spot = spot;
    var btn = $("hud-action");
    btn.hidden = !spot;
    if (spot) {
      btn.textContent = spot.scene === "arena" && hall && hall.night && hall.night.status === "open" ? (isLadder() ? (hall.night.opened ? "See your duels" : "Play your cards") : "Open the vaults") : spot.scene === "deal" && betsOn() ? (hall.bets.placed ? "See your bet" : "Place a bet") : spot.scene === "puzzle" && treasOn() ? "Open the treasury" : spot.label;
      btn.style.setProperty("--place", PLACES[stage.room].color);
    }
    measureStage();
  }

  function measureStage() {
    if (!stage) return;
    stage.width = stage.el.clientWidth;
    stage.height = stage.el.clientHeight;
    stage.padTop = document.querySelector(".hud-top").offsetHeight + 6;
    stage.padBottom = Math.max(16, document.querySelector(".hud-bottom").offsetHeight - 20);
  }
  window.addEventListener("resize", measureStage);

  function useSpot(spot) {
    if (!spot) return;
    if (spot.cell) ui.cell = spot.cell;
    go(spot.scene);
  }

  function refreshStage() {
    if (!stage || !hall || !stage.room) return;
    if (!live.ws) {
      online = {};
      (hall.online || []).forEach(function (n) { online[n] = true; });
    }
    // a night has ended and this player has not watched the result yet
    if (hall.night && hall.night.unseen && ui.scene !== "vreveal") return go("vreveal");
    // a game has begun and this player has not been told yet
    if (nightCall()) return go("gamecall");
    // a night started or ended while this player stood in the arena or the shop: redraw the room
    var set = dressWorld();
    if (stage.dressed !== set) {
      var was = stage.dressed;
      stage.dressed = set;
      if (was !== undefined && STAFF[stage.room]) { talkedIn = ""; return buildRoom(false); }
    }
    drawCommit();
    if (roomSig() !== stage.sig) buildActors();
    else dressActors();
    var total = hall.unread.table + hall.unread.whispers + hall.unread.study + hall.unread.board;
    $("menu-n").innerHTML = badge(total);
    var mark = $("mark-n");
    if (mark) mark.textContent = (stage.room === "betting" ? hall.unread.deals : 0) || "";
    $("menu-btn").disabled = false;
    drawBell();
    drawOnline();
    if (!$("menu").hidden && stage.menuKind === "bell") readNotices(false); // news that arrives while the bell is open is read too
    redrawMenu();
    drawStatus();
    showCast();
    showNotice();
  }

  // The room always fills the screen; the camera follows me and stops at the walls.
  function camera(dt) {
    var R = WORLD.ROOMS[stage.room];
    var sw = stage.width, sh = stage.height;
    var cover = Math.max(sw / R.w, sh / R.h);
    var z = Math.max(Math.max(0.78, Math.min(1.15, sw / 500)), cover);
    var a = actors[hall.you];
    var fx = a ? a.x : R.w / 2, fy = a ? a.y - 50 : R.h / 2;
    if (stage.focus) { fx = stage.focus[0]; fy = stage.focus[1]; } // someone is pointing at something
    var tx = Math.max(0, Math.min(R.w * z - sw, fx * z - sw / 2));
    var top = stage.padTop || 0, bottom = stage.padBottom || 0;
    var ty = Math.max(-top, Math.min(R.h * z - sh + bottom, fy * z - (sh + top - bottom) / 2));
    if (stage.snap || z !== stage.zoom) {
      stage.camX = tx;
      stage.camY = ty;
      stage.snap = false;
    } else {
      var k = 1 - Math.exp(-dt * 9);
      stage.camX += (tx - stage.camX) * k;
      stage.camY += (ty - stage.camY) * k;
    }
    var transform = "translate3d(" + (-stage.camX).toFixed(1) + "px," + (-stage.camY).toFixed(1) + "px,0) scale(" + z + ")";
    if (transform !== stage.cameraTransform) {
      stage.world.style.transform = transform;
      stage.cameraTransform = transform;
    }
    if (z !== stage.zoom || !stage.scaleSet) {
      stage.world.style.setProperty("--unzoom", (1 / z).toFixed(3));
      stage.scaleSet = true;
    }
    stage.zoom = z;
  }

  function stepActor(a, dt, speed) {
    var left = speed * dt;
    while (left > 0 && a.path.length) {
      var p = a.path[0];
      var dx = p[0] - a.x, dy = p[1] - a.y;
      var d = Math.hypot(dx, dy);
      if (Math.abs(dx) > 0.6) a.flip = dx < 0;
      if (d <= left) {
        a.x = p[0];
        a.y = p[1];
        a.path.shift();
        left -= d;
      } else {
        a.x += (dx / d) * left;
        a.y += (dy / d) * left;
        left = 0;
      }
    }
    setWalking(a, a.path.length > 0);
    place(a);
    spots[a.n] = [a.room, a.x, a.y];
    if (!a.path.length && a.then) {
      var then = a.then;
      a.then = null;
      then();
    }
  }

  // Warm only the current destination. The old room stays visible until the new plate can paint.
  var roomImages = new Map();
  function warmRoom(id) {
    if (roomImages.has(id)) return roomImages.get(id);
    var image = new Image();
    image.decoding = "async";
    image.src = "/art/rooms/" + id + ".webp";
    var ready = image.decode ? image.decode().catch(function () {}) : Promise.resolve();
    roomImages.set(id, ready);
    if (roomImages.size > 3) roomImages.delete(roomImages.keys().next().value);
    return ready;
  }

  function nearbyDoor(id, x, y, depth) {
    var doors = WORLD.ROOMS[id].doors;
    for (var i = 0; i < doors.length; i++) {
      var z = doors[i].zone;
      var upright = z[2] - z[0] < z[3] - z[1];
      var dx = upright ? depth : 4, dy = upright ? 4 : depth;
      if (x >= z[0] - dx && x <= z[2] + dx && y >= z[1] - dy && y <= z[3] + dy) return doors[i];
    }
    return null;
  }

  // Arrival is inside the new room, beyond the return trigger. Commit a crossing only once.
  function enterRoom(to) {
    if (!stage || stage.entering || !$("menu").hidden) return;
    var current = stage, from = current.room;
    var exit = WORLD.doorTo(to, from);
    if (!exit) return;
    current.entering = to;
    var self = actors[me.number];
    if (self) { self.path = []; self.then = null; setWalking(self, false); }
    function arrive() {
      if (stage !== current || current.entering !== to) return;
      current.entering = null;
      var point = exit.arrive;
      spots[me.number] = [to, point[0], point[1]];
      delete actors[me.number];
      stage.room = to;
      tellMove(to, point, "r");
      buildRoom(false);
    }
    var ready = warmRoom(to);
    if (instant) return arrive();
    // A slow connection must still let the player through the doorway.
    var timeout = setTimeout(arrive, 450);
    ready.then(function () { clearTimeout(timeout); arrive(); });
  }

  function tick(now) {
    if (!stage || !hall) return;
    var mine = stage;
    var dt = Math.min(0.16, Math.max(0, (now - stage.last) / 1000));
    stage.last = now;
    var a = actors[hall.you];
    if (a && !stage.entering) {
      var kx = (stage.keys.right ? 1 : 0) - (stage.keys.left ? 1 : 0);
      var ky = (stage.keys.down ? 1 : 0) - (stage.keys.up ? 1 : 0);
      if (kx || ky) {
        var len = Math.hypot(kx, ky);
        var distance = SPEED * dt;
        var slices = Math.max(1, Math.ceil(distance / 7));
        var dx = kx / len * distance / slices, dy = ky / len * distance / slices;
        a.path = [];
        a.then = null;
        for (var step = 0; step < slices; step++) {
          if (WORLD.walkable(stage.room, a.x + dx, a.y)) a.x += dx;
          if (WORLD.walkable(stage.room, a.x, a.y + dy)) a.y += dy;
        }
        if (kx) a.flip = kx < 0;
        a.keyed = true;
        setWalking(a, true);
        place(a);
        spots[a.n] = [stage.room, a.x, a.y];
        if (now - stage.sent > 180) {
          stage.sent = now;
          sendLive({ t: "p", r: stage.room, x: Math.round(a.x), y: Math.round(a.y) });
        }
      } else if (a.keyed) {
        a.keyed = false;
        setWalking(a, false);
        tellMove(stage.room, [a.x, a.y], "p");
      }
    }
    var cast = actors;
    for (var n in cast) {
      if (cast[n].path.length) stepActor(cast[n], dt, SPEED);
      if (stage !== mine) return; // arriving somewhere may have left the set
    }
    a = actors[hall.you];
    if (a) {
      var door = WORLD.doorAt(stage.room, a.x, a.y) || nearbyDoor(stage.room, a.x, a.y, 26);
      if (door) enterRoom(door.to);
      else if (a.walking && (a.path.length || a.keyed)) {
        var approaching = nearbyDoor(stage.room, a.x, a.y, 155);
        if (approaching) warmRoom(approaching.to);
      }
    }
    offerSpot();
    camera(dt);
    stage.raf = requestAnimationFrame(tick);
  }

  // Tell everyone else where this player is going. Falls back to a plain request without a live line.
  function tellMove(roomId, to, kind) {
    var m = { t: kind || "m", r: roomId, x: Math.round(to[0]), y: Math.round(to[1]) };
    if (demo || sendLive(m)) return;
    api("POST", "/api/move", m).catch(function () {});
  }

  function walkTo(target, then) {
    var a = hall && actors[hall.you];
    if (!a || !stage || stage.entering) return;
    closeTalk();
    var to = WORLD.nearest(stage.room, Math.round(target[0]), Math.round(target[1]));
    a.path = WORLD.findPath(stage.room, [a.x, a.y], to);
    a.then = null;
    if (!a.path.length) {
      if (then && Math.hypot(to[0] - a.x, to[1] - a.y) < 7) then();
      return;
    }
    a.then = then || null;
    tellMove(stage.room, a.path[a.path.length - 1], "m");
  }

  function approach(n) {
    var other = actors[n], a = actors[hall.you];
    if (!other || !a) return;
    var dx = a.x - other.x, dy = a.y - other.y;
    var d = Math.hypot(dx, dy) || 1;
    walkTo([other.x + (dx / d) * 50, other.y + (dy / d) * 34], function () {
      ui.withN = n;
      go("whisper");
    });
  }

  function pollMe() {
    if (demo) return;
    api("GET", "/api/me")
      .then(function (data) {
        var changed = data.state !== me.state;
        me = data;
        if (changed) render();
      })
      .catch(function () {});
  }

  // ----- the live line: who is here now, and where they walk -----

  function sendLive(m) {
    if (live.ws && live.ws.readyState === 1) {
      live.ws.send(JSON.stringify(m));
      return true;
    }
    return false;
  }

  var newsTimer = null;
  // ---------- the stage reveal: when a stage closes, every player is shown all of it, once ----------
  // Four beats: the title, every duel of the stage turned over one by one, the talk of the stage, and the
  // ladder read out from the bottom to the top. It plays over whatever room the player is in, and can be skipped.
  var mega = null;
  function megaKey(n) { return "dp_mega_" + (me && me.number) + "_" + n; }
  function megaSeen(n) { try { return Number(localStorage.getItem(megaKey(n)) || 0); } catch (e) { return 0; } }
  function megaMark(n, st) { try { localStorage.setItem(megaKey(n), String(st)); } catch (e) { /* private mode */ } }
  // the GM is told who has been shown the reveal, so stragglers can be nudged. Told once for each stage.
  var megaTold = 0;
  function megaTell(n, st) {
    if (megaTold >= st) return;
    megaTold = st;
    api("POST", "/api/night/reveal-seen", { stage: st }).catch(function () { megaTold = 0; });
  }
  function megaCheck() {
    var b = hall && hall.night;
    if (mega || !b || b.game !== "ladder" || b.status !== "open" || !(b.closed > 0)) return;
    if (megaSeen(b.n) >= b.closed) return megaTell(b.n, b.closed);
    if (stage) return;
    if (document.hidden) return;
    // not over the call to the game, the tour, the rules or the end of the game
    if (["gamecall", "tour", "vbrief", "vreveal", "face", "look"].indexOf(ui.scene) >= 0 || HALL.indexOf(ui.scene) < 0) return;
    mega = { loading: true };
    api("GET", "/api/night").then(function (v) {
      if (!v || !v.mega || megaSeen(v.n) >= v.mega.stage) { mega = null; return; }
      megaPlay(v);
    }).catch(function () { mega = null; });
  }
  function mgCard(c, o) {
    o = o || {};
    if (o.down) return '<span class="mg-card down"></span>';
    var j = LADDER.isJoker(c);
    return '<span class="mg-card' + (j ? " joker" : "") + (o.cls ? " " + o.cls : "") + '"><b>' + (j ? "★" : c) + "</b>" + (o.boost ? "<em>+2</em>" : "") + "</span>";
  }
  // played on request, from the bell, whether or not it has been seen
  function megaNow() {
    if (mega) return;
    mega = { loading: true };
    api("GET", "/api/night").then(function (v) { if (!v || !v.mega) { mega = null; return toast("No stage has closed yet."); } megaPlay(v); }).catch(function (err) { mega = null; toast(err.message); });
  }
  setInterval(megaCheck, 20000);
  document.addEventListener("visibilitychange", function () { if (!document.hidden) setTimeout(megaCheck, 800); });
  function megaPlay(v) {
    var m = v.mega, you = v.you, box = document.createElement("div");
    box.id = "mega";
    box.innerHTML = '<button type="button" id="mega-skip">Skip</button><div id="mega-body"></div>';
    document.body.appendChild(box);
    mega = { box: box, timers: [], n: v.n, stage: m.stage };
    var body = box.querySelector("#mega-body");
    function later(ms, fn) { mega.timers.push(setTimeout(function () { if (mega && mega.box === box) fn(); }, ms)); }
    function close(to) {
      mega.timers.forEach(clearTimeout);
      megaMark(v.n, m.stage);
      megaTell(v.n, m.stage);
      box.classList.add("out");
      setTimeout(function () { if (box.parentNode) box.parentNode.removeChild(box); }, 350);
      mega = null;
      if (to) go(to);
    }
    box.querySelector("#mega-skip").onclick = function () { close(); };
    // marked as seen only once the ladder has been reached or the player skips: a page closed half way plays it again

    // 1. the title
    function title() {
      body.innerHTML = '<div class="mg-title"><i>The Ladder</i><h1>Stage ' + m.stage + '</h1><p>The cards are turned</p><div class="mg-fan">' + mgCard("A") + mgCard("K") + mgCard("2") + mgCard("X1") + "</div></div>";
      later(3400, wall);
    }
    // 2. every duel of the stage. The player's own duels come last.
    function wall() {
      var list = m.duels.slice().sort(function (x, y) { return ((x.a === you || x.b === you) ? 1 : 0) - ((y.a === you || y.b === you) ? 1 : 0); });
      var html = '<div class="mg-head"><i>Stage ' + m.stage + "</i><h2>" + list.length + ' duels</h2></div><div class="mg-wall">';
      list.forEach(function (d, i) {
        html += '<div class="mg-duel' + (d.a === you || d.b === you ? " mine" : "") + '" data-i="' + i + '"><span class="mg-face">' + faceHTML(d.a) + '</span><span class="mg-slot a">' + mgCard("", { down: true }) + '</span><span class="mg-slot b">' + mgCard("", { down: true }) + '</span><span class="mg-face">' + faceHTML(d.b) + "</span></div>";
      });
      body.innerHTML = html + '</div><p class="mg-tally" id="mg-tally">&nbsp;</p>';
      var step = Math.max(140, Math.min(300, Math.round(6500 / Math.max(1, list.length)))), forfeits = 0;
      list.forEach(function (d, i) {
        later(700 + i * step, function () {
          var el = body.querySelector('.mg-duel[data-i="' + i + '"]');
          if (!el) return;
          el.querySelector(".mg-slot.a").innerHTML = mgCard(d.ca, { boost: d.ba, cls: d.fa ? "forfeit" : d.pa > 0 ? "won" : d.pa < 0 ? "lost" : "" });
          el.querySelector(".mg-slot.b").innerHTML = mgCard(d.cb, { boost: d.bb, cls: d.fb ? "forfeit" : d.pb > 0 ? "won" : d.pb < 0 ? "lost" : "" });
          el.classList.add("turned");
          if (d.fa) forfeits += 1; if (d.fb) forfeits += 1;
          var t = body.querySelector("#mg-tally");
          if (t) t.textContent = (i + 1) + " of " + list.length + " turned" + (forfeits ? " · " + forfeits + " forfeited" : "");
        });
      });
      later(700 + list.length * step + 1800, m.upset ? upset : ladder);
    }
    // 3. the talk of the stage
    function upset() {
      var u = m.upset;
      body.innerHTML = '<div class="mg-upset"><i>' + (u.kind === "upset" ? "Biggest upset" : "Strongest card to fall") + '</i><div class="mg-vs"><div class="mg-side won"><span class="mg-bigface">' + faceHTML(u.w) + "</span>" + mgCard(u.cw, { boost: u.bw, cls: "big" }) + "<b>" + esc(who(u.w)) + '</b></div><strong>beat</strong><div class="mg-side lost"><span class="mg-bigface">' + faceHTML(u.l) + "</span>" + mgCard(u.cl, { boost: u.bl, cls: "big" }) + "<b>" + esc(who(u.l)) + "</b></div></div><p>" +
        (LADDER.isJoker(u.cl) && u.cw === "2" ? "A 2 over a Joker." : "A " + LADDER.label(u.cw) + (u.bw ? " with a boost" : "") + " over " + (LADDER.isJoker(u.cl) ? "a Joker" : "a " + LADDER.label(u.cl)) + ".") + "</p></div>";
      later(3800, ladder);
    }
    // 4. the ladder, read from the bottom up
    function ladder() {
      var rows = m.table, n = rows.length, html = '<div class="mg-head"><i>After stage ' + m.stage + '</i><h2>The ladder</h2></div><div class="mg-ladder">';
      rows.forEach(function (r, i) {
        html += '<div class="mg-row' + (i < 3 ? " top" : "") + (i === n - 1 ? " last" : "") + (r.n === you ? " you" : "") + '" style="--d:' + ((n - 1 - i) * 0.24).toFixed(2) + 's"><em>' + (i + 1) + '</em><span class="mg-face">' + faceHTML(r.n) + "</span><b>" + (r.n === you ? "You" : esc(who(r.n))) + "</b>" + (i === n - 1 ? "<u>Danger</u>" : "") + "<strong>" + (r.pts > 0 ? "+" : r.pts < 0 ? "−" : "") + Math.abs(r.pts) + "</strong></div>";
      });
      body.innerHTML = html + '</div><div class="mg-foot" style="--d:' + (n * 0.24 + 0.4).toFixed(2) + 's"><button type="button" class="btn" id="mega-go">See your duels</button><button type="button" class="btn ghost" id="mega-done">Close</button></div>';
      box.querySelector("#mega-go").onclick = function () { close("arena"); };
      box.querySelector("#mega-done").onclick = function () { close(); };
      box.querySelector("#mega-skip").style.display = "none";
      megaMark(v.n, m.stage); megaTell(v.n, m.stage);
    }
    title();
  }

  function news() {
    clearTimeout(newsTimer);
    newsTimer = setTimeout(function () {
      pollMe();
      if (!me || me.state !== "hall") return;
      if (room) pull(false).catch(function () {});
      loadHall().then(function () {
        // the game is beginning: every player is told at once, whatever page they are on
        if (!stage && nightCall() && HALL.indexOf(ui.scene) >= 0 && ui.scene !== "gamecall") return go("gamecall");
        refreshStage(); if (!stage) showNotice(); drawThreads(); drawPlayers(); drawStandings();
        // on the play screen: a stage has closed, or the game has ended, so turn the cards now
        var sched = $("sched");
        if (sched && sched.offsetParent !== null && ui.night && ui.night.on && ui.matchMark !== matchMark()) {
          ui.matchMark = matchMark();
          if (hall.night && hall.night.unseen) return go("vreveal");
          if (hall.night) fetchNight().then(drawMatch);
        }
      }).catch(function () {});
    }, 500);
  }

  function onLive(m) {
    var a;
    if (m.t === "hi") {
      online = {};
      (m.online || []).forEach(function (n) { online[n] = true; });
      for (var k in m.pos) if (Number(k) !== me.number || !spots[k]) spots[k] = m.pos[k];
      gmLine = String(m.gmLine || "");
      if (stage && hall && stage.room) buildActors();
      presenceChanged();
    } else if (m.t === "on") { online[m.n] = true; dressActors(); presenceChanged(); }
    else if (m.t === "off") { delete online[m.n]; dressActors(); presenceChanged(); }
    else if (m.t === "m" || m.t === "p" || m.t === "r") {
      if (m.n === me.number) return;
      var movedRoom = !spots[m.n] || spots[m.n][0] !== m.r;
      spots[m.n] = [m.r, m.x, m.y];
      if (movedRoom) redrawMenu(); // the list of who is online says which room each player is in
      if (!stage || !hall || !stage.room) return;
      a = actors[m.n];
      if (m.r === stage.room && a && !a.empty && m.t !== "r") a.path = m.t === "m" ? WORLD.findPath(stage.room, [a.x, a.y], [m.x, m.y]) : [[m.x, m.y]];
      else if ((m.r === stage.room) !== !!a) buildActors(); // they came into my room, or left it
    } else if (m.t === "gmoff") {
      delete spots[0];
      redrawMenu();
      if (stage && hall && stage.room && actors[0]) buildActors();
    } else if (m.t === "gmsay") {
      // the line over the Gamemaster's head stays until the GM changes it
      gmLine = String(m.text || "");
      var g = stage && actors[0];
      if (!g) return;
      var b = g.el.querySelector(".gm-say");
      b.textContent = gmLine;
      b.hidden = !gmLine;
      if (gmLine) { b.classList.remove("on"); void b.offsetWidth; b.classList.add("on"); }
    } else if (m.t === "news") news();
  }

  function openLive() {
    if (demo || live.ws || !live.wanted || typeof WebSocket === "undefined") return;
    var ws;
    try {
      ws = new WebSocket((location.protocol === "https:" ? "wss://" : "ws://") + location.host + "/api/live" + (token ? "?s=" + encodeURIComponent(token) : ""));
    } catch (e) {
      return;
    }
    live.ws = ws;
    ws.onopen = function () { live.tries = 0; };
    ws.onmessage = function (event) {
      try {
        onLive(JSON.parse(event.data));
      } catch (e) {}
    };
    ws.onclose = function () {
      if (live.ws === ws) live.ws = null;
      if (!live.wanted) return;
      live.tries += 1;
      clearTimeout(live.timer);
      live.timer = setTimeout(openLive, Math.min(30000, 1500 * live.tries));
    };
    ws.onerror = function () {
      try { ws.close(); } catch (e) {}
    };
  }

  function closeLive() {
    live.wanted = false;
    clearTimeout(live.timer);
    if (live.ws) {
      try { live.ws.close(); } catch (e) {}
      live.ws = null;
    }
    online = {};
  }

  // ----- the preview has no server, so a few sample players wander the hall on their own -----

  function startBots() {
    var movers = [3, 9, 14];
    movers.forEach(function (n) { online[n] = true; });
    dressActors();
    presenceChanged();
    function somewhere() {
      for (var i = 0; i < 40; i++) {
        var p = [120 + Math.random() * 1560, 220 + Math.random() * 1160];
        if (WORLD.walkable("hall", p[0], p[1])) return p;
      }
      return WORLD.marker(1);
    }
    movers.forEach(function wander(n) {
      later(function () {
        if (!stage) return;
        var a = actors[n];
        if (a && !a.empty && stage.room === "hall") a.path = WORLD.findPath("hall", [a.x, a.y], somewhere());
        wander(n);
      }, 1500 + Math.random() * 6500);
    });
  }

  // ---------- pages: players, the puzzle, deals, the sky, the door log ----------

  function ago(at) {
    var s = Math.max(0, Math.floor((Date.now() - at) / 1000));
    if (s < 90) return "just now";
    if (s < 3600) return Math.floor(s / 60) + " min ago";
    if (s < 86400) return Math.floor(s / 3600) + " h ago";
    return plural(Math.floor(s / 86400), "day", "days") + " ago";
  }

  function coinsKnown() {
    return hall.phase === "revealed" && hall.seats.some(function (s) { return s.coins != null && s.number !== hall.you; });
  }

  function drawStandings() {
    var box = $("standings");
    if (!box || !hall) return;
    var published = coinsKnown();
    var coins = balance();
    var content = '<div class="standing-balance"><span>Your coins</span><strong>' + coins + '</strong></div>';
    if (!published) {
      content += '<h2>' + (hall.phase === "revealed" ? 'Balances are private' : 'The bags are not open yet') + '</h2><p>' +
        (hall.phase === "revealed"
          ? 'The GM is keeping coin totals private. You can see your own balance above.'
          : 'Your puzzle winnings count now. Bag payouts are added at opening. Rankings appear if the GM shares coin totals.') + '</p>';
    } else {
      var seats = hall.seats.filter(function (s) { return s.avatar && Number.isFinite(s.coins); });
      seats.sort(function (a, b) { return b.coins - a.coins || a.number - b.number; });
      var rank = 0;
      content += '<h2>Coin standings</h2><p>Ranked by coins. Players with the same balance share a place.</p><ol class="standing-list">';
      seats.forEach(function (s, i) {
        if (!i || seats[i - 1].coins !== s.coins) rank = i + 1;
        var mine = s.number === hall.you;
        content += '<li' + (mine ? ' class="mine"' : '') + '><span class="place-number" aria-label="Place ' + rank + '">' + rank +
          '</span><span class="standing-face" aria-hidden="true">' + faceHTML(s.number) + '</span><span>Player ' + s.number + (mine ? ' <small>you</small>' : '') +
          '</span><b>' + plural(s.coins, 'coin', 'coins') + '</b></li>';
      });
      content += '</ol>';
    }
    if (box.renderedStandings !== content) {
      box.innerHTML = content;
      box.renderedStandings = content;
    }
  }

  function drawPlayers() {
    var box = $("faces");
    if (!box || !hall) return;
    var rows = hall.seats.slice();
    var here = rows.filter(function (s) { return s.avatar; }).length;
    var on = onlineOthers().length;
    $("players-note").textContent = here + " of " + rows.length + " players have arrived. " + (on ? plural(on, "other is", "others are") + " online now, marked with a green dot. " : "") + "Select a portrait to open their player card.";
    box.innerHTML = rows.map(function (s) {
      var mine = s.number === hall.you;
      return (
        '<button type="button" class="face-tile' + (mine ? " me" : "") + (s.avatar ? "" : " empty") + (s.out ? " gone" : "") + '" data-act="card" data-n="' + s.number + '">' +
        '<span class="face-pic">' + faceHTML(s.number) + (!mine && s.avatar && online[s.number] ? '<i class="on-dot" title="Online now"></i>' : "") + "</span><b>" + (mine ? "You" : "Player " + s.number) + "</b>" +
        (!s.avatar ? "<small>Not here yet</small>" : s.out ? '<small class="gone">' + (s.out < 0 ? "Resigned" : "Out") + "</small>" : s.coins != null ? '<small class="coin">' + s.coins + "</small>" : "<small>In the game</small>") + "</button>"
      );
    }).join("");
  }

  // The card behind a portrait: the little that everyone may know about a player.
  function showCard(n) {
    var el = $("card");
    var s = seatOf(n);
    if (!el || !s) return;
    ui.card = n;
    var mine = n === hall.you;
    var revealed = hall.phase === "revealed";
    function row(label, value) { return '<div class="card-row"><span>' + label + "</span><b>" + value + "</b></div>"; }
    var rows = !s.avatar
      ? row("Status", "Not here yet")
      : row("Status", s.out < 0 ? "Resigned. Watching." : s.out ? "Out in Game " + s.out : "In the game") +
        row("Coins", mine ? balance() : s.coins != null ? s.coins : revealed ? "Private" : "Bags not open yet") +
        row("Joined", ago(s.since)) +
        row("Last seen", mine || online[n] ? "Here now" : ago(s.seen)) +
        row("Puzzles solved", s.solved) +
        row("Deals made", s.deals);
    el.innerHTML =
      '<div class="card" role="dialog" aria-label="Player ' + n + '"><span class="card-face">' + faceHTML(n) + "</span><h2>Player " + n + (mine ? " <small>You</small>" : "") + "</h2>" + rows +
      (mine && hall.canEditFace ? '<button type="button" class="btn" data-act="editFace">Change my disguise</button>' : "") +
      (s.avatar && !mine ? '<button type="button" class="btn" data-act="seat" data-n="' + n + '">Message Player ' + n + "</button>" : "") +
      '<button type="button" class="btn ghost" data-act="cardClose">Close</button></div>';
    el.hidden = false;
  }

  // ----- the puzzle of the day -----

  var SHAPES = {
    a: '<svg viewBox="0 0 40 40" class="pz-shape" aria-label="diamond"><path d="M20 3 L37 20 L20 37 L3 20 Z" fill="#E0B040"/></svg>',
    b: '<svg viewBox="0 0 40 40" class="pz-shape" aria-label="square"><rect x="5" y="5" width="30" height="30" fill="#35C2B0"/></svg>',
    c: '<svg viewBox="0 0 40 40" class="pz-shape" aria-label="triangle"><path d="M20 4 L37 36 H3 Z" fill="#A98BEA"/></svg>',
  };

  function tiles(text) {
    return '<div class="pz-tiles">' + String(text).split("").map(function (ch) { return "<b>" + esc(ch) + "</b>"; }).join("") + "</div>";
  }

  function drawPuzzle() {
    var box = $("pz");
    var p = ui.pz;
    if (!box || !p) return;
    var body = "";
    var open = !p.solved && p.left > 0;
    if (p.type === "code") {
      body = '<p class="pz-hint">Each row is a wrong guess. Beside it: how close that guess was.</p>' +
        p.data.clues.map(function (c) {
          var notes = [];
          if (c.place) notes.push('<span class="in">' + (c.place === 1 ? "1 digit is right and in the right place." : c.place + " digits are right and in the right place.") + "</span>");
          if (c.digit) notes.push('<span class="near">' + (c.digit === 1 ? "1 digit is right but in the wrong place." : c.digit + " digits are right but in the wrong place.") + "</span>");
          if (!notes.length) notes.push('<span class="none">No digit is right.</span>');
          return '<div class="pz-clue said">' + tiles(c.guess) + '<p class="pz-said">' + notes.join("") + "</p></div>";
        }).join("");
    } else if (p.type === "sums") {
      body = p.data.rows.map(function (r) {
        return '<div class="pz-sum">' + r.shapes.map(function (k) { return SHAPES[k]; }).join("<i>+</i>") + "<i>=</i><b>" + r.sum + "</b></div>";
      }).join("") + '<div class="pz-sum ask">' + SHAPES.a + "<i>×</i>" + SHAPES.b + "<i>×</i>" + SHAPES.c + "<i>=</i><b>?</b></div>";
    } else if (p.type === "keys") {
      // six numbered keys, a picture for each clue about the order they are used in, and one order that fits them all
      body = '<p class="pz-hint">Find the order that fits every picture. Read each one left to right: first to last.</p>' +
        '<div class="pz-clues">' + (p.data.clues || []).map(keyClueHTML).join("") + "</div>" +
        '<p class="pz-hint">' + (open ? "Tap the keys in the order they are used." : "The six keys.") + "</p>" +
        '<div class="pz-keys" id="pz-keys">' + [1, 2, 3, 4, 5, 6].map(function (k) { return '<button type="button" class="pz-disc" data-k="' + k + '"' + (open ? "" : " disabled") + ">" + k + "</button>"; }).join("") + "</div>" +
        '<div class="pz-order" id="pz-order"><span>First</span>' + [0, 1, 2, 3, 4, 5].map(function (i) { return '<button type="button" class="pz-slot" data-i="' + i + '"' + (open ? "" : " disabled") + ' aria-label="Place ' + (i + 1) + '"></button>'; }).join("") + "<span>Last</span></div>";
    } else if (p.type === "cipher") {
      body = tiles(p.data.text) + '<p class="pz-hint">A B C D E F G H I J K L M N O P Q R S T U V W X Y Z</p>';
    } else {
      body = '<div class="pz-tiles wide">' + p.data.terms.map(function (t) { return "<b>" + t + "</b>"; }).join("") + '<b class="q">?</b></div>';
    }
    var end = p.solved
      ? '<div class="pz-done ok"><b>Solved.</b> +' + plural(p.reward, "coin", "coins") + ", paid into your balance. One puzzle a day.</div>"
      : p.left <= 0
        ? '<div class="pz-done"><b>No tries left.</b> The answer was ' + esc(p.answer) + ". One puzzle a day.</div>"
        : '<div class="composer pz-form" id="pz-form"><input type="text" id="pz-answer" maxlength="24" autocomplete="off" autocapitalize="characters" enterkeyhint="send" inputmode="' + (p.type === "cipher" ? "text" : "numeric") + '" placeholder="Your answer" aria-label="Your answer">' +
          '<button type="button" class="btn send" id="pz-send">Try</button></div><p class="pz-left">' + plural(p.left, "try", "tries") + " left today</p>";
    box.innerHTML =
      '<div class="s-card now"><i>Worth ' + plural(p.reward, "coin", "coins") + " · three tries</i><h2>" + esc(p.title) + '</h2><div class="pz-body">' + body + "</div><p>" + esc(p.type === "keys" ? (open ? "Or type the six numbers in order." : "") : (p.data && p.data.ask) || p.ask) + "</p>" + end + "</div>" +
      (p.held
        // the GM is holding this puzzle: it does not change at midnight, and nobody knows yet when it will
        ? '<div class="s-card"><i>Next puzzle</i><b class="s-count small">TBD</b><p>This puzzle stays open until the GM starts the next one. Every player gets the same puzzle.</p>'
        : '<div class="s-card"><i>Next puzzle in</i><b class="s-count small" id="pz-reset">' + span(Math.max(0, p.resetAt - Date.now())) + "</b><p>Every player gets the same puzzle.</p>") +
"</div>";
    if (p.type === "keys") bindKeys();
    var form = $("pz-form");
    if (form) {
      var tryNow = function () {
        var value = $("pz-answer").value.trim();
        if (!value || ui.busy) return;
        ui.busy = true;
        api("POST", "/api/puzzle", { answer: value, no: p.no })
          .then(function (res) {
            ui.pz = res;
            if (hall) hall.puzzle = { solved: !!res.solved, left: res.left, reward: res.reward };
            drawPuzzle();
            if (res.right) pzResult("win", res);
            else if (res.left <= 0) pzResult("lose", res);
            else toast("Not that. " + plural(res.left, "try", "tries") + " left.");
            // the coin is in the balance at once
            loadHall().then(function () {
              syncWallet();
              var bal = $("pz-bal");
              if (bal) bal.textContent = "Your balance: " + plural(balance(), "coin", "coins") + ".";
            }).catch(function () {});
          })
          .catch(function (err) {
            toast(err.message);
            // the puzzle may have changed under the page: show whatever is in play now
            return api("GET", "/api/puzzle").then(function (now) { ui.pz = now; if (currentScene() === "puzzle") drawPuzzle(); }).catch(function () {});
          })
          .then(function () { ui.busy = false; });
      };
      $("pz-send").addEventListener("click", tryNow);
      $("pz-answer").addEventListener("keydown", function (event) {
        if (event.key === "Enter" && !event.isComposing) { event.preventDefault(); tryNow(); }
      });
    }
  }

  // One clue of the six keys, as a picture. Left is earlier, right is later.
  function keyClueHTML(c) {
    function disc(k) { return '<b class="pz-keyno">' + k + "</b>"; }
    function strip(lit, crossed) {
      var out = "";
      for (var i = 0; i < 6; i++) out += '<i class="' + (lit(i) ? "lit" : crossed && crossed(i) ? "no" : "") + '"></i>';
      return '<span class="kc-is">is</span><span class="kc-strip">' + out + "</span>";
    }
    var swap = '<svg class="kc-swap" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 8h14l-3-3M20 16H6l3 3" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
    var pic, says;
    if (c.k === "before") { pic = disc(c.a) + '<span class="kc-arrow"></span>' + disc(c.b); says = "before"; }
    else if (c.k === "next") { pic = '<span class="kc-pair">' + disc(c.a) + disc(c.b) + "</span>"; says = "side by side, in this order"; }
    else if (c.k === "apart") { pic = '<span class="kc-pair no">' + disc(c.a) + disc(c.b) + "</span>" + swap; says = "never side by side"; }
    else if (c.k === "gap") { pic = disc(c.a) + new Array(c.n + 1).join('<i class="kc-hole"></i>') + disc(c.b) + swap; says = "this far apart, either way round"; }
    else if (c.k === "ends") { pic = disc(c.a) + strip(function (i) { return i === 0 || i === 5; }); says = "first or last"; }
    else if (c.k === "mid") { pic = disc(c.a) + strip(function (i) { return i > 0 && i < 5; }, function (i) { return i === 0 || i === 5; }); says = "not first, not last"; }
    else if (c.k === "early") { pic = disc(c.a) + strip(function (i) { return i < 3; }); says = "in the first three"; }
    else { pic = disc(c.a) + strip(function (i) { return i > 2; }); says = "in the last three"; }
    return '<div class="kc"><span class="kc-pic">' + pic + "</span><small>" + says + "</small></div>";
  }

  // The six keys are answered by tapping them into place. The slots always show what is in the answer box.
  function bindKeys() {
    var input = $("pz-answer"), keys = $("pz-keys"), order = $("pz-order");
    if (!keys || !order) return;
    function digits() {
      var seen = {}, out = [];
      String(input ? input.value : (ui.pz.solved || ui.pz.left <= 0) && ui.pz.answer ? ui.pz.answer : "").split("").forEach(function (ch) {
        if (/[1-6]/.test(ch) && !seen[ch] && out.length < 6) { seen[ch] = true; out.push(ch); }
      });
      return out;
    }
    function show() {
      var d = digits();
      Array.prototype.forEach.call(order.querySelectorAll(".pz-slot"), function (slot, i) {
        slot.innerHTML = d[i] ? '<b class="pz-keyno">' + d[i] + "</b>" : "";
        slot.classList.toggle("full", !!d[i]);
      });
      Array.prototype.forEach.call(keys.querySelectorAll(".pz-disc"), function (b) {
        b.classList.toggle("used", d.indexOf(b.getAttribute("data-k")) >= 0);
      });
    }
    if (input) {
      keys.addEventListener("click", function (event) {
        var b = event.target.closest(".pz-disc");
        if (!b) return;
        var d = digits(), k = b.getAttribute("data-k"), at = d.indexOf(k);
        if (at >= 0) d.splice(at, 1); else if (d.length < 6) d.push(k);
        input.value = d.join("");
        show();
      });
      order.addEventListener("click", function (event) {
        var slot = event.target.closest(".pz-slot");
        if (!slot) return;
        var d = digits();
        d.splice(Number(slot.getAttribute("data-i")), 1); // tap a placed key to take it out
        input.value = d.join("");
        show();
      });
      input.addEventListener("input", show);
    }
    show();
  }

  // The moment a puzzle is settled: solved, with the coin; or failed, with the answer.
  function pzResult(kind, p) {
    var old = $("pz-result");
    if (old) old.remove();
    var el = document.createElement("div");
    el.className = "pz-result " + kind;
    el.id = "pz-result";
    el.setAttribute("role", "alertdialog");
    el.innerHTML = kind === "win"
      ? '<div class="pz-burst" aria-hidden="true"></div><div class="pz-coin">' + ART.bigCoin() + "</div><h2>Puzzle solved</h2>" +
        '<p class="pz-plus">+' + plural(p.reward, "coin", "coins") + '</p><p class="pz-note" id="pz-bal">Paid into your balance.</p>' +
        '<button type="button" class="btn narrow" data-act="pzDone">Continue</button>'
      : '<div class="pz-x" aria-hidden="true"><svg viewBox="0 0 120 120"><circle cx="60" cy="60" r="52" fill="none" stroke="#ff5a4d" stroke-width="7"/><path d="M41 41l38 38M79 41 41 79" stroke="#ff5a4d" stroke-width="9" stroke-linecap="round"/></svg></div>' +
        "<h2>Puzzle failed</h2><p class=\"pz-plus\">The answer was " + esc(p.answer) + '</p><p class="pz-note">' + (p.held ? "No coin this time. The GM will start the next puzzle." : "No coin today. A new puzzle arrives at midnight EST.") + "</p>" +
        '<button type="button" class="btn narrow" data-act="pzDone">Continue</button>';
    (root.firstElementChild || root).appendChild(el);
  }

  // ----- Game: The Ladder. Fifteen cards, one against every other player, in stages of three -----

  function isLadder() { var n = (ui.night && ui.night.on && ui.night) || (hall && hall.night); return !!n && n.game === "ladder"; }
  function gameName() { return isLadder() ? "The Ladder" : "Six Vaults"; }

  // One playing card. o: small, down (face down), dim (already played), boost, cls
  function cardHTML(c, o) {
    o = o || {};
    var size = o.small ? " small" : o.tiny ? " tiny" : "";
    if (o.down) return '<span class="pcard down' + size + '"></span>';
    var j = LADDER.isJoker(c);
    return '<span class="pcard' + (j ? " joker" : "") + size + (o.dim ? " dim" : "") + (o.cls ? " " + o.cls : "") + '">' +
      "<b>" + (j ? "★" : c) + "</b>" + (o.tiny ? "" : "<i" + (c === "A" || c === "2" ? ' class="rank"' : "") + ">" + (j ? "Joker" : c === "A" ? "High" : c === "2" ? "Low" : "♠") + "</i>") + (o.boost ? "<em>+2</em>" : "") + "</span>";
  }

  // The rules of The Ladder, one picture to a screen. The pictures are made of the same cards the game is played with.
  // A player who was given the first set of rules is shown only what was added to them.
  function shortRules(n) { return !!n && heard("vb" + n.n) && !heard("vbB" + n.n); }

  function ladderTiles(n) { var all = ladderTilesAll(n); return shortRules(n) ? all.slice(-3) : all; }

  function ladderTilesAll(n) {
    var r = n.rules, pr = r.prizes.join(", ").replace(/, ([^,]*)$/, " and $1");
    function pic(inner, cls) { return '<div class="vb-draw' + (cls ? " " + cls : "") + '">' + inner + "</div>"; }
    function versus(a, b, ra, rb, oa, ob) {
      return '<div class="vs"><span class="vs-side' + (ra > 0 ? " won" : ra < 0 ? " lost" : "") + '">' + cardHTML(a, oa) + "<u>" + (ra > 0 ? "+1" : ra < 0 ? "−1" : "0") + '</u></span><span class="vs-x">vs</span>' +
        '<span class="vs-side' + (rb > 0 ? " won" : rb < 0 ? " lost" : "") + '">' + cardHTML(b, ob) + "<u>" + (rb > 0 ? "+1" : rb < 0 ? "−1" : "0") + "</u></span></div>";
    }
    var all = LADDER.CARDS.map(function (c) { return cardHTML(c, { small: true }); }).join("");
    var used = LADDER.CARDS.map(function (c, i) { return cardHTML(c, { small: true, dim: [1, 4, 8, 11, 13].indexOf(i) >= 0 }); }).join("");
    var faces = "";
    for (var s = 0; s < 5; s++) faces += '<span class="stage-box"><i>Stage ' + (s + 1) + "</i><span><b></b><b></b><b></b></span></span>";
    return [
      { line: "Everyone holds the same fifteen cards. The 2 is the lowest. The Ace is the highest: it beats the King.", pic: pic('<div class="fan-all">' + all + '</div><div class="lowhigh"><span>Lowest</span><i></i><span>Highest</span></div>') },
      { line: "You meet every other player once, and play one card against them.", pic: pic(versus("9", "6", 0, 0, {}, { down: true }).replace(/<u>0<\/u>/g, ""), "meet") },
      { line: "The higher card wins a point. The lower card loses one. Ace beats King. Equal cards score nothing.", pic: pic(versus("A", "K", 1, -1) + versus("7", "7", 0, 0), "two") },
      { line: "A Joker beats every card. Except a 2.", pic: pic(versus("X1", "A", 1, -1) + versus("2", "X1", 1, -1), "two") },
      { line: "Each card is played once. Everyone can see which cards you have used.", pic: pic('<div class="fan-all">' + used + "</div>") },
      { line: plural(r.boostPrice, "coin", "coins") + " adds " + r.boost + " to a card. You can do it " + (r.boosts === 2 ? "twice" : r.boosts + " times") + " in the whole game.", pic: pic(versus("9", "10", 1, -1, { boost: true }, {}), "boost") },
      { line: "There are five stages. Each stage you play three opponents.", pic: pic('<div class="stages">' + faces + "</div>") },
      { line: "The three highest scores win " + pr + " coins. The lowest ranked player is eliminated.", pic: '<img class="vb-art" src="/art/night1/brief-8.webp" alt="A podium with three coins">' + pic('<div class="elim"><span class="rung-face">' + faceHTML(n.you) + '</span><b>Last place</b><img src="/art/night1/stamp-out.webp" alt="Out"></div>', "elim-wrap") },
      { line: "To play your cards, walk to the yellow symbol in the arena.", pic: pic('<div class="walkto"><span class="walk-me">' + faceHTML(n.you) + '</span><i class="walk-arrow"></i><span class="walk-mark"></span></div><div class="walk-cap">The yellow symbol, in front of the cards</div>') },
      { line: "A tip: talk to your opponents before you submit. You can strike deals with them. They may keep their word. They may not.", pic: pic('<div class="talkto"><span class="rung-face">' + faceHTML(n.you) + '</span><span class="bubble">I play low, you play low?</span><span class="bubble right">Deal.</span><span class="rung-face">' + faceHTML((n.opponents && n.opponents[0] && n.opponents[0][0]) || (n.you % 16) + 1) + "</span></div>") },
    ];
  }

  // What the player has laid out for this stage, before sealing.
  function ladderDraft(n) {
    var opps = n.opponents[n.stage - 1] || [];
    if (!ui.ld || ui.ld.stage !== n.stage || ui.ld.game !== n.n) {
      ui.ld = { game: n.n, stage: n.stage, dirty: false, plays: opps.map(function (o) {
        var was = (n.sealed || []).filter(function (p) { return p.opp === o; })[0];
        return { opp: o, card: was ? was.card : null, boost: was ? !!was.boost : false };
      }) };
    }
    return ui.ld;
  }

  function ladderTableHTML(n, final) {
    var res = n.result || {}, prizes = res.prizes || {};
    return '<div class="ladder">' + n.table.map(function (row, i) {
      var mine = row.n === n.you, out = final && res.out === row.n;
      // the bottom three are in danger while the game is on: the last of them goes home
      var danger = !final && n.table.length > 6 && i >= n.table.length - 3 && (row.w + row.l + row.t) > 0;
      return (danger && i === n.table.length - 3 ? '<div class="danger-line"><span>Danger zone · the last player is eliminated</span></div>' : "") +
        '<div class="rung' + (mine ? " me" : "") + (out ? " out" : "") + (danger ? " danger" : "") + (i === n.table.length - 1 && !final ? " last" : "") + '" style="--i:' + i + '"><em>' + (i + 1) + '</em><span class="rung-face">' + faceHTML(row.n) + "</span><b>" + (mine ? "You" : "Player " + row.n) + "</b>" +
        "<small>" + row.w + " won · " + row.l + " lost</small>" +
        (prizes[row.n] ? '<span class="rung-prize">+' + prizes[row.n] + "</span>" : "") +
        "<strong>" + (row.pts > 0 ? "+" : "") + row.pts + "</strong></div>";
    }).join("") + "</div>";
  }

  // The talk of the stage: the biggest upset, told to every player.
  function upsetHTML(n) {
    var u = n.upset;
    if (!u) return "";
    var name = function (k) { return k === n.you ? "You" : "Player " + k; };
    var card = function (c, b) { return LADDER.isJoker(c) ? "a Joker" : (c === "A" || c === "8" ? "an " : "a ") + LADDER.label(c) + (b ? " +2" : ""); };
    return '<div class="upset"><i>' + (u.kind === "upset" ? "Biggest upset of stage " : "Strongest card to fall in stage ") + u.stage + '</i><div class="upset-row"><span class="upset-face">' + faceHTML(u.w) + "</span>" + cardHTML(u.cw, { small: true, boost: u.bw }) +
      '<strong>beat</strong>' + cardHTML(u.cl, { small: true, boost: u.bl }) + '<span class="upset-face">' + faceHTML(u.l) + "</span></div><p>" +
      esc(name(u.w)) + " beat " + esc(name(u.l) === "You" ? "you" : name(u.l)) + ": " + esc(card(u.cw, u.bw)) + " over " + esc(card(u.cl, u.bl)) + ".</p></div>";
  }

  // One stage's three duels, turned over one after another.
  function ladderRevealHTML(st) {
    return '<div class="ld-duels">' + st.duels.map(function (d, i) {
      return '<div class="ld-duel ' + (d.r > 0 ? "won" : d.r < 0 ? "lost" : "level") + '" style="--i:' + i + '"><span class="ld-me' + (d.mf ? " forfeit" : "") + '"><i>You</i>' + cardHTML(d.mine, { boost: d.mb }) + (d.mf ? "<u>Forfeit</u>" : "") + '</span><strong>' + (d.r > 0 ? "+1" : d.r < 0 ? "−1" : "0") + "</strong>" +
        '<span class="ld-them' + (d.tf ? " forfeit" : "") + '">' + cardHTML(d.theirs, { boost: d.tb }) + (d.tf ? "<u>Forfeit</u>" : "") + '<i><span class="ld-face">' + faceHTML(d.opp) + "</span>Player " + d.opp + "</i></span></div>";
    }).join("") + "</div>";
  }

  function drawLadder() {
    var box = $("sched"), n = ui.night;
    if (!box || !n) return;
    var acting = ui.matchAct && n.playing && !n.out;
    var out = "";
    if (n.status === "done") {
      out = '<div class="s-card now"><i>Game ' + n.n + " · The Ladder · result</i>" + ladderTableHTML(n, true) + "</div>";
    } else if (!heard("vbB" + n.n)) {
      out = '<div class="s-card now"><i>Game ' + n.n + " · being played now</i><h2>The Ladder</h2><p>Walk to the arena. The attendant will give you the rules.</p></div>";
    } else {
      var last = n.results[n.results.length - 1];
      var closeAt = n.endsAt ? new Date(n.endsAt).toLocaleString("en-US", { timeZone: "America/New_York", weekday: "short", hour: "numeric", minute: "2-digit" }) + " ET" : "";
      var count = n.endsAt ? '<i>This stage closes in</i><b class="s-count small" id="v-count">' + span(Math.max(0, new Date(n.endsAt).getTime() - Date.now())) + '</b><p class="ld-closeat">At <b>' + esc(closeAt) + "</b>. Anyone who has not submitted by then <b>forfeits</b>: they lose all three duels and their three lowest cards are burned.</p>" : "<p>The GM closes each stage.</p>";
      out += '<div class="s-card now"><i>Game ' + n.n + " · The Ladder</i><h2>Stage " + n.stage + " of " + n.stages + "</h2>" + count + "</div>";
      var subs = n.submitted || [], all = (n.table || []).map(function (r) { return r.n; }).sort(function (a, b) { return a - b; });
      if (all.length) out += '<div class="s-card ld-subs"><i>Submitted · ' + subs.length + " of " + all.length + '</i><div class="subs">' + all.map(function (k) {
        var done = subs.indexOf(k) >= 0;
        return '<span class="sub' + (done ? " done" : "") + '" title="Player ' + k + (done ? " has submitted" : " has not submitted yet") + '"><span class="sub-face">' + faceHTML(k) + "</span><b>" + k + "</b>" + (done ? "<em>✓</em>" : "") + "</span>";
      }).join("") + '</div><p class="subs-cap">' + (subs.length === all.length ? "Everyone has submitted." : "A tick means that player has submitted. The cards are turned when everyone has.") + "</p></div>";
      // what happened in the stage that just closed, shown once before the next cards are laid
      if (last && n.seenStage < last.stage) {
        var net = last.duels.reduce(function (s, d) { return s + d.r; }, 0);
        out += '<div class="s-card ld-shown"><i>Stage ' + last.stage + " · the cards are turned</i>" + ladderRevealHTML(last) +
          '<p class="ld-net">This stage: <b>' + (net > 0 ? "+" : "") + net + "</b></p>" + upsetHTML(n) + '<button type="button" class="btn" data-act="ldSeen">Continue</button></div>';
      } else if (!acting) {
        out += '<div class="s-card"><p>' + (n.playing && !n.out ? "Your cards are played at the table in the arena. Its door is at the top of the hall." : "You are watching this game.") + "</p></div>";
      } else {
        var d = ladderDraft(n), placed = d.plays.filter(function (p) { return p.card; }).length, boostsUsed = d.plays.filter(function (p) { return p.boost; }).length;
        var sealed = !!n.sealed;
        if (sealed) {
          // submitted: the cards are final. A duel is decided as soon as the other player has submitted too;
          // the result and the other player's card are shown at once.
          var liveOf = function (opp) { return (n.live || []).filter(function (x) { return x.opp === opp; })[0] || { r: null }; };
          var decided = n.sealed.filter(function (p) { return liveOf(p.opp).r != null; }).length;
          out += '<div class="s-card ld-shown ld-live"><i>Your duels this stage · ' + decided + " of " + n.sealed.length + ' decided</i><div class="ld-duels">' + n.sealed.map(function (p, i) {
            var lv = liveOf(p.opp), r = lv.r, cls = r == null ? "wait" : r > 0 ? "won" : r < 0 ? "lost" : "level";
            return '<div class="ld-duel ' + cls + '" style="--i:0"><span class="ld-me"><i>You</i>' + cardHTML(p.card, { boost: p.boost }) + "</span>" +
              (r == null ? '<strong class="ld-wait">Waiting</strong>' : "<strong>" + (r > 0 ? "+1" : r < 0 ? "−1" : "0") + "<small>" + (r > 0 ? "Won" : r < 0 ? "Lost" : "Level") + "</small></strong>") +
              '<span class="ld-them">' + (r == null ? '<span class="pcard ghost"></span>' : lv.theirs ? cardHTML(lv.theirs, { boost: lv.tb }) : cardHTML("2", { down: true })) + '<i><span class="ld-face">' + faceHTML(p.opp) + "</span>Player " + p.opp + "</i></span></div>";
          }).join("") + '</div><p class="ld-sealed">' + (decided === n.sealed.length ? "All three of your duels are over. The next stage opens when this one closes." : "Submitted and final. A duel is over as soon as the other player submits, and you see their card at once.") + "</p></div>";
        } else {
        out += '<div class="s-card ld-board"><i>Your three opponents this stage</i><div class="ld-opps">' + d.plays.map(function (p, i) {
          var theirs = n.used[p.opp] || [];
          var inAlready = (n.submitted || []).indexOf(p.opp) >= 0;
          return '<div class="ld-opp"><span class="ld-face">' + faceHTML(p.opp) + "</span><b>Player " + p.opp + "</b>" + (inAlready ? '<em class="ld-in">Submitted · waiting for you</em>' : '<em class="ld-in none">Not submitted yet</em>') +
            '<button type="button" class="ld-slot' + (p.card ? " full" : "") + '" data-act="ldSlot" data-i="' + i + '" aria-label="Your card against Player ' + p.opp + '">' + (p.card ? cardHTML(p.card, { boost: p.boost }) : "<span>Your card</span>") + "</button>" +
            '<button type="button" class="ld-boost' + (p.boost ? " on" : "") + '" data-act="ldBoost" data-i="' + i + '"' + (p.card && (p.boost || (n.boostsLeft - boostsUsed > 0 && (n.coins == null || (n.purse != null ? n.purse : n.coins) - boostsUsed * n.rules.boostPrice >= n.rules.boostPrice))) ? "" : " disabled") + ">+2 · 1 coin</button>" +
            '<span class="ld-left"><u>Cards they have left</u>' + LADDER.CARDS.map(function (c) { return cardHTML(c, { tiny: true, dim: theirs.indexOf(c) >= 0 }); }).join("") + "</span></div>";
        }).join("") + "</div></div>";
        out += '<div class="s-card ld-hand"><i>Your cards · tap one to play it · Ace is high</i><div class="ld-cards">' + LADDER.CARDS.map(function (c) {
          var gone = n.hand.indexOf(c) < 0, down = d.plays.some(function (p) { return p.card === c; });
          return '<button type="button" class="ld-card' + (down ? " placed" : "") + '" data-act="ldCard" data-c="' + c + '"' + (gone ? " disabled" : "") + ">" + cardHTML(c, { dim: gone }) + "</button>";
        }).join("") + "</div>" +
          '<p class="ld-boosts">Boosts left: <b>' + (n.boostsLeft - boostsUsed) + " of " + n.rules.boosts + "</b></p>" +
          (d.ask ? '<div class="ld-ask"><p><b>Submit these cards?</b> They are final. You cannot change them afterwards.</p><div class="btn-row"><button type="button" class="btn" data-act="ldSeal">Submit</button><button type="button" class="btn ghost" data-act="ldBack">Back</button></div></div>'
            : '<button type="button" class="btn" data-act="ldAsk"' + (placed === d.plays.length ? "" : " disabled") + ">" + (placed === d.plays.length ? "Submit these " + (placed === 3 ? "three" : placed) + " cards" : "Play a card against each opponent") + '</button><p class="ld-final">Submitted cards are final.</p>') + "</div>";
        }
      }
      out += '<div class="s-card"><i>The ladder' + (n.liveCount ? " · live" : n.results.length ? " after stage " + n.results[n.results.length - 1].stage : "") + "</i>" +
        (n.liveCount ? '<p class="ld-livecap">Stage ' + n.stage + " is still open. A duel counts here as soon as both players have submitted.</p>" : "") + ladderTableHTML(n, false) + "</div>";
      if (n.upset && !(last && n.seenStage < last.stage)) out += '<div class="s-card">' + upsetHTML(n) + "</div>";
      out += '<div class="s-card"><button type="button" class="link" data-act="vbAgain">The rules again</button></div>';
    }
    if (box.getAttribute("data-sig") === out) return;
    box.setAttribute("data-sig", out);
    box.innerHTML = out;
  }

  function ladderAct(name, el) {
    var n = ui.night, d = n && ladderDraft(n);
    if (!d) return;
    var i = Number(el.getAttribute("data-i"));
    if (n.sealed && name !== "ldSeen") return; // submitted cards are final
    if (name === "ldAsk") d.ask = true;
    else if (name === "ldBack") d.ask = false;
    else if (name === "ldCard") {
      var c = el.getAttribute("data-c"), at = -1;
      d.plays.forEach(function (p, k) { if (p.card === c) at = k; });
      if (at >= 0) { d.plays[at].card = null; d.plays[at].boost = false; } // tap a played card to take it back
      else { var free = d.plays.filter(function (p) { return !p.card; })[0]; if (free) free.card = c; }
      d.dirty = true;
    } else if (name === "ldSlot") { d.plays[i].card = null; d.plays[i].boost = false; d.dirty = true; }
    else if (name === "ldBoost") { d.plays[i].boost = !d.plays[i].boost; d.dirty = true; }
    else if (name === "ldSeal") {
      if (ui.busy) return;
      ui.busy = true;
      api("POST", "/api/night/seal", { plays: d.plays }).then(function (v) { ui.night = v; d.dirty = false; var moved = v.status !== "open" || v.stage !== n.stage; if (hall && hall.night) hall.night.opened = !moved; drawLadder(); toast(moved ? "Everyone has submitted. The cards are turned." : "Submitted."); if (moved) news(); })
        .catch(function (err) { toast(err.message); }).then(function () { ui.busy = false; });
      return;
    } else if (name === "ldSeen") {
      api("POST", "/api/night/stage-seen", {}).then(function (v) { ui.night = v; drawLadder(); window.scrollTo(0, 0); }).catch(function (err) { toast(err.message); });
      return;
    }
    drawLadder();
  }

  // The end of The Ladder, shown once: the whole ladder, the prizes, and who is out.
  function drawLadderEnd() {
    var box = $("vr"), n = ui.night, res = n.result;
    var mine = n.table.filter(function (r) { return r.n === n.you; })[0];
    var place = n.table.indexOf(mine) + 1;
    if (!ui.vstep) {
      box.innerHTML = '<div class="v-gate"><p class="say big">Game ' + n.n + ' is over.<br>The last cards are turned.</p><button type="button" class="btn narrow" data-act="vNext">Show me</button></div>';
      return;
    }
    var lastSt = n.results[n.results.length - 1];
    if (ui.vstep === 1 && lastSt && lastSt.stage === n.stages) {
      var net = lastSt.duels.reduce(function (t, d) { return t + d.r; }, 0);
      box.innerHTML = '<div class="s-card ld-shown"><i>Stage ' + lastSt.stage + " · the last cards are turned</i>" + ladderRevealHTML(lastSt) +
        '<p class="ld-net">This stage: <b>' + (net > 0 ? "+" : "") + net + "</b></p>" + upsetHTML(n) + '<button type="button" class="btn" data-act="vNext">The final ladder</button></div>';
      return;
    }
    var out = res.out === n.you;
    box.innerHTML = '<div class="s-card now"><i>Game ' + n.n + " · The Ladder · final</i>" + (mine ? "<h2>You finished " + place + ORD(place) + " with " + (mine.pts > 0 ? "+" : "") + mine.pts + "</h2>" : "") + ladderTableHTML(n, true) + "</div>" +
      '<div class="s-card next v-outcard"><i>Out</i><img class="v-stamp" src="/art/night1/stamp-out.webp" alt="Out"><h2>' + (res.out == null ? "The GM will decide" : out ? "You are out" : "Player " + res.out + " is out") + "</h2>" +
      (res.out != null ? '<img class="v-car" src="/art/night1/out-car.webp" alt="A car waiting at the gate">' : "") + "<p>" + (res.last.length > 1 ? "Level on points at the bottom. The duels between those players decided it." : "The fewest points on the ladder.") + "</p></div>" +
      (n.bet ? '<div class="s-card ' + (n.bet.won ? "now" : "next") + '"><i>Your bet in the betting room</i><h2>' + (n.bet.won ? "Right: +" + n.bet.pays + " coins" : "Wrong: −" + plural(n.bet.stake, "coin", "coins")) + "</h2><p>You bet " + plural(n.bet.stake, "coin", "coins") + " on finishing on " + signed(n.bet.score) + ". You finished on " + (mine ? signed(mine.pts) : "") + ".</p></div>" : "") +
      '<button type="button" class="btn" data-act="vDone">Continue</button>';
  }
  function ORD(k) { return k === 1 ? "st" : k === 2 ? "nd" : k === 3 ? "rd" : "th"; }

  // ----- the treasury: one passcode of sixteen letters, and a puzzle for every player -----

  function treasOn() { return !!(hall && hall.treasury && hall.treasury.on); }
  function trGuesses() { try { return JSON.parse(localStorage.getItem("dp_tr_guess_" + (me ? me.number : 0)) || "{}"); } catch (e) { return {}; } }
  function trSaveGuess(slot, ch) { try { var g = trGuesses(); if (ch) g[slot] = ch; else delete g[slot]; localStorage.setItem("dp_tr_guess_" + me.number, JSON.stringify(g)); } catch (e) {} }

  function mountTreasury() {
    var head = document.querySelector("#app .room-head h1");
    if (head) head.textContent = "The treasury";
    ui.tr = null;
    ui.trs = { view: heard("treasury") ? "main" : "rules", step: 0 };
    var load = function () { return api("GET", "/api/treasury").then(function (v) { var first = !ui.tr; ui.tr = v; if (first || (ui.trs && ui.trs.view === "main")) drawTreasury(); }); };
    load().catch(function (err) { toast(err.message); });
    ticker = setInterval(function () { if (ui.trs && ui.trs.view === "main" && !(document.activeElement && document.activeElement.classList.contains("tr-in"))) load().catch(function () {}); }, 8000);
  }

  // a small picture of a grid: 1 is a filled square
  function trPixels(rows, cls) {
    return '<div class="tr-pix' + (cls ? " " + cls : "") + '" style="--n:' + rows[0].length + '">' + rows.map(function (r) { return r.split("").map(function (c) { return "<i" + (c === "1" ? ' class="on"' : "") + "></i>"; }).join(""); }).join("") + "</div>";
  }

  // The treasury itself: a strongroom door with its wheel, gold showing through the seam.
  function trVault(pot, big) {
    var spokes = "";
    for (var k = 0; k < 6; k++) spokes += '<rect x="58.5" y="34" width="3" height="52" rx="1.5" fill="#e8c874" transform="rotate(' + k * 30 + ' 60 60)"/>';
    var bolts = "";
    for (var j = 0; j < 12; j++) bolts += '<circle cx="' + (60 + 43 * Math.cos(j * Math.PI / 6)).toFixed(1) + '" cy="' + (60 + 43 * Math.sin(j * Math.PI / 6)).toFixed(1) + '" r="2.6" fill="#8d7436" stroke="#f0d68c" stroke-width=".6"/>';
    return '<div class="tr-vault' + (big ? " big" : "") + '"><svg viewBox="0 0 120 132" aria-hidden="true">' +
      '<defs><radialGradient id="trg" cx="38%" cy="30%" r="80%"><stop offset="0" stop-color="#6d5a2a"/><stop offset=".55" stop-color="#3a3018"/><stop offset="1" stop-color="#191610"/></radialGradient>' +
      '<radialGradient id="trglow" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="#ffe9a8" stop-opacity=".55"/><stop offset="1" stop-color="#ffe9a8" stop-opacity="0"/></radialGradient></defs>' +
      '<rect x="4" y="6" width="112" height="116" rx="9" fill="#14131a" stroke="#6f5c2c" stroke-width="2"/>' +
      '<circle cx="60" cy="60" r="56" fill="url(#trglow)"/>' +
      '<circle cx="60" cy="60" r="50" fill="url(#trg)" stroke="#ddb65a" stroke-width="3"/>' +
      '<circle cx="60" cy="60" r="36" fill="none" stroke="#a88a42" stroke-width="1.2"/>' + bolts +
      '<circle cx="60" cy="60" r="26" fill="none" stroke="#e8c874" stroke-width="4"/>' + spokes +
      '<circle cx="60" cy="60" r="8" fill="#f3d98f" stroke="#7a6530" stroke-width="1.5"/>' +
      '<rect x="108" y="40" width="9" height="14" rx="2" fill="#8d7436"/><rect x="108" y="68" width="9" height="14" rx="2" fill="#8d7436"/>' +
      '<g fill="#f3d98f" stroke="#7a6530" stroke-width=".8"><ellipse cx="22" cy="124" rx="9" ry="3.4"/><ellipse cx="22" cy="120.5" rx="9" ry="3.4"/><ellipse cx="22" cy="117" rx="9" ry="3.4"/><ellipse cx="40" cy="125" rx="9" ry="3.4"/><ellipse cx="40" cy="121.5" rx="9" ry="3.4"/><ellipse cx="96" cy="124.5" rx="9" ry="3.4"/><ellipse cx="96" cy="121" rx="9" ry="3.4"/></g>' +
      '</svg><small><b>' + pot + "</b> coins inside</small></div>";
  }

  // One wire piece. Four bits: a wire to the north (1), east (2), south (4), west (8).
  function trTile(m, cls, attrs) {
    var w = "";
    if (m & 1) w += '<path d="M20 20V0"/>'; if (m & 2) w += '<path d="M20 20H40"/>'; if (m & 4) w += '<path d="M20 20V40"/>'; if (m & 8) w += '<path d="M20 20H0"/>';
    var src = /\bsrc\b/.test(cls || "");
    return "<" + (attrs ? "button type=\"button\" " + attrs : "span") + ' class="tr-tile ' + (cls || "") + '"><svg viewBox="0 0 40 40" aria-hidden="true">' + w +
      (src ? '<rect x="11" y="11" width="18" height="18" rx="4" class="bat"/><path d="M21.5 13.5l-5 7.5h4l-2 5.5 5.5-8h-4z" class="bolt"/>' : '<circle cx="20" cy="20" r="' + ((m & (m - 1)) ? 3.2 : 5.5) + '" class="node"/>') + "</svg></" + (attrs ? "button" : "span") + ">";
  }
  function trTurn(m) { return ((m << 1) & 15) | (m >> 3); }
  // Which pieces have power, and how many wire ends are loose.
  function trPower(cells, w, h, source) {
    var n = w * h, seen = [], stack = [source], loose = 0, lit = 0, D = [[1, 0, -1, 4], [2, 1, 0, 8], [4, 0, 1, 1], [8, -1, 0, 2]];
    function nb(i, d) { var x = i % w + d[1], y = Math.floor(i / w) + d[2]; return x < 0 || y < 0 || x >= w || y >= h ? -1 : y * w + x; }
    for (var i = 0; i < n; i++) D.forEach(function (d) { if (cells[i] & d[0]) { var j = nb(i, d); if (j < 0 || !(cells[j] & d[3])) loose += 1; } });
    seen[source] = true;
    while (stack.length) { var c = stack.pop(); lit += 1; D.forEach(function (d) { if (cells[c] & d[0]) { var j = nb(c, d); if (j >= 0 && (cells[j] & d[3]) && !seen[j]) { seen[j] = true; stack.push(j); } } }); }
    return { seen: seen, lit: lit, loose: loose, done: lit === n && loose === 0 };
  }
  function trHex(text) { return String(text).split("").map(function (c) { return parseInt(c, 16); }); }

  function trTiles(v) {
    function pic(inner, cls) { return '<div class="vb-draw' + (cls ? " " + cls : "") + '">' + inner + "</div>"; }
    var blanks = ""; for (var i = 0; i < 16; i++) blanks += '<i' + (i === v.mine ? ' class="me"' : "") + ">" + (i === v.mine ? "?" : "") + "</i>";
    var wireDemo = '<div class="tr-wdemo">' + trTile(2, "lit src") + trTile(10, "lit") + trTile(5, "") + '<span class="tr-tap">Tap to turn</span>' + trTile(12, "") + "</div>" +
      '<div class="tr-wdemo">' + trTile(2, "lit src") + trTile(10, "lit") + trTile(10, "lit") + trTile(12, "lit") + "</div>";
    return [
      { line: "The treasury holds " + v.pot + " coins. A passcode of " + v.length + " letters opens it.", pic: pic(trVault(v.pot, true) + '<div class="tr-blanks">' + blanks.replace(' class="me"', "").replace("?", "") + "</div>") },
      { line: "You hold one place in the passcode. A puzzle that only you have hides the letter that goes there.", pic: pic('<div class="tr-blanks">' + blanks + '</div><div class="tr-mineface"><span class="rung-face">' + faceHTML(v.you) + "</span><b>Your place: " + (v.mine + 1) + "</b></div>") },
      { line: "The puzzle is a board of wires. Tap a piece to turn it. Join the wires so power from the battery reaches every piece.", pic: pic(wireDemo) },
      { line: "When every piece has power, the wires on your letter glow gold. Then tell the others, in the broadcast room. Nobody is shown your letter unless you tell them.", pic: pic(trPixels(["0000000", "0111110", "0001000", "0001000", "0001000", "0001000", "0001000", "0001000", "0000000"], "big") + '<div class="tr-say"><span class="rung-face">' + faceHTML(v.you) + '</span><span class="bubble">Place ' + (v.mine + 1) + " is T.</span></div>") },
      { line: "Stuck? Open your puzzle to everyone and ask for help. When someone enters the whole passcode, every player gets " + v.reward + " coins.", pic: pic('<div class="tr-all">' + v.slots.slice(0, 16).map(function (x) { return '<span class="rung-face">' + faceHTML(x.holder || 0) + "</span>"; }).join("") + '</div><div class="bt-pay win"><em>✓</em><span>Everyone</span><s></s><b>+' + v.reward + "</b></div>") },
    ];
  }

  function drawTreasury() {
    var box = $("pz"), v = ui.tr, t = ui.trs;
    if (!box || !v || !t) return;
    if (!v.on) { box.innerHTML = '<div class="s-card"><p>The treasury is closed.</p></div>'; return; }
    if (t.view === "rules") {
      var tiles = trTiles(v), tl = tiles[Math.min(t.step, tiles.length - 1)];
      box.innerHTML = '<div class="s-card now bt-tile"><i>The treasury · ' + (t.step + 1) + " of " + tiles.length + "</i>" + tl.pic + '<p class="bt-line">' + esc(tl.line) + '</p><button type="button" class="btn" data-act="trNext">' + (t.step === tiles.length - 1 ? "Got it" : "Next") + "</button></div>";
      return;
    }
    if (t.view === "solve") return drawTrSolve();
    var mineKnown = {}, guesses = trGuesses(), out = "";
    v.letters.forEach(function (l) { mineKnown[l.slot] = l.letter; });
    var found = v.slots.filter(function (x) { return x.found; }).length;
    if (v.opened) {
      var rain = ""; for (var c = 0; c < 14; c++) rain += '<i style="--x:' + (6 + (c * 37) % 88) + "%;--d:" + ((c * 0.23) % 1.6).toFixed(2) + "s;--t:" + (1.5 + (c % 4) * 0.25).toFixed(2) + 's"></i>';
      out += '<div class="s-card now tr-open"><i>The treasury is open</i><div class="tr-stage"><div class="tr-rain">' + rain + '</div><div class="tr-gm">' + AV.executor() + '</div><div class="tr-quote"><b>“' + esc(v.opened.said || v.opened.code) + '”</b><small>The Gamemaster, turning out his pockets</small></div></div>' +
        "<p>" + esc(who(v.opened.by)) + " entered the passcode. His " + v.pot + " coins are gone: every player was paid <b>" + v.reward + " coins</b>.</p></div>";
    } else {
      out += '<div class="s-card now"><i>The treasury</i><div class="tr-head">' + trVault(v.pot) + "<p>" + found + " of " + v.length + " letters have been found. A tick under a place means its holder has the letter. Ask them for it.</p></div></div>";
    }
    // the sixteen places
    var filled = 0;
    out += '<div class="s-card tr-code"><i>The passcode · your working copy</i><div class="tr-slots">' + v.slots.map(function (x, i) {
      var sure = v.opened ? v.opened.code[i] : mineKnown[i], val = sure || guesses[i] || "";
      if (val) filled += 1;
      return '<label class="tr-slot' + (sure ? " sure" : "") + (i === v.mine ? " mine" : "") + '"><small>' + (i + 1) + "</small>" +
        (sure ? "<b>" + esc(sure) + "</b>" : '<input class="tr-in" type="text" maxlength="1" autocapitalize="characters" autocomplete="off" inputmode="text" data-slot="' + i + '" value="' + esc(val) + '" aria-label="Letter in place ' + (i + 1) + '">') +
        '<span class="tr-holder' + (x.found ? " found" : "") + '">' + faceHTML(x.holder || 0) + (x.found ? "<em>✓</em>" : "") + "</span></label>";
    }).join("") + "</div>" + (v.opened ? "" : '<p class="tr-cap">Gold letters are ones you have earned. Type the letters other players tell you into the empty places.</p>' +
      (v.out ? "" : '<button type="button" class="btn" data-act="trTry"' + (filled === v.length && v.triesLeft > 0 ? "" : " disabled") + ">" + (v.triesLeft ? (filled === v.length ? "Try this passcode" : "Fill all " + v.length + " places to try") : "You have used your tries") + '</button><p class="tr-cap">' + plural(v.triesLeft, "try", "tries") + " left for you, of " + v.tries + ".</p>")) + "</div>";
    // your own puzzle
    if (v.mine >= 0) {
      var mineL = mineKnown[v.mine];
      if (mineL) out += '<div class="s-card now tr-mine"><i>Your letter</i><div class="tr-got"><strong>' + esc(mineL) + "</strong><span>Place <b>" + (v.mine + 1) + "</b> of the passcode</span></div>" + (v.opened ? "" : '<p>Nobody else is shown this. Tell them in the broadcast room.</p><div class="btn-row"><button type="button" class="btn" data-act="go" data-scene="table">Go to the broadcast room</button></div>') + "</div>";
      else if (!v.opened) out += '<div class="s-card todo tr-mine"><i>Your puzzle · place ' + (v.mine + 1) + "</i><p>It hides the letter that goes in place " + (v.mine + 1) + '.</p><div class="btn-row"><button type="button" class="btn" data-act="trSolve" data-slot="' + v.mine + '">Solve my puzzle</button></div>' +
        (v.slots[v.mine].help ? '<p class="tr-cap">Your puzzle is open to everyone. <button type="button" class="link" data-act="trHelpOff">Close it again</button></p>' : '<button type="button" class="link" data-act="trHelp">Stuck? Open it to everyone and ask for help</button>') + "</div>";
    }
    // puzzles other players have opened
    var open = v.opened ? [] : v.slots.map(function (x, i) { return { i: i, x: x }; }).filter(function (o) { return o.x.help && o.i !== v.mine && !mineKnown[o.i]; });
    if (open.length) out += '<div class="s-card"><i>Players asking for help</i>' + open.map(function (o) {
      return '<div class="tr-helprow"><span class="rung-face">' + faceHTML(o.x.holder || 0) + "</span><span>" + (o.x.holder ? esc(who(o.x.holder)) + "’s puzzle" : "A puzzle nobody holds") + "<small>Place " + (o.i + 1) + (o.x.found ? " · already solved" : "") + '</small></span><button type="button" class="btn small" data-act="trSolve" data-slot="' + o.i + '">Help</button></div>';
    }).join("") + "</div>";
    out += '<div class="s-card"><button type="button" class="link" data-act="trRules">How the treasury works</button></div>';
    box.innerHTML = out;
  }

  // The grid itself. 0 unknown, 1 filled, 2 marked empty.
  function drawTrSolve() {
    var box = $("pz"), t = ui.trs, p = t.pz;
    if (!box || !p) return;
    var n = p.w * p.h, cells = t.cells, holder = p.holder, k;
    if (t.done) {
      var glow = '<div class="tr-board solved" style="--w:' + p.w + '">';
      for (k = 0; k < n; k++) glow += trTile(cells[k], (t.done.mask[k] === "1" ? "gold" : "dimmed") + (k === p.source ? " src" : ""));
      box.innerHTML = '<div class="s-card now tr-done"><i>Solved</i>' + glow + '</div><div class="tr-got"><strong>' + esc(t.done.letter) + "</strong><span>goes in place <b>" + t.done.place + "</b> of the passcode</span></div>" +
        "<p>" + (holder === ui.tr.you ? "This is your letter. Nobody else is shown it. Tell the others in the broadcast room." : "You solved " + esc(holder ? who(holder) : "an unheld") + "’s puzzle. You both have this letter now.") + "</p>" +
        '<div class="btn-row"><button type="button" class="btn" data-act="go" data-scene="table">Go to the broadcast room</button><button type="button" class="btn ghost" data-act="trBack">The treasury</button></div></div>';
      return;
    }
    var pw = trPower(cells, p.w, p.h, p.source), html = '<div class="tr-board" style="--w:' + p.w + '">';
    for (k = 0; k < n; k++) html += trTile(cells[k], (pw.seen[k] ? "lit" : "") + (k === p.source ? " src" : "") + (k === t.turned ? " turned" : ""), 'data-act="trCell" data-i="' + k + '" aria-label="Piece ' + (k + 1) + '"');
    html += "</div>";
    t.turned = -1;
    box.innerHTML = '<div class="s-card now tr-solve"><i>' + (holder === ui.tr.you ? "Your puzzle" : esc(holder ? who(holder) : "Unheld") + "’s puzzle") + " · place " + (p.slot + 1) + "</i>" +
      '<p class="tr-cap">Tap a piece to turn it. Give every piece power from the battery, with no loose wire ends.</p>' + html +
      '<div class="tr-meter"><span style="width:' + Math.round(pw.lit / n * 100) + '%"></span></div>' +
      '<p class="tr-cap"><b>' + pw.lit + "</b> of " + n + " pieces have power. " + (pw.loose ? plural(pw.loose, "loose end", "loose ends") + "." : "No loose ends.") + "</p>" +
      '<div class="btn-row"><button type="button" class="btn" data-act="trCheck"' + (pw.done ? "" : " disabled") + ">" + (pw.done ? "Reveal the letter" : "Power every piece to finish") + '</button><button type="button" class="btn ghost" data-act="trBack">Back</button></div>' +
      '<button type="button" class="link" data-act="trClear">Start this board again</button></div>';
  }

  // Unfinished work is kept on the server, so a player can leave and come back, or change phone.
  var trSaveTimer = null;
  function trSaveNow() {
    var t = ui.trs;
    clearTimeout(trSaveTimer);
    if (!t || !t.pz || t.done || !t.cells) return Promise.resolve();
    return api("POST", "/api/treasury/work", { slot: t.pz.slot, cells: t.cells.map(function (c) { return c.toString(16); }).join("") }).catch(function () {});
  }
  function trSaveWork() {
    clearTimeout(trSaveTimer);
    trSaveTimer = setTimeout(trSaveNow, 1200);
  }

  function treasuryAct(name, el) {
    var v = ui.tr, t = ui.trs;
    if (!v || !t) return;
    if (name === "trNext") { t.step += 1; if (t.step >= trTiles(v).length) { t.view = "main"; markHeard("treasury"); } window.scrollTo(0, 0); return drawTreasury(); }
    if (name === "trRules") { t.view = "rules"; t.step = 0; window.scrollTo(0, 0); return drawTreasury(); }
    if (name === "trBack") {
      var saved = trSaveNow();
      t.view = "main"; t.done = null; t.pz = null;
      saved.then(function () { return api("GET", "/api/treasury"); }).then(function (nv) { ui.tr = nv; drawTreasury(); }).catch(function () { drawTreasury(); });
      window.scrollTo(0, 0);
      return;
    }
    if (name === "trSolve") {
      var slot = Number(el.getAttribute("data-slot"));
      return api("GET", "/api/treasury/puzzle?slot=" + slot).then(function (p) {
        t.pz = p; t.turned = -1; t.done = p.solved ? { letter: p.letter, place: p.slot + 1, mask: p.mask } : null;
        t.cells = trHex(p.solved ? p.cells : p.work && p.work.length === p.w * p.h ? p.work : p.start);
        t.view = "solve"; window.scrollTo(0, 0); drawTreasury();
      }).catch(function (err) { toast(err.message); });
    }
    if (name === "trClear") { if (!t.sure) { t.sure = true; return toast("Tap again to put every piece back as it was dealt."); } t.sure = false; t.cells = trHex(t.pz.start); trSaveWork(); return drawTrSolve(); }
    if (name === "trCell") { var i = Number(el.getAttribute("data-i")); t.cells[i] = trTurn(t.cells[i]); t.turned = i; t.sure = false; trSaveWork(); return drawTrSolve(); }
    if (name === "trCheck") {
      if (ui.busy) return;
      ui.busy = true;
      return api("POST", "/api/treasury/solve", { slot: t.pz.slot, cells: t.cells.map(function (c) { return c.toString(16); }).join("") }).then(function (r) {
        if (!r.ok) return toast(r.error || "Not yet.");
        t.done = { letter: r.letter, place: r.place, mask: r.mask };
        if (hall && hall.treasury && t.pz.holder === v.you) hall.treasury.solved = true;
        window.scrollTo(0, 0); drawTrSolve();
      }).catch(function (err) { toast(err.message); }).then(function () { ui.busy = false; });
    }
    if (name === "trHelp" || name === "trHelpOff") {
      if (name === "trHelp" && !t.askHelp) { t.askHelp = true; return toast("Everyone will be able to open your puzzle. Tap again to confirm."); }
      t.askHelp = false;
      return api("POST", "/api/treasury/help", { on: name === "trHelp" }).then(function (nv) { ui.tr = nv; drawTreasury(); toast(name === "trHelp" ? "Your puzzle is open to everyone. Say so in the broadcast room." : "Your puzzle is yours alone again."); }).catch(function (err) { toast(err.message); });
    }
    if (name === "trTry") {
      var mineKnown = {}, g = trGuesses(), code = "";
      v.letters.forEach(function (l) { mineKnown[l.slot] = l.letter; });
      for (var k = 0; k < v.length; k++) code += mineKnown[k] || g[k] || "?";
      if (!t.sureTry) { t.sureTry = true; return toast("You have " + plural(v.triesLeft, "try", "tries") + ". Tap again to try " + code + "."); }
      t.sureTry = false;
      if (ui.busy) return;
      ui.busy = true;
      return api("POST", "/api/treasury/open", { code: code }).then(function (r) {
        if (r.ok) { ui.tr = r.view; news(); drawTreasury(); return toast("The treasury is open."); }
        ui.tr.triesLeft = r.triesLeft; drawTreasury();
        toast("Wrong. " + r.right + " of " + v.length + " letters are in the right place.");
      }).catch(function (err) { toast(err.message); }).then(function () { ui.busy = false; });
    }
  }
  // tapping a place selects what is in it, so typing replaces the letter
  document.addEventListener("focusin", function (e) { var el = e.target; if (el && el.classList && el.classList.contains("tr-in")) setTimeout(function () { try { el.select(); } catch (x) {} }, 0); });
  document.addEventListener("visibilitychange", function () { if (document.hidden) trSaveNow(); });
  document.addEventListener("input", function (e) {
    var el = e.target;
    if (!el || !el.classList || !el.classList.contains("tr-in")) return;
    var ch = (el.value || "").toUpperCase().replace(/[^A-Z]/g, "").slice(-1);
    el.value = ch;
    trSaveGuess(Number(el.getAttribute("data-slot")), ch);
    if (ui.trs) ui.trs.sureTry = false;
    var next = ch && document.querySelector('.tr-in[data-slot="' + (Number(el.getAttribute("data-slot")) + 1) + '"]');
    // the Try button depends on every place being filled
    var btn = document.querySelector('[data-act="trTry"]');
    if (btn && ui.tr) {
      var known = {}, g = trGuesses(), n = 0;
      ui.tr.letters.forEach(function (l) { known[l.slot] = 1; });
      for (var k = 0; k < ui.tr.length; k++) if (known[k] || g[k]) n += 1;
      btn.disabled = !(n === ui.tr.length && ui.tr.triesLeft > 0);
      btn.textContent = ui.tr.triesLeft ? (n === ui.tr.length ? "Try this passcode" : "Fill all " + ui.tr.length + " places to try") : "You have used your tries";
    }
    if (next) next.focus();
  });

  // ----- the betting room during The Ladder: one bet on your own final score -----

  function betsOn() { return !!(hall && hall.bettingOpen && hall.bets); }
  function signed(k) { return (k > 0 ? "+" : k < 0 ? "−" : "") + Math.abs(k); }
  function coinsHTML(k, cls) { var o = ""; for (var i = 0; i < k; i++) o += '<i class="bcoin' + (cls ? " " + cls : "") + '"></i>'; return '<span class="coins-row">' + o + "</span>"; }

  // What one coin pays, stage by stage. The stage being played is lit; the ones gone by are struck out.
  function betOddsHTML(v) {
    return '<div class="odds">' + v.pays.map(function (p, i) {
      var st = i + 1, now = !v.done && v.stage === st, past = v.done || v.stage > st;
      return '<span class="odd' + (now ? " now" : past ? " past" : "") + '"><i>Stage ' + st + "</i><b>×" + p + "</b><u>" + (now ? "Now" : past ? "Gone" : "Later") + "</u></span>";
    }).join("") + '<span class="odd shut' + (v.done || v.stage > v.pays.length ? " now" : "") + '"><i>Stage ' + (v.pays.length + 1) + "</i><b>✕</b><u>Closed</u></span></div>";
  }

  // The rules of the bet, one picture to a screen.
  function betTiles(v) {
    function pic(inner, cls) { return '<div class="vb-draw' + (cls ? " " + cls : "") + '">' + inner + "</div>"; }
    var guess = '<div class="bt-guess"><span class="rung-face">' + faceHTML(v.you) + "</span><b>Your final score</b><strong>?</strong></div>";
    return [
      { line: "Guess the score you will finish Game 1 on.", pic: pic(guess) },
      { line: "Bet 1, 2 or " + v.maxStake + " coins on your guess.", pic: pic('<div class="bt-stakes"><span>' + coinsHTML(1) + "</span><span>" + coinsHTML(2) + "</span><span>" + coinsHTML(3) + "</span></div>") },
      { line: "Right: every coin comes back as more coins. Wrong: the coins you bet are gone.", pic: pic('<div class="bt-pay win"><em>✓</em>' + coinsHTML(1) + "<s></s>" + coinsHTML(5) + '</div><div class="bt-pay lose"><em>✕</em>' + coinsHTML(1) + "<s></s><b>0</b></div>") },
      { line: "The earlier you bet, the more one coin pays. After stage " + v.pays.length + " the room is closed.", pic: pic(betOddsHTML({ pays: v.pays, stage: 0, done: false })) },
      { line: "You can also bet 1 coin on a duel between two other players. Pick the winner: 2 coins back if you are right.", pic: pic('<div class="bt-duel demo"><span class="bt-pick on"><span class="rung-face">' + faceHTML(v.you % 16 + 1) + '</span><b>Wins</b></span><em>vs</em><span class="bt-pick"><span class="rung-face">' + faceHTML((v.you + 4) % 16 + 1) + '</span><b>Loses</b></span></div><div class="bt-pay win" style="margin-top:12px"><em>✓</em>' + coinsHTML(1) + "<s></s>" + coinsHTML(2) + "</div>") },
      { line: "Your guess must be exact. You get one bet, and it cannot be changed.", pic: pic('<div class="bt-exact"><span class="no">+2<i>✕</i></span><span class="yes">+3<i>✓</i></span><span class="no">+4<i>✕</i></span></div><div class="walk-cap">You bet on +3</div>') },
    ];
  }

  function drawBet() {
    var box = $("deal"), v = ui.bet;
    if (!box || !v) return;
    var head = document.querySelector("#app .room-head h1");
    if (head) head.textContent = "Bet on your score";
    if (!v.on) { ui.bet = null; return api("GET", "/api/deals").then(function (d) { ui.deals = d; drawDeal(); }); }
    if (!ui.bt) ui.bt = { step: heard("bet" + v.n) ? -1 : 0, score: null, stake: 1, ask: false };
    var b = ui.bt, out = "";
    if (b.step >= 0) {
      var tiles = betTiles(v), t = tiles[Math.min(b.step, tiles.length - 1)];
      out = '<div class="s-card now bt-tile"><i>Game ' + v.n + " · the betting room · " + (b.step + 1) + " of " + tiles.length + "</i>" + t.pic + '<p class="bt-line">' + esc(t.line) + '</p><button type="button" class="btn" data-act="btNext">' + (b.step === tiles.length - 1 ? "Got it" : "Next") + "</button></div>";
      box.innerHTML = out;
      return;
    }
    out += '<div class="s-card"><i>What 1 coin pays, if you are right</i>' + betOddsHTML(v) + "</div>";
    if (v.bet) {
      var won = v.bet.won;
      out += '<div class="s-card ' + (won === false ? "next" : "now") + ' bt-mine"><i>' + (won == null ? "Your bet · placed in stage " + v.bet.stage + " · final" : won ? "Your bet · you were right" : "Your bet · you were wrong") + '</i><div class="bt-big"><strong>' + signed(v.bet.score) + "</strong><span>" + coinsHTML(v.bet.stake) + "<small>" + plural(v.bet.stake, "coin", "coins") + " bet</small></span></div>" +
        "<p>" + (won == null ? "Finish Game 1 on exactly <b>" + signed(v.bet.score) + "</b> and you get <b>" + v.bet.pays + " coins</b>. Any other score and the " + plural(v.bet.stake, "coin is", "coins are") + " gone." : won ? "You finished on " + signed(v.pts) + ". You were paid <b>" + v.bet.pays + " coins</b>." : "You finished on " + signed(v.pts) + ". The " + plural(v.bet.stake, "coin is", "coins are") + " gone.") + "</p>" +
        (won == null ? '<p class="bt-now">Your score now: <b>' + signed(v.pts) + "</b> · " + plural(v.left, "duel", "duels") + " left</p>" : "") + "</div>";
    } else if (v.taking) {
      if (b.score == null || b.score < v.low || b.score > v.high) b.score = Math.max(v.low, Math.min(v.high, v.pts));
      var can = Math.min(v.maxStake, v.coins || 0);
      if (b.stake > can) b.stake = Math.max(1, can);
      if (b.ask) {
        out += '<div class="s-card now"><i>Place this bet?</i><div class="bt-big"><strong>' + signed(b.score) + "</strong><span>" + coinsHTML(b.stake) + "<small>" + plural(b.stake, "coin", "coins") + "</small></span></div><p>It is final. You cannot change the score or the coins.</p>" +
          '<div class="btn-row"><button type="button" class="btn" data-act="btYes">Place it</button><button type="button" class="btn ghost" data-act="btBack">Back</button></div></div>';
      } else if (can < 1) {
        out += '<div class="s-card next"><i>No coins</i><p>A bet costs at least 1 coin. You have none.</p></div>';
      } else {
        out += '<div class="s-card"><i>Where you stand</i><p class="bt-now">Your score now: <b>' + signed(v.pts) + "</b> · " + plural(v.left, "duel", "duels") + " left. You can still finish anywhere from <b>" + signed(v.low) + "</b> to <b>" + signed(v.high) + "</b>.</p></div>";
        out += '<div class="s-card todo"><i>1 · The score you will finish on</i><div class="bt-step"><button type="button" class="bt-pm" data-act="btDown" aria-label="One lower"' + (b.score <= v.low ? " disabled" : "") + '>−</button><strong id="bt-score">' + signed(b.score) + '</strong><button type="button" class="bt-pm" data-act="btUp" aria-label="One higher"' + (b.score >= v.high ? " disabled" : "") + ">+</button></div></div>";
        out += '<div class="s-card todo"><i>2 · The coins you bet</i><div class="bt-stakes pick">' + [1, 2, 3].slice(0, v.maxStake).map(function (k) {
          return '<button type="button" class="bt-stake' + (b.stake === k ? " on" : "") + '" data-act="btStake" data-k="' + k + '"' + (k > can ? " disabled" : "") + ">" + coinsHTML(k) + "<small>" + plural(k, "coin", "coins") + "</small></button>";
        }).join("") + "</div></div>";
        out += '<div class="s-card now bt-sum"><i>This bet</i><div class="bt-pay win"><em>✓</em><span>Finish on exactly <b>' + signed(b.score) + "</b></span><s></s><b>+" + b.stake * v.mult + '</b></div><div class="bt-pay lose"><em>✕</em><span>Any other score</span><s></s><b>−' + b.stake + "</b></div>" +
          '<button type="button" class="btn" data-act="btAsk">Bet ' + plural(b.stake, "coin", "coins") + " on " + signed(b.score) + "</button></div>";
      }
    } else {
      out += '<div class="s-card next"><i>Closed</i><p>' + (v.out ? "You are out of the game." : !v.playing ? "You are not playing in this game, so there is no score to bet on." : v.done ? "Game 1 is over. You placed no bet." : "Bets closed when stage " + (v.pays.length + 1) + " opened. You placed no bet.") + "</p></div>";
    }
    var dz = v.duels;
    if (dz && !v.done && !v.out) {
      var canBet = dz.left > 0 && (v.coins || 0) >= dz.stake;
      out += '<div class="s-card bt-duels"><i>Bet on another duel · ' + dz.left + " of " + dz.perStage + ' left this stage</i><p class="bt-now">Pick who wins a duel between two other players. It costs <b>' + plural(dz.stake, "coin", "coins") + "</b>. Right: <b>" + dz.pays + " coins</b> back. Level: your coin back. Wrong: it is gone. A duel closes for bets when both players have submitted.</p>" +
        (dz.open.length ? dz.open.map(function (d) {
          var side = function (k, isIn) { return '<button type="button" class="bt-pick" data-act="btDuel" data-a="' + d.a + '" data-b="' + d.b + '" data-k="' + k + '"' + (canBet ? "" : " disabled") + '><span class="rung-face">' + faceHTML(k) + "</span><b>Player " + k + "</b><small>" + (isIn ? "Submitted" : "Not yet") + "</small></button>"; };
          return '<div class="bt-duel">' + side(d.a, d.aIn) + "<em>vs</em>" + side(d.b, d.bIn) + "</div>";
        }).join("") : '<p class="bt-now">No duel is open for bets right now.</p>') +
        (!canBet && dz.open.length ? '<p class="bt-now">' + (dz.left ? "You have no coin to bet." : "You have placed all your duel bets for this stage.") + "</p>" : "") + "</div>";
    }
    if (dz && dz.mine.length) {
      out += '<div class="s-card"><i>Your duel bets</i>' + dz.mine.map(function (m) {
        var other = m.pick === m.a ? m.b : m.a;
        var tag = m.status === "open" ? ["Waiting", "wait"] : m.status === "won" ? ["Won +" + m.paid, "won"] : m.status === "level" ? ["Level · coin back", "level"] : ["Lost", "lost"];
        return '<div class="bt-mineduel ' + tag[1] + '"><span class="rung-face">' + faceHTML(m.pick) + "</span><span>Player " + m.pick + " to beat Player " + other + "<small>Stage " + m.stage + "</small></span><b>" + tag[0] + "</b></div>";
      }).join("") + "</div>";
    }
    out += '<div class="s-card"><button type="button" class="link" data-act="btRules">How the bet works</button></div>';
    box.innerHTML = out;
  }

  function betAct(name, el) {
    var v = ui.bet, b = ui.bt;
    if (!v || !b) return;
    if (name === "btNext") { b.step += 1; if (b.step >= betTiles(v).length) { b.step = -1; markHeard("bet" + v.n); } window.scrollTo(0, 0); }
    else if (name === "btRules") { b.step = 0; window.scrollTo(0, 0); }
    else if (name === "btDown") b.score = Math.max(v.low, b.score - 1);
    else if (name === "btUp") b.score = Math.min(v.high, b.score + 1);
    else if (name === "btStake") b.stake = Number(el.getAttribute("data-k"));
    else if (name === "btDuel") {
      if (ui.busy) return;
      ui.busy = true;
      var pick = Number(el.getAttribute("data-k"));
      api("POST", "/api/bet/duel", { a: Number(el.getAttribute("data-a")), b: Number(el.getAttribute("data-b")), pick: pick }).then(function (nv) { ui.bet = nv; syncWalletAfter(nv); drawBet(); toast("1 coin on Player " + pick + "."); })
        .catch(function (err) { toast(err.message); return api("GET", "/api/bet").then(function (nv) { ui.bet = nv; drawBet(); }); }).then(function () { ui.busy = false; });
      return;
    }
    else if (name === "btAsk") b.ask = true;
    else if (name === "btBack") b.ask = false;
    else if (name === "btYes") {
      if (ui.busy) return;
      ui.busy = true;
      api("POST", "/api/bet", { score: b.score, stake: b.stake }).then(function (nv) { ui.bet = nv; b.ask = false; if (hall && hall.bets) hall.bets.placed = true; syncWalletAfter(nv); drawBet(); toast("Your bet is placed."); })
        .catch(function (err) { b.ask = false; toast(err.message); drawBet(); }).then(function () { ui.busy = false; });
      return;
    }
    drawBet();
  }
  function syncWalletAfter(nv) { if (hall && nv && nv.coins != null) { hall.coins = nv.coins; syncWallet(); } }

  // ----- the night's match: Six Vaults -----

  var THROW = { r: "Rock", p: "Paper", s: "Scissors" };
  // the three throws, as gloved hands
  var THROW_ICON = {
    r: '<img src="/art/night1/rock.webp" alt="">',
    p: '<img src="/art/night1/paper.webp" alt="">',
    s: '<img src="/art/night1/scissors.webp" alt="">',
  };
  var ORDINAL = ["", "1st", "2nd", "3rd"];

  function fetchNight() {
    return api("GET", "/api/night").then(function (n) {
      ui.night = n;
      return n;
    });
  }

  // What the play screen was last drawn for: the game's status and, in The Ladder, its stage.
  // Kept apart from the hall's own copy, which other parts of the page refresh too.
  function matchMark() { return hall && hall.night ? hall.night.status + ":" + (hall.night.stage || 0) + ":" + (hall.night.subs || 0) : ""; }

  function mountMatch(canAct) {
    ui.matchAct = canAct;
    if (canAct && hall && hall.night && isLadder() && briefed()) markHeard("table" + hall.night.n);
    ui.matchMark = matchMark();
    ui.v = null;
    $("sched").removeAttribute("data-sig");
    loadHall()
      .then(function () {
        ui.matchMark = matchMark();
        if (!hall.night) return drawSched();
        return fetchNight().then(function (n) {
          // the first look at a night is the picture briefing
          drawMatch();
        });
      })
      .catch(function (err) { toast(err.message); });
    ticker = setInterval(function () {
      if (!hall) return;
      if (!hall.night) return drawSched();
      var el = $("v-count");
      if (el && ui.night && ui.night.endsAt) el.textContent = span(Math.max(0, new Date(ui.night.endsAt).getTime() - Date.now()));
    }, 1000);
    poller = setInterval(function () {
      if (quiet()) return;
      var before = ui.matchMark;
      loadHall()
        .then(function () {
          var now = matchMark(); // a stage of The Ladder closing counts as a change: the cards are turned on this screen
          ui.matchMark = now;
          if (now !== before) {
            if (hall.night && hall.night.unseen) return go("vreveal");
            if (hall.night) return fetchNight().then(drawMatch);
            $("sched").removeAttribute("data-sig");
            drawSched();
          }
        })
        .catch(function () {});
      pollMe();
    }, 10000);
  }

  // six vault doors: plain, picked, or open with what was inside
  function vaultsHTML(opts) {
    var out = '<div class="vaults' + (opts.act ? "" : " still") + '">';
    for (var v = 1; v <= 6; v++) {
      var picked = (opts.picks || []).indexOf(v) >= 0;
      var gold = opts.layout ? opts.layout[v - 1] : null;
      var cls = "vault" + (picked ? " on" : "") + (gold != null ? (gold ? " gold" : " bare") + " open" : "");
      // the painted vault: shut, or open on what it holds. Its number sits on the brass plate.
      var art = gold == null ? "vault-closed" : gold ? "vault-open-" + gold : "vault-open-empty";
      var inner = '<img src="/art/night1/' + art + '.webp" alt=""><b>' + v + "</b>" + (gold != null ? "<em>" + (gold ? gold + " gold" : "Empty") + "</em>" : picked ? "<em>Chosen</em>" : "<em>Vault " + v + "</em>");
      out += opts.act
        ? '<button type="button" class="' + cls + '" data-act="vaultPick" data-v="' + v + '" aria-pressed="' + picked + '" style="--i: ' + v + '">' + inner + "</button>"
        : '<span class="' + cls + '" style="--i: ' + v + '">' + inner + "</span>";
    }
    return out + "</div>";
  }

  function throwsHTML(list, act) {
    return '<div class="throws">' + list.map(function (t, i) {
      var inner = '<span class="throw-icon">' + THROW_ICON[t] + "</span><b>" + THROW[t] + "</b>";
      return act ? '<button type="button" class="throw" data-act="throwCycle" data-i="' + i + '" aria-label="Throw ' + (i + 1) + ": " + THROW[t] + '. Tap to change.">' + inner + "</button>" : '<span class="throw">' + inner + "</span>";
    }).join("") + "</div>";
  }

  function clueHTML(text, label, extra) {
    return '<div class="clue' + (extra || "") + '"><i>' + label + "</i><p>" + esc(text) + "</p></div>";
  }

  // ----- Six Vaults in pictures: one idea, one picture -----

  function vbSvg(inner) {
    return '<svg class="vb-svg" viewBox="0 0 360 200" role="img" aria-hidden="true">' + inner + "</svg>";
  }
  function vbText(x, y, text, size, fill, anchor) {
    return '<text x="' + x + '" y="' + y + '" text-anchor="' + (anchor || "middle") + '" font-size="' + size + '" fill="' + (fill || "#ecd9a4") + '">' + text + "</text>";
  }
  function vbVault(x, y, label, lit) {
    return '<g transform="translate(' + x + " " + y + ')"><rect width="46" height="76" rx="5" fill="' + (lit ? "#3b3320" : "#232d34") + '" stroke="' + (lit ? "#ecd9a4" : "#8f7c4e") + '" stroke-width="' + (lit ? 3 : 1.5) + '"/>' +
      vbText(23, 21, label, 17) + '<circle cx="23" cy="47" r="13" fill="none" stroke="#d4b471" stroke-width="2"/>' +
      '<path d="M23 34v26M10 47h26M14 38l18 18M32 38 14 56" stroke="#d4b471" stroke-width="1.6"/><circle cx="23" cy="47" r="3.5" fill="#ecd9a4"/></g>';
  }
  function vbCoin(x, y, r, text) {
    return '<circle cx="' + x + '" cy="' + y + '" r="' + r + '" fill="#d4b471" stroke="#8a6d2f" stroke-width="2"/><circle cx="' + x + '" cy="' + y + '" r="' + (r - 5) + '" fill="none" stroke="#8a6d2f" stroke-width="1" opacity=".7"/>' +
      (text != null ? vbText(x, y + r * 0.36, text, r, "#2a1f08") : "");
  }
  function vbHead(x, y, fill) {
    return '<circle cx="' + x + '" cy="' + y + '" r="13" fill="' + fill + '"/><path d="M' + (x - 22) + " " + (y + 44) + "c0-18 9-27 22-27s22 9 22 27z" + '" fill="' + fill + '"/>';
  }
  function vbCard(x, y, w, h, tone) {
    return '<rect x="' + x + '" y="' + y + '" width="' + w + '" height="' + h + '" rx="4" fill="#efe8d6" stroke="' + tone + '" stroke-width="3"/>' +
      '<path d="M' + (x + 14) + " " + (y + 30) + "h" + (w - 28) + "M" + (x + 14) + " " + (y + 46) + "h" + (w - 28) + "M" + (x + 14) + " " + (y + 62) + "h" + (w - 60) + '" stroke="#8d8672" stroke-width="4" stroke-linecap="round"/>';
  }

  function vbTiles(n) {
    if (n.game === "ladder") return ladderTiles(n);
    var r = n.rules;
    var gold = r.amounts.join(", ").replace(/, ([^,]*)$/, " and $1");
    var prizes = r.prizes.join(", ").replace(/, ([^,]*)$/, " and $1");
    var six = "";
    for (var i = 0; i < 6; i++) six += vbVault(15 + i * 56, 62, i + 1, false);
    var empties = "";
    for (var e = 0; e < 3; e++) empties += '<rect x="' + (18 + e * 50) + '" y="70" width="40" height="52" rx="4" fill="none" stroke="#7d8a90" stroke-width="2" stroke-dasharray="6 5"/>';
    var bars = "", amounts = [15, 12, 10, 5, 0];
    amounts.forEach(function (g, k) {
      var y = 26 + k * 32, w = 30 + g * 13, lost = k === amounts.length - 1;
      bars += '<circle cx="46" cy="' + (y + 11) + '" r="11" fill="' + (lost ? "#7a2a22" : "#56666d") + '"/>' +
        '<rect x="68" y="' + y + '" width="' + w + '" height="22" rx="3" fill="' + (lost ? "#7a2a22" : "#d4b471") + '"/>' + vbText(78 + w, y + 17, g, 17, lost ? "#ff8a7a" : "#ecd9a4", "start");
    });
    bars += '<path d="M30 ' + (26 + 4 * 32 + 11) + 'h150" stroke="#ff5a4d" stroke-width="3"/>' + vbText(300, 26 + 4 * 32 + 18, "OUT", 22, "#ff5a4d");
    var podium = '<rect x="130" y="92" width="100" height="84" fill="#3b3320" stroke="#d4b471" stroke-width="2"/><rect x="30" y="116" width="100" height="60" fill="#2c3338" stroke="#8f7c4e" stroke-width="2"/><rect x="230" y="134" width="100" height="42" fill="#2c3338" stroke="#8f7c4e" stroke-width="2"/>' +
      vbText(180, 150, "1st", 20) + vbText(80, 158, "2nd", 18, "#c9c2ab") + vbText(280, 164, "3rd", 18, "#c9c2ab") +
      vbCoin(164, 62, 17) + vbText(200, 70, "+" + r.prizes[0], 26, "#ecd9a4", "start") +
      vbCoin(66, 90, 13) + vbText(86, 97, "+" + r.prizes[1], 20, "#ecd9a4", "start") + vbCoin(266, 108, 13) + vbText(286, 115, "+" + r.prizes[2], 20, "#ecd9a4", "start");
    function art(k, alt) { return '<img class="vb-art" src="/art/night1/brief-' + k + '.webp" alt="' + alt + '">'; }
    return [
      { line: "There are six vaults.", pic: art(1, "Six numbered vault doors") },
      { line: "Three are empty. Three hold gold: " + gold + ".", pic: art(2, "Six open vaults: three empty, three with gold") },
      { line: "Open any two. The gold inside is your score.", pic: art(3, "A gloved hand opening one of six vaults") },
      { line: "You hold one true clue. Only you were dealt it.", pic: art(4, "A gloved hand holding a sealed card") },
      { line: "The shop sells one more true clue for " + plural(r.cluePrice, "coin", "coins") + ".", pic: art(5, "A coin pushed across a counter towards a tagged card") },
      { line: "Other players hold other clues. They may lie.", pic: art(6, "Three players comparing cards") },
      { line: "The least gold is out. A tie is settled by Rock, Paper, Scissors.", pic: art(7, "Piles of gold from most to least, and a figure leaving through a door") },
      { line: "The three highest scores win " + prizes + " coins.", pic: art(8, "A podium with three coins") },
    ];
  }

  // The same pictures, small, on the Tonight page and under the vault buttons.
  function rulesHTML(n) {
    return '<div class="vb-grid">' + vbTiles(n).map(function (t) {
      return '<div class="vb-tile">' + t.pic + "<p>" + esc(t.line) + "</p></div>";
    }).join("") + "</div>";
  }

  function drawVB() {
    var n = ui.night;
    if (!n || !$("vb-pic")) return;
    var tiles = vbTiles(n);
    var i = Math.min(ui.vb || 0, tiles.length - 1);
    $("vb-kicker").innerHTML = '<span class="vb-who">' + AV.draw(STAFF.arena.look, { ring: "#EFE8D6", ringWidth: 3, label: "Attendant" }) + "</span>Game " + n.n + " · " + gameName() + " · " + (i + 1) + " of " + tiles.length;
    $("vb-pic").innerHTML = tiles[i].pic;
    $("vb-line").textContent = tiles[i].line;
    $("vb-dots").innerHTML = tiles.map(function (t, k) { return '<i class="' + (k === i ? "on" : k < i ? "done" : "") + '"></i>'; }).join("");
    $("vb-next").textContent = i === tiles.length - 1 ? "Got it" : "Next";
    $("vb-skip").hidden = !heard("vbB" + n.n); // the first time, every rule is shown; after that the rules can be skipped
  }

  function drawMatch() {
    var box = $("sched");
    var n = ui.night;
    if (!box || !n) return;
    if (!n.on) return drawSched();
    if (n.game === "ladder") return drawLadder();
    var out = "";
    if (n.status === "done") {
      out = resultHTML(n);
    } else if (!heard("vbB" + n.n)) {
      // the rules are given in the arena, by the attendant, and nowhere else
      out = '<div class="s-card now"><i>Game ' + n.n + " · being played now</i><h2>Six Vaults</h2><p>Walk to the arena. The attendant will show you the vaults and give you the rules.</p></div>";
    } else {
      var count = n.endsAt ? '<i>The vaults close in</i><b class="s-count small" id="v-count">' + span(Math.max(0, new Date(n.endsAt).getTime() - Date.now())) + "</b>" : "<p>The GM closes the vaults.</p>";
      var acting = ui.matchAct && n.playing && !n.out && !n.opened;
      var rules = '<div class="s-card"><i>The rules</i>' + rulesHTML(n) + '<button type="button" class="link" data-act="vbAgain">Play the briefing</button></div>';
      if (acting) out += '<div class="s-card now"><i>Game ' + n.n + " · Six Vaults</i>" + count + "</div>";
      else out += '<div class="s-card now"><i>Game ' + n.n + " · being played now</i><h2>Six Vaults</h2>" + count + "</div>";
      if (n.playing) {
        out += '<div class="s-card"><i>What you know</i>' + clueHTML(n.clue, "Your clue · true · only you were dealt it") +
          (n.bought ? clueHTML(n.bought, "From the shop · true", " shop")
            : n.opened || n.out ? ""
            : "<p>The shop sells one more clue for " + plural(n.rules.cluePrice, "coin", "coins") + ". Its door is at the bottom of the hall.</p>") +
          "<p>Every other player holds a different clue. They may tell you the truth. They may lie.</p></div>";
      }
      if (n.out) out += '<div class="s-card next"><i>Out</i><p>You are out of the game. You can watch how the night ends.</p></div>';
      else if (!n.playing) out += '<div class="s-card"><p>You are not in tonight’s match.</p></div>';
      else if (n.opened) {
        out += '<div class="s-card todo"><i>Sealed</i><h2>Vault ' + n.opened[0] + " and Vault " + n.opened[1] + "</h2>" + vaultsHTML({ picks: n.opened }) +
          "<p>You will see what was inside when the night ends.</p><i>Your throws, if you tie for last</i>" + throwsHTML(n.throws || [], false) + "</div>";
      } else if (!ui.matchAct) {
        out += '<div class="s-card todo"><i>To open your vaults</i><p>Walk to the arena. Its door is at the top of the hall.</p></div>';
      } else {
        if (!ui.v) ui.v = { picks: [], throws: [0, 1, 2, 3, 4].map(function () { return "rps".charAt(Math.floor(Math.random() * 3)); }), ask: false };
        var v = ui.v;
        var ready = v.picks.length === 2;
        var a = Math.min(v.picks[0], v.picks[1]), b = Math.max(v.picks[0], v.picks[1]);
        out += v.ask
          ? '<div class="s-card now"><i>Open them?</i><h2>Vault ' + a + " and Vault " + b + "</h2><p>It is final. You will not see inside until the night ends.</p>" +
            '<div class="btn-row"><button type="button" class="btn" data-act="vaultSealYes">Open them</button><button type="button" class="btn ghost" data-act="vaultBack">Back</button></div></div>'
          : '<div class="s-card todo"><i>Open two vaults</i>' + vaultsHTML({ picks: v.picks, act: true }) +
            "<i>If you tie for last</i><p>These five throws are played in order. Tap one to change it.</p>" + throwsHTML(v.throws, true) +
            '<button type="button" class="btn" data-act="vaultSeal"' + (ready ? "" : " disabled") + ">" + (ready ? "Open Vault " + a + " and Vault " + b : "Choose two vaults") + "</button></div>";
      }
      out += rules;
    }
    box.innerHTML = out;
  }

  function golds(res) {
    return Object.keys(res.gold).map(Number).sort(function (x, y) { return res.gold[y] - res.gold[x] || x - y; });
  }

  // the result, as it stays on the arena page after the reveal
  function resultHTML(n) {
    var res = n.result;
    var mine = res.gold[n.you];
    var out = '<div class="s-card now"><i>Game ' + n.n + " · Six Vaults · result</i>" + vaultsHTML({ layout: res.layout, picks: res.plays[n.you] || [] });
    if (mine != null) {
      out += "<h2>You: " + mine + " gold</h2><p>" + (res.plays[n.you] ? "You opened Vault " + res.plays[n.you][0] + " and Vault " + res.plays[n.you][1] + "." : "You did not open a vault.") +
        (res.prize[n.you] ? " " + (ORDINAL[res.rank[n.you]] || "") + " place: +" + plural(res.prize[n.you], "coin", "coins") + "." : "") + "</p>";
    }
    out += "</div>" + outHTML(n) + '<div class="s-card"><i>Everyone</i>' + golds(res).map(function (p) {
      var play = res.plays[p];
      return '<div class="card-row' + (p === res.out ? " gone" : "") + '"><span>' + who(p) + (play ? " · Vaults " + play[0] + " and " + play[1] : " · did not open") + (res.prize[p] ? " · +" + res.prize[p] + (res.prize[p] === 1 ? " coin" : " coins") : "") + "</span><b>" + res.gold[p] + "</b></div>";
    }).join("") + "</div>";
    return out;
  }

  function roundsHTML(res) {
    var d = res.duel;
    if (!d || !d.rounds.length) return "";
    return '<div class="rounds">' + d.rounds.map(function (r, i) {
      var names = Object.keys(r.hands).map(Number);
      return '<div class="round" style="--i: ' + i + '"><i>Throw ' + (i + 1) + "</i>" + names.map(function (p) {
        var lost = r.losers.indexOf(p) >= 0;
        return '<span class="hand' + (lost ? " lost" : "") + '"><b>' + (p === hall.you ? "You" : p) + '</b><span class="throw-icon">' + THROW_ICON[r.hands[p]] + "</span><em>" + THROW[r.hands[p]] + "</em></span>";
      }).join("") + "<small>" + (r.losers.length ? "" : "Draw") + "</small></div>";
    }).join("") + "</div>";
  }

  function outHTML(n) {
    var res = n.result;
    var tied = res.last.length > 1;
    var list = res.last.map(who).join(", ").replace(/, ([^,]*)$/, " and $1");
    var head = res.out != null ? (res.out === n.you ? "You are out" : who(res.out) + " is out") : "The GM will decide";
    var stamp = res.out != null ? '<img class="v-stamp" src="/art/night1/stamp-out.webp" alt="Out">' : "";
    var why = !tied ? "The least gold: " + res.gold[res.last[0]] + "."
      : list + " tied for last on " + res.gold[res.last[0]] + " gold. " +
        (res.duel && res.duel.forfeit ? (res.out != null ? "A player who opened nothing has no throws, and loses the tie." : "None of them opened a vault, so there are no throws to play.")
          : res.out != null && res.duel && res.duel.out === res.out ? "Rock Paper Scissors settled it."
          : res.out != null ? "Rock Paper Scissors could not separate them, so the player with fewer coins goes." : "Rock Paper Scissors and coins could not separate them.");
    return '<div class="s-card next v-outcard"><i>Out</i>' + stamp + "<h2>" + head + "</h2>" + (res.out != null ? '<img class="v-car" src="/art/night1/out-car.webp" alt="A car waiting at the gate">' : "") + "<p>" + why + "</p>" + (tied ? roundsHTML(res) : "") + "</div>";
  }

  // the reveal, one step at a time, shown once
  function drawVReveal() {
    var box = $("vr");
    var n = ui.night;
    if (!box) return;
    if (!n || !n.on || n.status !== "done") return go("hall");
    if (n.game === "ladder") return drawLadderEnd();
    var res = n.result;
    var step = ui.vstep;
    var mine = res.gold[n.you];
    var next = '<button type="button" class="btn" data-act="vNext">Next</button>';
    var out = "";
    if (step === 0) {
      out = '<div class="v-gate"><p class="say big">Game ' + n.n + ' is over.<br>The vaults are open.</p><button type="button" class="btn narrow" data-act="vNext">Show me</button></div>';
    } else if (step === 1) {
      out = '<div class="s-card now"><i>The six vaults</i>' + vaultsHTML({ layout: res.layout, picks: res.plays[n.you] || [] }) +
        (mine == null ? "<p>You watched this one.</p>" : res.plays[n.you] ? "<h2>You: " + mine + " gold</h2><p>You opened Vault " + res.plays[n.you][0] + " and Vault " + res.plays[n.you][1] + ".</p>" : "<h2>You: 0 gold</h2><p>You did not open a vault.</p>") + "</div>" + '<div class="page-foot flat">' + next + "</div>";
    } else if (step === 2) {
      var amounts = [];
      golds(res).forEach(function (p) { if (amounts.indexOf(res.gold[p]) < 0) amounts.push(res.gold[p]); });
      out = '<div class="s-card now"><i>The gold</i>' + amounts.map(function (g, i) {
        var names = golds(res).filter(function (p) { return res.gold[p] === g; });
        var prize = res.prize[names[0]];
        return '<div class="tier' + (names.indexOf(n.you) >= 0 ? " me" : "") + '" style="--i: ' + i + '"><b>' + g + "</b><span>" + names.map(function (p) { return p === n.you ? "You" : p; }).join(" · ") + "</span><em>" + (prize ? "+" + prize + (prize === 1 ? " coin" : " coins") : "") + "</em></div>";
      }).join("") + (mine != null ? "<p>" + (res.prize[n.you] ? "You win " + plural(res.prize[n.you], "coin", "coins") + "." : "No coins for you tonight.") + "</p>" : "") + "</div>" + '<div class="page-foot flat">' + next + "</div>";
    } else {
      out = outHTML(n) + '<div class="page-foot flat"><button type="button" class="btn" data-act="vDone">' + (res.out === n.you ? "Continue" : "Back to the hall") + "</button></div>";
    }
    box.innerHTML = out;
    box.parentNode.scrollTop = 0;
  }

  function drawShop() {
    var box = $("shop");
    var n = ui.night;
    if (!box || !n) return;
    var purse = '<div class="s-card todo"><i>Your coins</i><p>' + (n.coins != null ? "You hold " + plural(n.coins, "coin", "coins") + "." : "Coins are counted when the bags open.") + "</p></div>";
    if (!n.on || n.status !== "open" || !n.playing || n.out) {
      box.innerHTML = '<div class="s-card"><i>Closed</i><h2>Nothing for sale right now</h2><p>The shop opens on match nights.</p></div>' + purse;
      return;
    }
    var price = plural(n.rules.cluePrice, "coin", "coins");
    box.innerHTML =
      (n.bought
        ? '<div class="s-card now"><i>Sold</i><h2>Your second clue</h2>' + clueHTML(n.bought, "From the shop · true", " shop") + "<p>The shop sells each player one clue a night.</p></div>"
        : '<div class="s-card now"><i>For sale tonight</i><h2>One clue · ' + price + "</h2><p>A true clue about the six vaults, one you have not seen. One for each player.</p>" +
          (n.opened ? "<p>You have already opened your vaults.</p>"
            : n.canBuy ? '<button type="button" class="btn" data-act="clueBuy">Buy a clue for ' + price + "</button>"
            : "<p>You do not have " + price + ".</p>") + "</div>") + purse;
  }

  // ----- a deal between two players -----

  var CHOICE = { c: "Cooperate", b: "Betray" };

  function payTable(d) {
    function cell(key) {
      var v = d.pay[key][0];
      return '<b class="' + (v > 0 ? "up" : "down") + '">' + (v > 0 ? "+" : "−") + Math.abs(v) + "</b>";
    }
    return (
      '<div class="pay"><span></span><i>They cooperate</i><i>They betray</i>' +
      "<i>You cooperate</i>" + cell("cc") + cell("cb") + "<i>You betray</i>" + cell("bc") + cell("bb") + "</div>"
    );
  }

  function drawDeal() {
    var box = $("deal");
    var d = ui.deals;
    if (!box || !d) return;
    var out = "";
    if (ui.dealResult) {
      var r = ui.dealResult;
      out += '<div class="s-card ' + (r.net > 0 ? "now" : "next") + '"><i>Result</i><h2>' + (r.net > 0 ? "+" : "−") + plural(Math.abs(r.net), "coin", "coins") + "</h2><p>You chose to " + CHOICE[r.mine].toLowerCase() + ". " + who(r.with) + " chose to " + CHOICE[r.theirs].toLowerCase() + ".</p></div>";
    }
    out += '<div class="s-card"><i>The deal</i><p>You and one other player each stake ' + plural(d.stake, "coin", "coins") + " and secretly seal a choice. Nobody else is told the result.</p>" + payTable(d) + "</div>";
    if (!d.open) {
      out += '<div class="s-card next"><i>Closed</i><h2>Opens when the bags open</h2><p>You can start making deals once the bag payouts are in.</p></div>';
    } else {
      var pick = ui.dealPick;
      if (pick) {
        out += '<div class="s-card now"><i>Seal it?</i><h2>' + (pick.choice === "c" ? "Cooperate with " : "Betray ") + who(pick.n) + "</h2><p>You stake " + plural(d.stake, "coin", "coins") + ". It cannot be changed once " + (pick.id ? "sealed." : who(pick.n) + " answers.") + '</p><div class="btn-row"><button type="button" class="btn" data-act="dealSeal">Seal</button><button type="button" class="btn ghost" data-act="dealBack">Back</button></div></div>';
      } else {
        d.incoming.forEach(function (o) {
          out += '<div class="s-card now"><i>Waiting for you</i><div class="deal-who"><span class="thread-face">' + faceHTML(o.from) + "</span><h2>" + who(o.from) + ' has sealed a choice</h2></div><p>Seal yours to see the result.</p><div class="btn-row"><button type="button" class="btn go" data-act="dealPick" data-id="' + o.id + '" data-n="' + o.from + '" data-c="c">Cooperate</button><button type="button" class="btn stop" data-act="dealPick" data-id="' + o.id + '" data-n="' + o.from + '" data-c="b">Betray</button></div><button type="button" class="link" data-act="dealDecline" data-id="' + o.id + '">Decline</button></div>';
        });
        if (d.doneToday) {
          out += '<div class="s-card todo"><i>Done for today</i><p>One deal a day. You can make another in ' + span(Math.max(0, d.resetAt - Date.now())) + ".</p></div>";
        } else if (d.mine) {
          out += '<div class="s-card todo"><i>Your offer</i><div class="deal-who"><span class="thread-face">' + faceHTML(d.mine.with) + "</span><h2>Waiting for " + who(d.mine.with) + '</h2></div><p>Your choice is sealed. They must come here to answer before the day ends, or your stake comes back.</p><button type="button" class="link" data-act="dealCancel" data-id="' + d.mine.id + '">Take it back</button></div>';
        } else if (d.balance < d.stake) {
          out += '<div class="s-card todo"><i>Not enough coins</i><p>You hold ' + plural(d.balance, "coin", "coins") + ". A deal needs " + d.stake + ".</p></div>";
        } else if (ui.dealTo) {
          out += '<div class="s-card now"><i>Your choice</i><div class="deal-who"><span class="thread-face">' + faceHTML(ui.dealTo) + "</span><h2>With " + who(ui.dealTo) + '</h2></div><div class="btn-row"><button type="button" class="btn go" data-act="dealPick" data-n="' + ui.dealTo + '" data-c="c">Cooperate</button><button type="button" class="btn stop" data-act="dealPick" data-n="' + ui.dealTo + '" data-c="b">Betray</button></div><button type="button" class="link" data-act="dealBack">Choose someone else</button></div>';
        } else {
          out += '<div class="s-card todo"><i>Start a deal</i><p>You hold ' + plural(d.balance, "coin", "coins") + '. Choose a player.</p><div class="deal-faces">' +
            d.players.map(function (n) { return '<button type="button" class="deal-face" data-act="dealTo" data-n="' + n + '" aria-label="Player ' + n + '">' + faceHTML(n) + "<b>" + n + "</b></button>"; }).join("") + "</div></div>";
        }
      }
      if (d.past.length) {
        out += '<div class="s-card"><i>Your deals</i>' + d.past.map(function (p) {
          var line = p.status === "done" ? "You: " + CHOICE[p.mine].toLowerCase() + ". They: " + CHOICE[p.theirs].toLowerCase() + "." : p.status === "declined" ? "Declined." : p.status === "expired" ? "Not answered in time." : "Taken back.";
          return '<div class="card-row"><span>' + who(p.with) + " · " + line + "</span><b>" + (p.status === "done" ? (p.net > 0 ? "+" : "−") + Math.abs(p.net) : "0") + "</b></div>";
        }).join("") + "</div>";
      }
    }
    box.innerHTML = out;
  }

  function dealSend(path, body, after) {
    if (ui.busy) return;
    ui.busy = true;
    api("POST", path, body)
      .then(function (d) {
        ui.deals = d;
        ui.dealPick = null;
        ui.dealTo = 0;
        ui.dealResult = d.result || null;
        hall = null;
        if (after) after(d);
        return loadHall();
      })
      .then(drawDeal)
      .catch(function (err) { toast(err.message); ui.dealPick = null; drawDeal(); })
      .then(function () { ui.busy = false; });
  }

  // ----- the sky: sixteen stars -----

  var STARS = [[62, 190], [112, 140], [176, 168], [226, 118], [292, 150], [346, 112], [318, 222], [252, 262], [196, 320], [134, 288], [80, 352], [146, 414], [222, 440], [286, 394], [338, 458], [262, 520]];
  var LINKS = [[0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [4, 6], [6, 7], [7, 8], [8, 9], [9, 10], [8, 12], [11, 12], [12, 13], [13, 14], [12, 15], [2, 9]];

  function skyHTML() {
    var out = '<svg viewBox="0 0 400 700" preserveAspectRatio="xMidYMid slice" class="sky-svg" role="img" aria-label="Sixteen stars, one for each player">' +
      '<defs><linearGradient id="sky-g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#03050C"/><stop offset="1" stop-color="#14224E"/></linearGradient>' +
      '<radialGradient id="sky-s"><stop offset="0" stop-color="#FFFFFF" stop-opacity="0.9"/><stop offset="1" stop-color="#FFFFFF" stop-opacity="0"/></radialGradient>' +
      '<radialGradient id="sky-me"><stop offset="0" stop-color="#E0B040" stop-opacity="1"/><stop offset="1" stop-color="#E0B040" stop-opacity="0"/></radialGradient></defs>' +
      '<rect width="400" height="700" fill="url(#sky-g)"/>';
    var seed = 7;
    function rnd() { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; }
    for (var i = 0; i < 170; i++) out += '<circle cx="' + (rnd() * 400).toFixed(1) + '" cy="' + (rnd() * 700).toFixed(1) + '" r="' + (0.4 + rnd() * 1.1).toFixed(2) + '" fill="#FFFFFF" fill-opacity="' + (0.2 + rnd() * 0.55).toFixed(2) + '"' + (i % 7 === 0 ? ' class="twinkle" style="animation-delay: -' + (rnd() * 4).toFixed(1) + 's"' : "") + "/>";
    LINKS.forEach(function (l) {
      out += '<path d="M' + STARS[l[0]][0] + " " + STARS[l[0]][1] + " L" + STARS[l[1]][0] + " " + STARS[l[1]][1] + '" stroke="#9DB7FF" stroke-opacity="0.35" stroke-width="1"/>';
    });
    hall.seats.forEach(function (s, k) {
      var p = STARS[k];
      var mine = s.number === hall.you;
      var lit = !!s.avatar && !s.out;
      out += '<g class="star' + (mine ? " me" : "") + (lit ? "" : " off") + '" data-act="card" data-n="' + s.number + '">' +
        '<circle cx="' + p[0] + '" cy="' + p[1] + '" r="' + (mine ? 26 : lit ? 17 : 8) + '" fill="url(#' + (mine ? "sky-me" : "sky-s") + ')" fill-opacity="' + (lit ? (mine ? 0.9 : 0.55) : 0.2) + '"/>' +
        '<circle cx="' + p[0] + '" cy="' + p[1] + '" r="' + (mine ? 5 : lit ? 3.4 : 1.8) + '" fill="' + (mine ? "#F7E3A0" : "#FFFFFF") + '" fill-opacity="' + (lit ? 1 : 0.5) + '"/>' +
        '<text x="' + p[0] + '" y="' + (p[1] + (mine ? 30 : 24)) + '" text-anchor="middle" font-family="\'Barlow Condensed\', sans-serif" font-weight="700" font-size="' + (mine ? 15 : 12) + '" fill="' + (mine ? "#E0B040" : "#FFFFFF") + '" fill-opacity="' + (lit ? 0.95 : 0.35) + '">' + (mine ? "YOU" : s.number) + "</text>" +
        '<circle cx="' + p[0] + '" cy="' + p[1] + '" r="22" fill="transparent"/></g>';
    });
    return out + "</svg>";
  }

  function drawDoorLog(d) {
    var box = $("doorlog");
    if (!box) return;
    var out = "";
    for (var c = 1; c <= 3; c++) {
      var inside = d.now[c] || [];
      out += '<div class="s-card' + (d.mine === c ? " now" : "") + '"><i>Cell ' + c + (d.mine === c ? " · you are here" : "") + "</i>" +
        (inside.length ? '<div class="deal-faces still">' + inside.map(function (n) { return '<span class="deal-face">' + faceHTML(n) + "<b>" + (n === me.number ? "You" : n) + "</b></span>"; }).join("") + "</div>" : "<p>Empty.</p>") + "</div>";
    }
    out += '<div class="s-card"><i>Who went down</i>' + (d.entries.length
      ? d.entries.map(function (e) { return '<div class="card-row"><span>' + who(e.n) + " went into cell " + e.cell + "</span><b>" + ago(e.at) + "</b></div>"; }).join("")
      : "<p>Nobody yet.</p>") + "</div>";
    box.innerHTML = out;
  }

  // A broadcast shows on every screen as it happens.
  function showCast() {
    var c = hall && hall.lastCast;
    if (!stage || !c) return;
    if (stage.castSeen == null) { stage.castSeen = c.id; return; }
    if (c.id <= stage.castSeen) return;
    stage.castSeen = c.id;
    if (c.from === me.number) return;
    var el = $("onair");
    el.innerHTML = '<span class="onair-face">' + faceHTML(c.from) + '</span><span class="onair-text"><i>' + who(c.from) + " · on air</i><b>" + esc(c.body) + "</b></span>";
    el.hidden = false;
    el.classList.remove("on");
    void el.offsetWidth;
    el.classList.add("on");
    clearTimeout(showCast.timer);
    showCast.timer = setTimeout(function () { el.hidden = true; }, 9000);
  }

  function drawThreads() {
    var el = $("threads");
    if (!el || !hall) return;
    var byN = {};
    hall.whispers.forEach(function (t) { byN[t.with] = t; });
    var others = hall.seats.filter(function (s) { return s.avatar && s.number !== hall.you; });
    others.sort(function (a, b) {
      return ((byN[b.number] || {}).at || 0) - ((byN[a.number] || {}).at || 0) || a.number - b.number;
    });
    el.innerHTML = others.length
      ? others.map(function (s) {
          var t = byN[s.number];
          return (
            '<button type="button" class="thread" data-act="seat" data-n="' + s.number + '"><span class="thread-face">' + faceHTML(s.number) + (online[s.number] ? '<i class="on-dot" title="Online now"></i>' : "") + "</span>" +
            '<span class="thread-main"><b>Player ' + s.number + (online[s.number] ? ' <small class="on-word">Online</small>' : "") + "</b><span>" + (t && t.last ? esc(t.last) : "No messages yet") + "</span></span>" +
            badge(t && t.unread) + "</button>"
          );
        }).join("")
      : '<p class="empty-room">No one else has arrived yet.</p>';
  }

  // ---------- conversations: group chat, messages, ask the GM, notice board ----------

  // The room's own art sits behind its conversation, dimmed, so you know where you are.
  function backdrop(id) {
    return '<div class="room-back" aria-hidden="true">' + WORLD.svg(id).replace('class="map-art"', 'class="map-art" preserveAspectRatio="xMidYMin slice"') + "</div>";
  }

  function roomHTML(id, title, placeholder, back, faceOf) {
    return (
      '<section class="screen room" style="--place: ' + PLACES[id].color + '">' + backdrop(PLACES[id].art || id) +
      '<header class="room-head"><button type="button" class="link" data-act="go" data-scene="' + back + '">\u2190 Back</button>' +
      "<h1>" + esc(title) + "</h1>" + (faceOf != null ? '<span class="head-face" id="head-face"></span>' : "") + "</header>" +
      sayHTML() +
      '<div class="msgs" id="msgs" aria-live="polite"></div>' +
      '<div class="composer" id="composer"><input type="text" id="msg" maxlength="600" autocomplete="off" enterkeyhint="send" placeholder="' + esc(placeholder) + '" aria-label="' + esc(placeholder) + '">' +
      '<button type="button" class="btn send" id="msg-send">Send</button></div></section>'
    );
  }

  function msgHTML(m) {
    return (
      '<div class="msg' + (m.from === me.number ? " mine" : "") + (m.from === 0 ? " from-gm" : "") + '"><div class="msg-face">' + faceHTML(m.from) + "</div>" +
      '<div class="msg-main"><div class="msg-who"><b>' + who(m.from) + "</b><time>" + clock(m.at) + "</time></div>" +
      '<div class="msg-body">' + (m.removed ? "<i>Removed by the GM.</i>" : esc(m.body)) + "</div></div></div>"
    );
  }

  function drawMessages(stick) {
    var box = $("msgs");
    if (!box || !room) return;
    room.drawn = true;
    var nearEnd = box.scrollHeight - box.scrollTop - box.clientHeight < 90;
    var out = "";
    if (room.cfg.room === "board") {
      room.list.forEach(function (p) {
        if (p.parent != null) return;
        var answers = room.list.filter(function (r) { return r.parent === p.id; });
        out += '<div class="post">' + msgHTML(p);
        answers.forEach(function (r) { out += '<div class="answer">' + msgHTML(r) + "</div>"; });
        if (p.from !== 0 && !answers.length) out += '<p class="pending">Not answered yet</p>';
        out += "</div>";
      });
    } else {
      room.list.forEach(function (m) { out += msgHTML(m); });
    }
    box.innerHTML = out || '<p class="empty-room">' + room.cfg.empty + "</p>";
    if (stick || nearEnd) box.scrollTop = box.scrollHeight;
  }

  function pull(stick) {
    var mine = room;
    var cfg = room.cfg;
    return api("GET", "/api/messages?room=" + cfg.room + (cfg.withN ? "&with=" + cfg.withN : "") + "&after=" + room.last).then(function (data) {
      if (room !== mine) return;
      if (data.messages.length) {
        room.list = room.list.concat(data.messages);
        room.last = data.messages[data.messages.length - 1].id;
        drawMessages(stick);
      } else if (!room.drawn) drawMessages(true);
    });
  }

  function openRoom(cfg, intro) {
    room = { cfg: cfg, last: 0, list: [], drawn: false, sending: false };
    var mine = room;
    (hall ? Promise.resolve() : loadHall())
      .then(function () {
        if (room !== mine) return;
        var head = $("head-face");
        if (head) head.innerHTML = faceHTML(cfg.withN || 0);
        sayOnce(cfg.key, intro, {});
        return pull(true);
      })
      .catch(function (err) { toast(err.message); });
    poller = setInterval(function () {
      if (room === mine && !quiet()) pull(false).catch(function () {});
    }, 4000);
    function sendNow() {
      var input = $("msg");
      if (!input) return;
      var text = input.value.trim();
      if (!text || mine.sending) return;
      mine.sending = true;
      api("POST", "/api/messages", { room: cfg.room, with: cfg.withN, body: text })
        .then(function () {
          input.value = "";
          return pull(true);
        })
        .catch(function (err) { toast(err.message); })
        .then(function () { mine.sending = false; });
    }
    $("msg-send").addEventListener("click", sendNow);
    $("msg").addEventListener("keydown", function (event) {
      if (event.key === "Enter" && !event.isComposing) { event.preventDefault(); sendNow(); }
    });
  }

  function currentScene() {
    var state = me && me.state;
    if (state === "letter") return ui.opened ? "letter" : "envelope";
    if (state === "number") return ARRIVE.indexOf(ui.scene) >= 0 ? ui.scene : "welcome";
    if (state === "choose") {
      if (ui.scene === "choose" || INTRO.indexOf(ui.scene) >= 0) return ui.scene;
      return introSeen() ? "choose" : "sixteen";
    }
    if (state === "avatar") return ui.scene === "sealed" || ui.scene === "look" ? ui.scene : "face";
    if (state === "hall") return HALL.indexOf(ui.scene) >= 0 ? ui.scene : "hall";
    if (state === "reveal") return REVEAL.indexOf(ui.scene) >= 0 ? ui.scene : "gate";
    return SCENES[state] ? state : "none";
  }

  function go(scene) {
    // back from the puzzle: the attendant has something new to say
    if (scene === "hall" && ui.scene === "puzzle") talkedIn = "";
    ui.scene = scene;
    render();
  }

  // ---------- countdown ----------

  function countHTML(at) {
    var left = Math.max(0, at - Date.now());
    var s = Math.floor(left / 1000);
    var d = Math.floor(s / 86400);
    var h = Math.floor((s % 86400) / 3600);
    var m = Math.floor((s % 3600) / 60);
    var sec = s % 60;
    function cell(v, label) {
      return "<div><b>" + (v < 10 ? "0" + v : v) + "</b><span>" + label + "</span></div>";
    }
    return (d > 0 ? cell(d, "DAYS") : "") + cell(h, "HOURS") + cell(m, "MIN") + (d > 0 ? "" : cell(sec, "SEC"));
  }

  // ---------- drawing ----------

  function render() {
    var id = currentScene();
    if (me && me.state === "hall") {
      live.wanted = true;
      openLive();
    } else if (live.wanted || live.ws) closeLive();
    var key = (me && me.state) + ":" + id + (id === "whisper" ? ":" + ui.withN : "");
    if (key === lastKey) return;
    lastKey = key;
    clearTimers();
    mount(id);
  }

  function mount(id) {
    var scene = SCENES[id];
    document.body.classList.toggle("desk", id === "letter" || id === "envelope" || id === "declined" || id === "full" || id === "closed");
    var position = me && (spots[me.number] || (hall && hall.pos && hall.pos[me.number]));
    WORLD.framePage(root, scene.html(), id, position && position[0]);
    var el = root.firstElementChild;
    root.dataset.scene = id;
    if (el) {
      el.classList.add("enter");
      el.querySelectorAll(".later:not(.on)").forEach(function (part) { part.inert = true; });
      if (["welcome","sixteen","coins","bags","bag1","bag2","sealed"].includes(id)) {
        var hint = el.querySelector(".tap-hint");
        var next = document.createElement("button");
        next.type = "button";
        next.className = "brief-next";
        next.dataset.act = "advance";
        next.textContent = "Continue";
        if (hint) { next.id = hint.id; hint.replaceWith(next); }
        else el.appendChild(next);
        el.classList.add("with-brief-next");
      }
      var header = id !== "hall" && me.state === "hall" && el.querySelector(".room-head");
      if (header) header.insertAdjacentHTML("beforeend", walletMarkup());
    }
    if (window.scrollY || window.scrollX) window.scrollTo(0, 0);
    if (scene.mount) scene.mount();
    if (scene.auto) {
      later(function () {
        go(typeof scene.next === "function" ? scene.next() : scene.next);
      }, instant ? 400 : scene.auto);
    }
  }

  function refreshChoose() {
    var bags = $("bags");
    if (!bags) return;
    bags.className = "bags" + (ui.pick ? " picked" : "");
    Array.prototype.forEach.call(bags.children, function (b) {
      var on = Number(b.getAttribute("data-bag")) === ui.pick;
      b.classList.toggle("on", on);
      b.setAttribute("aria-pressed", on);
    });
    $("seal").innerHTML = sealHTML();
  }

  root.addEventListener("click", function (event) {
    var el = event.target.closest("[data-act]");
    if (!el) {
      // A tap anywhere else moves the story on.
      if (stage && event.target.id === "menu") setMenu(false);
      else if (stage && stage.room && event.target.closest("#world")) {
        var box = stage.world.getBoundingClientRect();
        var x = (event.clientX - box.left) / stage.zoom, y = (event.clientY - box.top) / stage.zoom;
        var sign = event.target.closest("[data-exit]");
        var exit = sign ? WORLD.doorTo(stage.room, sign.getAttribute("data-exit")) : nearbyDoor(stage.room, x, y, 60);
        if (exit) warmRoom(exit.to);
        walkTo(exit ? exit.center : [x, y]);
      } else if (!event.target.closest("button, a, input, .split, .options, .composer, .faces, .card-wrap, .guide, .sched")) advance();
      return;
    }
    if (el.disabled) return;
    var name = el.getAttribute("data-act");
    if (name === "advance") advance();
    else if (name === "claim") claimWord();
    else if (name === "openLetter") {
      if (ui.opened) return;
      el.classList.add("opening");
      setTimeout(function () { ui.opened = true; render(); }, instant ? 0 : 520);
    }
    else if (name === "accept") act("POST", "/api/respond", { accept: true }, function () { ui.scene = "welcome"; ui.drawn = false; });
    else if (name === "decline") act("POST", "/api/respond", { accept: false }, function () { ui.declineAsk = false; });
    else if (name === "declineAsk" || name === "declineNo") {
      ui.declineAsk = name === "declineAsk";
      $("letter-actions").innerHTML = letterActions();
    } else if (name === "enter") act("POST", "/api/enter", {}, function () { ui.scene = "sixteen"; });
    else if (name === "draw") runDraw();
    else if (name === "tourNext") tourNext();
    else if (name === "pick") { ui.pick = Number(el.getAttribute("data-bag")); ui.confirm = false; refreshChoose(); }
    else if (name === "sealAsk") { ui.confirm = true; refreshChoose(); }
    else if (name === "sealNo") { ui.confirm = false; refreshChoose(); }
    else if (name === "seal") act("POST", "/api/seal", { bag: ui.pick }, function () { ui.scene = "sealed"; ui.stamped = true; });
    else if (name === "hall") go("hall");
    else if (name === "megaNow") megaNow();
    else if (name === "go") go(el.getAttribute("data-scene"));
    else if (name === "seat") { ui.withN = Number(el.getAttribute("data-n")); ui.card = 0; go("whisper"); }
    else if (name === "pzDone") { var done = $("pz-result"); if (done) done.remove(); }
    else if (name === "commitYes") sendCommit(true);
    else if (name === "commitAsk" || name === "commitBack") { ui.resignAsk = name === "commitAsk"; drawCommit(); }
    else if (name === "commitResign") sendCommit(false);
    else if (name === "gmTalk") go("study");
    else if (name === "stageGo") {
      // after the first walk to the table the bar goes straight there; before that it only says where to walk
      if (hall && hall.night && (hall.night.opened || heard("table" + hall.night.n))) go("arena");
      else toast("Walk to the arena. Its door is at the top of the hall.");
    }
    else if (name === "npc") { if (stage && STAFF[stage.room]) openTalk(stage.room); }
    else if (name === "talkClose") closeTalk();
    else if (name === "introNext") { ui.intro = 1; if (stage) drawTalk(stage.room); }
    else if (name === "introRules") { ui.vbBack = "hall"; go("vbrief"); }
    else if (name === "callDone") {
      if (hall && hall.night) markHeard("call" + hall.night.n);
      go("hall");
      setTimeout(function () { if (stage && stage.room === "hall" && !briefed()) narrate(["The arena door is at the top of the hall."], { auto: 4200, fade: true }); }, 700);
    }
    else if (name === "actor") {
      var n = Number(el.getAttribute("data-n"));
      if (n !== me.number) approach(n);
      else setMenu(true);
    } else if (name === "use") { if (stage) useSpot(el.hasAttribute("data-i") ? WORLD.ROOMS[stage.room].spots[Number(el.getAttribute("data-i"))] : stage.spot); }
    else if (name === "card") { var cn = Number(el.getAttribute("data-n")); if ($("card")) showCard(cn); else { ui.card = cn; go("players"); } }
    else if (name === "pzNext") { var dz = demoHallStore().pz; dz.kind = ((dz.kind || 0) + 1) % 4; dz.tries = 0; dz.solved = false; api("GET", "/api/puzzle").then(function (pz) { ui.pz = pz; drawPuzzle(); var pg = document.querySelector(".page"); if (pg) pg.scrollTop = 0; }); }
    else if (name === "vaultPick") {
      var vv = Number(el.getAttribute("data-v"));
      var at = ui.v.picks.indexOf(vv);
      if (at >= 0) ui.v.picks.splice(at, 1);
      else { if (ui.v.picks.length === 2) ui.v.picks.shift(); ui.v.picks.push(vv); }
      drawMatch();
    }
    else if (name === "throwCycle") { var ti = Number(el.getAttribute("data-i")); ui.v.throws[ti] = { r: "p", p: "s", s: "r" }[ui.v.throws[ti]]; drawMatch(); }
    else if (name === "vaultSeal") { if (ui.v && ui.v.picks.length === 2) { ui.v.ask = true; drawMatch(); } }
    else if (name === "vaultBack") { ui.v.ask = false; drawMatch(); }
    else if (name === "vaultSealYes") {
      if (ui.busy) return;
      ui.busy = true;
      api("POST", "/api/night/open", { vaults: ui.v.picks, throws: ui.v.throws })
        .then(function (n) { ui.night = n; ui.v = null; hall = null; drawMatch(); })
        .catch(function (err) { toast(err.message); })
        .then(function () { ui.busy = false; });
    }
    else if (name === "clueBuy") {
      if (ui.busy) return;
      ui.busy = true;
      api("POST", "/api/night/buy", {})
        .then(function (n) { ui.night = n; if (hall && n.coins != null) hall.coins = n.coins; syncWallet(); drawShop(); })
        .catch(function (err) { toast(err.message); })
        .then(function () { ui.busy = false; });
    }
    else if (name === "vbNext" || name === "vbSkip") {
      var tiles = ui.night ? vbTiles(ui.night).length : 0;
      if (name === "vbNext" && (ui.vb || 0) < tiles - 1) { ui.vb = (ui.vb || 0) + 1; drawVB(); }
      else {
        if (ui.night) markHeard("vbB" + ui.night.n);
        var back = ui.vbBack || "tonight";
        ui.vbBack = "";
        if (back === "hall") talkedIn = ""; // back in the arena, the attendant says what to do next
        go(back);
      }
    }
    else if (name === "vbAgain") go("vbrief");
    else if (name.indexOf("ld") === 0) ladderAct(name, el);
    else if (name === "vNext") { ui.vstep += 1; drawVReveal(); }
    else if (name === "vDone") {
      api("POST", "/api/night/seen", {}).catch(function () {}).then(function () { hall = null; go("hall"); });
    }
    else if (name === "cardClose") { ui.card = 0; $("card").hidden = true; }
    else if (name.indexOf("bt") === 0) betAct(name, el);
    else if (name.indexOf("tr") === 0 && name.length > 2 && name.charAt(2) === name.charAt(2).toUpperCase()) treasuryAct(name, el);
    else if (name === "dealTo") { ui.dealTo = Number(el.getAttribute("data-n")); drawDeal(); }
    else if (name === "dealPick") { ui.dealPick = { id: Number(el.getAttribute("data-id")) || 0, n: Number(el.getAttribute("data-n")), choice: el.getAttribute("data-c") }; drawDeal(); }
    else if (name === "dealBack") { ui.dealPick = null; ui.dealTo = 0; drawDeal(); }
    else if (name === "dealSeal") { var dp = ui.dealPick; if (dp) dealSend(dp.id ? "/api/deal/answer" : "/api/deal", dp.id ? { id: dp.id, choice: dp.choice } : { to: dp.n, choice: dp.choice }); }
    else if (name === "dealDecline") dealSend("/api/deal/answer", { id: Number(el.getAttribute("data-id")), decline: true });
    else if (name === "dealCancel") dealSend("/api/deal/answer", { id: Number(el.getAttribute("data-id")), cancel: true });
    else if (name === "menu") setMenu($("menu").hidden);
    else if (name === "bell") setMenu(true, "bell");
    else if (name === "online") setMenu(true, "online");
    else if (name === "noteGo") {
      el.hidden = true;
      // a duel of mine is over, or someone waits for my cards: straight to the table, where the cards are shown.
      // Any other pop-up opens the bell; the puzzle itself is only in the puzzle room.
      var to = el.getAttribute("data-to");
      el.removeAttribute("data-to");
      if (to === "arena") { readNotices(true); go("arena"); }
      else if (to === "whispers") go("whispers");
      else if (to === "puzzle") { readNotices(true); toast("Walk to the puzzle room. The treasury is there."); }
      else setMenu(true, "bell");
    }
    else if (name === "menuClose") setMenu(false);
    else if (name === "editFace") { ui.face = null; go("face"); }
    else if (name === "tab") { ui.tab = el.getAttribute("data-tab"); refreshFace(false); }
    else if (name === "opt") { ui.face[el.getAttribute("data-k")] = Number(el.getAttribute("data-v")); refreshFace(true); }
    else if (name === "preset") { ui.face = AV.clean(AV.PRESETS[Number(el.getAttribute("data-i"))]); refreshFace(true); }
    else if (name === "saveFace") {
      var wasInHall = me.state === "hall";
      act("POST", "/api/avatar", { avatar: ui.face }, function () { ui.scene = wasInHall ? "hall" : "tour"; hall = null; faceMemo = {}; });
    }
    else if (name === "rules") go("bags");
    else if (name === "next") {
      var scene = SCENES[currentScene()];
      go(typeof scene.next === "function" ? scene.next() : scene.next);
    } else if (name === "seen") act("POST", "/api/seen", {}, function () { ui.scene = "ledger"; hall = null; });
  });

  root.addEventListener("input", function (event) {
    if (event.target.id === "split-range") drawSplit();
  });

  document.addEventListener("keydown", function (event) {
    if (event.key !== "Enter" && event.key !== " ") return;
    if (event.target.closest && event.target.closest("button, a, input, textarea")) return;
    event.preventDefault();
    advance();
  });

  var KEYS = { ArrowLeft: "left", a: "left", A: "left", ArrowRight: "right", d: "right", D: "right", ArrowUp: "up", w: "up", W: "up", ArrowDown: "down", s: "down", S: "down" };
  function onKey(event, down) {
    if (stage && $("menu") && !$("menu").hidden) {
      if (down && event.key === "Escape") setMenu(false);
      return;
    }
    if (!stage || !KEYS[event.key]) return;
    if (event.target.closest && event.target.closest("input, textarea")) return;
    stage.keys[KEYS[event.key]] = down;
    if (down) event.preventDefault();
  }
  document.addEventListener("keydown", function (event) { onKey(event, true); });
  document.addEventListener("keyup", function (event) { onKey(event, false); });
  window.addEventListener("blur", function () { if (stage) stage.keys = {}; });

  document.addEventListener("visibilitychange", function () {
    if (document.hidden || !me) return;
    lastActive = Date.now();
    if (demo) return;
    if (me.state === "letter" || me.state === "full") load().catch(function () {});
    else if (me.state === "hall") {
      openLive();
      if (stage) stage.last = performance.now();
      if (room) pull(false).catch(function () {});
      else loadHall().then(function () { refreshStage(); drawThreads(); }).catch(function () {});
    }
  });

  // ---------- preview mode: /?demo=letter and friends, nothing is saved ----------

  var DEMO_LETTER = DP.defaultLetter;

  function demoMake(state, pickedBag, heldNumber, keepAvatar) {
    if (state === "waiting") state = "hall";
    var number = heldNumber || parseInt(query.get("n") || "11", 10);
    var k = Math.max(0, Math.min(16, parseInt(query.get("k") || "6", 10)));
    var bag = pickedBag || (query.get("bag") === "0" ? null : parseInt(query.get("bag") || "2", 10));
    var names = query.get("names") !== "0";
    var soon = new Date(Date.now() + (2 * 24 + 5) * 3600 * 1000 + 14 * 60000).toISOString();
    var revealed = state === "reveal" || !!query.get("revealed");
    var past = state === "avatar" || state === "hall" || state === "reveal";
    var d = {
      state: state,
      phase: revealed ? "revealed" : "open",
      name: query.get("name") || "Maya",
      number: state === "letter" ? null : number,
      bag: past ? bag : null,
      coins: null,
      avatar: keepAvatar || (state === "hall" || state === "reveal" ? AV.PRESETS[5] : null),
      seats: 16,
      bag1Coins: 5,
      bag2Pot: 40,
      opensAt: query.get("past") ? new Date(Date.now() - 60000).toISOString() : soon,
      replyBy: new Date(Date.now() + 24 * 3600 * 1000).toISOString(),
      letter: DEMO_LETTER,
    };
    if (revealed) {
      var others = [];
      for (var i = 1; i <= 16; i++) if (i !== number) others.push(i);
      // A fixed shuffle so the preview looks the same every time.
      others.sort(function (a, b) { return ((a * 7) % 16) - ((b * 7) % 16); });
      var inTwo = bag === 2 ? [number].concat(others.slice(0, Math.max(0, k - 1))) : others.slice(0, k);
      var none = bag == null ? [number] : [];
      var each = inTwo.length ? Math.floor(40 / inTwo.length) : 0;
      var results = [];
      for (var p = 1; p <= 16; p++) {
        var b = inTwo.indexOf(p) >= 0 ? 2 : none.indexOf(p) >= 0 ? null : 1;
        results.push({ number: p, bag: b, coins: b === 2 ? each : b === 1 ? 5 : 0 });
      }
      d.coins = results[number - 1].coins;
      d.reveal = {
        pot: 40,
        bag1Coins: 5,
        bag1Count: 16 - inTwo.length - none.length,
        bag2Count: inTwo.length,
        bag2Share: each,
        leftover: inTwo.length ? 40 - each * inTwo.length : 40,
        unsealedCount: none.length,
        showChoices: names,
      };
      if (names) {
        d.reveal.order = inTwo.slice().sort(function (a, b) { return ((a * 5) % 16) - ((b * 5) % 16); });
        d.reveal.results = results;
        d.reveal.unsealed = none;
      }
    }
    return d;
  }

  // A small made-up hall for the preview: some players have arrived, a few have spoken.
  var demoStore = null;

  function demoHallStore() {
    if (demoStore) return demoStore;
    var here = [2, 3, 5, 6, 8, 9, 12, 13, 14, 16];
    var looks = [1, 13, 2, 14, 4, 3, 15, 23, 11, 17].map(function (n) { return AV.PRESETS[n]; });
    var seats = [];
    for (var n = 1; n <= 16; n++) seats.push({ number: n, avatar: here.indexOf(n) >= 0 ? looks[here.indexOf(n)] : null });
    var t = Date.now();
    var msgs = [];
    msgs.forEach(function (m, i) {
      m.id = i + 1;
      if (m.to == null) m.to = null;
      if (m.parent == null) m.parent = null;
    });
    var pos = { 2: ["hall", 560, 470], 16: ["hall", 1250, 1140], 5: ["puzzle", 500, 420], 6: ["betting", 620, 700], 12: ["hall", 1180, 560], 13: ["gallery", 820, 380] };
    demoStore = {
      seats: seats, msgs: msgs, read: {}, next: msgs.length + 1, pos: pos, extra: 0,
      pz: { tries: 0, solved: false, kind: query.get("pz") ? Math.max(0, ["code", "keys", "cipher"].indexOf(query.get("pz"))) : 1 },
      deals: { mine: null, incoming: [{ id: 1, from: 9 }], past: [], doneToday: false },
      doors: [],
    };
    return demoStore;
  }

  function demoHall() {
    var d = demoHallStore();
    function mark(key) { return d.read[key] || 0; }
    var threads = {};
    d.msgs.forEach(function (m) {
      if (m.room !== "whisper" || (m.from !== me.number && m.to !== me.number)) return;
      var other = m.from === me.number ? m.to : m.from;
      var t = threads[other] || (threads[other] = { with: other, last: "", at: 0, unread: 0 });
      t.last = m.body.slice(0, 80);
      t.at = m.at;
      if (m.from === other && m.id > mark("w:" + other)) t.unread += 1;
    });
    var whispers = Object.keys(threads).map(function (k) { return threads[k]; }).sort(function (a, b) { return b.at - a.at; });
    function count(roomName, onlyGm) {
      return d.msgs.filter(function (m) {
        return m.room === roomName && m.id > mark(roomName) && m.from !== me.number && (!onlyGm || m.from === 0);
      }).length;
    }
    var revealed = me.phase === "revealed";
    return {
      you: me.number,
      phase: me.phase,
      opensAt: me.opensAt,
      autoOpen: !!query.get("auto"),
      nextAt: query.get("next") === "0" ? "" : new Date((revealed ? Date.now() : new Date(me.opensAt).getTime()) + (26 * 60 + 40) * 60000).toISOString(),
      nextName: "Night 1",
      canEditFace: !revealed,
      pos: d.pos,
      online: [3, 9, 14],
      seats: d.seats.map(function (s) {
        var mine = s.number === me.number;
        var seat = { number: s.number, avatar: mine ? me.avatar : s.avatar };
        if (seat.avatar) {
          seat.since = Date.now() - (2 + (s.number * 7) % 30) * 3600000;
          seat.seen = Date.now() - ((s.number * 13) % 9) * 3600000;
          seat.solved = mine ? (d.pz.solved ? 1 : 0) : (s.number * 3) % 3;
          seat.deals = !revealed ? 0 : mine ? d.deals.past.length : s.number % 2;
        }
        if (revealed && seat.avatar) {
          if (mine) seat.coins = me.coins + d.extra;
          else if (me.reveal && me.reveal.results) seat.coins = me.reveal.results[s.number - 1].coins;
          if (!mine && d.night && d.night.result) seat.coins += d.night.result.prize[s.number] || 0;
        }
        if (d.night && d.night.result && d.night.result.out === s.number) seat.out = 1;
        if (d.resigned && s.number === me.number) seat.out = -1;
        return seat;
      }),
      unread: { table: count("table"), study: count("study", true), board: count("board"), whispers: whispers.reduce(function (sum, t) { return sum + t.unread; }, 0), deals: revealed && d.bettingOpen ? d.deals.incoming.length : 0 },
      whispers: whispers,
      coins: revealed ? me.coins + d.extra : null,
      banked: d.extra,
      lastCast: d.msgs.filter(function (m) { return m.room === "table"; }).slice(-1).map(function (m) { return { id: m.id, from: m.from, body: m.body, at: m.at }; })[0] || null,
      cell: 0,
      bettingOpen: !!d.bettingOpen,
      bets: d.bettingOpen && d.night && d.night.game === "ladder" ? { taking: d.night.status === "open" && d.night.stage <= 4, stage: d.night.status === "open" ? d.night.stage : 5, placed: !!d.night.bet } : null,
      gm: (function () {
        var posts = d.msgs.filter(function (m) { return m.room === "board" && m.from === 0 && m.parent == null; });
        return { total: posts.length, notes: posts.slice(-3).reverse().map(function (m) { return { id: m.id, body: m.body, at: m.at, fresh: m.id > mark("board") }; }) };
      })(),
      notices: (d.notices || []).slice().reverse(),
      noticeMark: d.noticeMark || 0,
      puzzle: { solved: !!d.pz.solved, left: 3 - d.pz.tries, reward: 1 },
      needsCommit: !d.committed && !query.get("committed"),
      out: d.resigned ? -1 : d.night && d.night.result && d.night.result.out === me.number ? 1 : 0,
      night: d.night ? { n: 1, game: d.night.game || "vaults", stage: d.night.stage, status: d.night.status, endsAt: d.night.endsAt, opened: d.night.game === "ladder" ? !!d.night.sealed : !!d.night.opened, unseen: d.night.status === "done" && !d.night.seen } : null,
    };
  }

  function demoMessages(method, path, body) {
    var d = demoHallStore();
    var q = new URLSearchParams(path.split("?")[1] || "");
    var roomName = method === "GET" ? q.get("room") : body.room;
    var other = Number(method === "GET" ? q.get("with") : body.with) || 0;
    function inThread(m) {
      if (m.room !== roomName) return false;
      if (roomName !== "whisper") return true;
      return (m.from === me.number && m.to === other) || (m.from === other && m.to === me.number);
    }
    if (method === "GET") {
      var after = Number(q.get("after")) || 0;
      var list = d.msgs.filter(function (m) { return inThread(m) && m.id > after; });
      var key = roomName === "whisper" ? "w:" + other : roomName;
      if (list.length) d.read[key] = Math.max(d.read[key] || 0, list[list.length - 1].id);
      return { messages: list };
    }
    d.msgs.push({ id: d.next++, room: roomName, from: me.number, to: roomName === "whisper" ? other : roomName === "study" ? me.number : null, parent: null, body: body.body, at: Date.now() });
    if (roomName === "study") {
      // In the preview nobody is on the other end, so say so.
      setTimeout(function () {
        d.msgs.push({ id: d.next++, room: "study", from: 0, to: me.number, parent: null, body: "This is only the preview. In the real game, I answer here.", at: Date.now() });
      }, 1500);
    }
    return { ok: true };
  }

  // The preview's puzzle, deals and door log: fixed samples that behave like the real ones.
  var DEMO_PUZZLES = [
    { type: "code", title: "Crack the code", ask: "The code has three different digits, from 1 to 9. What is it?", data: { clues: [{ guess: "358", place: 1, digit: 1 }, { guess: "641", place: 0, digit: 1 }, { guess: "924", place: 0, digit: 0 }, { guess: "692", place: 0, digit: 1 }, { guess: "837", place: 0, digit: 1 }, { guess: "643", place: 0, digit: 2 }] }, answer: "365" },
    { type: "keys", title: "The six keys", ask: "Type the six numbers in the order the keys are used.", data: { ask: "Type the six numbers in the order the keys are used.", clues: [{ k: "before", a: 2, b: 6 }, { k: "gap", a: 3, b: 5, n: 2 }, { k: "before", a: 4, b: 2 }, { k: "gap", a: 3, b: 6, n: 3 }, { k: "next", a: 3, b: 2 }], lines: ["Key 2 is used before key 6.", "Exactly two keys are used between keys 3 and 5.", "Key 4 is used before key 2.", "Exactly three keys are used between keys 3 and 6.", "Key 2 is used right after key 3."] }, answer: "432156" },
    { type: "cipher", title: "Break the cipher", ask: "Every letter was moved the same number of places along the alphabet. What is the word?", data: { text: "THYISL" }, answer: "MARBLE" },
  ];

  function demoPuzzle(method, body) {
    var d = demoHallStore();
    var sample = DEMO_PUZZLES[d.pz.kind || 0];
    var right = false;
    if (method === "POST" && !d.pz.solved && d.pz.tries < 3) {
      d.pz.tries += 1;
      right = String(body.answer).toUpperCase().replace(/[^A-Z0-9]/g, "") === sample.answer;
      if (right) { d.pz.solved = true; d.extra += 1; }
    }
    return {
      right: right, type: sample.type, title: sample.title, ask: sample.ask, data: sample.data,
      tries: d.pz.tries, left: 3 - d.pz.tries, solved: d.pz.solved, answer: d.pz.solved || d.pz.tries >= 3 ? sample.answer : undefined,
      resetAt: Date.now() + (5 * 60 + 12) * 60000, reward: 1, paid: me.phase === "revealed",
    };
  }

  function demoDeals(path, body) {
    var d = demoHallStore();
    var deals = d.deals;
    var pay = { cc: [1, 1], cb: [-2, 2], bc: [2, -2], bb: [-1, -1] };
    var result = null;
    if (path === "/api/deal") deals.mine = { id: 2, with: body.to };
    else if (path === "/api/deal/answer") {
      if (body.cancel) deals.mine = null;
      else if (body.decline) deals.incoming = [];
      else {
        var theirs = "b"; // in the preview, Player 9 betrays
        var net = pay[theirs + body.choice][1];
        d.extra += net;
        deals.past.unshift({ id: body.id, with: 9, status: "done", mine: body.choice, theirs: theirs, net: net, at: Date.now() });
        deals.incoming = [];
        deals.doneToday = true;
        result = { with: 9, mine: body.choice, theirs: theirs, net: net };
      }
    }
    var open = me.phase === "revealed";
    return {
      open: open, stake: 2, pay: pay, balance: open ? me.coins + d.extra : null, doneToday: deals.doneToday, resetAt: Date.now() + (5 * 60 + 12) * 60000,
      mine: deals.mine, incoming: open ? deals.incoming : [], players: d.seats.filter(function (s) { return s.avatar && s.number !== me.number; }).map(function (s) { return s.number; }),
      past: deals.past, result: result || undefined,
    };
  }

  // The preview's Night 1. The same vaults and the same rules as the real one, with made-up choices for the others.
  // Sample contents for the preview only. The real vaults are held by the server and are different.
  var DEMO_GOLD = [5, 0, 0, 10, 0, 2];
  var DEMO_RULES = { vaults: 6, open: 2, amounts: [10, 5, 2], cluePrice: 1, prizes: [5, 3, 1], throws: 5 };
  var DEMO_PLAYS = { 2: [2, 3, "rpsrp"], 3: [2, 3, "srpps"], 5: [2, 5, "prsrs"], 6: [1, 2, "ssrpr"], 8: [3, 5, "rrpsp"], 9: [2, 3, "psrrs"], 12: [2, 6, "rspsr"], 13: [1, 4, "rpsrp"], 14: [2, 3, "sprsp"], 16: [4, 6, "prrsp"] };

  function demoNightStart() {
    var d = demoHallStore();
    d.night = { status: "open", endsAt: new Date(Date.now() + (5 * 60 + 12) * 60000).toISOString(), clue: "Exactly one of Vault 1 and Vault 2 is empty.", bought: "", opened: null, throws: null, result: null, seen: false };
  }

  function demoDuel(tied, throws) {
    var beats = { r: "s", s: "p", p: "r" };
    var none = tied.filter(function (n) { return !throws[n]; });
    if (none.length === 1) return { rounds: [], out: none[0], forfeit: true, undecided: [] };
    if (none.length > 1) return { rounds: [], out: null, forfeit: true, undecided: none };
    function hand(n, i) { var t = throws[n]; return t[(i + Math.floor(i / t.length) * tied.indexOf(n)) % t.length]; }
    var rounds = [], alive = tied.slice(), i = 0;
    while (alive.length > 2 && i < 60) {
      var hands = {}, kinds = [];
      alive.forEach(function (n) { hands[n] = hand(n, i); if (kinds.indexOf(hands[n]) < 0) kinds.push(hands[n]); });
      var losers = [];
      if (kinds.length === 2) { var losing = beats[kinds[0]] === kinds[1] ? kinds[1] : kinds[0]; losers = alive.filter(function (n) { return hands[n] === losing; }); }
      rounds.push({ hands: hands, losers: losers });
      if (losers.length) alive = losers;
      i += 1;
    }
    if (alive.length === 1) return { rounds: rounds, out: alive[0], forfeit: false, undecided: [] };
    if (alive.length > 2) return { rounds: rounds, out: null, forfeit: false, undecided: alive };
    var a = alive[0], b = alive[1], wins = {};
    wins[a] = 0; wins[b] = 0;
    while (wins[a] < 2 && wins[b] < 2 && i < 120) {
      var h = {}, lost = [];
      h[a] = hand(a, i); h[b] = hand(b, i);
      if (h[a] !== h[b]) { var w = beats[h[a]] === h[b] ? a : b; wins[w] += 1; lost = [w === a ? b : a]; }
      rounds.push({ hands: h, losers: lost, final: true });
      i += 1;
    }
    if (wins[a] === wins[b]) return { rounds: rounds, out: null, forfeit: false, undecided: [a, b] };
    return { rounds: rounds, out: wins[a] > wins[b] ? b : a, forfeit: false, undecided: [], wins: wins };
  }

  function demoNightEnd() {
    var d = demoHallStore();
    var nt = d.night;
    if (!nt || nt.status !== "open") return;
    var plays = {}, throws = {}, gold = {}, players = [];
    Object.keys(DEMO_PLAYS).forEach(function (k) { plays[k] = DEMO_PLAYS[k].slice(0, 2); throws[k] = DEMO_PLAYS[k][2].split(""); });
    if (nt.opened) { plays[me.number] = nt.opened; throws[me.number] = nt.throws; }
    d.seats.forEach(function (s) { if (s.avatar || s.number === me.number) players.push(s.number); });
    players.forEach(function (n) { gold[n] = plays[n] ? DEMO_GOLD[plays[n][0] - 1] + DEMO_GOLD[plays[n][1] - 1] : 0; });
    var amounts = [];
    players.forEach(function (n) { if (amounts.indexOf(gold[n]) < 0) amounts.push(gold[n]); });
    amounts.sort(function (x, y) { return y - x; });
    var rank = {}, prize = {};
    players.forEach(function (n) { rank[n] = amounts.indexOf(gold[n]) + 1; prize[n] = gold[n] > 0 ? DEMO_RULES.prizes[rank[n] - 1] || 0 : 0; });
    var last = players.filter(function (n) { return gold[n] === amounts[amounts.length - 1]; });
    var match = last.length > 1 ? demoDuel(last, throws) : null;
    nt.result = { layout: DEMO_GOLD, plays: plays, gold: gold, rank: rank, prize: prize, last: last, duel: match, out: match ? match.out : last[0], undecided: match ? match.undecided : [] };
    nt.status = "done";
    d.extra += prize[me.number] || 0;
  }

  // ----- the preview's Ladder: fifteen other players who play their cards at random -----
  function demoLadderStart() {
    var d = demoHallStore();
    d.seats.forEach(function (s) { if (!s.avatar) s.avatar = { s: s.number % 6, h: (s.number * 3) % 20, c: s.number % 6, g: 0, b: s.number % 5, m: 0, o: s.number % 9 }; });
    var players = d.seats.map(function (s) { return s.number; });
    d.night = { game: "ladder", status: "open", endsAt: new Date(Date.now() + 47 * 60000).toISOString(), stage: 1, players: players, sealed: null, seenStage: 0, duels: [], used: {}, boosts: 0, seen: false, result: null };
    players.forEach(function (n) { d.night.used[n] = []; });
  }

  // The GM closes the stage: every card sealed for it is turned, and the next stage opens.
  function demoLadderClose() {
    var d = demoHallStore(), nt = d.night;
    if (!nt || nt.status !== "open") return;
    var per = LADDER.RULES.perStage, mine = {}, picked = {};
    (nt.sealed || []).forEach(function (p) { mine[p.opp] = p; });
    function play(n, opp) {
      var hand = LADDER.CARDS.filter(function (c) { return nt.used[n].indexOf(c) < 0 && (picked[n] || []).indexOf(c) < 0; });
      var card, boost = 0, p = mine[opp];
      if (n === me.number) { card = p && p.card && hand.indexOf(p.card) >= 0 ? p.card : LADDER.lowest(hand, 1)[0]; boost = p && p.boost ? 1 : 0; }
      else card = hand[Math.floor(Math.random() * hand.length)];
      (picked[n] = picked[n] || []).push(card);
      if (boost) { nt.boosts += 1; d.extra -= 1; }
      return [card, boost];
    }
    LADDER.rounds(nt.players).slice((nt.stage - 1) * per, nt.stage * per).forEach(function (pairs) {
      pairs.forEach(function (pr) { var a = play(pr[0], pr[1]), b = play(pr[1], pr[0]); nt.duels.push({ stage: nt.stage, a: pr[0], b: pr[1], ca: a[0], cb: b[0], ba: a[1], bb: b[1] }); });
    });
    Object.keys(picked).forEach(function (n) { nt.used[n] = nt.used[n].concat(picked[n]); });
    nt.sealed = null;
    if (nt.stage >= LADDER.stageCount(nt.players)) {
      var tab = LADDER.table(nt.players, nt.duels), lp = LADDER.lastPlace(nt.players, nt.duels), prizes = {};
      LADDER.RULES.prizes.forEach(function (p, i) { if (tab[i]) prizes[tab[i].n] = p; });
      nt.status = "done";
      nt.result = { out: lp.out != null ? lp.out : lp.last[lp.last.length - 1], last: lp.last, prizes: prizes };
    } else nt.stage += 1;
  }

  function demoLadderView(d, coins) {
    var nt = d.night, you = me.number, results = [], stages = LADDER.stageCount(nt.players);
    for (var s = 1; s <= stages; s++) {
      var ds = nt.duels.filter(function (x) { return x.stage === s && (x.a === you || x.b === you); });
      if (ds.length) results.push({ stage: s, duels: ds.map(function (x) {
        var am = x.a === you, r = LADDER.duel(x.ca, x.ba, x.cb, x.bb);
        return { opp: am ? x.b : x.a, mine: am ? x.ca : x.cb, theirs: am ? x.cb : x.ca, mb: am ? x.ba : x.bb, tb: am ? x.bb : x.ba, r: am ? r : -r };
      }) });
    }
    return { on: true, game: "ladder", n: 1, status: nt.status, you: you, playing: true, out: 0, endsAt: nt.endsAt, stage: nt.stage, stages: stages,
      opponents: LADDER.stagesFor(nt.players, you), hand: LADDER.CARDS.filter(function (c) { return nt.used[you].indexOf(c) < 0; }), sealed: nt.sealed,
      boostsLeft: LADDER.RULES.boosts - nt.boosts, coins: coins, used: nt.used, results: results, seenStage: nt.seenStage,
      table: LADDER.table(nt.players, nt.duels), rules: LADDER.RULES, result: nt.result };
  }

  function demoBet(method, body) {
    var d = demoHallStore(), nt = d.night, pays = [5, 4, 3, 2];
    if (!nt || nt.game !== "ladder" || !d.bettingOpen) return { on: false };
    var done = nt.status === "done", stage = done ? LADDER.stageCount(nt.players) + 1 : nt.stage;
    var row = LADDER.table(nt.players, nt.duels).filter(function (r) { return r.n === me.number; })[0];
    var left = nt.players.length - 1 - (row.w + row.l + row.t);
    if (method === "POST" && !nt.bet) { nt.bet = { score: body.score, stake: body.stake, stage: stage, mult: pays[stage - 1] }; d.extra -= body.stake; }
    var b = nt.bet;
    return { on: true, n: 1, you: me.number, playing: true, out: 0, done: done, stage: stage, stages: 5, pays: pays, mult: pays[stage - 1] || 0, taking: !done && stage <= 4 && !b, maxStake: 3,
      coins: me.coins + d.extra, pts: row.pts, left: left, low: row.pts - left, high: row.pts + left,
      bet: b ? { score: b.score, stake: b.stake, stage: b.stage, mult: b.mult, pays: b.stake * b.mult, won: done ? row.pts === b.score : null } : null };
  }

  function demoNight(method, path, body) {
    var d = demoHallStore();
    var nt = d.night;
    var coins = me.phase === "revealed" ? me.coins + d.extra : null;
    if (!nt) return { on: false, rules: DEMO_RULES, coins: coins, out: 0 };
    if (nt.game === "ladder") {
      if (path === "/api/night/seal") nt.sealed = body.plays.map(function (p) { return { opp: p.opp, card: p.card, boost: !!p.boost }; });
      if (path === "/api/night/stage-seen") nt.seenStage = nt.duels.length ? nt.duels[nt.duels.length - 1].stage : 0;
      if (path === "/api/night/seen") nt.seen = true;
      return demoLadderView(d, coins);
    }
    if (path === "/api/night/buy" && !nt.bought) { nt.bought = "Exactly two of Vaults 2, 3 and 6 are empty."; d.extra -= 1; coins -= 1; }
    if (path === "/api/night/open" && !nt.opened) { nt.opened = body.vaults.slice().sort(function (x, y) { return x - y; }); nt.throws = body.throws; }
    if (path === "/api/night/seen") nt.seen = true;
    var out = nt.result && nt.result.out === me.number ? 1 : 0;
    var view = {
      on: true, n: 1, game: "vaults", status: nt.status, endsAt: nt.endsAt, rules: DEMO_RULES, you: me.number, out: out, playing: true,
      clue: nt.clue, bought: nt.bought, opened: nt.opened, throws: nt.throws, coins: coins,
      canBuy: nt.status === "open" && !nt.bought && !nt.opened && coins >= 1,
    };
    if (nt.status === "done") { view.result = nt.result; view.seen = nt.seen; }
    return view;
  }

  function demoDoors() {
    var d = demoHallStore();
    var mine = spots[me.number] && spots[me.number][0] === "dungeon" ? cellHere(spots[me.number]) : 0;
    var now = { 1: [6, 12], 2: [], 3: [] };
    if (mine) now[mine] = now[mine].concat([me.number]).sort(function (a, b) { return a - b; });
    return { entries: d.doors, now: now, mine: mine };
  }

  function cellHere(at) {
    for (var i = 0; i < WORLD.CELLS.length; i++) {
      var c = WORLD.CELLS[i];
      if (at[1] >= c[0] && at[1] <= c[2] && at[2] >= c[1] && at[2] <= c[3]) return i + 1;
    }
    return 0;
  }

  function demoApi(method, path, body) {
    if (!me) me = demoMake(demo);
    var out = { ok: true };
    if (path === "/api/me") out = me;
    else if (path === "/api/respond") {
      me.state = body.accept ? "number" : "declined";
      me.number = me.number || parseInt(query.get("n") || "11", 10);
    } else if (path === "/api/enter") me.state = "choose";
    else if (path === "/api/seal") { me.bag = body.bag; me.state = "avatar"; }
    else if (path === "/api/avatar") { me.avatar = body.avatar; me.state = me.phase === "revealed" ? "reveal" : "hall"; }
    else if (path === "/api/seen") me.state = "hall";
    else if (path === "/api/hall") out = demoHall();
    else if (path === "/api/puzzle") out = demoPuzzle(method, body);
    else if (path === "/api/deals" || path === "/api/deal" || path === "/api/deal/answer") out = demoDeals(path, body);
    else if (path === "/api/doorlog") out = demoDoors();
    else if (path.indexOf("/api/night") === 0) out = demoNight(method, path, body);
    else if (path === "/api/bet") out = demoBet(method, body);
    else if (path === "/api/commit") { var dc = demoHallStore(); dc.committed = true; dc.resigned = !body.play; }
    else if (path === "/api/notices/seen") demoHallStore().noticeMark = body.upTo;
    else if (path.indexOf("/api/messages") === 0) out = demoMessages(method, path, body);
    return Promise.resolve(out);
  }

  function start() {
    if (switching && !demo) { me = { state: "none" }; return render(); }
    if (demo) {
      me = demo === "word" ? { state: "none" } : demoMake(demo); // ?demo=word starts the preview on the front page
      if (query.get("scene")) ui.scene = query.get("scene");
      // preview only: lets a review script jump to a screen or step into the next room
      // The GM's moves, for the preview only. Real players have no such controls: only the host console does.
      window.DP_PREVIEW = {
        go: go,
        enter: enterRoom,
        openBags: function () {
          if (!me || me.state !== "hall" || me.phase === "revealed") return false;
          var keep = me;
          me = demoMake("reveal", keep.bag, keep.number, keep.avatar);
          me.letter = keep.letter;
          ui.scene = "";
          hall = null;
          render();
          return true;
        },
        betting: function (open) { demoHallStore().bettingOpen = !!open; return loadHall().then(refreshStage); },
        // the GM posts a notice to every player
        notice: function (text) {
          var dn = demoHallStore();
          dn.msgs.push({ id: dn.next++, room: "board", from: 0, to: null, parent: null, body: text || "The bags open at 9 PM EST. Take your bag before then.", at: Date.now() });
          return loadHall().then(refreshStage);
        },
        // another player solves today's puzzle, as it would arrive from the server
        solve: function (n) {
          var ds = demoHallStore();
          ds.notices = ds.notices || [];
          var taken = ds.notices.map(function (x) { return x.n; });
          var solver = n || [2, 16, 12, 5, 6, 13, 3, 8, 9, 14].filter(function (k) { return k !== me.number && taken.indexOf(k) < 0; })[0];
          if (!solver) return false;
          ds.notices.push({ id: ds.notices.length + 1, kind: "solved", n: solver, at: Date.now(), today: true });
          return loadHall().then(function () { refreshStage(); if (!stage) showNotice(); });
        },
        startNight: function (game) { if (game === "vaults") demoNightStart(); else demoLadderStart(); ui.night = null; ui.ld = null; if (stage) setMenu(false); return loadHall().then(function () { if (stage) refreshStage(); else if (nightCall()) go("gamecall"); }); },
        // The Ladder: each press closes one stage. Six Vaults: the vaults close.
        endNight: function () { var dn = demoHallStore().night; if (!dn) return false; if (dn.game === "ladder") { demoLadderClose(); if (currentScene() === "arena") { ui.ld = null; return fetchNight().then(function (v) { if (v.status === "done") return loadHall().then(function () { go("vreveal"); }); drawLadder(); window.scrollTo(0, 0); }); } } else demoNightEnd(); if (stage) setMenu(false); return loadHall().then(function () { if (stage) refreshStage(); else go("hall"); }); },
      };
      if (query.get("with")) ui.withN = parseInt(query.get("with"), 10) || 0;
      if (query.get("tab")) ui.tab = query.get("tab");
      if (query.get("pick")) ui.pick = parseInt(query.get("pick"), 10) || 0;
      if (query.get("confirm")) ui.confirm = true;
      // In preview, borrow the host's real letter and dates when the host is signed in.
      return fetch("/api/host/state", { credentials: "same-origin" })
        .then(function (r) { return r.json(); })
        .then(function (h) {
          if (h && h.authed) {
            me.letter = h.letter;
            if (!query.get("past")) me.opensAt = h.opensAt || me.opensAt;
            me.replyBy = h.replyBy || (h.opensAt ? "" : me.replyBy);
          }
        })
        .catch(function () {})
        .then(render);
    }
    return load().catch(function (err) {
      me = { state: "none" };
      render();
      toast(err.message);
    });
  }

  // The rooms are drawings with lettering in them, so their typeface has to be ready before the first one is drawn.
  function fontsReady() {
    if (!document.fonts || !document.fonts.load) return Promise.resolve();
    var wanted = ['700 20px "Barlow Condensed"', '700 20px "Manrope"', '500 20px "Manrope"', '700 20px "Bodoni Moda"'].map(function (f) { return document.fonts.load(f); });
    var limit = new Promise(function (done) { setTimeout(done, 2500); });
    return Promise.race([Promise.all(wanted).then(function () { return document.fonts.ready; }), limit]);
  }

  fontsReady().then(start, start);
})();
