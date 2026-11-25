// Dark Post: host console.
(function () {
  "use strict";

  var DP = window.DP;
  var esc = DP.esc;
  var $ = function (id) { return document.getElementById(id); };
  var state = null;
  var formsFilled = false;
  var showBags = false;
  var confirmOpen = false;
  var confirmUndo = false;
  var refresher = null;

  function api(method, path, body) {
    return fetch(path, {
      method: method,
      credentials: "same-origin",
      cache: "no-store",
      headers: { "Content-Type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
    }).then(
      function (res) {
        return res.json().catch(function () { return {}; }).then(function (data) {
          if (!res.ok) throw new Error(data.error || "Something went wrong. Try again.");
          return data;
        });
      },
      function () { throw new Error("Could not reach the server. Check your connection and try again."); }
    );
  }

  function toast(message) {
    var old = document.querySelector(".toast");
    if (old) old.remove();
    var el = document.createElement("div");
    el.className = "toast";
    el.setAttribute("role", "status");
    el.textContent = message;
    document.body.appendChild(el);
    setTimeout(function () { el.remove(); }, 3500);
  }

  function copy(text, done) {
    function ok() { toast(done); }
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(text).then(ok, fallback);
    } else fallback();
    function fallback() {
      var ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand("copy"); ok(); } catch (e) { window.prompt("Copy this:", text); }
      ta.remove();
    }
  }

  function toLocalInput(iso) {
    if (!iso) return "";
    var d = new Date(iso);
    if (isNaN(d.getTime())) return "";
    function p(n) { return String(n).padStart(2, "0"); }
    return d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate()) + "T" + p(d.getHours()) + ":" + p(d.getMinutes());
  }

  function fromLocalInput(value) {
    if (!value) return "";
    var d = new Date(value);
    return isNaN(d.getTime()) ? "" : d.toISOString();
  }

  // ---------- loading ----------

  function refresh() {
    return api("GET", "/api/host/state").then(function (data) {
      state = data;
      if (!data.authed) {
        $("console").hidden = true;
        $("gate").hidden = false;
        $("gate-title").textContent = data.hasHost ? "Host console" : "Set your host passphrase";
        $("gate-help").textContent = data.hasHost
          ? "Enter your passphrase."
          : "Nobody has claimed this console yet. Choose a passphrase of at least 8 characters. You will need it every time, and it cannot be recovered.";
        $("gate-go").textContent = data.hasHost ? "Sign in" : "Set passphrase and enter";
        $("pass").setAttribute("autocomplete", data.hasHost ? "current-password" : "new-password");
        return;
      }
      $("gate").hidden = true;
      $("console").hidden = false;
      if (!formsFilled) fillForms();
      draw();
      loadView(false);
      loadActivity();
      if (!refresher) {
        refresher = setInterval(function () { if (!document.hidden) refresh().catch(function () {}); }, 15000);
        setInterval(function () { if (!document.hidden && $("board")) api("GET", "/api/host/activity").then(function (a) { drawBoard(a.board); }).catch(function () {}); }, 4000);
      }
    });
  }

  function fillForms() {
    formsFilled = true;
    $("opens").value = toLocalInput(state.opensAt);
    $("reply").value = toLocalInput(state.replyBy);
    $("next-name").value = state.nextName || "";
    $("next-at").value = toLocalInput(state.nextAt);
    $("auto").checked = !!state.autoOpen;
    $("show-choices").checked = !!state.showChoices;
    $("betting-open").checked = !!state.bettingOpen;
    $("door-address").textContent = location.origin;
    var wrong = $("wrong-words");
    wrong.hidden = !state.wrongWords;
    wrong.textContent = state.wrongWords ? state.wrongWords + (state.wrongWords === 1 ? " wrong word has" : " wrong words have") + " been typed at the door in the last hour. A few are typos. Dozens mean someone is guessing; the door shuts itself for the hour at 40." : "";
    fillLetter(state.letter);
  }

  function fillLetter(L) {
    L = DP.displayLetter(L);
    $("l-kicker").value = L.kicker || "";
    $("l-headline").value = L.headline || "";
    $("l-body").value = L.body || "";
    $("l-closing").value = L.closing || "";
    $("l-signature").value = L.signature || "";
    drawPreview();
  }

  function readLetter() {
    return {
      kicker: $("l-kicker").value,
      headline: $("l-headline").value,
      body: $("l-body").value,
      closing: $("l-closing").value,
      signature: $("l-signature").value,
    };
  }

  function drawPreview() {
    $("preview").innerHTML = DP.letterHTML({
      letter: readLetter(),
      name: "Maya",
      opensAt: fromLocalInput($("opens").value),
      replyBy: fromLocalInput($("reply").value),
    });
  }

  // ---------- drawing ----------

  function statusChip(inv) {
    if (inv.status === "declined") return '<span class="chip red">Declined</span>';
    if (inv.status === "accepted") {
      if (inv.sealed) return '<span class="chip solid">Sealed</span>';
      if (inv.entered) return '<span class="chip gold">Choosing</span>';
      return '<span class="chip gold">Accepted</span>';
    }
    return inv.opened ? '<span class="chip">Read, no answer</span>' : '<span class="chip">Not opened</span>';
  }

  function draw() {
    var list = state.invites;
    var accepted = list.filter(function (i) { return i.status === "accepted"; });
    var sealed = accepted.filter(function (i) { return i.sealed; });
    var declined = list.filter(function (i) { return i.status === "declined"; });
    var pending = list.filter(function (i) { return i.status === "invited"; });

    $("summary").innerHTML =
      "<div><b>" + list.length + "</b><span>Invited</span></div>" +
      "<div><b>" + accepted.length + "/" + state.seats + "</b><span>Seats taken</span></div>" +
      "<div><b>" + sealed.length + "</b><span>Choices sealed</span></div>" +
      "<div><b>" + pending.length + "</b><span>No answer yet</span></div>" +
      "<div><b>" + declined.length + "</b><span>Declined</span></div>";

    if (!list.length) {
      $("invites").innerHTML = '<p class="table-empty">No invitations yet. Add names above. Each one gets a word.</p>';
    } else {
      var rows = list.map(function (inv) {
        var bag = "";
        if (inv.status === "accepted") {
          bag = !inv.sealed ? "Not sealed" : showBags ? "Bag " + inv.bag : "Hidden";
          if (state.phase === "revealed") {
            var extra = inv.extra || 0;
            bag = (inv.bag ? "Bag " + inv.bag : "None") + " · " + ((inv.coins || 0) + extra) + " coins" + (extra ? " (" + (inv.coins || 0) + " from the bag, " + (extra > 0 ? "+" : "−") + Math.abs(extra) + " since)" : "");
          }
        }
        return (
          '<tr data-token="' + esc(inv.token) + '">' +
          '<td class="name">' + (inv.avatar ? '<span class="name-face">' + window.DP_AVATAR.draw(inv.avatar) + "</span>" : "") + esc(inv.name) + "</td>" +
          "<td>" + statusChip(inv) + (inv.out < 0 ? ' <span class="chip red">Resigned</span>' : inv.out ? ' <span class="chip red">Out</span>' : inv.committed ? ' <span class="chip gold">Confirmed</span>' : inv.avatar ? ' <span class="chip">Not confirmed yet</span>' : "") + "</td>" +
          '<td class="num">' + (inv.number != null ? inv.number : "") + "</td>" +
          "<td>" + esc(bag) + "</td>" +
          '<td class="word">' + esc(inv.word || "") + "</td>" +
          '<td class="actions">' +
          '<button type="button" class="link" data-do="copy">Copy invitation</button>' +
          '<button type="button" class="link quiet" data-do="reword">New word</button>' +
          '<button type="button" class="link quiet" data-do="rename">Rename</button>' +
          (inv.status !== "invited" && state.phase !== "revealed" ? '<button type="button" class="link quiet" data-do="reset">Reset</button>' : "") +
          '<button type="button" class="link quiet" data-do="remove">Remove</button>' +
          "</td></tr>"
        );
      });
      $("invites").innerHTML =
        '<table class="table"><thead><tr><th>Name</th><th>Status</th><th>Player</th><th>Bag</th><th>Word</th><th></th></tr></thead><tbody>' +
        rows.join("") + "</tbody></table>";
    }

    drawNight(accepted, sealed);
  }

  function drawNight(accepted, sealed) {
    var out = '<div class="night-box">';
    if (state.phase === "revealed" && state.reveal) {
      var r = state.reveal;
      out +=
        '<p class="sum">The bags are open.</p>' +
        "<p>" + r.bag2Count + " took Bag 2 and received " + r.bag2Share + " each" +
        (r.bag2Count ? " (" + r.pot + " ÷ " + r.bag2Count + ", rounded down; " + r.leftover + " left in the bag)" : "") + ". " +
        r.bag1Count + " took Bag 1 and received " + r.bag1Coins + " each. " +
        r.unsealed.length + " sealed nothing." + "</p>" +
        "<p>Every player now sees the result the next time they open their link.</p>";
      out += confirmUndo
        ? '<p><b>Undo the reveal?</b> Players go back to the waiting screen and all coins are cleared. Only do this while testing.</p>' +
          '<div class="row"><button type="button" class="btn" id="undo-yes">Yes, undo it</button><button type="button" class="btn ghost" id="undo-no">Keep it</button></div>'
        : '<button type="button" class="link quiet" id="undo-ask">Undo the reveal (testing only)</button>';
    } else {
      var missing = accepted.length - sealed.length;
      out +=
        "<p>" + accepted.length + " of " + state.seats + " seats are taken, and " + sealed.length + " of those players have sealed a choice." +
        (missing > 0 ? " <b>" + missing + " have not sealed. If you open the bags now, they receive nothing.</b>" : "") +
        (accepted.length < state.seats ? " The rules on screen tell players there are " + state.seats + " of them." : "") + "</p>";
      if (state.autoOpen && state.opensAt) {
        out += "<p>The bags will open by themselves on " + esc(DP.when(state.opensAt, true)) + ", your time.</p>";
      }
      out += confirmOpen
        ? "<p><b>Open the bags now?</b> Choices lock for good and every player sees the result.</p>" +
          '<div class="row"><button type="button" class="btn" id="open-yes">Yes, open the bags</button><button type="button" class="btn ghost" id="open-no">Not yet</button></div>'
        : '<button type="button" class="btn" id="open-ask"' + (accepted.length ? "" : " disabled") + ">Open the bags now</button>";
    }
    out += "</div>";
    $("night").innerHTML = out;
  }

  // ---------- actions ----------

  function run(promise, done) {
    return promise
      .then(function () { if (done) toast(done); return refresh(); })
      .catch(function (err) { toast(err.message); });
  }

  $("gate-form").addEventListener("submit", function (e) {
    e.preventDefault();
    $("gate-error").textContent = "";
    api("POST", "/api/host/login", { passphrase: $("pass").value })
      .then(function () { $("pass").value = ""; return refresh(); })
      .catch(function (err) { $("gate-error").textContent = err.message; });
  });

  $("signout").addEventListener("click", function () {
    api("POST", "/api/host/logout", {}).then(function () { location.reload(); });
  });

  $("add-form").addEventListener("submit", function (e) {
    e.preventDefault();
    var names = $("names").value.split("\n").map(function (s) { return s.trim(); }).filter(Boolean);
    if (!names.length) { toast("Enter at least one name."); return; }
    run(api("POST", "/api/host/invites", { names: names }), names.length === 1 ? "Invitation created." : names.length + " invitations created.")
      .then(function () { $("names").value = ""; });
  });

  $("show-bags").addEventListener("change", function () { showBags = this.checked; draw(); });

  // What to send a player: the one address, and their word.
  function inviteText(inv) {
    return "Dark Post is a game. Go to " + location.origin + " and enter your word: " + inv.word;
  }
  $("copy-address").addEventListener("click", function () { copy(location.origin, "Address copied."); });

  $("copy-all").addEventListener("click", function () {
    var lines = state.invites
      .filter(function (i) { return i.status === "invited"; })
      .map(function (i) { return i.name + ": " + inviteText(i); });
    if (!lines.length) { toast("There are no unanswered invitations."); return; }
    copy(lines.join("\n"), lines.length + " invitations copied.");
  });

  $("invites").addEventListener("click", function (e) {
    var btn = e.target.closest("[data-do]");
    if (!btn) return;
    var token = btn.closest("tr").getAttribute("data-token");
    var inv = state.invites.filter(function (i) { return i.token === token; })[0];
    if (!inv) return;
    var what = btn.getAttribute("data-do");
    if (what === "copy") copy(inviteText(inv), "Invitation for " + inv.name + " copied.");
    else if (what === "reword") {
      if (window.confirm("Give " + inv.name + " a new word? The old word stops working and they are signed out everywhere until they type the new one."))
        run(api("POST", "/api/host/invite/reword", { token: token }), "New word made.");
    }
    else if (what === "rename") {
      var name = window.prompt("Name printed on the letter:", inv.name);
      if (name && name.trim()) run(api("POST", "/api/host/invite/update", { token: token, name: name.trim() }), "Renamed.");
    } else if (what === "reset") {
      if (window.confirm("Reset " + inv.name + "? Their answer, number and sealed choice are erased and they see the letter again."))
        run(api("POST", "/api/host/invite/reset", { token: token }), "Reset.");
    } else if (what === "remove") {
      if (window.confirm("Remove " + inv.name + "? Their word stops working."))
        run(api("POST", "/api/host/invite/delete", { token: token }), "Removed.");
    }
  });

  $("dates-form").addEventListener("submit", function (e) {
    e.preventDefault();
    run(
      api("POST", "/api/host/settings", {
        opensAt: fromLocalInput($("opens").value),
        replyBy: fromLocalInput($("reply").value),
        nextName: $("next-name").value,
        nextAt: fromLocalInput($("next-at").value),
        autoOpen: $("auto").checked,
      }),
      "Dates saved."
    );
  });

  ["opens", "reply", "l-kicker", "l-headline", "l-body", "l-closing", "l-signature"].forEach(function (id) {
    $(id).addEventListener("input", drawPreview);
  });

  $("letter-form").addEventListener("submit", function (e) {
    e.preventDefault();
    run(api("POST", "/api/host/settings", { letter: readLetter() }), "Letter saved.");
  });

  $("letter-reset").addEventListener("click", function () {
    fillLetter(state.defaultLetter);
    toast("Original text restored. Save the letter to keep it.");
  });

  $("show-choices").addEventListener("change", function () {
    run(api("POST", "/api/host/settings", { showChoices: this.checked }), "Saved.");
  });

  // The daily puzzle: hold it in play, release it to the daily change, or move on now.
  $("puzzle-hold").addEventListener("change", function () {
    run(api("POST", "/api/host/puzzle", { hold: this.checked }), this.checked ? "The puzzle is held. It will not change until you release it." : "Released. This puzzle stays until midnight EST, then changes every day.");
  });
  $("puzzle-next").addEventListener("click", function () {
    if (!window.confirm("Start the next puzzle now? The puzzle in play ends for everyone, and players who have not solved it lose the chance.")) return;
    run(api("POST", "/api/host/puzzle", { next: true }), "The next puzzle has started.");
  });
  $("betting-open").addEventListener("change", function () {
    run(api("POST", "/api/host/settings", { bettingOpen: this.checked }), this.checked ? "The betting room is open." : "The betting room is closed.");
  });

  $("night").addEventListener("click", function (e) {
    var id = e.target.id;
    if (id === "open-ask") { confirmOpen = true; draw(); }
    else if (id === "open-no") { confirmOpen = false; draw(); }
    else if (id === "open-yes") { confirmOpen = false; run(api("POST", "/api/host/reveal", {}), "The bags are open."); }
    else if (id === "undo-ask") { confirmUndo = true; draw(); }
    else if (id === "undo-no") { confirmUndo = false; draw(); }
    else if (id === "undo-yes") {
      confirmUndo = false;
      run(api("POST", "/api/host/unreveal", {}), "Reveal undone.").then(function () { $("auto").checked = false; });
    }
  });


  // ---------- messages ----------

  var AV = window.DP_AVATAR;
  var mtab = "study";
  var studyWith = 0;

  function byNumber(n) {
    var list = (state && state.invites) || [];
    for (var i = 0; i < list.length; i++) if (list[i].number === n) return list[i];
    return null;
  }

  function hface(n) {
    if (n === 0) return AV.gm();
    var p = byNumber(n);
    return p && p.avatar ? AV.draw(p.avatar) : AV.silhouette();
  }

  function hwho(n) {
    if (n === 0) return "GM (you)";
    var p = byNumber(n);
    return "Player " + n + (p ? " · " + p.name : "");
  }

  function htime(at) {
    return new Date(at).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
  }

  function hmsg(m) {
    return (
      '<div class="hmsg' + (m.from === 0 ? " from-gm" : "") + '"><span class="hface">' + hface(m.from) + "</span>" +
      '<div class="hmsg-main"><div class="hwho"><b>' + esc(hwho(m.from)) + "</b><time>" + esc(htime(m.at)) + "</time>" +
      (m.removed ? "" : '<button type="button" class="link quiet" data-remove="' + m.id + '">Remove</button>') + "</div>" +
      '<div class="hbody">' + (m.removed ? "<i>Removed.</i>" : esc(m.body)) + "</div></div></div>"
    );
  }

  function mform(kind, placeholder, extra) {
    return (
      '<form class="mform" data-kind="' + kind + '"' + (extra || "") + '><input type="text" maxlength="1800" autocomplete="off" placeholder="' + esc(placeholder) + '" aria-label="' + esc(placeholder) + '">' +
      '<button type="submit" class="btn">Send</button></form>'
    );
  }

  function drawTabs() {
    var inbox = state.inbox || { study: {}, board: 0, table: 0, whispers: 0, cells: 0 };
    var studyN = 0;
    Object.keys(inbox.study).forEach(function (k) { studyN += inbox.study[k]; });
    var tabs = [["study", "Ask the GM", studyN], ["board", "Notice board", 0], ["table", "Broadcasts", inbox.table], ["whispers", "Messages", inbox.whispers]];
    $("mtabs").innerHTML = tabs.map(function (t) {
      return '<button type="button" class="' + (mtab === t[0] ? "on" : "") + '" data-mtab="' + t[0] + '">' + t[1] + (t[2] ? '<span class="n">' + t[2] + "</span>" : "") + "</button>";
    }).join("");
    document.title = (studyN ? "(" + studyN + ") " : "") + "Dark Post: host console";
  }

  function typing() {
    var fields = $("mview").querySelectorAll("input");
    for (var i = 0; i < fields.length; i++) if (fields[i].value || fields[i] === document.activeElement) return true;
    return false;
  }

  function loadView(force) {
    if (!state || !state.authed) return;
    drawTabs();
    if (!force && typing()) return;
    var view = $("mview");
    var players = state.invites.filter(function (i) { return i.status === "accepted" && i.number != null; }).sort(function (a, b) { return a.number - b.number; });

    if (mtab === "study") {
      if (!players.length) { view.innerHTML = '<p class="mview-empty">Nobody has entered yet.</p>'; return; }
      if (!studyWith || !byNumber(studyWith)) {
        var waiting = players.filter(function (p) { return (state.inbox.study || {})[p.number]; });
        studyWith = (waiting[0] || players[0]).number;
      }
      return api("GET", "/api/host/messages?room=study&with=" + studyWith).then(function (data) {
        if (state.inbox.study) delete state.inbox.study[studyWith];
        drawTabs();
        var list = players.map(function (p) {
          var n = (state.inbox.study || {})[p.number];
          return '<button type="button" class="' + (p.number === studyWith ? "on" : "") + '" data-study="' + p.number + '"><span class="hface">' + hface(p.number) + "</span>" +
            esc("Player " + p.number + " · " + p.name) + (n ? '<span class="n">' + n + "</span>" : "") + "</button>";
        }).join("");
        view.innerHTML =
          '<div class="study"><div class="study-list">' + list + '</div><div><div class="hmsgs" id="hmsgs">' +
          (data.messages.length ? data.messages.map(hmsg).join("") : '<p class="mview-empty">Player ' + studyWith + " has not asked anything.</p>") +
          "</div>" + mform("study", "Reply privately to Player " + studyWith) + "</div></div>";
        var box = $("hmsgs");
        box.scrollTop = box.scrollHeight;
      }).catch(function (err) { toast(err.message); });
    }

    if (mtab === "board") {
      return api("GET", "/api/host/messages?room=board").then(function (data) {
        state.inbox.board = 0;
        drawTabs();
        var out = data.messages.map(hmsg).join("");
        view.innerHTML = '<div class="hmsgs" id="hmsgs">' + (out || '<p class="mview-empty">Nothing on the notice board yet.</p>') + "</div>" + mform("notice", "Post a notice to every player");
        var box = $("hmsgs");
        box.scrollTop = box.scrollHeight;
      }).catch(function (err) { toast(err.message); });
    }

    if (mtab === "table") {
      return api("GET", "/api/host/messages?room=table").then(function (data) {
        state.inbox.table = 0;
        drawTabs();
        view.innerHTML = '<div class="hmsgs" id="hmsgs">' + (data.messages.length ? data.messages.map(hmsg).join("") : '<p class="mview-empty">No one has broadcast yet.</p>') + "</div>" + mform("table", "Broadcast to everyone, as the GM");
        var box = $("hmsgs");
        box.scrollTop = box.scrollHeight;
      }).catch(function (err) { toast(err.message); });
    }

    if (mtab === "cells") {
      return api("GET", "/api/host/messages?room=cells").then(function (data) {
        state.inbox.cells = 0;
        drawTabs();
        var byCell = {};
        data.messages.forEach(function (m) { (byCell[m.room] || (byCell[m.room] = [])).push(m); });
        var keys = Object.keys(byCell).sort();
        view.innerHTML = keys.length
          ? '<div class="hmsgs">' + keys.map(function (key) {
              return '<div class="pair-box"><p class="pair">Cell ' + esc(key.slice(4)) + "</p>" + byCell[key].map(function (m) {
                var heard = String(m.heard || "").split(",").filter(function (n) { return n && Number(n) !== m.from; });
                return hmsg(m) + '<p class="heard">' + (heard.length ? "Heard by " + heard.map(function (n) { return "Player " + esc(n); }).join(", ") : "Nobody else was in the cell") + "</p>";
              }).join("") + "</div>";
            }).join("") + "</div>"
          : '<p class="mview-empty">Nothing has been said in the dungeon yet.</p>';
      }).catch(function (err) { toast(err.message); });
    }

    return api("GET", "/api/host/messages?room=whispers").then(function (data) {
      state.inbox.whispers = 0;
      drawTabs();
      var pairs = {};
      var order = [];
      data.messages.forEach(function (m) {
        var key = Math.min(m.from, m.to) + "-" + Math.max(m.from, m.to);
        if (!pairs[key]) { pairs[key] = []; order.push(key); }
        pairs[key].push(m);
      });
      order.sort(function (a, b) { return pairs[b][pairs[b].length - 1].at - pairs[a][pairs[a].length - 1].at; });
      view.innerHTML = order.length
        ? '<div class="hmsgs">' + order.map(function (key) {
            var ab = key.split("-");
            return '<div class="pair-box"><p class="pair">Player ' + ab[0] + " and Player " + ab[1] + "</p>" + pairs[key].map(hmsg).join("") + "</div>";
          }).join("") + "</div>"
        : '<p class="mview-empty">No private messages between players yet.</p>';
    }).catch(function (err) { toast(err.message); });
  }

  // ---------- rooms: the puzzle, the deals, the dungeon ----------

  var WORD = { c: "cooperated", b: "betrayed" };

  function signed(v) {
    return (v > 0 ? "+" : v < 0 ? "−" : "") + Math.abs(v);
  }

  function loadActivity() {
    if (!state || !state.authed) return;
    var pick = $("coins-n");
    var players = state.invites.filter(function (i) { return i.status === "accepted" && i.number != null && i.avatar; }).sort(function (a, b) { return a.number - b.number; });
    if (document.activeElement !== pick) {
      var keep = pick.value;
      pick.innerHTML = players.map(function (p) { return '<option value="' + p.number + '">Player ' + p.number + " · " + esc(p.name) + "</option>"; }).join("");
      if (keep) pick.value = keep;
    }
    return api("GET", "/api/host/activity").then(function (a) {
      var out = "<h3>Today’s puzzle" + (a.puzzle.title ? ": " + esc(a.puzzle.title) : "") + "</h3>";
      if (!a.puzzle.players.length) out += '<p class="table-empty">Nobody has entered yet.</p>';
      else {
        out += '<table class="table"><thead><tr><th>Player</th><th>Today</th><th>The answer is</th><th>Solved in all</th></tr></thead><tbody>' +
          a.puzzle.players.map(function (p) {
            return "<tr><td>" + esc(hwho(p.n)) + "</td><td>" + (p.solved ? '<span class="chip gold">Solved</span>' : p.tries >= 3 ? '<span class="chip red">Out of tries</span>' : p.tries ? p.tries + " of 3 tries used" : "Not tried") +
              '</td><td class="num">' + esc(p.answer) + '</td><td class="num">' + p.total + "</td></tr>";
          }).join("") + "</tbody></table>" +
          '<p class="help">' + (a.puzzle.held
            ? "<b>This puzzle is held.</b> It stays in play until you release it or start the next one. "
            : "A new puzzle arrives " + esc(htime(a.puzzle.endsAt)) + ", your time (midnight EST). ") +
          "Every player gets the same puzzle, so the answer is the same for all of them. Three tries each.</p>";
      }
      if (document.activeElement !== $("puzzle-hold")) $("puzzle-hold").checked = !!a.puzzle.held;
      out += "<h3>Deals</h3>";
      if (!a.deals.length) out += '<p class="table-empty">No deals yet. The betting room opens when the bags open.</p>';
      else {
        out += '<table class="table"><thead><tr><th>When</th><th>Offered by</th><th>To</th><th>Result</th></tr></thead><tbody>' +
          a.deals.map(function (d) {
            var result = d.status === "done"
              ? "Player " + d.a + " " + WORD[d.aChoice] + " (" + signed(d.aNet) + "). Player " + d.b + " " + WORD[d.bChoice] + " (" + signed(d.bNet) + ")."
              : d.status === "open" ? "Waiting. Player " + d.a + " sealed: " + (d.aChoice === "c" ? "cooperate" : "betray") + "."
              : d.status === "cancelled" ? "Taken back." : d.status === "declined" ? "Declined." : "Ran out of time.";
            return "<tr><td>" + esc(htime(d.at)) + "</td><td>" + esc(hwho(d.a)) + "</td><td>" + esc(hwho(d.b)) + "</td><td>" + esc(result) + "</td></tr>";
          }).join("") + "</tbody></table>";
      }
      $("activity").innerHTML = out;
      drawBoard(a.board);
      drawNight1(a.night); gmInit();
    }).catch(function () {});
  }

  // ---------- the live board: every room from above, with each player where they stand ----------

  var BOARD_ROOMS = ["hall", "arena", "puzzle", "betting", "studio", "gallery", "shop"];
  function drawBoard(b) {
    var box = $("board");
    if (!box || !b || !window.DP_WORLD) return;
    var W = window.DP_WORLD, online = {}, inRoom = {};
    b.online.forEach(function (n) { online[n] = true; });
    b.players.forEach(function (p) {
      var at = b.pos[p.n] || ["hall"].concat(W.marker(p.n));
      if (BOARD_ROOMS.indexOf(at[0]) < 0) at = ["hall"].concat(W.marker(p.n));
      (inRoom[at[0]] = inRoom[at[0]] || []).push({ p: p, x: at[1], y: at[2] });
    });
    // every place is shown: a face for a player in the house (faded when away), a silhouette for a place nobody stands in yet
    var taken = {}, arriving = {};
    b.players.forEach(function (p) { taken[p.n] = true; });
    (b.arriving || []).forEach(function (p) { arriving[p.n] = p.name; });
    var ghosts = [];
    for (var n = 1; n <= (b.seats || 16); n++) if (!taken[n]) ghosts.push(n);
    var here = b.players.length, live = b.players.filter(function (p) { return online[p.n]; }).length;
    var out = '<p class="board-sum"><b>' + here + "</b> in the house · <b>" + live + "</b> connected now · <b>" + ghosts.length + '</b> not here yet</p><div class="board-grid">';
    BOARD_ROOMS.forEach(function (id) {
      var R = W.ROOMS[id], list = inRoom[id] || [];
      out += '<div class="board-room' + (id === "hall" ? " wide" : "") + '"><div class="board-map" style="aspect-ratio: ' + R.w + " / " + R.h + "; background-image: url(/art/rooms/" + id + '.webp)">' +
        (id !== "hall" ? "" : ghosts.map(function (n) {
          var m = W.marker(n);
          return '<span class="board-pin ghost" style="left: ' + (m[0] / R.w * 100).toFixed(1) + "%; top: " + (m[1] / R.h * 100).toFixed(1) + '%" title="' + (arriving[n] ? esc(arriving[n]) + ", still in the opening" : "Nobody has this place yet") + '">' +
            window.DP_AVATAR.silhouette() + "<b>" + n + "</b></span>";
        }).join("")) +
        list.map(function (e) {
          return '<span class="board-pin' + (online[e.p.n] ? " on" : "") + (e.p.out ? " out" : "") + '" style="left: ' + (e.x / R.w * 100).toFixed(1) + "%; top: " + (e.y / R.h * 100).toFixed(1) + '%" title="' + esc(e.p.name) + '">' +
            window.DP_AVATAR.draw(e.p.avatar) + "<b>" + e.p.n + "</b></span>";
        }).join("") +
        '</div><p class="board-name"><b>' + esc(R.name) + "</b>" + (list.length ? list.map(function (e) { return "Player " + e.p.n + " (" + esc(e.p.name) + ")" + (online[e.p.n] ? "" : ", away"); }).join(" · ") : "Nobody") + "</p></div>";
    });
    box.innerHTML = out + "</div>";
  }

  // ---------- Night 1: Six Vaults ----------

  var THROWS = { r: "Rock", p: "Paper", s: "Scissors" };

  // ----- the Gamemaster's figure: steered from a map of the room -----
  var GMV = null, gmRoom = "hall", gmTimer = null;
  var GM_ROOMS = ["hall", "arena", "puzzle", "betting", "studio", "sky", "gallery", "shop"].filter(function (r) { return window.DP_WORLD && DP_WORLD.ROOMS[r]; });

  function gmDraw() {
    if (!GMV || !window.DP_WORLD) return;
    var on = !!GMV.gm;
    $("gm-face").innerHTML = AV.executor();
    $("gm-status").textContent = on ? "In " + DP_WORLD.ROOMS[GMV.gm[0]].name.replace(/^The /, "the ") : "Not in the estate";
    $("gm-enter").hidden = on;
    $("gm-leave").hidden = !on;
    $("gm-walk").hidden = !on;
    if (!on) return;
    var sel = $("gm-room");
    if (!sel.options.length) sel.innerHTML = GM_ROOMS.map(function (r) { return '<option value="' + r + '">' + esc(DP_WORLD.ROOMS[r].name) + "</option>"; }).join("");
    if (document.activeElement !== sel) { gmRoom = sel.value = gmRoom; }
    var room = DP_WORLD.ROOMS[gmRoom], here = [];
    var dots = Object.keys(GMV.pos).map(function (k) {
      var p = GMV.pos[k], n = Number(k);
      if (p[0] !== gmRoom || n === 0) return "";
      var live = GMV.online.indexOf(n) >= 0;
      here.push("Player " + n + (live ? "" : " (away)"));
      return '<span class="gm-dot' + (live ? "" : " away") + '" style="left:' + (p[1] / room.w * 100) + "%;top:" + (p[2] / room.h * 100) + '%">' + n + "</span>";
    }).join("");
    var me = GMV.gm[0] === gmRoom ? '<span class="gm-dot me" style="left:' + (GMV.gm[1] / room.w * 100) + "%;top:" + (GMV.gm[2] / room.h * 100) + '%">GM</span>' : "";
    var map = $("gm-map");
    if (map.getAttribute("data-room") !== gmRoom) { map.setAttribute("data-room", gmRoom); map.innerHTML = '<div class="gm-art">' + DP_WORLD.svg(gmRoom).replace(/ width="\d+" height="\d+" class/, ' class') + '</div><div class="gm-dots"></div>'; map.style.aspectRatio = room.w + " / " + room.h; }
    map.querySelector(".gm-dots").innerHTML = dots + me;
    $("gm-here").textContent = (GMV.gm[0] === gmRoom ? "You are in this room. " : "You are in another room: tap the map to walk in here. ") + (here.length ? "Here now: " + here.join(", ") + "." : "No players are in this room.");
  }
  function gmLoad() { return api("GET", "/api/host/gm").then(function (v) { GMV = v; if (v.gm && !gmLoad.once) { gmLoad.once = true; gmRoom = v.gm[0]; } gmDraw(); }).catch(function () {}); }
  function gmGo(room, x, y) { return api("POST", "/api/host/gm", { on: true, r: room, x: x, y: y }).then(function (v) { GMV = v; gmDraw(); }).catch(function (err) { toast(err.message); }); }
  function gmInit() {
    if (gmInit.done || !$("gm-panel") || !window.DP_WORLD || !AV.executor) return;
    gmInit.done = true;
    $("gm-enter").addEventListener("click", function () { var m = DP_WORLD.nearest("hall", DP_WORLD.CX, DP_WORLD.CY + 260); gmRoom = "hall"; gmGo("hall", m[0], m[1]); });
    $("gm-leave").addEventListener("click", function () { api("POST", "/api/host/gm", { on: false }).then(function (v) { GMV = v; gmDraw(); }).catch(function (err) { toast(err.message); }); });
    $("gm-room").addEventListener("change", function () { gmRoom = $("gm-room").value; gmDraw(); });
    $("gm-map").addEventListener("click", function (e) {
      var box = $("gm-map").getBoundingClientRect(), room = DP_WORLD.ROOMS[gmRoom];
      var p = DP_WORLD.nearest(gmRoom, (e.clientX - box.left) / box.width * room.w, (e.clientY - box.top) / box.height * room.h);
      gmGo(gmRoom, p[0], p[1]);
    });
    $("gm-say-form").addEventListener("submit", function (e) {
      e.preventDefault();
      var text = $("gm-say").value.trim();
      if (!text) return;
      api("POST", "/api/host/gm/say", { text: text }).then(function () { $("gm-say").value = ""; toast("Said in " + DP_WORLD.ROOMS[GMV.gm[0]].name.toLowerCase() + "."); }).catch(function (err) { toast(err.message); });
    });
    gmLoad();
    gmTimer = setInterval(function () { if (!document.hidden) gmLoad(); }, 5000);
  }

  function drawLadder1(n) {
    var box = $("night-box");
    $("night-form").hidden = !!n;
    if (!n) { box.innerHTML = state.phase === "revealed" ? "" : '<p class="table-empty">Open the bags first. Players need coins for the +2 boost.</p>'; return; }
    var out = '<div class="night-box">';
    if (n.status === "open") {
      var waiting = n.players.filter(function (k) { return n.sealed.indexOf(k) < 0; });
      out += "<p><b>Game " + n.n + ": The Ladder. Stage " + n.stage + " of " + n.stages + " is open.</b> " + n.sealed.length + " of " + n.players.length + " players have sealed their cards. " +
        (waiting.length ? "Not yet: " + waiting.map(function (k) { return "Player " + k; }).join(", ") + ". " : "Everyone has sealed. ") +
        (n.endsAt ? "This stage closes by itself " + esc(htime(Date.parse(n.endsAt))) + ", your time." : "It closes when you press the button.") + "</p>" +
        '<button type="button" class="btn" data-night="stage" data-waiting="' + waiting.length + '">Close stage ' + n.stage + (n.stage === n.stages ? " and end the game" : " and turn the cards") + '</button> <button type="button" class="link quiet" data-night="reset">Cancel the game</button>';
    } else {
      var r = n.result || {};
      out += "<p><b>Game " + n.n + ": The Ladder is over.</b> " + (r.out != null ? esc(hwho(r.out)) + " is out." : "Nobody is out yet.") + "</p>";
      if (r.out == null && (r.undecided || []).length) {
        out += "<p>These players are level at the bottom, and neither the duels between them nor their wins could separate them. Choose who leaves.</p>" +
          r.undecided.map(function (k) { return '<button type="button" class="btn" data-out="' + k + '">Send Player ' + k + " home</button>"; }).join(" ");
      }
      out += '<p><button type="button" class="link quiet" data-night="reset">Undo the game (testing only)</button></p>';
    }
    out += "</div>";
    var prizes = (n.result && n.result.prizes) || {};
    out += '<table class="table"><thead><tr><th>Place</th><th>Player</th><th>Points</th><th>Won</th><th>Lost</th><th>Level</th><th>' + (n.status === "open" ? "This stage" : "Prize") + "</th><th>Bet</th></tr></thead><tbody>" +
      n.table.map(function (row, i) {
        return "<tr><td>" + (i + 1) + "</td><td>" + esc(hwho(row.n)) + '</td><td class="num">' + (row.pts > 0 ? "+" : "") + row.pts + '</td><td class="num">' + row.w + '</td><td class="num">' + row.l + '</td><td class="num">' + row.t + "</td><td>" +
          (n.status === "open" ? (n.sealed.indexOf(row.n) >= 0 ? "Sealed" : "Not yet") : prizes[row.n] ? "+" + prizes[row.n] + " coins" : "") + "</td><td>" +
          (function () { var b = (n.bets || []).filter(function (x) { return x.number === row.n; })[0]; return b ? b.stake + " on " + (b.score > 0 ? "+" : "") + b.score + " (×" + b.mult + ")" + (n.status === "open" ? "" : b.paid ? ": paid " + b.paid : ": lost") : ""; })() + "</td></tr>";
      }).join("") + "</tbody></table>";
    // every player's choices, and when they were last in the estate (Eastern time). Only this console is sent these.
    var lab = function (c) { return c === "X1" || c === "X2" ? "Joker" : c; };
    var et = function (at) { return at ? new Date(at).toLocaleString("en-US", { timeZone: "America/New_York", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) + " ET" : "Never"; };
    var bets = {};
    (n.bets || []).forEach(function (b) { bets[b.number] = b; });
    out += '<h3 class="choices-h">Every player\u2019s choices (only you see this)</h3>' + (n.choices || []).map(function (c) {
      var b = bets[c.n];
      var now = n.status !== "open" ? "" : c.sealed
        ? c.sealed.map(function (p) { return lab(p.card) + (p.boost ? " +2" : "") + " vs P" + p.opp; }).join(" \u00b7 ")
        : "Nothing sealed yet";
      var byStage = {};
      c.played.forEach(function (d) { (byStage[d.stage] = byStage[d.stage] || []).push(lab(d.card) + (d.boost ? " +2" : "") + " vs P" + d.opp + " (" + (d.r > 0 ? "won" : d.r < 0 ? "lost" : "level") + ")"); });
      var past = Object.keys(byStage).map(function (st) { return "<div><b>Stage " + st + ":</b> " + esc(byStage[st].join(" \u00b7 ")) + "</div>"; }).join("");
      return '<div class="choice"><div class="choice-top"><b>' + esc(hwho(c.n)) + "</b><span>Last online: " + esc(et(c.seen)) + "</span></div>" +
        (n.status === "open" ? "<div><b>Stage " + n.stage + " (sealed, not yet turned):</b> " + esc(now) + "</div>" : "") + past +
        "<div><b>Bet:</b> " + (b ? b.stake + (b.stake === 1 ? " coin" : " coins") + " on finishing " + (b.score > 0 ? "+" : "") + b.score + ", placed in stage " + b.stage + " (pays " + b.stake * b.mult + ")" + (n.status === "open" ? "" : b.paid ? ": paid " + b.paid : ": lost") : "None") + "</div></div>";
    }).join("");
    box.innerHTML = out;
  }

  function drawNight1(n) {
    if (!n || n.game === "ladder") return drawLadder1(n);
    var box = $("night-box");
    $("night-form").hidden = !!(n && n.status === "open");
    if (!n || !n.players) { box.innerHTML = state.phase === "revealed" ? "" : '<p class="table-empty">Open the bags first. Players need coins for the shop.</p>'; return; }
    var out = '<div class="night-box">';
    var vaults = n.layout.map(function (g, i) { return "Vault " + (i + 1) + ": " + (g ? g + " gold" : "empty"); }).join(" · ");
    if (n.status === "open") {
      var opened = n.players.filter(function (p) { return p.opened; }).length;
      out += "<p><b>Night " + n.n + " is being played.</b> " + opened + " of " + n.players.length + " players have opened their vaults. " +
        (n.endsAt ? "The vaults close " + esc(htime(Date.parse(n.endsAt))) + ", your time." : "No closing time is set: they close when you press the button.") + "</p>" +
        '<button type="button" class="btn" data-night="end">Close the vaults now</button> <button type="button" class="link quiet" data-night="reset">Cancel the night</button>';
    } else {
      var r = n.result || {};
      var top = Object.keys(r.prize || {}).filter(function (k) { return r.prize[k] === 5; }).length;
      out += "<p><b>Night " + n.n + " is over.</b> " + (r.out != null ? esc(hwho(r.out)) + " is out." : "Nobody is out yet.") + " " + top + " players were paid 5 coins.</p>";
      if (r.out == null && (r.undecided || []).length) {
        out += "<p>These players tied for last, and neither the throws nor their coins could separate them. Choose who leaves.</p>" +
          r.undecided.map(function (k) { return '<button type="button" class="btn" data-out="' + k + '">Send Player ' + k + " home</button>"; }).join(" ");
      }
      out += '<p><button type="button" class="link quiet" data-night="reset">Undo the night (testing only)</button></p>';
    }
    out += '<p class="help">' + esc(vaults) + ".</p></div>";
    out += '<table class="table"><thead><tr><th>Player</th><th>Dealt clue</th><th>Bought</th><th>Opened</th><th>Gold</th><th>Throws</th></tr></thead><tbody>' +
      n.players.map(function (p) {
        return "<tr><td>" + esc(hwho(p.n)) + "</td><td>" + esc(p.clue) + "</td><td>" + esc(p.bought || "") + "</td><td>" + (p.opened ? p.opened.join(" and ") : "Not yet") +
          '</td><td class="num">' + (p.gold != null ? p.gold : "") + "</td><td>" + esc(p.throws.split("").map(function (t) { return THROWS[t]; }).join(", ")) + "</td></tr>";
      }).join("") + "</tbody></table>";
    box.innerHTML = out;
  }

  $("night-form").addEventListener("submit", function (e) {
    e.preventDefault();
    var hours = Number($("night-hours").value);
    if (!window.confirm(hours > 0 ? "Start Game 1: The Ladder? Each stage will close by itself after " + hours + " hours. You can still close one early." : "Start Game 1: The Ladder? You will close each of the stages yourself.")) return;
    api("POST", "/api/host/night/start", { game: "ladder", stageMinutes: hours > 0 ? Math.round(hours * 60) : 0 })
      .then(function (res) { toast("Game 1 has begun for " + res.players + " players."); return refresh(); })
      .catch(function (err) { toast(err.message); });
  });

  $("night-box").addEventListener("click", function (e) {
    var act = e.target.closest("[data-night]");
    var send = e.target.closest("[data-out]");
    if (send) {
      var k = Number(send.getAttribute("data-out"));
      if (!window.confirm("Send Player " + k + " home? This ends the tie.")) return;
      api("POST", "/api/host/out", { number: k }).then(refresh).catch(function (err) { toast(err.message); });
      return;
    }
    if (!act) return;
    var what = act.getAttribute("data-night");
    if (what === "stage") {
      var late = Number(act.getAttribute("data-waiting"));
      if (!window.confirm(late ? late + " players have not sealed. If you close now they play their lowest cards. Close the stage?" : "Close the stage and turn the cards?")) return;
      api("POST", "/api/host/night/stage", {}).then(function (res) { toast(res.status === "done" ? "The game is over." : "The cards are turned. Stage " + res.stage + " is open."); return refresh(); }).catch(function (err) { toast(err.message); });
      return;
    }
    if (what === "end" && !window.confirm("Close the vaults now? Players who have not opened get no gold.")) return;
    if (what === "reset" && !window.confirm("Undo this night? Prizes and clue money go back, and the player who left returns.")) return;
    api("POST", "/api/host/night/" + what, {})
      .then(function () { toast(what === "end" ? "The vaults are closed." : "The night was undone."); return refresh(); })
      .catch(function (err) { toast(err.message); });
  });

  $("coins-form").addEventListener("submit", function (e) {
    e.preventDefault();
    var n = Number($("coins-n").value);
    var amount = Number($("coins-amt").value);
    if (!n || !amount) { toast("Choose a player and a number of coins."); return; }
    if (!window.confirm((amount > 0 ? "Give " + amount + " coins to" : "Take " + Math.abs(amount) + " coins from") + " Player " + n + "?")) return;
    api("POST", "/api/host/coins", { number: n, amount: amount })
      .then(function (res) { $("coins-amt").value = ""; toast("Player " + n + " now holds " + res.coins + "."); return refresh(); })
      .catch(function (err) { toast(err.message); });
  });

  $("mtabs").addEventListener("click", function (e) {
    var btn = e.target.closest("[data-mtab]");
    if (!btn) return;
    mtab = btn.getAttribute("data-mtab");
    loadView(true);
  });

  $("mview").addEventListener("click", function (e) {
    var pick = e.target.closest("[data-study]");
    if (pick) { studyWith = Number(pick.getAttribute("data-study")); loadView(true); return; }
    var rm = e.target.closest("[data-remove]");
    if (rm && window.confirm("Remove this message for everyone?")) {
      api("POST", "/api/host/message/remove", { id: Number(rm.getAttribute("data-remove")) })
        .then(function () { toast("Removed."); loadView(true); })
        .catch(function (err) { toast(err.message); });
    }
  });

  $("mview").addEventListener("submit", function (e) {
    e.preventDefault();
    var form = e.target;
    var input = form.querySelector("input");
    var text = input.value.trim();
    if (!text) return;
    var kind = form.getAttribute("data-kind");
    var body = { body: text };
    if (kind === "study") { body.room = "study"; body.to = studyWith; }
    else if (kind === "notice") body.room = "board";
    else body.room = "table";
    api("POST", "/api/host/messages", body)
      .then(function () { input.value = ""; input.blur(); toast("Sent."); loadView(true); })
      .catch(function (err) { toast(err.message); });
  });

  refresh().catch(function (err) {
    $("gate").hidden = false;
    $("gate-error").textContent = err.message;
  });
})();
