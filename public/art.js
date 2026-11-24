// Illustrations for the game’s printed invitation and miniature field equipment.
// Every part is local vector artwork. Numbers and group states stay live text.
window.DP_ART = (function () {
  "use strict";

  var serial = 0;
  var materials = {
    paper: ["#f8efd8", "#e5d7b8", "#bdad8e"],
    ivory: ["#fff6dd", "#edddbb", "#d9c69c"],
    brass: ["#f6df9c", "#d9b468", "#956d39"],
    darkBrass: ["#c8a66a", "#997340", "#644a2f"],
    forest: ["#688477", "#425d53", "#263f39"],
    leather: ["#52675d", "#354a41", "#24362f"],
    cloth: ["#bd9167", "#a5744e", "#70503c"],
    clothDark: ["#9d7353", "#7f593f", "#5c4133"],
    wax: ["#bf795f", "#aa5e4c", "#813d38"]
  };

  function svg(className, label, box, used, paint) {
    var namespace = "dp-prop-" + (++serial) + "-";
    function fill(name) { return "url(#" + namespace + name + ")"; }
    var defs = used.map(function (name) {
      var stops = materials[name];
      return '<linearGradient id="' + namespace + name + '" x1="0%" y1="0%" x2="86%" y2="100%">' +
        '<stop stop-color="' + stops[0] + '"/><stop offset=".54" stop-color="' + stops[1] +
        '"/><stop offset="1" stop-color="' + stops[2] + '"/></linearGradient>';
    }).join("");
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="' + box + '" class="' + className +
      '" role="img" aria-label="' + label + '" focusable="false"><defs>' + defs + '</defs>' + paint(fill) + '</svg>';
  }

  // A folded messenger bird. The same little maker's mark is struck in the
  // paper seal, the coin and the game masthead.
  function bird(x, y, scale, face, fold) {
    return '<g transform="translate(' + x + ' ' + y + ') scale(' + scale + ')">' +
      '<path d="M-34-10-5-3 26-20 14 0 34-5 19 8 5 11-7 25-9 12-27 15-18 6Z" fill="' + face + '"/>' +
      '<path d="M-34-10-5-3-10 8-18 6ZM26-20 5 11-9 12-2 3Z" fill="' + fold + '"/></g>';
  }

  function imprint() {
    return '<svg xmlns="http://www.w3.org/2000/svg" class="post-imprint" viewBox="0 0 76 56" width="1.4em" height="1em" aria-hidden="true" focusable="false">' +
      bird(38,24,1,"currentColor","currentColor") + '</svg>';
  }

  function wordmark() {
    return '<div class="wordmark" aria-label="Dark Post"><span>DARK</span>' +
      imprint() + '<span>POST</span></div>';
  }

  function shadow(x, y, rx, ry) {
    return '<ellipse cx="' + x + '" cy="' + y + '" rx="' + rx + '" ry="' + ry + '" fill="#080d0d" opacity=".29"/>';
  }

  function waxSeal(x, y, size, paint) {
    return '<g transform="translate(' + x + ' ' + y + ') scale(' + size + ')">' +
      '<path d="M-4-29C3-32 9-27 15-27c8 0 7 8 13 12 7 5 4 11 4 16 3 10-3 14-8 17-5 9-9 11-15 11-7 5-11 4-18 1-9 1-13-2-16-10-7-4-10-11-8-17-4-7-2-13 6-18 2-7 7-12 14-11z" fill="#683e35" transform="translate(0 4)"/>' +
      '<path d="M-4-29C3-32 9-27 15-27c8 0 7 8 13 12 7 5 4 11 4 16 3 10-3 14-8 17-5 9-9 11-15 11-7 5-11 4-18 1-9 1-13-2-16-10-7-4-10-11-8-17-4-7-2-13 6-18 2-7 7-12 14-11z" fill="' + paint + '"/>' +
      '<circle r="23" fill="none" stroke="#854b3c" stroke-width="2.6"/><path d="M-19 12a23 23 0 0 1 34-29" stroke="#f2af87" opacity=".66" fill="none" stroke-width="1.6"/>' +
      bird(0,0,.5,"#e2a37f","#c9886e") + '</g>';
  }

  function coinFace(x, y, size, fill) {
    return '<g transform="translate(' + x + ' ' + y + ') scale(' + size + ')">' +
      '<circle cy="5" r="76" fill="#7e6037"/><path d="M-74 18a76 76 0 0 0 145 12" stroke="#a37a3e" stroke-width="3" fill="none"/>' +
      '<circle r="76" fill="' + fill("brass") + '" stroke="#e4c286" stroke-width="2"/>' +
      '<circle r="63" fill="none" stroke="#98713b" stroke-width="2"/><path d="M-58 21a61 61 0 0 1 97-67" fill="none" stroke="#f5dfac" stroke-width="2.5"/>' +
      '<path d="M-42 43q41 35 81 1" fill="none" stroke="#e6c586" stroke-width="1.4"/>' +
      bird(0,0,1.48,"#96713e","#b89456") + bird(0,-2,1.48,"#b99254","#efcf89") +
      '<circle cx="-51" cy="27" r="2.2" fill="#9e7843"/><circle cx="50" cy="24" r="2.2" fill="#9e7843"/></g>';
  }

  function bigCoin() {
    return svg("big-coin","A brass game coin stamped with a folded bird.","0 0 200 200",["brass"],function (fill) {
      return shadow(104,173,62,7) + '<g transform="rotate(-13 100 100) translate(8 0) scale(.94 1)">' +
        coinFace(100,98,1.02,fill) + '</g>';
    });
  }

  function smallCoin(x, y, scale, tilt, fill) {
    return '<g transform="translate(' + x + ' ' + y + ') rotate(' + tilt + ') scale(' + scale + ')">' +
      '<path d="M-17 0a17 7 0 0 1 34 0v4a17 7 0 0 1-34 0z" fill="' + fill("darkBrass") + '"/>' +
      '<ellipse rx="17" ry="7.3" fill="' + fill("brass") + '" stroke="#eccd8d" stroke-width=".9"/>' +
      '<ellipse rx="12" ry="4.6" fill="none" stroke="#ab8247" stroke-width=".85"/></g>';
  }

  function bagTag(which, x, y, turn) {
    return '<g transform="translate(' + x + ' ' + y + ') rotate(' + turn + ')">' +
      '<path d="M0-11Q-3-1 0 3" fill="none" stroke="#4e412f" stroke-width="2"/>' +
      '<path d="m-10 6 4-5h12l4 5v23h-20z" fill="#6d4c34" transform="translate(.9 2)"/>' +
      '<path d="m-10 6 4-5h12l4 5v23h-20z" fill="#e3c58b"/><circle cy="5.3" r="1.8" fill="#6e573b"/>' +
      '<text x="0" y="23" text-anchor="middle" font-size="16" font-family="Georgia,serif" font-weight="bold" fill="#58432c">' + which + '</text></g>';
  }

  function closedBag(fill) {
    return shadow(119,222,69,10) +
      '<path d="M94 85Q81 75 76 59q5-7 17-4l11 3q7-7 15-8l12 6 13-6q10-3 16 2-4 18-21 33z" fill="' + fill("cloth") + '" stroke="#6c4c35" stroke-width="2"/>' +
      '<path d="m77 58 18 9 8 18-11-3zm31-4 7 29 5 2 4-27zm37 0-8 24 11-10 8-15" fill="#7f5b40"/>' +
      '<path d="M88 88q12 5 26 4 12 0 27-5 6 27 27 52 25 32 12 58-7 19-26 24-21 7-54 5-36 0-52-15-21-18-7-46 12-26 27-47 15-24 20-30z" fill="#5c4233" transform="translate(2 3)"/>' +
      '<path d="M88 88q12 5 26 4 12 0 27-5 6 27 27 52 25 32 12 58-7 19-26 24-21 7-54 5-36 0-52-15-21-18-7-46 12-26 27-47 15-24 20-30z" fill="' + fill("cloth") + '"/>' +
      '<path d="M104 95q-5 32-22 52-21 23-25 53-3 10 4 14-19-9-18-24 1-24 23-51 19-25 25-47z" fill="#d5ac80" opacity=".74"/>' +
      '<path d="M114 95q5 15-2 32m21-32q0 24 16 45m-1 69q7-15 10-24" fill="none" stroke="#7c563b" stroke-width="2.5" stroke-linecap="round" opacity=".63"/>' +
      '<path d="M139 95q4 31 24 67 15 26 8 40-5 12-35 19 23 1 38-10 22-20 4-52-10-18-22-32z" fill="#75523b" opacity=".66"/>' +
      '<path d="M87 82q23 9 53-1l3 7q-25 12-58 2z" fill="#d3b275" stroke="#735637" stroke-width="1.8"/>' +
      '<path d="M88 85q24 8 51-1m-1 1q12-12 17-4 3 7-12 9m-2-3q13 5 15 14" fill="none" stroke="#e0bf83" stroke-width="2.4" stroke-linecap="round"/>' +
      bagTag(1,144,97,-13) + smallCoin(177,216,.95,4,fill) + smallCoin(177,211,.95,4,fill);
  }

  function openBag(fill) {
    var coins = [[73,80,.87,-9],[102,65,1.04,1],[147,66,1.02,5],[116,56,.94,-7],[132,51,.92,2],[113,46,.88,-10],[88,71,.94,-5],[151,76,1.05,9],[170,80,.86,6],[124,72,1.04,-6],[111,83,1.02,0],[140,85,.97,4]];
    return shadow(124,223,87,11) +
      '<path d="M65 90q-13-8-11-18 8-14 40-18 50-8 86 8 16 8 15 18-3 12-18 19z" fill="' + fill("clothDark") + '" stroke="#6b4d37" stroke-width="2"/>' +
      '<path d="M62 78c4-20 110-25 124 2-8 14-105 27-124-2z" fill="#483a2c"/>' +
      coins.map(function (c) { return smallCoin(c[0],c[1],c[2],c[3],fill); }).join("") +
      '<path d="M61 87c20 12 76 16 120-1-4 18-2 29 10 55 16 32 25 54 7 70-12 13-36 19-77 20-39 0-64-4-82-19-15-15-8-37 3-62 11-23 23-42 19-63z" fill="#5e4634" transform="translate(2 3)"/>' +
      '<path d="M61 87c20 12 76 16 120-1-4 18-2 29 10 55 16 32 25 54 7 70-12 13-36 19-77 20-39 0-64-4-82-19-15-15-8-37 3-62 11-23 23-42 19-63z" fill="' + fill("cloth") + '"/>' +
      '<path d="M71 102q18 3 21 5-4 29-28 63-12 20-8 40-8-2-14-10 0-23 16-56 13-27 13-42z" fill="#d0a579" opacity=".77"/>' +
      '<path d="M159 101q10 28 13 48 4 27 17 46 4 15-20 24 21-3 30-14 10-17-3-44-22-41-19-70z" fill="#79573e" opacity=".79"/>' +
      '<path d="M95 109q-3 21-10 32m65-40q7 16 8 34m-7 63q1 12 6 17" fill="none" stroke="#815a3f" stroke-width="2.7" stroke-linecap="round" opacity=".74"/>' +
      '<path d="M55 77q9 4 25 10 46 13 92-2l17-7q4 4 1 10-10 14-47 19-48 6-78-9-14-7-10-21z" fill="' + fill("clothDark") + '"/>' +
      '<path d="M57 78q23 15 58 16 38 2 72-14" fill="none" stroke="#d1a67e" stroke-width="3.4" stroke-linecap="round"/>' +
      '<path d="M53 112q45 23 112 1" fill="none" stroke="#c4a471" stroke-width="4"/>' +
      bagTag(2,162,112,-8) + smallCoin(204,217,.95,8,fill) + smallCoin(66,228,.68,-11,fill);
  }

  function bag(which) {
    var opened = which === 2;
    var label = opened ? "Bag 2, an open brown cloth sack filled with brass coins." : "Bag 1, a small brown cloth sack tied with a cord.";
    return svg("bag-art",label,"0 0 240 256",["cloth","clothDark","brass","darkBrass"],opened ? openBag : closedBag);
  }

  function envelope(fill) {
    return shadow(182,201,104,10) + '<g transform="rotate(-7 181 128)">' +
      '<rect x="67" y="61" width="229" height="133" rx="7" fill="#3c4036"/>' +
      '<rect x="64" y="54" width="229" height="134" rx="7" fill="' + fill("paper") + '" stroke="#aba78c" stroke-width="1.5"/>' +
      '<path d="m66 180 82-74 31 16 31-16 81 73" fill="#e2d2af" stroke="#b4a886" stroke-width="1.6" stroke-linejoin="round"/>' +
      '<path d="m65 59 101 86q12 11 25-1l100-85" fill="#ab9d80" opacity=".55"/>' +
      '<path d="m65 56 105 78q8 6 17 0l104-78" fill="' + fill("ivory") + '" stroke="#c5b795" stroke-width="1.8" stroke-linejoin="round"/>' +
      '<path d="m73 58 99 71q6 5 13 0l96-71" stroke="#fff4d6" fill="none" opacity=".85"/>' +
      waxSeal(181,130,.72,fill("wax")) + '</g>';
  }

  function notebook(fill) {
    return shadow(174,205,89,9) + '<g transform="rotate(-13 180 124)">' +
      '<path d="M110 49h124q11 0 11 10v132q0 8-9 8H109q-9 0-9-9V59q0-10 10-10Z" fill="#23352e" stroke="#738375" stroke-width="1.5"/>' +
      '<path d="m110 51 126 2v137H108q-7 0-9-5V62q0-8 11-11z" fill="#c9bd9f"/>' +
      '<path d="m119 185 111 1m-113 4 111 1" fill="none" stroke="#a79d84" stroke-width="1.2"/>' +
      '<path d="m212 177 11 1v31l-6-5-6 5z" fill="#caa969"/>' +
      '<rect x="99" y="41" width="139" height="144" rx="6" fill="' + fill("forest") + '" stroke="#859486" stroke-width="1.8"/>' +
      '<path d="M109 43v139M114 43v140" stroke="#253c35" stroke-width="1.3" fill="none"/>' +
      '<path d="M148 75a28 28 0 1 0 39 38 30 30 0 0 1-39-38z" fill="#d8bc7b"/>' +
      '<path d="m192 74 1.7 4.7 4.7 1.7-4.7 1.7-1.7 4.7-1.7-4.7-4.7-1.7 4.7-1.7z" fill="#f2d694"/>' +
      '<path d="M199 159h16" fill="none" stroke="#b7ab86" stroke-width="2" stroke-linecap="round"/>' +
      '</g>';
  }

  function watch(fill) {
    var ticks = "";
    for (var n = 0; n < 12; n++) {
      ticks += '<path d="M0-50v' + (n % 3 === 0 ? 6 : 3) + '" transform="rotate(' + (n * 30) +
        ')" stroke="#647365" stroke-width="' + (n % 3 === 0 ? 2.8 : 1.7) + '" stroke-linecap="round"/>';
    }
    return shadow(187,208,67,8) + '<g transform="translate(181 133) rotate(12)">' +
      '<path d="M-6-86q-17-16-35-16-19 0-25-9" fill="none" stroke="#7f785e" stroke-width="4" stroke-linecap="round"/>' +
      '<rect x="-15" y="-99" width="30" height="21" rx="9" fill="none" stroke="#d6b674" stroke-width="5"/>' +
      '<rect x="-9" y="-84" width="18" height="14" rx="3" fill="' + fill("brass") + '"/><path d="M-5-81v7m5-7v7m5-7v7" stroke="#987744" stroke-width="1.4"/>' +
      '<ellipse cy="5" rx="66" ry="69" fill="' + fill("darkBrass") + '"/><ellipse rx="66" ry="69" fill="' + fill("brass") + '" stroke="#edd7a2" stroke-width="2"/>' +
      '<ellipse rx="57.5" ry="60.5" fill="' + fill("ivory") + '" stroke="#917a50" stroke-width="2.5"/>' +
      '<path d="M0 0v-52a52 52 0 0 1 45 26z" fill="#b2c0aa"/>' + ticks +
      '<path d="M-14 15 0 0l35-20" fill="none" stroke="#344a40" stroke-width="4.2" stroke-linecap="round"/><circle r="4.9" fill="#a6814b"/><circle r="2.2" fill="#f5dc9b"/>' +
      '<text x="0" y="33" text-anchor="middle" fill="#465348" font-family="Georgia,serif" font-style="italic" font-size="14">10 min</text></g>';
  }

  function identity(value, fill) {
    var number = Number(value);
    var printed = Number.isInteger(number) && number >= 1 && number <= 16 ? String(number) : "—";
    return shadow(183,202,87,8) + '<g transform="rotate(-7 178 130)">' +
      '<rect x="79" y="81" width="205" height="115" rx="12" fill="#152421"/>' +
      '<rect x="75" y="74" width="208" height="117" rx="12" fill="' + fill("forest") + '" stroke="#748779" stroke-width="1.8"/>' +
      '<rect x="83" y="83" width="192" height="100" rx="7" fill="none" stroke="#a9af92" opacity=".6" stroke-width="1.4" stroke-dasharray="3 5"/>' +
      '<rect x="88" y="72" width="180" height="95" rx="5" fill="#30493e"/>' +
      '<rect x="87" y="67" width="183" height="94" rx="5" fill="' + fill("ivory") + '" stroke="#b9af90" stroke-width="1.6"/>' +
      '<path d="M194 73v81" stroke="#b8af91" stroke-width="1.6" stroke-dasharray="3 4"/>' +
      bird(232,111,.63,"#657363","#9d9d7d") +
      '<path d="M219 136h23m-17 4h11" stroke="#a4a18a" stroke-width="1.5" stroke-linecap="round"/>' +
      '<path d="M158 61v-8q0-10 10-10h9q10 0 10 10v8" fill="none" stroke="#a68a57" stroke-width="5.5"/>' +
      '<rect x="147" y="55" width="48" height="21" rx="5" fill="#7e673e" transform="translate(0 2)"/>' +
      '<rect x="147" y="54" width="48" height="20" rx="5" fill="' + fill("brass") + '" stroke="#d1b979" stroke-width="1.2"/>' +
      '<path d="M154 60h34" fill="none" stroke="#f3d899" stroke-width="1.5" stroke-linecap="round"/>' +
      '<text data-brief-number="" class="brief-id-number" x="142" y="137" font-family="Georgia,serif" font-weight="bold" font-size="64" fill="#303d34" text-anchor="middle">' + printed + '</text></g>';
  }

  function group(options, fill) {
    options = typeof options === "object" && options ? options : { number: options };
    var self = Number(options.number) || 0;
    var step = Math.max(0, Math.min(3, Number(options.step) || 0));
    var cards = "";
    for (var n = 1; n <= 16; n++) {
      var mine = step > 0 && n === self;
      var offset = (n - self + 16) % 16;
      var retired = (step === 2 && [3,5,8,11,14].indexOf(offset) !== -1) || (step === 3 && !mine);
      var x = 108 + (n - 1) % 4 * 39, y = 53 + Math.floor((n - 1) / 4) * 30;
      var paper = mine ? "#edca7c" : retired ? "#5e6d60" : "#e3ddc5";
      cards += '<g transform="translate(' + x + ' ' + y + ')"><path d="M1 1h29l4 5v20H0V3z" fill="#263932" transform="translate(0 3)"/>' +
        '<path d="M1 1h29l4 5v20H0V3z" fill="' + paper + '"/>' +
        '<text x="16" y="20" font-family="Georgia,serif" font-weight="bold" font-size="18" fill="' +
        (retired ? "#d9d6b8" : "#3e4a3d") + '" text-anchor="middle">' + String(n).padStart(2,"0") + '</text></g>';
    }
    return shadow(180,206,91,9) + '<g transform="rotate(-4 180 120)">' +
      '<path d="M86 55q0-8 8-8h24l8-11h45l8 11h82q8 0 8 8v126q0 10-9 10H95q-9 0-9-10z" fill="#263f36"/>' +
      '<path d="M84 52q0-8 8-8h24l8-11h45l8 11h82q8 0 8 8v126q0 10-9 10H93q-9 0-9-10z" fill="' + fill("leather") + '" stroke="#7e8a74" stroke-width="1.6"/>' +
      '<path d="M94 59v113" stroke="#8e9a84" opacity=".38" stroke-width="1.4"/>' + cards +
      '<path d="M101 178h152" stroke="#949780" stroke-width="1.2" opacity=".65"/></g>';
  }

  function stampedBundle(fill) {
    return shadow(177,207,88,8) + '<g transform="rotate(-9 178 145)">' +
      '<path d="M66 137 224 116l61 42-158 38z" fill="#4f5042" transform="translate(0 9)"/>' +
      '<path d="m66 137 158-21 61 42-158 37z" fill="' + fill("paper") + '" stroke="#c0b18e" stroke-width="1.4"/>' +
      '<path d="m70 138 95 18q6 1 11-1l48-37m-96 76 42-38 110 2" stroke="#b5a17d" fill="none" stroke-width="1.6"/>' +
      waxSeal(172,157,.5,fill("wax")) + '</g>' +
      '<g transform="translate(208 100) rotate(16)">' +
      '<path d="M-22 20q0-8 12-13 5-2 5-12-1-10-8-17c-13-13-5-31 13-31s26 18 13 31Q4-13 5-4q-1 10 5 12 13 5 13 12z" fill="' + fill("forest") + '" stroke="#728075" stroke-width="1.4"/>' +
      '<path d="M-23 17q23-6 46 0v12q-23 8-46 0z" fill="' + fill("brass") + '" stroke="#957744" stroke-width="1.3"/>' +
      '<ellipse cy="29" rx="23" ry="4.4" fill="#977441"/><path d="M-14-35q-5-11 7-13" stroke="#99a697" fill="none" stroke-width="2" stroke-linecap="round"/></g>';
  }

  function openEnvelope(fill) {
    return shadow(180,204,89,8) + '<g transform="rotate(-6 180 121)">' +
      '<path d="m80 112 87-80q11-9 22 1l82 77v81H80z" fill="' + fill("forest") + '" stroke="#89927a" stroke-width="1.8"/>' +
      '<path d="m87 109 83-70q8-7 15-1l78 70-81 47z" fill="#30453b"/>' +
      '<rect x="105" y="65" width="145" height="107" rx="5" fill="' + fill("ivory") + '" stroke="#cbbb96" stroke-width="1.5" transform="rotate(6 177 115)"/>' +
      bird(180,104,.83,"#7f876b","#aaab89") +
      '<path d="m80 108 90 46q9 4 17 0l84-44v79q0 7-8 7H89q-9 0-9-8z" fill="' + fill("forest") + '" stroke="#748675" stroke-width="1.6"/>' +
      '<path d="m83 191 71-46m48 1 66 45" fill="none" stroke="#8b9880" stroke-width="1.3"/></g>';
  }

  function doorway(fill) {
    return shadow(186,212,73,6) +
      '<path d="m103 188 94-8 63 25-104 8z" fill="#9a885d" opacity=".28"/>' +
      '<path d="M116 49 223 34l18 13v145l-20-5-106 12z" fill="#263732" stroke="#66776a" stroke-width="1.7"/>' +
      '<path d="m126 58 88-12v128l-88 13z" fill="' + fill("brass") + '"/>' +
      '<path d="m128 60 82-11v122l-82 14z" fill="#1c2b28"/>' +
      '<path d="m128 60 57-15 1 139-58 1z" fill="' + fill("forest") + '" stroke="#97a08a" stroke-width="1.5"/>' +
      '<path d="m185 45 6 3v132l-5 4z" fill="#d9bb7f"/><rect x="172" y="109" width="7" height="3.5" rx="1.5" fill="#e1c280"/>' +
      '<path d="m191 179 21-5 44 25-15 3z" fill="#cbb47d" opacity=".42"/>';
  }

  var scenes = {
    invitation: { label:"A cream envelope closed with a small wax seal.", paints:["paper","ivory","wax"], draw:envelope },
    night: { label:"A field notebook embossed with a crescent moon.", paints:["forest"], draw:notebook },
    match: { label:"A brass pocket watch showing ten minutes.", paints:["brass","darkBrass","ivory"], draw:watch },
    draw: { label:"An anonymous player identification badge.", paints:["brass","forest","ivory"], draw:function (fill, value) { return identity(value, fill); } },
    group: { label:"The case file holds a numbered card for each of the sixteen players.", paints:["leather"], draw:function (fill, value) { return group(value, fill); } },
    seal: { label:"A brass seal and a closed letter.", paints:["paper","wax","forest","brass"], draw:stampedBundle },
    reveal: { label:"An open field envelope reveals its card.", paints:["forest","ivory"], draw:openEnvelope },
    door: { label:"A quiet doorway is open a crack.", paints:["brass","forest"], draw:doorway },
    coin: { label:"A brass game coin.", paints:["brass"], draw:function (fill) { return shadow(180,204,71,8) + '<g transform="rotate(-12 180 118)">' + coinFace(180,119,1.08,fill) + '</g>'; } }
  };
  var welcomeSequence = ["invitation","night","match","draw","group","coin","seal"];

  function briefing(kind, value) {
    if (kind === "welcome") {
      kind = welcomeSequence[value] || "invitation";
      value = null;
    }
    if (kind === "identity" || kind === "ballot") kind = "draw";
    if (kind === "sixteen") kind = "group";
    if (kind === "exit") kind = "door";
    var scene = scenes[kind] || scenes.invitation;
    return svg("briefing-art w-pic",scene.label,"0 0 360 240",scene.paints,function (fill) { return scene.draw(fill,value); });
  }

  return { bag:bag, bigCoin:bigCoin, wordmark:wordmark, imprint:imprint, briefing:briefing };
})();

// The Four Wings components take match data from their caller. Only wings that
// have been revealed are printed into the plan and joined in the observatory.
window.DP_ART.fourWings = (function () {
  "use strict";

  var wings = ["north", "east", "south", "west"];
  var names = ["North", "East", "South", "West"];
  var pencils = ["A", "B", "C", "D"];
  var colors = ["#e9bd72", "#a8cab0", "#b8cbdd", "#d8a38a"];
  var starPositions = [
    [363, 80], [106, 68], [310, 201], [53, 123],
    [91, 232], [305, 132], [407, 219], [171, 276],
    [164, 106], [152, 196], [393, 143], [354, 266],
    [447, 264], [201, 49], [452, 90], [62, 307]
  ];

  function text(value) {
    return String(value == null ? "" : value).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  function number(n) {
    return Number.isInteger(n) && n >= 1 && n <= 16;
  }

  function padded(n) {
    return String(n).padStart(2, "0");
  }

  function visibleCount(count) {
    return Math.min(4, Math.max(0, Math.floor(Number(count) || 0)));
  }

  function wingMembers(groups, key) {
    var values = groups && groups[key];
    return Array.isArray(values) ? values.filter(number).slice(0, 4) : [];
  }

  function svgStart(viewBox, className, label) {
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="' + viewBox +
      '" class="' + className + '" role="img" aria-label="' + text(label) + '">';
  }

  function postSeal() {
    return window.DP_ART.imprint();
  }

  function bed(x, y) {
    return '<g transform="translate(' + x + ' ' + y + ')" class="fw-bed">' +
      '<rect x="1" y="3" width="32" height="43" rx="5" style="fill:#1e302a;stroke:none"/>' +
      '<rect width="32" height="43" rx="5"/><rect x="4" y="3" width="24" height="9" rx="3" style="fill:#c7c9b0;stroke:none"/>' +
      '<path d="M2 17h28" fill="none" stroke-linecap="round"/></g>';
  }

  function roomDraw(angle, active, newest, members) {
    var centers = [[194,65],[284,65],[194,120],[284,120]];
    var out = '<g class="fw-wing' + (active ? ' is-lit' : '') + (newest ? ' fw-new-light' : '') + '" transform="rotate(' + angle + ' 256 256)">' +
      '<path class="fw-slab" d="M184 42h144q12 0 12 12v105q0 12-12 12h-51v36l-10 9h-22l-10-9v-36h-51q-12 0-12-12V54q0-12 12-12z"/>' +
      '<path class="fw-plaster" d="M184 47h144q7 0 7 7v104q0 7-7 7h-58v41h-28v-41h-58q-7 0-7-7V54q0-7 7-7z"/>' +
      '<path class="fw-hallway" d="M243 48h26v157h-26z"/>' +
      '<path class="fw-partition" d="M178 112h63m29 0h63M241 48v19m0 27v30m0 27v14M271 48v19m0 27v30m0 27v14" fill="none" stroke="var(--fw-plan-wall)" stroke-width="2.7"/>' +
      '<path class="fw-window" d="M194 43h33m59 0h33" stroke-linecap="round"/>';
    centers.forEach(function (point,i) {
      out += bed(point[0],point[1]-10);
      if (active && members[i]) {
        var cx=point[0]+16, cy=point[1]+16;
        out += '<g transform="rotate(' + (-angle) + ' ' + cx + ' ' + cy + ')">' +
          '<rect class="fw-bed-plaque" x="' + (cx-13) + '" y="' + (cy-11) + '" width="26" height="23" rx="4"/>' +
          '<text class="fw-bed-number" style="font-size:19px" x="' + cx + '" y="' + (cy+7) + '">' + padded(members[i]) + '</text></g>';
      }
    });
    return out + '</g>';
  }

  function plan(groups, count) {
    var shown = visibleCount(count);
    var out = svgStart("0 0 512 512", "fw-plan", "Four bedrooms in each of the North, East, South and West wings. " + shown + " wings revealed.");
    wings.forEach(function (wing,i) {
      out += roomDraw(i*90,i<shown,i===shown-1,i<shown?wingMembers(groups,wing):[]);
    });
    out += '<g class="fw-vestibule"><path d="M229 201h54q8 0 14 7l8 8q6 5 6 14v53q0 8-7 14l-8 8q-6 7-14 7h-52q-8 0-14-7l-9-8q-6-6-6-14v-53q0-9 7-15l8-7q5-7 13-7z"/>' +
      '<svg x="221" y="230" width="70" height="51" viewBox="0 0 76 56" aria-hidden="true" style="color:#c4b88c">' +
      '<path style="fill:currentColor;stroke:none" d="M5 14 34 21 65 4 53 24 73 19 58 32 44 35 32 49 30 36 12 39 21 30Z"/></svg></g>';
    var labels = [[256,25,0],[490,256,90],[256,488,0],[22,256,-90]];
    labels.forEach(function (p,i) {
      out += '<text class="fw-wing-name' + (i<shown?' is-lit':'') + '" x="' + p[0] + '" y="' + p[1] + '" transform="rotate(' +
        p[2] + ' ' + p[0] + ' ' + p[1] + ')">' + names[i].toUpperCase() + '</text>';
    });
    return out + '</svg>';
  }

  // The removable model sits on the existing stage, clear of its lip and stairs.
  function arenaOverlay(groups, count) {
    var out='<g class="fw-stage-insert"><rect x="394" y="473" width="712" height="335" rx="12" fill="#182720"/>' +
      '<rect x="394" y="468" width="712" height="332" rx="12" fill="#2d4036" stroke="#9e9b78" stroke-width="3"/>';
    var drawing=plan(groups,count);
    var inner=drawing.slice(drawing.indexOf(">")+1,drawing.lastIndexOf("</svg>"));
    return out + '<g class="fw-plan" transform="translate(435 482) scale(1.23 .60)">' + inner + '</g></g>';
  }

  function constellationLine(members) {
    if (!members.length) return "";
    var remaining = members.map(function (n) { return starPositions[n - 1]; });
    remaining.sort(function (a, b) { return a[0] - b[0]; });
    var ordered = [remaining.shift()];
    while (remaining.length) {
      var from = ordered[ordered.length - 1];
      remaining.sort(function (a, b) {
        return Math.hypot(a[0] - from[0], a[1] - from[1]) - Math.hypot(b[0] - from[0], b[1] - from[1]);
      });
      ordered.push(remaining.shift());
    }
    return ordered.map(function (p) { return p.join(","); }).join(" ");
  }

  function sky(groups, count) {
    var shown = visibleCount(count);
    var lit = {};
    var out = svgStart("0 0 512 360", "fw-sky-chart", "Sixteen numbered stars. " + shown + " wing constellations joined.");
    out += '<path d="M20 330q231-58 472 0" fill="none" stroke="#62766b" stroke-width="1" opacity=".42"/>';
    wings.slice(0, shown).forEach(function (wing, i) {
      var members = wingMembers(groups, wing);
      members.forEach(function (n) { lit[n] = colors[i]; });
      if (members.length > 1) out += '<polyline class="fw-constellation' + (i === shown - 1 ? ' fw-new-light' : '') + '" points="' + constellationLine(members) + '" stroke="' + colors[i] + '"/>';
    });
    starPositions.forEach(function (p, i) {
      var n = i + 1;
      out += '<g class="fw-star' + (lit[n] ? ' is-lit' : '') + '" transform="translate(' + p[0] + ' ' + p[1] + ')"' +
        (lit[n] ? ' style="color:' + lit[n] + '"' : '') + '><title>Player ' + n + '</title>' +
        '<path d="m0-7 2 5 4.5 2L2 2 0 7-2 2-6.5 0-2-2Z"/>' +
        '<text x="10" y="7">' + padded(n) + '</text></g>';
    });
    return out + '</svg>';
  }

  function clueCard(fact, options) {
    options = options || {};
    return '<article class="fw-clue' + (options.shown ? ' fw-shown' : '') + '">' +
      '<div class="fw-card-meta"><span>Clue ' + text(fact.id) + '</span>' + postSeal() + '</div>' +
      '<p>' + text(fact.text) + '</p><footer>' +
      (options.shown ? '<span class="fw-stamp">Verified by GM</span>' : '<span class="fw-signature">GM</span>') + '</footer></article>';
  }

  function notebook(assignments, pencil, self) {
    assignments = assignments || {};
    if (pencils.indexOf(pencil) === -1) pencil = "A";
    var out = '<fieldset class="fw-pencils"><legend>Mark a group</legend>';
    pencils.forEach(function (group) {
      out += '<label><input type="radio" name="fw-pencil" value="' + group + '" ' + (pencil === group ? 'checked' : '') +
        '><span><i class="fw-group-mark fw-mark-' + group + '" aria-hidden="true"></i>Group ' + group + '</span></label>';
    });
    out += '</fieldset><div class="fw-seats" role="group" aria-label="Notebook players">';
    for (var n = 1; n <= 16; n++) {
      var group = pencils.indexOf(assignments[n]) < 0 ? "" : assignments[n];
      out += '<button type="button" class="fw-seat' + (group ? ' marked' : '') + '" data-fw-note="' + n +
        '" aria-pressed="' + (pencil === group) + '" aria-label="Player ' + n + (n === self ? ', you' : '') +
        ', ' + (group ? 'Group ' + group : 'unmarked') + '">' +
        '<b>' + padded(n) + '</b><small>' + (group ? '<i class="fw-group-mark fw-mark-' + group + '" aria-hidden="true"></i>' + group : (n === self ? 'You' : '—')) + '</small></button>';
    }
    return out + '</div>';
  }

  function answer(selected, self, sealed) {
    selected = (Array.isArray(selected) ? selected : []).filter(function (n, i, arr) {
      return number(n) && n !== self && arr.indexOf(n) === i;
    }).slice(0, 3);
    if (sealed && selected.length === 3) {
      return '<article class="fw-envelope"><span class="fw-fold"></span><header>' + postSeal() +
        '<strong>Answer sealed</strong></header><div class="fw-locked-players">' +
        selected.map(function (n) { return '<span><small>Player</small>' + padded(n) + '</span>'; }).join('') + '</div></article>';
    }
    var out = '<div class="fw-answer-count">' + selected.length + ' of 3 chosen</div><div class="fw-seats fw-answer-seats" role="group" aria-label="Choose three other players">';
    for (var n = 1; n <= 16; n++) {
      var on = selected.indexOf(n) >= 0;
      out += '<button type="button" data-fw-pick="' + n + '" class="fw-seat' + (on ? ' chosen' : '') + '" aria-pressed="' + on +
        '" aria-label="Player ' + n + (n === self ? ', you' : '') + '"' + ((n === self || (!on && selected.length === 3)) ? ' disabled' : '') +
        '><b>' + padded(n) + '</b><small>' + (on ? 'Selected' : n === self ? 'You' : '') + '</small></button>';
    }
    return out + '</div><button class="fw-action fw-seal-button" type="button" data-fw-seal' + (selected.length !== 3 ? ' disabled' : '') + '>Seal answer</button>';
  }

  return { plan: plan, arenaOverlay: arenaOverlay, sky: sky, clueCard: clueCard, notebook: notebook, answer: answer };
})();
