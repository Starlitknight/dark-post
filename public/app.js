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
  var HALL = ["tour", "hall", "table", "onair", "whispers", "whisper", "study", "board", "players", "standings", "arena", "puzzle", "deal", "sky", "shop", "doorlog", "cell", "tonight", "vbrief", "vreveal", "guide", "ledger", "face", "look"].concat(RULES);

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
    if (n === 0) return AV.gm();
    var seat = seatOf(n);
    if (!seat || !seat.avatar) return AV.silhouette();
    var key = n + JSON.stringify(seat.avatar);
    if (!faceMemo[key]) faceMemo[key] = AV.draw(seat.avatar, { label: "Player " + n });
    return faceMemo[key];
  }

  function who(n) {
    return n === 0 ? "GM" : n === me.number ? "You" : "Player " + n;
  }

  function loadHall() {
    return api("GET", "/api/hall").then(function (data) {
      hall = data;
      syncWallet();
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
          '<div class="hud-chips"><div class="hud-brand">' + ART.wordmark() + '</div><span class="chip gold">Player ' + esc(me.number) + '</span>' + walletMarkup("top-coins") + '<span class="chip here" id="top-room"></span><span class="chip clock" id="top-clock" title="Game time. Every time in the game is on this clock."></span></div>' +
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
          buildRoom(true);
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

    // Tonight's match, one picture at a time. Shown once before the Tonight page, and again on request.
    vbrief: {
      html: function () {
        return '<section class="screen vbrief" id="vbrief"><p class="vb-kicker" id="vb-kicker">Tonight</p>' +
          '<div class="vb-pic" id="vb-pic"></div><p class="vb-line" id="vb-line"></p><div class="vb-dots" id="vb-dots" aria-hidden="true"></div>' +
          '<div class="vb-foot"><button type="button" class="btn" id="vb-next" data-act="vbNext">Next</button>' +
          '<button type="button" class="link" data-act="vbSkip">Skip</button></div></section>';
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
        api("GET", "/api/puzzle").then(function (p) { ui.pz = p; drawPuzzle(); }).catch(function (err) { toast(err.message); });
        ticker = setInterval(function () {
          var el = $("pz-reset");
          if (el && ui.pz) el.textContent = span(Math.max(0, ui.pz.resetAt - Date.now()));
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
        ui.dealPick = null;
        ui.dealResult = null;
        function fetchDeals() {
          return (hall ? Promise.resolve() : loadHall()).then(function () { return api("GET", "/api/deals"); }).then(function (d) { ui.deals = d; drawDeal(); });
        }
        fetchDeals().catch(function (err) { toast(err.message); });
        poller = setInterval(function () {
          if (!quiet() && !ui.dealPick && !ui.dealTo) fetchDeals().catch(function () {});
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

  // Which rooms are doing business. The GM decides; players cannot open anything.
  function roomOpen(id) {
    var n = hall && hall.night;
    if (id === "arena") return !!n;
    if (id === "shop") return !!(n && n.status === "open");
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
      return roomOpen(id)
        ? { text: "The tables are open. Make a deal when you are ready.", go: ["deal", "Make a deal"] }
        : { text: "The betting room is closed for bets right now, but feel free to explore the space. To place bets, check again later, when the games start." };
    }
    if (id === "arena") {
      if (!n) return { text: "The GM is preparing the next game, so this area is closed right now, but feel free to explore." };
      return n.status === "open" ? { text: "Tonight’s match is on the stage.", go: ["arena", "Play tonight’s match"] } : { text: "Tonight’s match is over. The result is on the stage.", go: ["arena", "See the result"] };
    }
    if (id === "shop") {
      return roomOpen(id)
        ? { text: "The shop is open.", go: ["shop", "See what is for sale"] }
        : { text: "The shop is closed right now. It will open when the games start." };
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
        refreshStage();
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
      '<button type="button" class="btn ghost" data-act="talkClose">' + (line.later || "OK") + "</button></div></div>";
    box.hidden = false;
  }
  function openTalk(id) {
    if (!STAFF[id]) return;
    if (id !== "puzzle") return drawTalk(id);
    drawTalk(id, ui.pz && ui.pz.resetAt > Date.now() ? ui.pz : null);
    api("GET", "/api/puzzle").then(function (pz) { ui.pz = pz; if (stage && stage.room === id && !$("npc-talk").hidden) drawTalk(id, pz); }).catch(function () {});
  }
  function closeTalk() {
    var box = $("npc-talk");
    if (box) box.hidden = true;
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
        now: "Night " + night.n + ": Six Vaults",
        next: "The vaults close",
        at: ends,
        count: isNaN(ends) ? "When the GM says" : togo <= 0 ? "Any moment" : span(togo),
        todo: hall.out ? outLine(hall.out) : night.opened ? "Your two vaults are sealed. Wait for the night to end." : "Collect clues. Then open two vaults in the arena.",
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

  // ----- the bell: what this player should do now, and news about the others -----

  var BELL = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3.2a5.8 5.8 0 0 0-5.8 5.8v3.5l-1.9 3.4a1 1 0 0 0 .9 1.5h13.6a1 1 0 0 0 .9-1.5l-1.9-3.4V9A5.8 5.8 0 0 0 12 3.2Z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="M9.7 20.2a2.5 2.5 0 0 0 4.6 0" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>';

  // Can this player still solve today's puzzle?
  function puzzleOpen() {
    var pz = hall && hall.puzzle;
    return !!pz && !hall.out && !pz.solved && pz.left > 0;
  }

  function solvedToday() {
    return ((hall && hall.notices) || []).filter(function (x) { return x.kind === "solved" && x.today; });
  }

  // The things waiting for this player, most pressing first. Each one has a button that takes them there.
  function todoList() {
    var out = [], u = hall.unread, n = hall.night;
    if (n && n.status === "open" && !n.opened && !hall.out) {
      out.push({ title: "Play tonight’s match", sub: "Night " + n.n + ": Six Vaults. Open two vaults before it ends.", scene: "tonight", go: "Play" });
    }
    if (puzzleOpen()) {
      var done = solvedToday().length;
      out.push({ title: "Solve today’s puzzle", sub: "Worth " + plural(hall.puzzle.reward, "coin", "coins") + "." + (done ? " " + plural(done, "player has", "players have") + " solved it." : ""), scene: "puzzle", go: "Solve it" });
    }
    if (u.whispers) out.push({ title: plural(u.whispers, "new message", "new messages"), sub: "From " + hall.whispers.filter(function (t) { return t.unread; }).map(function (t) { return who(t.with); }).join(", ") + ".", scene: "whispers", go: "Read" });
    if (u.study) out.push({ title: "The GM wrote to you", sub: "Only you can read it.", scene: "study", go: "Read" });
    if (u.board) out.push({ title: plural(u.board, "new notice", "new notices") + " from the GM", sub: "For every player.", scene: "board", go: "Read" });
    if (u.table) out.push({ title: plural(u.table, "new broadcast", "new broadcasts"), sub: "Said to every player.", scene: "table", go: "Read" });
    if (hall.bettingOpen && u.deals && !hall.out) out.push({ title: plural(u.deals, "player offers", "players offer") + " you a deal", sub: "Answer in the betting room.", scene: "deal", go: "Answer" });
    return out;
  }

  function unseenNotices() {
    var mark = hall.noticeMark || 0;
    return (hall.notices || []).filter(function (x) { return x.id > mark; }).length;
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

  function noticeLine(x) {
    return "Player " + x.n + (x.today ? " solved today’s puzzle" : " solved the daily puzzle");
  }

  function bellHTML() {
    var todo = todoList(), fresh = stage.bellMark || 0;
    var rows = todo.map(function (t) {
      return '<button type="button" class="bell-row todo" data-act="go" data-scene="' + t.scene + '"><span class="bell-text"><b>' + esc(t.title) + "</b><small>" + esc(t.sub) + '</small></span><em>' + t.go + "</em></button>";
    });
    var news = (hall.notices || []).map(function (x) {
      return '<div class="bell-row news' + (x.id > fresh ? " fresh" : "") + '"><span class="bell-face">' + faceHTML(x.n) + '</span><span class="bell-text"><b>' + esc(noticeLine(x)) + "</b><small>" + esc(stamp(x.at, x.today)) + "</small></span>" + (x.id > fresh ? '<i class="bell-new">New</i>' : "") + "</div>";
    });
    return '<div class="menu-sheet bell-sheet" role="dialog" aria-modal="true" aria-labelledby="bell-heading">' +
      '<div class="menu-head"><h2 id="bell-heading">Notifications</h2>' +
      '<button type="button" class="menu-close" data-act="menuClose" aria-label="Close notifications">×</button></div>' +
      '<h3 class="bell-h">To do now' + (todo.length ? "<span>" + todo.length + "</span>" : "") + "</h3>" +
      (rows.length ? rows.join("") : '<p class="bell-none">' + (hall.out ? "Nothing to read right now." : "Nothing is waiting for you. Explore the estate, or talk to the other players.") + "</p>") +
      '<h3 class="bell-h">News</h3>' +
      (news.length ? news.join("") : '<p class="bell-none">No news yet. When a player solves the puzzle, it shows here.</p>') +
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

  function drawBell() {
    var btn = $("bell-btn");
    if (!btn || !hall) return;
    var n = todoList().length + unseenNotices();
    $("bell-n").innerHTML = n ? '<span class="badge" aria-label="' + plural(n, "thing", "things") + ' waiting">' + n + "</span>" : "";
    btn.disabled = false;
  }

  // News pops up once as it happens, and once for anyone who arrives after it happened.
  var noteSeen = null, noteTimer = null, noteRetry = null;
  function showNotice() {
    if (!hall || !hall.notices || !me || me.state !== "hall") return;
    var list = hall.notices, top = list.length ? list[0].id : 0;
    if (noteSeen == null) noteSeen = hall.noticeMark || 0;
    if (top <= noteSeen) return;
    // not while a question or a panel covers the screen: it would be missed
    var saying = $("say") && $("say").textContent.trim(); // the narrator's line sits where the pop-up goes
    if (stage && (hall.needsCommit || saying || ($("menu") && !$("menu").hidden))) {
      // try again shortly, so the pop-up follows as soon as the screen is clear
      clearTimeout(noteRetry);
      noteRetry = setTimeout(showNotice, 2000);
      return;
    }
    var fresh = list.filter(function (x) { return x.id > noteSeen && x.kind === "solved" && x.today; });
    noteSeen = top;
    if (!fresh.length) return;
    var names = fresh.length === 1 ? "Player " + fresh[0].n : fresh.length === 2 ? "Players " + fresh[1].n + " and " + fresh[0].n : "Player " + fresh[0].n + " and " + (fresh.length - 1) + " others";
    var line = names + " solved today’s puzzle.";
    var nudge = puzzleOpen() ? "You haven’t yet. Try it now." : hall.puzzle && hall.puzzle.solved ? "So have you." : "";
    var el = stage && $("note");
    if (!el) return toast(line + (nudge ? " " + nudge : ""));
    if ($("onair")) $("onair").hidden = true;
    el.innerHTML = '<span class="onair-face">' + faceHTML(fresh[0].n) + '</span><span class="onair-text"><i>Puzzle solved</i><b>' + esc(line) + "</b>" + (nudge ? "<small>" + esc(nudge) + "</small>" : "") + "</span>" + (puzzleOpen() ? '<em class="note-go">Solve it</em>' : "");
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
    var counts = { whispers: u.whispers, study: u.study, table: u.table + u.board };
    var items = PAGES.map(function (id) {
      return '<button type="button" class="menu-tile" data-act="go" data-scene="' + id + '">' +
        '<span class="menu-icon">' + ICON[id] + '</span><b>' + PLACES[id].title + '</b>' + badge(counts[id]) + '</button>';
    });
    return '<div class="menu-sheet" role="dialog" aria-modal="true" aria-labelledby="menu-heading">' +
      '<div class="menu-head"><h2 id="menu-heading">Menu</h2>' + walletMarkup() +
      '<button type="button" class="menu-close" data-act="menuClose" aria-label="Close menu">×</button></div>' +
      (hall.night ? '<button type="button" class="menu-night" data-act="go" data-scene="tonight"><span><i>' + (hall.night.status === "open" ? "Being played now" : "Finished") + "</i><b>Night " + hall.night.n + " · Six Vaults</b></span><small>" + (hall.night.status === "open" ? (hall.night.opened ? "Your vaults are sealed" : "Your clue and the rules") : "See the result") + "</small></button>" : "") +
      menuNowHTML() +
      '<div class="menu-grid">' + items.join("") + '</div>' +
      '</div>';
  }

  function setMenu(open, kind) {
    var el = $("menu");
    if (!el || (open && (!hall || !stage || !stage.room))) return;
    var wasOpen = !el.hidden;
    var opener = $(stage && stage.menuKind === "bell" ? "bell-btn" : "menu-btn");
    if (open) {
      stage.menuKind = kind === "bell" ? "bell" : "menu";
      opener = $(stage.menuKind === "bell" ? "bell-btn" : "menu-btn");
      if (stage.menuKind === "bell") { readNotices(true); if ($("note")) $("note").hidden = true; }
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
      el.renderedMenu = stage.menuKind === "bell" ? bellHTML() : menuHTML();
      el.innerHTML = el.renderedMenu;
    }
    el.hidden = !open;
    $("menu-btn").setAttribute("aria-expanded", String(open && stage.menuKind !== "bell"));
    $("bell-btn").setAttribute("aria-expanded", String(open && stage.menuKind === "bell"));
    Array.prototype.forEach.call(el.parentNode.children, function (child) {
      if (child !== el) child.inert = open;
    });
    if (open) (el.querySelector(".menu-tile, .bell-row.todo") || el.querySelector("button")).focus({ preventScroll: true });
    else if (wasOpen) { opener.focus({ preventScroll: true }); drawBell(); }
  }

  // Draw the room I am standing in: its art, its people, its light.
  // The arena's set and the shop's sign follow the night's match.
  function dressWorld() {
    var n = hall && hall.night;
    WORLD.setArena(n ? n.game : "");
    WORLD.setShop(!!(n && n.status === "open"));
    return (n ? n.game + ":" + n.status : "") + (hall && hall.bettingOpen ? "+b" : "");
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
    else if (talkedIn !== id) { talkedIn = id; openTalk(id); }
    offerSpot();
    var name = $("room-name");
    name.textContent = first ? "" : PLACES[id].title;
    camera(0);
    if (!first && !reduced && !instant && stage.world.animate)
      stage.world.animate([{opacity: 0.78}, {opacity: 1}], {duration: 160, easing: "ease-out"});
  }

  // The one big button offers whatever can be used from where the player stands.
  function offerSpot() {
    if (!stage || !stage.room) return;
    var a = actors[me.number];
    var at = a ? [a.x, a.y] : spotOf(me.number).slice(1);
    var spot = roomOpen(stage.room) ? WORLD.spotAt(stage.room, at[0], at[1]) : null;
    if (spot === stage.spot) return;
    stage.spot = spot;
    var btn = $("hud-action");
    btn.hidden = !spot;
    if (spot) {
      btn.textContent = spot.scene === "arena" && hall && hall.night && hall.night.status === "open" ? "Play tonight's match" : spot.label;
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
    var menu = $("menu");
    if (!menu.hidden) {
      if (stage.menuKind === "bell") readNotices(false); // news that arrives while the bell is open is read too
      var nextMenu = stage.menuKind === "bell" ? bellHTML() : menuHTML();
      if (menu.renderedMenu !== nextMenu) {
        menu.renderedMenu = nextMenu;
        var focused = document.activeElement;
        var index = Array.prototype.indexOf.call(menu.querySelectorAll("button"), focused);
        menu.innerHTML = nextMenu;
        var sameButton = menu.querySelectorAll("button")[index];
        if (sameButton) sameButton.focus({ preventScroll: true });
      }
    }
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
  function news() {
    clearTimeout(newsTimer);
    newsTimer = setTimeout(function () {
      pollMe();
      if (!me || me.state !== "hall") return;
      if (room) pull(false).catch(function () {});
      loadHall().then(function () { refreshStage(); if (!stage) showNotice(); drawThreads(); drawPlayers(); drawStandings(); }).catch(function () {});
    }, 500);
  }

  function onLive(m) {
    var a;
    if (m.t === "hi") {
      online = {};
      (m.online || []).forEach(function (n) { online[n] = true; });
      for (var k in m.pos) if (Number(k) !== me.number || !spots[k]) spots[k] = m.pos[k];
      if (stage && hall && stage.room) buildActors();
    } else if (m.t === "on") { online[m.n] = true; dressActors(); }
    else if (m.t === "off") { delete online[m.n]; dressActors(); }
    else if (m.t === "m" || m.t === "p" || m.t === "r") {
      if (m.n === me.number) return;
      spots[m.n] = [m.r, m.x, m.y];
      if (!stage || !hall || !stage.room) return;
      a = actors[m.n];
      if (m.r === stage.room && a && !a.empty && m.t !== "r") a.path = m.t === "m" ? WORLD.findPath(stage.room, [a.x, a.y], [m.x, m.y]) : [[m.x, m.y]];
      else if ((m.r === stage.room) !== !!a) buildActors(); // they came into my room, or left it
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
    $("players-note").textContent = here + " of " + rows.length + " players are here. Select a portrait to open their player card.";
    box.innerHTML = rows.map(function (s) {
      var mine = s.number === hall.you;
      return (
        '<button type="button" class="face-tile' + (mine ? " me" : "") + (s.avatar ? "" : " empty") + (s.out ? " gone" : "") + '" data-act="card" data-n="' + s.number + '">' +
        '<span class="face-pic">' + faceHTML(s.number) + "</span><b>" + (mine ? "You" : "Player " + s.number) + "</b>" +
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
      : row("Status", s.out < 0 ? "Resigned. Watching." : s.out ? "Out on Night " + s.out : "In the game") +
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
      '<div class="s-card now"><i>Worth ' + plural(p.reward, "coin", "coins") + " · three tries</i><h2>" + esc(p.title) + '</h2><div class="pz-body">' + body + "</div><p>" + esc(p.ask) + "</p>" + end + "</div>" +
      '<div class="s-card"><i>Next puzzle in</i><b class="s-count small" id="pz-reset">' + span(Math.max(0, p.resetAt - Date.now())) + "</b><p>Every player gets the same puzzle.</p>" +
"</div>";
    var form = $("pz-form");
    if (form) {
      var tryNow = function () {
        var value = $("pz-answer").value.trim();
        if (!value || ui.busy) return;
        ui.busy = true;
        api("POST", "/api/puzzle", { answer: value })
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
          .catch(function (err) { toast(err.message); })
          .then(function () { ui.busy = false; });
      };
      $("pz-send").addEventListener("click", tryNow);
      $("pz-answer").addEventListener("keydown", function (event) {
        if (event.key === "Enter" && !event.isComposing) { event.preventDefault(); tryNow(); }
      });
    }
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
        "<h2>Puzzle failed</h2><p class=\"pz-plus\">The answer was " + esc(p.answer) + '</p><p class="pz-note">No coin today. A new puzzle arrives at midnight EST.</p>' +
        '<button type="button" class="btn narrow" data-act="pzDone">Continue</button>';
    (root.firstElementChild || root).appendChild(el);
  }

  // ----- the night's match: Six Vaults -----

  var THROW = { r: "Rock", p: "Paper", s: "Scissors" };
  var THROW_ICON = {
    r: ic("M7 11.5c0-2.5 2-4.5 5-4.5s5 2 5 4.5v2c0 2.8-2.2 4.5-5 4.5s-5-1.7-5-4.5z"),
    p: ic("M7 4h7l3 3v13H7zM14 4v3h3M10 11h4M10 14.5h4"),
    s: ic("M8.6 15.4 19 5M8.6 8.6 19 19", '<circle cx="6.5" cy="6.5" r="2.5" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="6.5" cy="17.5" r="2.5" fill="none" stroke="currentColor" stroke-width="2"/>'),
  };
  var ORDINAL = ["", "1st", "2nd", "3rd"];

  function fetchNight() {
    return api("GET", "/api/night").then(function (n) {
      ui.night = n;
      return n;
    });
  }

  function mountMatch(canAct) {
    ui.matchAct = canAct;
    ui.v = null;
    $("sched").removeAttribute("data-sig");
    loadHall()
      .then(function () {
        if (!hall.night) return drawSched();
        return fetchNight().then(function (n) {
          // the first look at a night is the picture briefing
          if (!canAct && ui.scene === "tonight" && n && n.on && n.status === "open" && n.playing && !heard("vb" + n.n)) return go("vbrief");
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
      var before = hall && hall.night ? hall.night.status : "";
      loadHall()
        .then(function () {
          var now = hall.night ? hall.night.status : "";
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
      var inner = "<i>Vault</i><b>" + v + "</b>" + (gold != null ? "<em>" + (gold ? gold + " gold" : "Empty") + "</em>" : picked ? "<em>Chosen</em>" : "<em>&nbsp;</em>");
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
    return [
      { line: "Six vaults.", pic: vbSvg(six) },
      { line: "Three are empty. Three hold " + gold + " gold.",
        pic: vbSvg(empties + vbText(88, 150, "3 EMPTY", 16, "#aab4b8") + vbCoin(212, 96, 26, r.amounts[0]) + vbCoin(270, 100, 21, r.amounts[1]) + vbCoin(318, 104, 17, r.amounts[2]) + vbText(264, 150, "3 WITH GOLD", 16) + '<path d="M180 56v100" stroke="#3d4b52" stroke-width="2"/>' + vbText(180, 34, "Which is which? Nobody knows.", 15, "#aab4b8")) },
      { line: "Open any two. The gold inside is your score tonight.",
        pic: vbSvg(vbVault(96, 56, "?", true) + vbVault(218, 56, "?", true) + vbText(180, 104, "+", 34) + vbText(180, 176, "2 OF 6", 18, "#aab4b8")) },
      { line: "You hold one true clue. Nobody else has it.",
        pic: vbSvg(vbCard(110, 44, 140, 96, "#d4b471") + '<circle cx="250" cy="44" r="20" fill="#2f7d4f" stroke="#efe8d6" stroke-width="2"/><path d="m240 44 7 8 13-15" fill="none" stroke="#fff" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>' + vbText(180, 176, "TRUE", 18)) },
      { line: "The shop sells one more true clue for " + plural(r.cluePrice, "coin", "coins") + ".",
        pic: vbSvg(vbCoin(92, 96, 26, r.cluePrice) + '<path d="M136 96h44m-14-12 14 12-14 12" fill="none" stroke="#ecd9a4" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>' + vbCard(200, 48, 120, 96, "#35c2b0") + vbText(180, 180, "THE SHOP · BOTTOM DOOR OF THE HALL", 14, "#aab4b8")) },
      { line: "Other players hold other clues. They may lie.",
        pic: vbSvg(vbHead(70, 96, "#56666d") + vbHead(180, 96, "#56666d") + vbHead(290, 96, "#56666d") +
          '<rect x="84" y="34" width="54" height="34" rx="8" fill="#efe8d6"/><path d="m100 50 8 8 14-16" fill="none" stroke="#2f7d4f" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>' +
          '<rect x="194" y="34" width="54" height="34" rx="8" fill="#efe8d6"/>' + vbText(221, 60, "?", 26, "#56666d") +
          '<rect x="304" y="34" width="50" height="34" rx="8" fill="#efe8d6"/><path d="m320 42 18 18m0-18-18 18" stroke="#b3372b" stroke-width="4" stroke-linecap="round"/>') },
      { line: "The least gold is out. A tie is settled by Rock Paper Scissors.", pic: vbSvg(bars) },
      { line: "The three highest amounts win " + prizes + " coins.", pic: vbSvg(podium) },
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
    $("vb-kicker").textContent = "Night " + n.n + " · Six Vaults";
    $("vb-pic").innerHTML = tiles[i].pic;
    $("vb-line").textContent = tiles[i].line;
    $("vb-dots").innerHTML = tiles.map(function (t, k) { return '<i class="' + (k === i ? "on" : k < i ? "done" : "") + '"></i>'; }).join("");
    $("vb-next").textContent = i === tiles.length - 1 ? "Got it" : "Next";
  }

  function drawMatch() {
    var box = $("sched");
    var n = ui.night;
    if (!box || !n) return;
    if (!n.on) return drawSched();
    var out = "";
    if (n.status === "done") {
      out = resultHTML(n);
    } else {
      var count = n.endsAt ? '<i>The vaults close in</i><b class="s-count small" id="v-count">' + span(Math.max(0, new Date(n.endsAt).getTime() - Date.now())) + "</b>" : "<p>The GM closes the vaults.</p>";
      var acting = ui.matchAct && n.playing && !n.out && !n.opened;
      var rules = '<div class="s-card"><i>The rules</i>' + rulesHTML(n) + '<button type="button" class="link" data-act="vbAgain">Play the briefing</button></div>';
      if (acting) out += '<div class="s-card now"><i>Night ' + n.n + " · Six Vaults</i>" + count + "</div>";
      else out += '<div class="s-card now"><i>Night ' + n.n + " · tonight's match</i><h2>Six Vaults</h2>" + count + "</div>";
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
    var out = '<div class="s-card now"><i>Night ' + n.n + " · Six Vaults · result</i>" + vaultsHTML({ layout: res.layout, picks: res.plays[n.you] || [] });
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
    var why = !tied ? "The least gold: " + res.gold[res.last[0]] + "."
      : list + " tied for last on " + res.gold[res.last[0]] + " gold. " +
        (res.duel && res.duel.forfeit ? (res.out != null ? "A player who opened nothing has no throws, and loses the tie." : "None of them opened a vault, so there are no throws to play.")
          : res.out != null && res.duel && res.duel.out === res.out ? "Rock Paper Scissors settled it."
          : res.out != null ? "Rock Paper Scissors could not separate them, so the player with fewer coins goes." : "Rock Paper Scissors and coins could not separate them.");
    return '<div class="s-card next"><i>Out</i><h2>' + head + "</h2><p>" + why + "</p>" + (tied ? roundsHTML(res) : "") + "</div>";
  }

  // the reveal, one step at a time, shown once
  function drawVReveal() {
    var box = $("vr");
    var n = ui.night;
    if (!box) return;
    if (!n || !n.on || n.status !== "done") return go("hall");
    var res = n.result;
    var step = ui.vstep;
    var mine = res.gold[n.you];
    var next = '<button type="button" class="btn" data-act="vNext">Next</button>';
    var out = "";
    if (step === 0) {
      out = '<div class="v-gate"><p class="say big">Night ' + n.n + ' is over.<br>The vaults are open.</p><button type="button" class="btn narrow" data-act="vNext">Show me</button></div>';
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
            '<button type="button" class="thread" data-act="seat" data-n="' + s.number + '"><span class="thread-face">' + faceHTML(s.number) + "</span>" +
            '<span class="thread-main"><b>Player ' + s.number + "</b><span>" + (t && t.last ? esc(t.last) : "No messages yet") + "</span></span>" +
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
    else if (name === "go") go(el.getAttribute("data-scene"));
    else if (name === "seat") { ui.withN = Number(el.getAttribute("data-n")); ui.card = 0; go("whisper"); }
    else if (name === "pzDone") { var done = $("pz-result"); if (done) done.remove(); }
    else if (name === "commitYes") sendCommit(true);
    else if (name === "commitAsk" || name === "commitBack") { ui.resignAsk = name === "commitAsk"; drawCommit(); }
    else if (name === "commitResign") sendCommit(false);
    else if (name === "npc") { if (stage && STAFF[stage.room]) openTalk(stage.room); }
    else if (name === "talkClose") closeTalk();
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
      else { if (ui.night) markHeard("vb" + ui.night.n); go("tonight"); }
    }
    else if (name === "vbAgain") go("vbrief");
    else if (name === "vNext") { ui.vstep += 1; drawVReveal(); }
    else if (name === "vDone") {
      api("POST", "/api/night/seen", {}).catch(function () {}).then(function () { hall = null; go("hall"); });
    }
    else if (name === "cardClose") { ui.card = 0; $("card").hidden = true; }
    else if (name === "dealTo") { ui.dealTo = Number(el.getAttribute("data-n")); drawDeal(); }
    else if (name === "dealPick") { ui.dealPick = { id: Number(el.getAttribute("data-id")) || 0, n: Number(el.getAttribute("data-n")), choice: el.getAttribute("data-c") }; drawDeal(); }
    else if (name === "dealBack") { ui.dealPick = null; ui.dealTo = 0; drawDeal(); }
    else if (name === "dealSeal") { var dp = ui.dealPick; if (dp) dealSend(dp.id ? "/api/deal/answer" : "/api/deal", dp.id ? { id: dp.id, choice: dp.choice } : { to: dp.n, choice: dp.choice }); }
    else if (name === "dealDecline") dealSend("/api/deal/answer", { id: Number(el.getAttribute("data-id")), decline: true });
    else if (name === "dealCancel") dealSend("/api/deal/answer", { id: Number(el.getAttribute("data-id")), cancel: true });
    else if (name === "menu") setMenu($("menu").hidden);
    else if (name === "bell") setMenu(true, "bell");
    else if (name === "noteGo") { if (puzzleOpen()) go("puzzle"); else { el.hidden = true; setMenu(true, "bell"); } }
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
      pz: { tries: 0, solved: false, kind: Math.max(0, ["code", "sums", "cipher", "sequence"].indexOf(query.get("pz"))) },
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
      notices: (d.notices || []).slice().reverse(),
      noticeMark: d.noticeMark || 0,
      puzzle: { solved: !!d.pz.solved, left: 3 - d.pz.tries, reward: 1 },
      needsCommit: !d.committed && !query.get("committed"),
      out: d.resigned ? -1 : d.night && d.night.result && d.night.result.out === me.number ? 1 : 0,
      night: d.night ? { n: 1, game: "vaults", status: d.night.status, endsAt: d.night.endsAt, opened: !!d.night.opened, unseen: d.night.status === "done" && !d.night.seen } : null,
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
    { type: "sums", title: "Weigh the shapes", ask: "Each shape is a whole number. Multiply the three together. What do you get?", data: { rows: [{ shapes: ["a", "a", "b"], sum: 13 }, { shapes: ["b", "b", "c"], sum: 14 }, { shapes: ["c", "c", "a"], sum: 21 }] }, answer: "120" },
    { type: "cipher", title: "Break the cipher", ask: "Every letter was moved the same number of places along the alphabet. What is the word?", data: { text: "THYISL" }, answer: "MARBLE" },
    { type: "sequence", title: "What comes next", ask: "One rule makes this row. What is the next number?", data: { terms: [9, 12, 17, 24, 33, 44] }, answer: "57" },
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

  function demoNight(method, path, body) {
    var d = demoHallStore();
    var nt = d.night;
    var coins = me.phase === "revealed" ? me.coins + d.extra : null;
    if (!nt) return { on: false, rules: DEMO_RULES, coins: coins, out: 0 };
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
        startNight: function () { demoNightStart(); setMenu(false); return loadHall().then(function () { refreshStage(); go("tonight"); }); },
        endNight: function () { demoNightEnd(); setMenu(false); return loadHall().then(refreshStage); },
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
