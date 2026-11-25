// Dark Post • Undercover agents. The portrait and the walking figure share a single paper-doll model.
window.DP_AVATAR = (function () {
  var uid = 0;

  var SKIN = ["#F7DCC4", "#EBC19C", "#D9A577", "#BD7F54", "#8F5A30", "#5E3B22"];
  var HAIR = ["#16110E", "#3A2416", "#6B4423", "#A3522A", "#D8B46A", "#B5B8BE", "#F0EEE8", "#C85A7C", "#3C6FB4"];
  var COAT = ["#E0B040", "#B33A3A", "#2F8F83", "#3C6FB4", "#7A5AB5", "#4E8B4A", "#D9772B", "#E8E4DA", "#4A4E57"];

  // How many options each choice has. The server holds the same table.
  // Saved appearance indices are shared with the live game and host console.
  var LIMITS = { s: 6, h: 24, c: 9, g: 4, b: 5, m: 4, o: 9, t: 4, x: 9, e: 2, f: 2 };

  // Twenty-four ready-made characters: twelve women, then twelve men.
  var PRESETS = [
    { s: 1, h: 4, c: 0, e: 1, m: 3, x: 5, o: 1, t: 0 },
    { s: 0, h: 5, c: 3, e: 1, m: 0, g: 1, o: 4, t: 3 },
    { s: 4, h: 6, c: 0, e: 1, m: 3, x: 5, o: 0, t: 0 },
    { s: 3, h: 10, c: 7, e: 1, m: 0, o: 7, t: 3 },
    { s: 1, h: 17, c: 8, e: 1, m: 2, x: 4, o: 2, t: 2 },
    { s: 2, h: 15, c: 1, e: 1, m: 0, x: 7, o: 5, t: 0 },
    { s: 0, h: 16, c: 6, e: 1, m: 3, g: 3, o: 8, t: 1 },
    { s: 1, h: 8, c: 4, e: 1, m: 0, o: 6, t: 2 },
    { s: 5, h: 18, c: 0, e: 1, m: 3, o: 3, t: 0 },
    { s: 4, h: 19, c: 1, e: 1, m: 0, x: 8, o: 2, t: 3 },
    { s: 1, h: 9, c: 5, e: 1, m: 1, g: 2, o: 7, t: 0 },
    { s: 2, h: 7, c: 7, e: 1, m: 2, x: 5, o: 4, t: 2 },

    { f: 1, s: 1, h: 20, c: 1, b: 4, m: 1, o: 3, t: 1 },
    { f: 1, s: 2, h: 14, c: 0, m: 2, g: 3, o: 1, t: 0 },
    { f: 1, s: 4, h: 0, c: 0, b: 2, m: 1, o: 8, t: 3 },
    { f: 1, s: 2, h: 11, c: 8, b: 2, m: 0, o: 0, t: 0 },
    { f: 1, s: 5, h: 21, c: 0, m: 0, g: 2, o: 5, t: 2 },
    { f: 1, s: 0, h: 13, c: 8, b: 4, m: 2, o: 8, t: 2 },
    { f: 1, s: 1, h: 1, c: 1, b: 1, m: 1, x: 1, o: 7, t: 1 },
    { f: 1, s: 0, h: 22, c: 2, b: 3, m: 1, o: 2, t: 0 },
    { f: 1, s: 3, h: 23, c: 0, b: 4, m: 0, x: 2, o: 6, t: 2 },
    { f: 1, s: 5, h: 19, c: 0, b: 2, m: 0, o: 4, t: 3 },
    { f: 1, s: 1, h: 23, c: 5, b: 1, m: 1, g: 2, o: 5, t: 1 },
    { f: 1, s: 2, h: 12, c: 0, b: 4, m: 1, x: 6, o: 8, t: 2 },
  ];

  function int(v, max) {
    v = Math.floor(Number(v));
    return v >= 0 && v < max ? v : 0;
  }

  // Keep only what a character can hold. Anything odd falls back to the first option.
  function clean(a) {
    a = a || {};
    var out = {};
    for (var k in LIMITS) out[k] = int(a[k], LIMITS[k]);
    return out;
  }

  function random() {
    function pick(n) { return Math.floor(Math.random() * n); }
    var p = clean(PRESETS[pick(PRESETS.length)]);
    p.s = pick(LIMITS.s);
    p.c = pick(LIMITS.c);
    p.o = pick(LIMITS.o);
    return p;
  }

  var INK = "#27282D";
  var NIGHT = "#252B35";
  var IVORY = "#FFF2D4";
  var BRASS = "#DABC79";

  function mix(a, b, ratio) {
    var start = parseInt(a.slice(1), 16), end = parseInt(b.slice(1), 16);
    return "#" + [16, 8, 0].map(function (shift) {
      var v = (start >> shift) & 255, w = (end >> shift) & 255;
      return ("0" + Math.round(v * (1 - ratio) + w * ratio).toString(16)).slice(-2);
    }).join("");
  }

  function escape(value) {
    return String(value).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
  }

  // A few solid fills and broad highlights keep the miniature readable on the room floor.
  function shape(d, fill, edge, width) {
    return '<path d="' + d + '" fill="' + fill + '"' +
      (edge ? ' stroke="' + edge + '" stroke-width="' + (width || 1.5) + '" stroke-linejoin="round"' : "") + '/>';
  }
  function line(d, ink, width) {
    return '<path d="' + d + '" fill="none" stroke="' + ink + '" stroke-width="' + width + '" stroke-linecap="round" stroke-linejoin="round"/>';
  }
  function oval(x, y, rx, ry, fill) {
    return '<ellipse cx="' + x + '" cy="' + y + '" rx="' + rx + '" ry="' + ry + '" fill="' + fill + '"/>';
  }
  function plate(x, y, width, height, r, color) {
    return '<rect x="' + x + '" y="' + y + '" width="' + width + '" height="' + height + '" rx="' + r + '" fill="' + color + '"/>';
  }
  function colors(a) {
    var s = SKIN[a.s], h = HAIR[a.c], coat = COAT[a.o];
    var cloth = mix(coat, a.o === 7 ? "#ABB0AE" : "#747B7B", .32);
    return {
      face: mix(s, "#F3C6AB", .10), faceLight: mix(s, "#FFEAD0", .27),
      cheek: mix(s, "#E38780", a.s > 3 ? .45 : .57), shade: mix(s, "#AE6A62", .40),
      outline: mix(s, "#422E35", .67), nose: mix(s,"#AD6A54",.62),
      line: a.s > 3 ? "#392C31" : "#46342F", hair: mix(h, "#3E3B40", .17),
      hairLow: mix(h, "#1D222C", .48), hairHi: mix(h, "#DDD1BA", .24),
      coat: cloth, coatHi: mix(cloth,"#F5E5C8",.32), coatLo: mix(cloth,"#29353F",.35),
      coatInk: mix(cloth,"#17232C",.66), portrait: mix(cloth,"#B5B6A9",.63),
      portraitLow: mix(cloth,"#7D8C8C",.55)
    };
  }
  function paints(id, c) {
    function ramp(name, a, b, x2, y2) {
      return '<linearGradient id="' + id + name + '" x1="0" y1="0" x2="' + x2 + '" y2="' + y2 + '"><stop stop-color="' + a + '"/><stop offset="1" stop-color="' + b + '"/></linearGradient>';
    }
    return '<defs>' + ramp("skin",c.faceLight,c.face,".8","1") + ramp("wool",c.coatHi,c.coat,".48","1") +
      ramp("hair",mix(c.hair,c.hairHi,.28),c.hairLow,".85","1") + ramp("field",c.portrait,c.portraitLow,".8","1") + '</defs>';
  }
  function paint(id, name) { return "url(#" + id + name + ")"; }

  // Each cut has a distinct outline. Rear silhouettes appear behind the coat; front cuts
  // leave a clear oval for the eyes. The few graphic highlights describe direction and volume.
  var CUTS = [
    {}, // Shaved
    { // Short crop
      front:"M22 55C20 31 35 18 58 18C80 16 98 29 98 50L93 56Q91 45 84 38Q67 45 46 39Q31 39 26 56Z",
      glint:"M28 40Q37 22 57 22Q41 25 34 38Z"},
    { // Side part
      front:"M22 66C14 42 23 23 48 16Q61 9 74 17C93 18 102 35 98 55L94 61Q91 41 78 32Q63 46 41 45L30 64L27 68Z",
      glint:"M27 41C31 27 47 20 61 20Q45 25 35 39Z"},
    { // Soft fringe
      front:"M22 63C15 44 20 25 37 19Q51 9 69 16Q89 13 98 35Q102 45 96 61L91 58Q89 47 83 41L73 46L69 40Q59 49 50 48L51 42Q42 49 35 48L29 64Z",
      glint:"M27 37Q35 23 51 21Q42 25 35 35Z"},
    { // Long curtain
      back:"M25 39C29 11 88 8 98 38Q102 49 98 70Q94 86 103 102Q88 108 77 99Q62 106 46 102Q31 110 16 102Q25 88 22 73Q18 55 25 39Z",
      front:"M22 68C13 38 27 16 52 14Q65 6 79 17Q103 25 100 53Q100 63 94 74L90 71Q92 47 72 31Q61 43 46 49L46 44Q38 51 31 51L27 72Z",
      glint:"M24 46Q27 25 52 19L61 18Q42 24 31 43Z", seam:"M78 22Q91 30 94 44"},
    { // French bob
      back:"M20 38Q27 13 56 13Q91 10 99 40Q105 60 100 83L105 91Q94 96 82 91Q58 99 35 92Q22 97 15 91L20 80Q15 56 20 38Z",
      front:"M21 77C13 50 17 26 38 17Q55 6 72 14Q96 17 100 43L101 70L94 78L89 46Q83 42 77 39L76 44L63 42L62 46Q53 45 49 42L47 46L35 43L30 75L26 79Z",
      glint:"M23 41Q27 24 47 20Q36 25 31 40Z", seam:"M63 20Q72 26 75 35"},
    { // Cloud of curls
      back:"M22 74Q11 72 15 61Q7 54 14 45Q9 35 18 30Q16 17 29 17Q32 7 43 10Q51 0 61 8Q72 2 79 11Q92 8 96 19Q108 21 104 33Q113 40 106 49Q114 58 104 66Q107 77 95 80Q60 93 22 74Z",
      front:"M19 56Q11 49 17 42Q13 34 22 29Q20 19 31 20Q34 11 44 15Q50 7 59 13Q69 7 76 15Q86 11 90 21Q101 21 98 31Q107 35 100 45Q104 53 94 59L90 53Q88 45 80 44Q74 48 68 42Q60 49 54 43Q45 49 39 43Q33 49 28 47L26 57Z",
      glint:"M18 36Q18 29 27 28Q24 21 34 22Q37 14 44 18Q37 20 35 26Q28 26 27 32Q22 31 18 36Z"},
    { // Twisted topknot
      back:"M43 22Q31 16 37 8Q40 2 48 4Q54 -2 62 3Q70 0 76 7Q83 16 73 25Z",
      front:"M23 62C15 39 25 22 46 17Q64 10 79 19Q99 24 98 48L94 61Q91 43 79 34Q69 43 53 44Q43 45 34 42L27 62Z",
      glint:"M26 40Q34 23 53 21Q41 27 34 38Z",seam:"M52 37Q72 33 76 23"},
    { // Ponytail
      back:"M81 31Q87 15 99 21Q114 26 112 45Q110 59 105 69Q100 80 105 87Q88 82 85 70Q81 59 87 46Z",
      front:"M23 62Q15 41 26 27Q42 8 65 13Q87 13 95 29Q101 42 96 58L92 62Q91 44 80 33Q67 46 48 45L34 45L28 62Z",
      glint:"M26 41Q33 24 54 20Q40 27 34 39Z",seam:"M86 26Q91 30 95 38"},
    { // Waves down to collar
      back:"M22 37Q28 14 54 13Q86 9 98 33Q105 47 99 61Q105 71 99 81Q107 94 99 102Q86 112 76 101Q65 108 54 101Q43 110 32 103Q19 107 15 98Q10 88 19 78Q13 69 19 58Q14 48 22 37Z",
      front:"M22 68Q13 44 23 29Q32 14 52 13Q64 4 77 15Q100 19 102 40Q103 57 96 66L91 64Q95 49 80 35L74 31Q60 52 37 46L29 63L27 72Z",
      glint:"M25 42Q29 24 51 19Q42 23 34 35Z",seam:"M78 21Q88 24 94 38"},
    { // Wrapped headscarf
      back:"M18 53Q17 22 47 15Q72 7 91 23Q105 36 101 61L102 82L111 101Q102 110 87 109L43 106Q25 109 14 104Q23 83 18 53Z",
      front:"M18 64Q13 39 26 24Q39 8 63 11Q91 9 99 37Q106 51 98 69Q91 74 88 75Q92 62 92 53Q86 42 77 35Q55 42 36 47Q27 57 29 72L25 78Z",
      glint:"M23 51Q24 28 47 18Q58 14 70 16Q40 21 29 47Z",seam:"M32 48Q48 37 70 32"},
    { // Brushed pompadour
      front:"M22 60Q13 41 22 28Q26 17 42 16Q44 8 56 9Q67 4 79 10Q94 11 99 26Q105 44 97 58L92 60Q92 46 85 39Q71 44 57 38Q46 48 33 44L27 62Z",
      glint:"M25 34Q31 22 41 22Q48 12 62 14Q43 19 35 32Z",seam:"M56 30Q71 24 85 30"},
    { // Tucked hood
      back:"M15 94Q9 74 16 48Q22 17 53 10L63 8Q92 17 103 42Q111 66 104 91L96 104Q77 111 61 106Q39 111 15 99Z",
      front:"M23 62Q17 37 34 24Q49 13 63 18Q86 16 97 37L95 59L91 63Q89 46 79 40Q67 48 60 44L57 39Q48 48 36 46L28 63Z",
      glint:"M27 43Q32 30 45 25Q35 32 33 42Z"},
    { // Rounded crest
      front:"M22 61Q19 42 31 30Q38 21 48 22Q45 14 53 13Q50 6 59 8Q64 0 69 7Q79 7 75 17Q83 16 82 24Q97 31 98 50L93 61Q90 45 80 39L69 37Q60 42 49 36Q33 39 28 60Z",
      glint:"M51 28Q51 17 58 17Q56 12 63 12L65 11Q67 19 62 25Z"},
    { // High quiff
      front:"M22 64C15 48 19 32 33 26Q30 14 44 16Q52 5 63 12Q77 4 85 16Q99 19 98 33Q103 48 96 60L91 60Q90 45 82 39Q62 45 48 38Q42 44 35 43L28 63Z",
      glint:"M26 37Q31 28 39 26Q36 20 44 20Q52 13 60 16Q47 20 44 26Q34 30 31 37Z"},
    { // Braided and tied
      front:"M22 63Q14 37 30 23Q42 10 61 14Q78 9 92 25Q103 40 98 59L93 64Q91 46 79 34Q61 45 42 44L32 49L28 66Z",
      glint:"M25 41Q32 24 50 20Q40 25 32 38Z"},
    { // Tousled pixie
      front:"M23 65Q14 52 18 36L15 33Q20 29 27 28Q23 22 27 20Q35 20 40 19Q46 10 59 13Q77 7 88 21Q95 22 102 31L97 33Q104 41 101 51L95 48L94 62L88 51L84 41L71 46L67 39Q58 49 49 49L50 43Q41 51 34 48L27 65Z",
      glint:"M24 39Q29 24 43 23L51 20Q38 29 34 37Z"},
    { // Twin buns
      back:"M42 33Q26 33 19 24Q12 12 23 7Q31 -1 41 5Q51 9 52 21L73 20Q70 9 81 5Q90 -1 98 7Q108 13 102 24Q97 32 81 35Z",
      front:"M22 64Q15 44 24 29Q36 13 56 15Q78 10 93 27Q102 38 98 57L93 63L88 43L78 40L77 44L61 42L57 46L50 41L46 45L36 43L28 63Z",
      glint:"M26 40Q32 25 47 22Q37 28 34 39Z"},
    { // Long curls
      back:"M22 31Q23 18 37 16Q42 7 53 11Q66 3 76 12Q90 10 94 22Q105 24 102 36Q111 41 105 52Q112 60 105 71Q113 78 104 89Q112 103 96 108Q86 117 75 107Q60 113 50 106Q35 116 26 107Q13 108 14 95Q7 87 16 76Q7 66 15 56Q9 47 18 40Q14 34 22 31Z",
      front:"M20 63Q12 55 17 45Q13 36 23 30Q22 22 32 21Q40 12 48 17Q55 8 63 15Q75 9 81 19Q91 17 94 27Q105 29 101 40Q107 48 99 57L96 65L91 60Q88 55 87 48Q77 47 74 40Q64 50 57 43Q48 51 42 44L34 49Q29 52 28 64Z",
      glint:"M20 42Q20 35 28 32Q25 26 35 25Q37 18 44 20L38 26Q33 29 32 34Q25 35 20 42Z"},
    { // Locs
      front:"M22 63Q17 51 19 36Q22 18 43 15Q62 7 78 16Q96 18 100 37Q103 49 97 61L93 63L90 50Q84 50 82 43Q78 48 72 44L68 38Q61 48 55 44L52 39Q47 47 40 45L36 42L29 59L27 65Z",
      glint:"M24 38Q25 26 38 21Q30 29 29 37Z",seam:"M37 35Q40 25 49 20 M56 33Q59 22 66 19 M79 37Q83 29 79 23"},
    { // Crew cut
      front:"M22 61Q18 41 29 30Q40 17 60 18Q83 15 94 32Q101 41 98 56L93 61Q91 47 83 37Q62 41 41 36Q30 41 27 60Z",
      glint:"M29 38Q38 24 56 22Q43 28 35 37Z"},
    { // Flat top
      front:"M22 62Q18 48 23 39L22 24Q22 16 30 16Q34 12 40 15Q46 10 53 13Q60 9 67 12Q74 8 81 13Q91 11 95 19L96 35Q102 48 97 60L92 63Q90 47 84 39Q64 39 48 37Q39 36 32 40L27 61Z",
      glint:"M26 29L26 23Q28 18 35 19Q40 15 47 18Q51 15 59 15Q46 19 39 22Q31 21 26 29Z"},
    { // Swept waves
      front:"M22 63Q15 44 23 31Q28 18 41 19Q50 8 64 12Q80 9 88 21Q100 25 100 40L97 60L92 63Q90 45 80 37L71 40L64 37Q56 44 46 41Q38 47 33 46L28 63Z",
      glint:"M24 40Q30 27 41 24Q46 18 55 17Q44 23 40 30Q30 34 29 40Z",seam:"M48 35Q56 24 69 20"},
    { // Curly taper
      front:"M22 64Q18 51 22 40Q18 32 26 29Q24 20 34 19Q39 12 47 16Q53 8 62 14Q73 8 79 16Q89 12 93 22Q104 23 99 34Q104 44 99 58L94 65L90 49Q82 48 79 41Q70 46 64 41Q54 47 48 41Q40 46 34 43L28 62Z",
      glint:"M25 35Q22 29 31 28Q29 22 37 22Q41 17 46 19L39 24Q34 25 33 30Q28 30 25 35Z"}
  ];
  function hairParts(a, c, id) {
    var cut = CUTS[a.h], color = paint(id,"hair");
    var back = cut.back ? shape(cut.back,a.h === 12 ? c.coatLo : c.hairLow,c.hairLow,1.1) : "";
    var over = "";
    if (a.h === 12) {
      back += shape("M21 87Q18 59 30 38Q42 22 62 14Q88 25 98 51Q105 75 96 95Q79 105 59 101Q38 106 21 96Z",NIGHT) +
        line("M19 64Q20 34 43 20",c.coatHi,2.4);
    }
    if (a.h === 15 || a.h === 19) {
      var braided = a.h === 15;
      var strands = braided ? [[27,56,90],[92,56,90]] : [[26,45,88],[31,44,95],[37,42,90],[82,41,89],[89,41,96],[95,46,87]];
      strands.forEach(function (strand) {
        var x = strand[0], y = strand[1], end = strand[2], side = x < 60 ? -1 : 1;
        var drawing = "", bottom = x + side * 4;
        if (braided) {
          drawing += line("M"+x+" "+y+"q"+(side*5)+" 12 "+(side*3)+" 25",c.hairLow,10);
          for (var top = y + 13; top < end; top += 6) {
            drawing += oval(bottom,top,4.8,5.4,c.hair);
            drawing += line("M"+(bottom-2)+" "+(top-1.4)+"q.3 -1.3 2 -2",c.hairHi,.85);
          }
          drawing += plate(bottom-3.5,end,7,3,1.4,BRASS) + shape("M"+(bottom-2.4)+" "+(end+2)+"q-2 4 2 8q4-4 2.4-8Z",c.hair);
          over += drawing;
        } else {
          drawing += line("M"+x+" "+y+"q"+(side*4)+" 15 "+(side*2)+" 26t"+(side*2)+" "+(end-y-26),c.hairLow,6.7);
          drawing += line("M"+(x-.7)+" "+(y+4)+"q"+(side*3)+" 8 "+side+" 18",c.hairHi,.95);
          if (x === 31 || x === 89) drawing += plate(bottom-3.2,end-5.5,6.4,2.6,1,BRASS);
          back += drawing;
        }
      });
    }
    var front = cut.front ? shape(cut.front,color,c.hairLow,1.2) : "";
    if (cut.glint) front += shape(cut.glint,c.hairHi);
    if (cut.seam) front += line(cut.seam,c.hairHi,1.45);
    return {back:back,front:front,over:over};
  }

  function eye(x, y, a, c, left) {
    var width = a.f ? 4.2 : 4.8, height = a.f ? 5.2 : 5.8;
    var gaze = a.m === 1 ? 1 : a.m === 2 ? -.65 : 0;
    var o = oval(x,y+.4,width+.4,height+.5,mix(c.face,c.shade,.66)) +
      oval(x+gaze,y,width,height,INK) +
      oval(x+gaze-.85,y-2.4,1.32,1.55,"#FFF4DA") +
      oval(x+gaze+1.15,y+2.4,.78,.56,"#AFA694");
    if (a.e) o += line(left ? "M40 53.5Q37.7 53.2 36.6 51.3" : "M81.2 52Q84 51.8 85.5 49.6",c.line,1.6);
    return o;
  }
  function facialHair(a,c) {
    var color = mix(a.c > 6 ? "#4B3B36" : c.hair,"#514445",.20);
    var out = "";
    if (a.b === 2) {
      out += shape("M25 65Q30 72 36 72Q42 72 48 77Q49 71 55 71Q61 73 66 70Q72 70 75 75Q88 71 95 63Q95 77 85 84Q74 93 60 93Q40 92 30 80Q25 74 25 65Z",color);
      out += shape("M45 79Q46 75 50 75Q59 77 65 73Q71 72 75 75Q73 81 67 83Q56 87 48 82Z",c.face);
    } else if (a.b === 4) {
      var stubble = [[37,76],[41,80],[45,82],[51,85],[57,87],[63,87],[69,85],[76,82],[81,79],[85,75]];
      stubble.forEach(function (point) { out += oval(point[0],point[1],.85,.85,mix(c.shade,color,.44)); });
    }
    if (a.b === 1 || a.b === 2 || a.b === 3) {
      out += shape("M49 72Q52 68 56.5 68.2Q60 68.5 61 71Q63 68.3 66 68Q70.5 67.4 74 70Q70.5 74.5 65.5 73.5Q62 73 61 71.6Q58 75.4 54 74.7Q50.5 74.4 49 72Z",color);
    }
    if (a.b === 3) out += shape("M52 83Q60 86 68 81Q68.8 87 63.5 90.7Q56.5 92 52 83Z",color);
    return out;
  }

  function face(a,c,id) {
    var facePath = a.f ?
      "M22 50C22 30 39 18 60 18C83 17 98 30 99 50L98 65Q97 80 84 87Q74 94 60 94Q44 94 35 87Q23 81 22 65Z" :
      "M23 52C21 32 37 18 59 18C82 16 98 30 98 50Q101 69 91 80Q81 93 62 94Q43 95 32 84Q22 75 23 62Z";
    var out = oval(23.3,61.7,8.1,9.1,c.shade) + oval(22.6,59.8,7.4,8,c.face) +
      oval(96.4,60.0,8,8.8,c.shade) + oval(96.6,58.5,7,7.7,c.face) +
      line("M19.9 61.6Q20.4 56.9 24 59.6 M95.7 58Q99.4 54.8 100.2 59.1",c.nose,1.4) +
      shape(facePath,paint(id,"skin"),c.outline,1.4) +
      shape(a.f ? "M25 69Q28 83 43 88Q73 101 93 75Q90 85 81 89Q67 97 51 92Q30 89 25 69Z" :
        "M26 73Q37 91 57 90Q80 93 94 72Q89 86 77 91Q58 98 42 89Q31 84 26 73Z",mix(c.face,c.shade,.58)) +
      oval(35.8,68.7,6.2,2.9,mix(c.face,c.cheek,.62)) + oval(85.8,66.9,6.0,2.7,mix(c.face,c.cheek,.6));
    var brow = mix(c.hair,"#3B3033",.45);
    out += line(a.f ? "M35.5 49.1Q42 44.6 50.1 48.6 M71.5 47.4Q78 42.7 85 46.4" :
      "M36.6 48.6Q42.6 43.7 49.8 47.7 M71.8 47Q78.5 41.9 85 45.6",brow,a.f ? 3.65 : 2.65);
    out += eye(44,57.8,a,c,true) + eye(77.5,56.3,a,c,false);
    out += oval(60.9,66.4,4.25,2.9,mix(c.shade,c.nose,.28)) +
      shape("M57.4 65.7Q58.2 62.4 61.2 62.8Q63.3 62.7 64.1 64.4Q60.8 66.7 57.4 65.7Z",mix(c.faceLight,c.cheek,.22));
    out += facialHair(a,c);
    var mouth = c.line;
    if (a.m === 0) out += line("M54.7 75Q60.3 80.3 67.6 73.4",mouth,1.8);
    if (a.m === 1) out += line("M55.1 75.7Q61.1 77.2 65.2 73.6",mouth,1.8) + oval(66.8,73,.6,.57,c.nose);
    if (a.m === 2) out += shape("M54.9 74.5Q61.2 76.5 68 72.8Q66.7 80.3 61.8 81.2Q57.1 80.9 54.9 74.5Z",mouth) +
      shape("M58.8 79.4Q61.9 77.3 65.5 78.3Q62.6 81.9 59.7 80.4Z","#CD8A82");
    if (a.m === 3) out += shape("M54.9 75.2Q58.3 73.4 61 74.2Q63.6 72.3 67.8 73.2Q63.5 79.8 59.2 78.6Q56.3 78.1 54.9 75.2Z",mix(c.nose,"#A34B63",.37)) +
      line("M56 75.7Q61.4 77.1 66.1 74.2",mix(mouth,c.nose,.23),1.07);
    if (a.h === 0 || a.h === 20) out += line("M31 40Q34 31 45 27",mix(c.faceLight,IVORY,.37),2.6);
    return out;
  }

  function glasses(kind,c) {
    if (!kind) return "";
    var frame = "#38414B", shine = "#D6C8A9";
    var out = line("M22.7 52L31.2 56.4 M57.4 55.3Q62 52.6 66.6 54.7 M88.9 53.8L97.4 48.9",frame,2.4);
    if (kind === 1) {
      out += '<g fill="none" stroke="'+frame+'" stroke-width="2.3"><ellipse cx="44.2" cy="57.4" rx="12.7" ry="11.2"/><ellipse cx="78.3" cy="55.7" rx="12.8" ry="11.1"/></g>' +
        line("M34.1 51.6Q37.4 47.4 43 47 M67.9 50.5Q71.4 45.6 76.1 45.4",shine,1.0);
    } else if (kind === 2) {
      out += '<g fill="none" stroke="'+frame+'" stroke-width="2.9"><path d="M30 51Q42 48 56.6 50L56.3 59Q55.9 66.4 49 67L40 67.7Q32.8 67.8 31.3 61Z"/><path d="M65.8 49.2Q78 46.1 92.8 47.8L91.1 58Q90.1 64 82.8 65.2L74.8 65.8Q67.6 65.8 66.5 59.6Z"/></g>' +
        line("M32.4 51.2L42 50 M68.4 49.1L78 48",shine,1);
    } else {
      out += '<g fill="#947452" fill-opacity=".29" stroke="'+frame+'" stroke-width="2.3"><path d="M29.7 50Q40.8 47.6 56.8 50L56.1 58Q55.2 65.7 48.2 66.8Q36 68.7 32.4 60.1Z"/><path d="M65.7 49.2Q77.5 45.5 93.4 47.2L91.8 55.2Q89.5 63.9 81.8 65.2Q71.5 67.2 67.2 59.4Z"/></g>' +
        line("M30.3 50.2Q43 47.7 56.7 50.4 M66.1 49Q79 45.9 93 47.3",frame,4) +
        line("M34.5 51.8L41.9 50.7 M70.2 50.3L77.2 48.8",shine,1.1);
    }
    return out;
  }

  function accessory(a,c) {
    switch (a.x) {
      case 1: // Soft-brim trilby
        return shape("M25 38L31 20Q33 13 39 14L51 17Q55 17 60 13L69 9Q77 6 81 14L92 33Q101 30 108 32Q112 36 98 41Q74 48 46 47Q24 48 14 43Q12 39 25 38Z",NIGHT,c.hairLow) +
          shape("M29 31Q56 36 87 23L92 34Q61 46 25 40Z",c.coat) + line("M19 41Q49 49 100 35","#ACB0AC",1.4) +
          line("M37 18Q46 22 51 21M74 13L79 19","#68727B",1.6);
      case 2: // Ribbed watch cap
        return shape("M22 48Q17 34 25 23Q35 7 51 9Q63 4 76 12Q95 16 99 35L101 44Q63 39 25 53Z",c.coat,c.coatInk) +
          shape("M19 43Q58 30 98 33L101 45Q60 41 23 55Q19 55 19 50Z",c.coatLo,c.coatInk,1.2) +
          line("M25 45L26 50 M33 42L34 47 M41 40L42 45 M50 38.2L51 43.2 M60 37L60.6 42 M70 36.3L70.6 40.7 M81 36L81.3 40.4 M91 36.6L91.4 41",c.coatHi,1.15) +
          line("M33 24Q40 16 51 15",c.coatHi,2);
      case 3: // Soft peaked cap
        return shape("M21 47Q18 34 25 25Q34 13 55 12Q81 8 92 26L99 37Q92 43 74 44L30 50Z",c.coat,c.coatInk) +
          shape("M48 41Q75 30 103 33Q114 34 109 39Q101 45 78 46L52 46Z",c.coatLo,c.coatInk,1.4) +
          line("M26 42Q39 35 52 34 M61 15Q56 20 55 28",c.coatHi,1.65);
      case 4: // Radio headset and tiny boom microphone
        return line("M19 57Q12 22 41 13Q68 3 88 21Q100 32 101 48",NIGHT,4) +
          line("M18 39Q23 19 42 14","#B0AFA0",1.3) +
          plate(15,52,10,14,4,NIGHT) + plate(94,49,11,16,4,NIGHT) +
          plate(97,52,4,8,2,c.coatHi) +
          line("M101 63Q100 73 89 75L82 76","#6D7678",2.2) + oval(81.4,76,3,2.2,NIGHT);
      case 5: // Miniature hoops
        return line("M21 66Q16 72 20 75Q25 78 27 72 M95 64Q91 71 95 72.4Q100 74 101 67",BRASS,2.2) +
          oval(20.2,70,1,1.2,IVORY) + oval(95,67,.8,.8,IVORY);
      case 6: // Single optical loupe
        return line("M90 54L99 50 M89 62Q97 73 94 82",BRASS,1.5) +
          '<ellipse cx="78" cy="56.2" rx="11.7" ry="10.6" fill="#87A39A" fill-opacity=".25" stroke="#8C7C58" stroke-width="2"/>' +
          line("M69.2 52.8Q72.8 47.1 77.7 46.6",IVORY,1.4);
      case 7: // Brass hair slides
        return line("M24.8 41.1L37.1 29.7 M25.7 46L38.9 34.3",c.hairLow,3.7) +
          line("M25 40.5L37 29.5 M26.3 45L38.3 33.5",BRASS,2.3) + oval(37.1,29.4,1.25,1.25,IVORY);
      case 8: // Knotted headband
        return shape("M21 47Q32 23 58 17Q82 12 97 31L98 37Q76 18 59 24Q34 29 24 51Z",c.coatHi,c.coatInk,1.2) +
          shape("M88 25Q85 13 88 11Q94 13 97 24Q102 15 108 16Q109 20 101 29Q106 31 106 34Q95 34 89 28Z",c.coat,c.coatInk,1.2) +
          oval(95.5,26.2,3.3,3,c.coatHi);
      default: return "";
    }
  }
  function leg(side,c) {
    var mark = side === "b" ? '<g transform="translate(120 0) scale(-1 1)">' : "<g>";
    return '<g class="leg leg-'+side+'">' + mark +
      shape("M40 126Q49 124 58 128L56 145Q55 150 52 151L40 151Q36 148 37 142Z","#3B4653",NIGHT,1.5) +
      shape("M40 131Q45 129 48 131L46 142Q45 146 40 147Z","#52606C") +
      shape("M38 145Q45 143 53 146L55 151Q56 155 52 157Q45 159 32 158Q27 157 28 153Q30 148 37 148Z","#303946","#212630",1.5) +
      shape("M28.8 153.3Q36 154.6 53.4 152.4L54.1 155.1Q52 158 35 157.6Q28 157.6 28.8 153.3Z","#777B7A") +
      line("M32.4 150.9Q34.9 148.7 39.3 148.7","#9B9D96",1.1) + '</g></g>';
  }
  function arm(side,a,c) {
    var mirrored = side === "b" ? '<g transform="translate(120 0) scale(-1 1)">' : "<g>";
    var broad = a.f ? -2 : 0;
    var tool = "";
    if (side === "b" && a.t === 1) {
      // The dispatch case is attached to the hand and follows its walking swing.
      tool = shape("M17.5 134L17.5 130.7Q17.6 127.7 21 127.7L27.1 127.7Q30.5 127.8 30.5 130.9L30.5 134","none",NIGHT,2.4) +
        shape("M12.4 132.3L34 132.3Q37 132.3 37.1 135.7L37.1 144.1Q37.1 147.1 34.1 147.3L12.5 147.3Q9.4 147.3 9.5 144L9.5 135.7Q9.5 132.4 12.4 132.3Z","#48545D",NIGHT,1.5) +
        line("M11.8 137.8Q22 140.8 35 137.2","#79837D",.9) + plate(21.6,137.3,3.8,3,1,BRASS);
    } else if (side === "a" && a.t === 3) {
      tool = line("M21.1 126.5L18.8 117.5",NIGHT,1.7) +
        shape("M18.5 126.6L25.2 125.1L28 138L20.4 139.5Q18.8 139.6 18.5 137.7L16.8 129.4Q16.4 127.2 18.5 126.6Z","#38454F",NIGHT,1.1) +
        line("M20.5 134.5L24.5 133.6 M21 136.4L24.8 135.6","#79847D",.8) + oval(21.6,128.4,.8,.8,BRASS);
    }
    return '<g class="arm arm-'+side+'">'+mirrored+'<g transform="translate('+broad+' 0)">' + tool +
      shape("M39.4 89.7Q32.6 88.6 27.8 98.1Q23.2 107.4 21.9 117.3Q21.3 121.6 26.2 123.5L31.6 124.3Q35.3 123.6 36.6 119.4L44.1 97.9Z",c.coatLo,c.coatInk,1.6) +
      shape("M29.7 99.1Q31.4 93.8 36.7 93Q34.5 100.2 31.7 104.6Q28.6 107.2 26.8 111.9Z",c.coat) +
      shape("M22.7 116Q27 117.7 34.7 119.1L33.8 124L27.7 126.1L21.5 122.3Z",a.t===2 ? NIGHT : c.coatInk) +
      shape("M22.7 122.6Q26.3 123.7 30.8 124Q32.3 126.1 30.8 129.7Q29.8 133.4 25.6 133.6Q20.3 133.1 19.7 128.7Q19 125.3 22.7 122.6Z",c.face,c.outline,1) +
      line("M22 126Q20.9 128.2 22.6 130",c.faceLight,1.3) +
      line("M23.1 118.9L30.6 121",c.coatHi,1.2) +
      '</g></g></g>';
  }
  function clothes(a,c,id) {
    var broad = a.f === 1;
    var torso = broad ? "M48 85Q38 84 30 90L29 103L33 116L31 132Q39 136 59 136Q82 136 90 132L87 114L91 101L89 91Q80 85 72 85Z" :
      "M49 85Q39 85 33 91L32 103L36 115L33 133Q43 136 59 136Q77 136 87 132L84 115L88 102L86 91Q76 85 71 85Z";
    var o = "";
    if (a.t === 0) {
      o += shape("M38 116Q59 123 81 116L90 138Q80 143 68 142L61 135L55 142Q43 143 29 138Z",c.coat,c.coatInk,1.5) +
        line("M61 131L58 139 M33 136Q40 139 47 139",c.coatLo,1.3);
    }
    o += shape(torso,paint(id,"wool"),c.coatInk,1.7);
    o += shape("M79 97Q80 106 77 118L77 130Q83 130 86 128L84 116L88 101Z",c.coatLo);
    if (a.t === 0) { // Belted trench coat, with a rain flap and brass hardware.
      o += shape("M28 91L28 78.5Q38 77.3 51.4 85.7L58.2 100.8L41.4 98Z",c.coatHi,c.coatInk,1.5) +
        shape("M92.3 89.7L91.8 76.8Q82.6 78 68.4 85.4L61.9 99.5L78.9 96.8Z",c.coatHi,c.coatInk,1.5) +
        shape("M43 85Q51 83 60 88Q69 82 76 85L67 101L59 104L48 98Z",NIGHT) +
        shape("M43 86L52 87L59.5 99L54 100L56 105L41 96L45 92L38 91Z",c.coatHi,c.coatLo,1.1) +
        shape("M74 85L65.5 88L60.7 99L65.2 100L63 104L79 94L74 91L81 89Z",c.coatHi,c.coatLo,1.1) +
        line("M38 106L45 107 M75 106L81 103.5",c.coatInk,1.5) +
        shape("M34 126Q55 129 85.3 124.7L85.6 128.9Q54 133 33.7 130.6Z",c.coatLo) +
        plate(55,127.7,9,4.8,1.25,BRASS) + plate(57,129,5,2.2,.55,c.coatInk) +
        oval(40.9,111.1,1.55,1.55,BRASS) + oval(79.5,110,1.55,1.55,BRASS) +
        oval(40.8,118.1,1.55,1.55,BRASS) + oval(79.6,117,1.55,1.55,BRASS);
    } else if (a.t === 1) { // Savile Row suit under a short agent's overcoat.
      o += shape("M46.5 86Q59.5 83.5 72 85L65 112L59 118L51 106Z","#E8DFCE") +
        shape("M56 92L60.2 89.6L64.4 92L62.2 96.8L65 109L60.5 114L56.1 109.2L58.4 96.7Z",NIGHT) +
        shape("M43.5 86L49 86L58.7 108L60 118L41 98L46 95L38 92Z",c.coatLo,c.coatInk,1) +
        shape("M74 85L69 85L62.4 106L60.8 117L80 96L74.7 93.8L81 89Z",c.coatLo,c.coatInk,1) +
        line("M39 125L47.5 123 M74.4 122.8L81.6 122.2 M78.2 103L83 102",c.coatInk,1.6) +
        line("M62 124L62.3 133",c.coatLo,1) + oval(61.9,128.3,1.35,1.35,BRASS);
    } else if (a.t === 2) { // Zip-up flight jacket and a slim cross-body strap.
      o += shape("M44 87Q50 84 58 88Q65 85 74 85L72 94L64 99L56 99L47 95Z",NIGHT) +
        shape("M43 87L50 86L59 95L55 100L45 95L40 91Z",c.coatLo) +
        shape("M73 85L67 86L60 95L64.2 99.4L75 94L79 89Z",c.coatLo) +
        line("M59.5 99L60 129",c.coatInk,1.7) +
        shape("M34.5 126Q54 129 85.2 125L85.8 130Q64 137 35 131.5Z",NIGHT) +
        shape("M78.4 90.3L82.7 93L43 130L36.6 128.3Z","#39454D") +
        line("M78.8 93.4L40.7 128","#828278",.8) +
        shape("M45.3 120.8L48.2 118.2L51.6 121.4L48.7 124Z",BRASS) +
        shape("M31.1 124.8L41.3 121.7Q44.4 121.3 45.4 124L47.6 131.6Q48 134.7 45.4 135.6L34.3 138.3Q30.4 138.8 29.8 135.3L28.5 128.1Q28.1 125.4 31.1 124.8Z","#47545A",NIGHT,1.35) +
        line("M30.5 128.1Q35.6 130.5 43.5 125.2","#A19D83",1);
    } else { // Field jacket over a ribbed turtleneck.
      o += shape("M47 85L52 81.5L67 81L73 84.7L72 94.4L64 100L54 100L46 94Z",NIGHT) +
        line("M51 89Q60 93 69 88 M51 92Q59 95.5 68 91.5","#616A71",1) +
        shape("M41 86L46.8 83L53 95L50 106L47.9 126.7L39.1 130L39.2 99.8Z",c.coatLo) +
        shape("M75 83L80.9 87.4L79 97.2L80.3 126.5L73.2 130.3L70.5 104.4L69 95Z",c.coatLo) +
        line("M39.3 117.8L45.9 116.1 M75.4 114.5L81 113.4 M39.5 121.2L45.3 120.3",c.coatInk,1.4) +
        plate(76.7,100,4.1,2,1,BRASS);
    }
    return o;
  }
  function numberPatch(number) {
    if (number == null) return "";
    return plate(43.7,104.5,32.6,21.1,5.4,NIGHT) +
      shape("M46.6 111Q46.6 107.2 50 107.2H69.7", "none", "#B4AC8A",.9) +
      '<text class="num" x="60.1" y="121.2" text-anchor="middle" font-family="Barlow Condensed,Arial Narrow,Arial,sans-serif" font-weight="700" font-size="'+
      (String(number).length > 1 ? 16 : 17) + '" fill="'+IVORY+'">'+escape(number)+'</text>';
  }
  function upper(a,c,id,number) {
    var h = hairParts(a,c,id);
    var wire = "";
    if ((a.t === 1 || a.t === 3) && a.x !== 4 && a.x !== 5) {
      wire = line("M98.4 63Q103.5 69.8 98.7 75.4Q94.4 80.6 86.6 82.9", "#9AA49D",1.8) +
        oval(98.4,61.8,2.6,3.5,NIGHT) + line("M98 60.4L98.7 62.2",BRASS,1);
    }
    return h.back + arm("a",a,c) + arm("b",a,c) + clothes(a,c,id) +
      h.over + face(a,c,id) + h.front + wire + glasses(a.g,c) + accessory(a,c) + numberPatch(number);
  }
  function draw(a,opts) {
    a = clean(a); opts = opts || {};
    var id = "av"+ ++uid, c = colors(a);
    var camera = a.h === 17 || a.h === 7 || a.x === 1 ? "translate(3.6 9.9) scale(.94)" : "translate(-3.6 -2.8) scale(1.06)";
    return '<svg viewBox="0 0 120 120" class="avatar" role="img" aria-label="'+escape(opts.label || "Player portrait")+'">' +
      paints(id,c)+'<defs><clipPath id="'+id+'window"><circle cx="60" cy="60" r="55.7"/></clipPath></defs>'+
      '<g clip-path="url(#'+id+'window)">'+oval(60,60,56,56,paint(id,"field"))+
      '<g transform="'+camera+'">'+upper(a,c,id,null)+'</g></g>'+
      '<circle cx="60" cy="60" r="56.7" fill="none" stroke="'+escape(opts.ring || "#D0BC8A")+'" stroke-width="'+escape(opts.ringWidth || 2.2)+'"/></svg>';
  }
  function sprite(a,number) {
    a = clean(a);
    var id = "av"+ ++uid, c = colors(a);
    return '<svg viewBox="0 0 72 124" class="sprite" aria-hidden="true">'+paints(id,c)+
      '<ellipse cx="36" cy="118" rx="22" ry="3.5" fill="#0B1117" opacity=".45"/>'+
      '<g transform="translate(-5.4 8.4) scale(.69)">'+leg("a",c)+leg("b",c)+
      '<g class="torso">'+upper(a,c,id,number)+'</g></g></svg>';
  }

  // Vacant seats share the stocky detective silhouette, with no identifying features.
  var vacantHead = "M22 54Q19 37 28 28L33 17Q34 13 40 14L50 18Q56 19 64 14Q73 7 79 14L88 30Q97 30 102 33Q106 37 95 41Q100 51 97 59Q101 65 96 70L91 73Q86 86 71 90L70 96Q60 103 48 96L47 90Q31 86 27 75Q18 74 17 66Q16 58 22 57Z";
  function silhouette() {
    var id = "av"+ ++uid;
    return '<svg viewBox="0 0 120 120" class="avatar empty" role="img" aria-label="Empty seat">'+
      '<defs><clipPath id="'+id+'window"><circle cx="60" cy="60" r="55.4"/></clipPath></defs>'+
      '<circle cx="60" cy="60" r="55.4" fill="#39434B"/><g clip-path="url(#'+id+'window)">'+
      shape("M22 122Q20 105 29 96Q41 88 57 87Q80 84 92 97Q99 104 99 122Z","#242D35")+
      shape(vacantHead,"#242D35") +line("M20 47Q53 51 95 38","#465057",1.4)+
      '</g><circle cx="60" cy="60" r="56.3" fill="none" stroke="#697073" stroke-width="1.7"/></svg>';
  }
  function shadow(number) {
    return '<svg viewBox="0 0 72 124" class="sprite" aria-hidden="true"><ellipse cx="36" cy="118" rx="19" ry="3.4" fill="#11181E" opacity=".52"/>'+
      '<g transform="translate(-5.4 8.4) scale(.69)">'+
      shape("M39 129H56L54 152Q57 159 34 158Q26 157 30 150L37 147Z M62 129H80L83 146L90 150Q95 158 85 158H68Q61 157 65 148Z","#202A32","#52606A",1.4)+
      shape("M32 91Q42 83 59 87Q78 83 87 90Q95 97 99 117Q99 129 88 130L83 126L87 132Q65 140 33 133L35 126Q27 135 21 129Q16 122 22 109Q25 96 32 91Z","#26313A","#53606A",1.4)+
      shape(vacantHead,"#253039","#53606A",1.5)+line("M20 47Q54 51 96 38","#556069",1.4)+
      (number==null?"":'<text class="num" x="60" y="121" text-anchor="middle" font-family="Barlow Condensed,Arial,sans-serif" font-weight="700" font-size="17" fill="#9AA2A1">'+escape(number)+'</text>')+
      '</g></svg>';
  }
  // The Executor: the GM's own figure in the estate. Not a player and not house staff.
  // A red-crowned crane mask of white porcelain, a short black topper with a crimson band and one white
  // feather, white gloves, a midnight tailcoat, and the brass key of the Crane estate where a number would be.
  var EXEC = {
    face: "#F4EFE2", faceLight: "#FFFFFF", cheek: "#E9E2D2", shade: "#CFC8B8", outline: "#3A3530", nose: "#B9B1A0", line: "#2A2622",
    hair: "#141217", hairLow: "#0B0A0D", hairHi: "#3A3640",
    coat: "#2B2733", coatHi: "#4B4658", coatLo: "#1A1820", coatInk: "#0C0B10", portrait: "#5B2A30", portraitLow: "#2E1519"
  };
  function executorHead(id) {
    var CRIMSON = "#C2262E", GOLD = "#DDB65A";
    var o = "";
    // the porcelain mask: a smooth white head with no mouth
    o += shape("M23 52C21 32 37 18 59 18C82 16 98 30 98 50Q101 69 91 80Q81 93 62 94Q43 95 32 84Q22 75 23 62Z", paint(id,"skin"), EXEC.outline, 1.6);
    o += shape("M26 73Q37 91 57 90Q80 93 94 72Q89 86 77 91Q58 98 42 89Q31 84 26 73Z", "#D9D2C2");
    // the black of a crane's cheek and throat, sweeping back from each eye
    o += shape("M30 56Q40 47 52 55Q49 66 40 70Q31 70 26 64Z", "#17151B") + shape("M92 54Q82 45 70 53Q73 64 82 68Q91 68 96 62Z", "#17151B");
    o += shape("M36 86Q48 80 60 84Q72 80 84 85Q74 95 60 95Q46 95 36 86Z", "#17151B");
    // eyes: gold rings in the black
    o += oval(41.5,59,5.6,5.2,GOLD) + oval(41.5,59,3.4,3.3,"#0A090C") + oval(42.8,57.7,1,1,"#FFF7D8");
    o += oval(80.5,57.5,5.6,5.2,GOLD) + oval(80.5,57.5,3.4,3.3,"#0A090C") + oval(81.8,56.2,1,1,"#FFF7D8");
    // the red crown
    o += shape("M40 27Q60 15 81 26Q78 38 61 40Q44 39 40 27Z", CRIMSON, "#6E1217", 1.2) + line("M47 28Q60 22 74 27", "#E8676C", 1.6);
    // the long beak, down and to one side
    o += shape("M52 62Q61 57 70 63L66 72L22 110Q18 111 20 106Z", "#C9B27A", "#4A3B1C", 1.5) +
      shape("M52 62Q61 57 70 63L64 67Q58 64 52 66Z", "#3B352A") + line("M58 69L24 106", "#8C7740", 1.3) + line("M55 64L27 100", "#F1E1AE", 1.2);
    return o;
  }
  function executorHat() {
    var CRIMSON = "#C2262E";
    return shape("M34 22L37 -6Q60 -11 83 -6L86 22Z", "#17151B", "#050506", 1.6) +
      shape("M35.2 12Q60 17 84.8 12L86 22Q60 27 34 22Z", CRIMSON, "#6E1217", 1) +
      shape("M14 23Q60 34 106 23Q108 27 104 29Q60 40 16 29Q12 27 14 23Z", "#1F1C24", "#050506", 1.6) +
      line("M40 -3Q60 -7 80 -3", "#4B4658", 1.5) +
      // one white feather in the band
      shape("M84 14Q98 -2 96 -20Q88 -10 82 2Z", "#F4EFE2", "#8E887A", 1.1) + line("M84 13Q92 0 95 -16", "#B9B1A0", 1);
  }
  function executorUpper(id) {
    var a = { s: 0, h: 0, c: 0, g: 0, b: 0, m: 0, o: 8, t: 1, x: 0, e: 0, f: 1 }, c = EXEC, GOLD = "#DDB65A";
    var body = arm("a",a,c) + arm("b",a,c) + clothes(a,c,id);
    // a crimson cravat over the shirt, and the estate's key on a chain
    body += shape("M53 88Q60 85 67 88L65 99L60 104L55 99Z", "#C2262E", "#6E1217", 1) + line("M56 92Q60 95 64 92", "#E8676C", 1.1);
    body += line("M47 112Q60 121 73 112", GOLD, 1.3) + '<circle cx="60" cy="121" r="4.2" fill="none" stroke="' + GOLD + '" stroke-width="2"/>' +
      line("M60 125.2L60 135 M60 131L63.5 131 M60 134.5L63 134.5", GOLD, 2);
    return body + executorHead(id) + executorHat();
  }
  function executor(kind) {
    var id = "av" + ++uid;
    if (kind === "sprite") {
      return '<svg viewBox="0 0 72 124" class="sprite executor" aria-hidden="true" style="overflow:visible">' + paints(id, EXEC) +
        '<ellipse cx="36" cy="118" rx="22" ry="3.5" fill="#0B1117" opacity=".45"/>' +
        '<g transform="translate(-5.4 8.4) scale(.69)">' + leg("a", EXEC) + leg("b", EXEC) + '<g class="torso">' + executorUpper(id) + "</g></g></svg>";
    }
    return '<svg viewBox="0 0 120 120" class="avatar executor" role="img" aria-label="The Executor">' + paints(id, EXEC) +
      '<defs><clipPath id="' + id + 'window"><circle cx="60" cy="60" r="55.7"/></clipPath></defs>' +
      '<g clip-path="url(#' + id + 'window)">' + oval(60,60,56,56,paint(id,"field")) +
      '<g transform="translate(9 26) scale(.85)">' + executorUpper(id) + "</g></g>" +
      '<circle cx="60" cy="60" r="56.7" fill="none" stroke="#DDB65A" stroke-width="2.6"/></svg>';
  }
  function gm() {
    return '<svg viewBox="0 0 120 120" class="avatar gm-mark" role="img" aria-label="The Gamemaster">'+
      '<circle cx="60" cy="60" r="56" fill="#283039" stroke="#B7A77F" stroke-width="2"/>'+
      shape("M37 47Q38 43 44 42L50 29Q52 25 56 27L63 31L68 29Q72 27 74 31L79 42Q88 43 87 47Q77 52 61 53Q43 53 34 50Q32 48 37 47Z","#D4BF85")+
      shape("M46 39Q59 43 76 37L78 41Q62 47 44 43Z","#475059")+
      line("M43 58Q50 54 56 59 M64 58Q70 53 77 56","#D4BF85",2.1)+
      '<text x="60" y="86" text-anchor="middle" font-family="Georgia,serif" font-size="21" font-weight="bold" letter-spacing="1.5" fill="#EEE2BD">GM</text></svg>';
  }
  return {
    draw: draw, sprite: sprite, shadow: shadow, silhouette: silhouette, gm: gm, executor: executor, clean: clean, random: random,
    PRESETS: PRESETS, SKIN: SKIN, HAIR: HAIR, COAT: COAT, LIMITS: LIMITS,
    STYLES: LIMITS.h, GLASSES: LIMITS.g, BEARD: LIMITS.b, MOUTH: LIMITS.m,
  };
})();
