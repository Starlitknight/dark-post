// Dark Post: helpers shared by the guest site and the host console.
window.DP = (function () {
  function esc(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  // Dates are always shown in the reader's own time zone.
  function when(iso, withTime) {
    if (!iso) return "";
    var d = new Date(iso);
    if (isNaN(d.getTime())) return "";
    var date = d.toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" });
    if (!withTime) return date;
    var time = d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
    return date + " at " + time;
  }

  // "Doors open {opens}. Answer by {reply}." A sentence whose date is not set is dropped.
  function closing(template, opensAt, replyBy) {
    var opens = when(opensAt, true);
    var reply = when(replyBy, false);
    if (opens) opens += " your time";
    var parts = String(template || "").match(/[^.!?]+[.!?]*\s*/g) || [];
    return parts
      .map(function (s) {
        if (s.indexOf("{opens}") >= 0) {
          if (!opens) return "";
          s = s.replace("{opens}", opens);
        }
        if (s.indexOf("{reply}") >= 0) {
          if (!reply) return "";
          s = s.replace("{reply}", reply);
        }
        return s;
      })
      .join("")
      .trim();
  }

  function paragraphs(text) {
    return String(text || "")
      .split(/\n\s*\n/)
      .map(function (p) {
        return p.trim();
      })
      .filter(Boolean)
      .map(function (p) {
        return "<p>" + esc(p).replace(/\n/g, "<br>") + "</p>";
      })
      .join("");
  }

  // Stock letters from earlier versions. A field still equal to one of them is shown as today's.
  var previousLetters = [
  {
    kicker: "Dark Post",
    headline: "YOU HAVE BEEN CHOSEN.",
    body: [
      "Sixteen people who have never met will enter a house that does not exist. Each will carry a number instead of a name.",
      "For eleven nights I will set one game. Most nights, someone leaves.",
      "You will need ten minutes a day, a steady nerve, and a willingness to be lied to.",
      "No one will know who you are. I will never tell.",
    ].join("\n\n"),
    closing: "Doors open {opens}. Answer by {reply}.",
    signature: "S",
  },
  {
    kicker: "Dark Post",
    headline: "You have been chosen.",
    body: [
      "I sent sixteen letters. Yours opens a door with no address. Beyond it, fifteen strangers will know you only by a number.",
      "I’ll set one ten-minute game each night for eleven nights. Most nights, a player is eliminated. Be the last one here, and you win.",
    ].join("\n\n"),
    closing: "Doors open {opens}. Reply by {reply}.",
    signature: "Gamemaster S",
  },
  ];
  var defaultLetter = {
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

  // Existing seasons can have individually customized fields, including an empty one.
  function displayLetter(letter) {
    var result = {};
    Object.keys(defaultLetter).forEach(function (key) {
      var value = letter && letter[key];
      var stock = previousLetters.some(function (was) { return value === was[key]; });
      result[key] = value == null || stock ? defaultLetter[key] : value;
    });
    return result;
  }

  function letterDate(label, iso, withTime) {
    if (!iso) return "";
    var date = new Date(iso);
    if (isNaN(date.getTime())) return "";
    var value = date.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
    if (withTime) value += " · " + date.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit", timeZoneName: "short" });
    return '<div><dt>' + label + '</dt><dd><time datetime="' + esc(iso) + '">' + esc(value) + "</time></dd></div>";
  }

  function letterHTML(opts) {
    var L = displayLetter(opts.letter);
    var mark = window.DP_ART && window.DP_ART.imprint ? window.DP_ART.imprint() : "";
    var schedule = "";
    if (L.closing === defaultLetter.closing) {
      var dates = letterDate("Doors open", opts.opensAt, true) + letterDate("Reply by", opts.replyBy, false);
      if (dates) schedule = '<dl class="paper-closing paper-dates">' + dates + "</dl>";
    } else {
      var customClosing = closing(L.closing, opts.opensAt, opts.replyBy);
      if (customClosing) schedule = '<p class="paper-closing">' + esc(customClosing) + "</p>";
    }
    return (
      '<div class="dossier"><article class="paper">' +
      (L.kicker ? '<div class="paper-head">' + mark + '<span>' + esc(L.kicker) + "</span></div>" : "") +
      (opts.name ? '<p class="paper-for">Dear ' + esc(opts.name) + ",</p>" : "") +
      (L.headline ? "<h1>" + esc(L.headline) + "</h1>" : "") +
      '<div class="letter-copy">' + paragraphs(L.body) + "</div>" +
      (L.signature ? '<div class="paper-foot"><p class="paper-sig">' + esc(L.signature) + "</p></div>" : "") +
      schedule + "</article></div>"
    );
  }

  return { esc: esc, when: when, closing: closing, paragraphs: paragraphs, defaultLetter: defaultLetter, displayLetter: displayLetter, letterHTML: letterHTML };
})();
