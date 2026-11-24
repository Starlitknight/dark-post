// Dark Post: nine miniature sets with fitted signs and live scenery, with the
// walkable floor, the route finder, the doors between rooms, and the things a player can use.
//   hall     where everyone gathers: the two bags and the clock
//   arena    where each night's match is played; its set changes every night
//   puzzle   one puzzle a day, worth a coin
//   betting  two players, two sealed choices
//   studio   the broadcast room: speak to everyone at once
//   sky      the observatory, upstairs: sixteen stars
//   dungeon  downstairs: three cells for secret meetings, and the door log
//   gallery  sixteen portraits
//   shop     where coins are spent
window.DP_WORLD = (function () {
  var GOLD = "#E0B040", TEAL = "#35C2B0", RED = "#E5544B", BLUE = "#6C9BF2", GREEN = "#4FBF7A", VIOLET = "#A98BEA", AMBER = "#E0893C", ROSE = "#E9A3B4";
  var CX = 900, CY = 800; // the vault in the middle of the hall
  // The dungeon's three cells. src/worker.js holds the same rectangles.
  var CELLS = [[90, 162, 470, 462], [560, 162, 940, 462], [1030, 162, 1410, 462]];

  // ---------- rooms ----------
  // floor: where feet may stand. blocks: things standing on the floor.
  // doors: zone = step here to leave; center = walk here to leave; arrive = where you appear coming from there.
  // spots: things to use. The first is the room's main one. A spot with a zone is offered only while you stand in it.
  var ROOMS = {
    hall: {
      id: "hall", w: 1800, h: 1500, name: "The hall", color: "#FFFFFF",
      floor: [[58, 162, 1742, 1440], [800, 100, 1000, 170], [800, 1430, 1000, 1490], [10, 540, 70, 740], [10, 880, 70, 1080], [1730, 540, 1790, 740], [1730, 880, 1790, 1080]],
      blocks: [{ c: [CX, CY, 176] }, [316, 330, 404, 446], [1396, 330, 1484, 446], [316, 1090, 404, 1206], [1396, 1090, 1484, 1206], [60, 1270, 300, 1440], [1500, 160, 1742, 330]],
      doors: [
        { to: "arena", zone: [800, 96, 1000, 126], center: [900, 110], arrive: [900, 240] },
        { to: "puzzle", zone: [6, 540, 34, 740], center: [18, 640], arrive: [140, 640] },
        { to: "betting", zone: [6, 880, 34, 1080], center: [18, 980], arrive: [140, 980] },
        { to: "studio", zone: [1766, 540, 1794, 740], center: [1782, 640], arrive: [1660, 640] },
        { to: "gallery", zone: [1766, 880, 1794, 1080], center: [1782, 980], arrive: [1660, 980] },
        { to: "shop", zone: [800, 1464, 1000, 1494], center: [900, 1480], arrive: [900, 1360] },
      ],
      spots: [],
    },
    arena: {
      id: "arena", w: 1500, h: 1300, name: "The arena", color: GOLD,
      floor: [[58, 162, 1442, 1240], [650, 1230, 850, 1290]],
      blocks: [[390, 470, 1110, 866], [70, 430, 240, 1010], [1260, 430, 1430, 1010]],
      doors: [{ to: "hall", zone: [650, 1264, 850, 1294], center: [750, 1280], arrive: [750, 1150] }],
      spots: [{ at: [750, 1010], mark: [750, 836], label: "See tonight's game", scene: "arena" }],
    },
    puzzle: {
      id: "puzzle", w: 1300, h: 1000, name: "Puzzle room", color: VIOLET,
      floor: [[58, 162, 1242, 940], [1230, 420, 1290, 620]],
      blocks: [[540, 162, 760, 290], [80, 400, 340, 560], [940, 162, 1242, 262], [980, 720, 1180, 850]],
      doors: [{ to: "hall", zone: [1266, 420, 1294, 620], center: [1282, 520], arrive: [1160, 520] }],
      spots: [{ at: [650, 330], mark: [650, 176], label: "Open today's puzzle", scene: "puzzle" }],
    },
    betting: {
      id: "betting", w: 1300, h: 1000, name: "Betting room", color: GREEN,
      floor: [[58, 162, 1242, 940], [1230, 680, 1290, 880]],
      blocks: [[150, 420, 390, 560], [500, 420, 740, 560], [850, 420, 1090, 560], [60, 162, 330, 290], [80, 780, 230, 930]],
      doors: [{ to: "hall", zone: [1266, 680, 1294, 880], center: [1282, 780], arrive: [1160, 780] }],
      spots: [{ at: [620, 620], mark: [620, 396], label: "Make a deal", scene: "deal" }],
    },
    studio: {
      id: "studio", w: 1300, h: 1000, name: "Broadcast room", color: RED,
      floor: [[58, 162, 1242, 940], [10, 420, 70, 620]],
      blocks: [[470, 290, 830, 404], [1060, 380, 1242, 780], { c: [650, 700, 46] }, { c: [330, 560, 30] }, { c: [970, 560, 30] }],
      doors: [{ to: "hall", zone: [6, 420, 34, 620], center: [18, 520], arrive: [140, 520] }],
      spots: [{ at: [650, 452], mark: [650, 286], label: "Go on air", scene: "onair" }],
    },
    sky: {
      id: "sky", w: 1300, h: 1000, name: "Observatory", color: BLUE,
      floor: [[58, 162, 1242, 940], [550, 930, 750, 990]],
      blocks: [[560, 400, 740, 560], [90, 290, 350, 430], [940, 640, 1210, 770], [1150, 200, 1242, 520]],
      doors: [{ to: "hall", zone: [550, 964, 750, 994], center: [650, 980], arrive: [650, 860] }],
      spots: [{ at: [650, 610], mark: [650, 380], label: "Look at the sky", scene: "sky" }],
    },
    dungeon: {
      id: "dungeon", w: 1500, h: 1000, name: "Dungeon", color: AMBER,
      floor: [[58, 162, 1442, 940], [1430, 620, 1490, 820]],
      blocks: [
        [58, 162, 90, 492], [470, 162, 560, 492], [940, 162, 1030, 492], [1410, 162, 1442, 492],
        [90, 462, 220, 492], [340, 462, 470, 492], [560, 462, 690, 492], [810, 462, 940, 492], [1030, 462, 1160, 492], [1280, 462, 1410, 492],
        [690, 640, 810, 716], [70, 790, 270, 940],
      ],
      doors: [{ to: "hall", zone: [1466, 620, 1494, 820], center: [1482, 720], arrive: [1360, 720] }],
      spots: [
        { at: [750, 760], mark: [750, 630], label: "Read the door log", scene: "doorlog" },
        { zone: CELLS[0], at: [280, 330], label: "Talk in cell 1", scene: "cell", cell: 1 },
        { zone: CELLS[1], at: [750, 330], label: "Talk in cell 2", scene: "cell", cell: 2 },
        { zone: CELLS[2], at: [1220, 330], label: "Talk in cell 3", scene: "cell", cell: 3 },
      ],
    },
    gallery: {
      id: "gallery", w: 1300, h: 1000, name: "Gallery", color: ROSE,
      floor: [[58, 162, 1242, 940], [10, 280, 70, 480]],
      blocks: [[150, 540, 570, 690], [730, 540, 1150, 690], [200, 850, 420, 904], [880, 850, 1100, 904]],
      doors: [{ to: "hall", zone: [6, 280, 34, 480], center: [18, 380], arrive: [140, 380] }],
      spots: [{ at: [650, 300], mark: [650, 176], label: "Look at the portraits", scene: "players" }],
      frames: [],
    },
    shop: {
      id: "shop", w: 1300, h: 1000, name: "The shop", color: TEAL,
      floor: [[58, 162, 1242, 940], [990, 100, 1190, 170]],
      blocks: [[200, 290, 860, 394], [80, 600, 330, 706], [930, 700, 1200, 900]],
      doors: [{ to: "hall", zone: [990, 96, 1190, 126], center: [1090, 110], arrive: [1090, 240] }],
      spots: [{ at: [530, 450], mark: [530, 292], label: "See what is for sale", scene: "shop" }],
    },
  };
  // Where each portrait hangs in the gallery: eight on the back wall, four on each standing panel.
  (function () {
    for (var i = 0; i < 8; i++) ROOMS.gallery.frames.push([172 + i * 136.6, 74, 60]);
    for (i = 0; i < 4; i++) ROOMS.gallery.frames.push([213 + i * 98, 618, 54]);
    for (i = 0; i < 4; i++) ROOMS.gallery.frames.push([793 + i * 98, 618, 54]);
  })();

  // The thing a player standing here would use: the spot whose zone they are in, or the room's main one.
  function spotAt(id, x, y) {
    var spots = ROOMS[id].spots;
    for (var i = 0; i < spots.length; i++) {
      var z = spots[i].zone;
      if (z && x >= z[0] && x <= z[2] && y >= z[1] && y <= z[3]) return spots[i];
    }
    return spots.length && !spots[0].zone ? spots[0] : null;
  }

  function marker(n) {
    // Turned a little so no mark sits on a lane to a door.
    var a = (-78.75 + (n - 1) * 22.5) * Math.PI / 180;
    return [Math.round(CX + Math.cos(a) * 430), Math.round(CY + Math.sin(a) * 430)];
  }

  function walkable(id, x, y) {
    var R = ROOMS[id];
    if (!R) return false;
    var ok = false, i;
    for (i = 0; i < R.floor.length; i++) {
      var f = R.floor[i];
      if (x >= f[0] && x <= f[2] && y >= f[1] && y <= f[3]) { ok = true; break; }
    }
    if (!ok) return false;
    for (i = 0; i < R.blocks.length; i++) {
      var b = R.blocks[i];
      if (b.c) {
        var dx = x - b.c[0], dy = y - b.c[1];
        if (dx * dx + dy * dy < b.c[2] * b.c[2]) return false;
      } else if (x > b[0] && x < b[2] && y > b[1] && y < b[3]) return false;
    }
    return true;
  }

  function doorAt(id, x, y) {
    var doors = ROOMS[id].doors;
    for (var i = 0; i < doors.length; i++) {
      var z = doors[i].zone;
      if (x >= z[0] && x <= z[2] && y >= z[1] && y <= z[3]) return doors[i];
    }
    return null;
  }

  function doorTo(id, to) {
    var doors = ROOMS[id].doors;
    for (var i = 0; i < doors.length; i++) if (doors[i].to === to) return doors[i];
    return null;
  }

  // ---------- route finding on a coarse grid, one grid per room ----------

  var CELL = 16;
  var grids = {};

  function gridOf(id) {
    if (grids[id]) return grids[id];
    var R = ROOMS[id];
    var cols = Math.ceil(R.w / CELL), rows = Math.ceil(R.h / CELL);
    var cells = new Uint8Array(cols * rows);
    for (var r = 0; r < rows; r++) for (var c = 0; c < cols; c++) cells[r * cols + c] = walkable(id, c * CELL + CELL / 2, r * CELL + CELL / 2) ? 1 : 0;
    grids[id] = { cols: cols, rows: rows, cells: cells };
    return grids[id];
  }

  function nearest(id, x, y) {
    if (walkable(id, x, y)) return [x, y];
    var g = gridOf(id);
    var c0 = Math.max(0, Math.min(g.cols - 1, Math.floor(x / CELL))), r0 = Math.max(0, Math.min(g.rows - 1, Math.floor(y / CELL)));
    var best = null, bestD = 1e12;
    for (var rad = 1; rad < 60 && !best; rad++) {
      for (var dr = -rad; dr <= rad; dr++) for (var dc = -rad; dc <= rad; dc++) {
        if (Math.max(Math.abs(dr), Math.abs(dc)) !== rad) continue;
        var c = c0 + dc, r = r0 + dr;
        if (c < 0 || r < 0 || c >= g.cols || r >= g.rows || !g.cells[r * g.cols + c]) continue;
        var px = c * CELL + CELL / 2, py = r * CELL + CELL / 2;
        var d = (px - x) * (px - x) + (py - y) * (py - y);
        if (d < bestD) { bestD = d; best = [px, py]; }
      }
    }
    return best || [ROOMS[id].w / 2, ROOMS[id].h / 2];
  }

  function clear(id, ax, ay, bx, by) {
    var steps = Math.ceil(Math.hypot(bx - ax, by - ay) / 7);
    for (var i = 1; i < steps; i++) if (!walkable(id, ax + (bx - ax) * i / steps, ay + (by - ay) * i / steps)) return false;
    return true;
  }

  // A* over the grid, then pulled tight so the walk looks natural.
  function findPath(id, from, to) {
    var g = gridOf(id);
    var a = nearest(id, from[0], from[1]);
    var b = nearest(id, to[0], to[1]);
    if (clear(id, a[0], a[1], b[0], b[1])) return [b];
    var cols = g.cols, rows = g.rows;
    var sc = Math.floor(a[0] / CELL), sr = Math.floor(a[1] / CELL), gc = Math.floor(b[0] / CELL), gr = Math.floor(b[1] / CELL);
    var start = sr * cols + sc, goal = gr * cols + gc;
    var open = [start];
    var came = new Int32Array(cols * rows).fill(-1);
    var cost = new Float32Array(cols * rows).fill(1e9);
    var est = new Float32Array(cols * rows).fill(1e9);
    cost[start] = 0;
    est[start] = 0;
    var found = false, guard = 0;
    while (open.length && guard++ < 40000) {
      var bi = 0;
      for (var i = 1; i < open.length; i++) if (est[open[i]] < est[open[bi]]) bi = i;
      var cur = open.splice(bi, 1)[0];
      if (cur === goal) { found = true; break; }
      var cc = cur % cols, cr = (cur - cc) / cols;
      for (var dr = -1; dr <= 1; dr++) for (var dc = -1; dc <= 1; dc++) {
        if (!dr && !dc) continue;
        var nc = cc + dc, nr = cr + dr;
        if (nc < 0 || nr < 0 || nc >= cols || nr >= rows) continue;
        var ni = nr * cols + nc;
        if (!g.cells[ni]) continue;
        if (dr && dc && (!g.cells[cr * cols + nc] || !g.cells[nr * cols + cc])) continue;
        var step = cost[cur] + (dr && dc ? 1.414 : 1);
        if (step < cost[ni]) {
          cost[ni] = step;
          came[ni] = cur;
          est[ni] = step + Math.hypot(nc - gc, nr - gr);
          if (open.indexOf(ni) < 0) open.push(ni);
        }
      }
    }
    if (!found) return [];
    var pts = [];
    for (var n = goal; n !== -1 && n !== start; n = came[n]) pts.push([(n % cols) * CELL + CELL / 2, Math.floor(n / cols) * CELL + CELL / 2]);
    pts.reverse();
    pts[pts.length - 1] = b;
    var out = [], at = a, k = 0;
    while (k < pts.length) {
      var far = k;
      for (var j = pts.length - 1; j > k; j--) if (clear(id, at[0], at[1], pts[j][0], pts[j][1])) { far = j; break; }
      out.push(pts[far]);
      at = pts[far];
      k = far + 1;
    }
    return out;
  }

  // Each room is a locally bundled miniature set. Lettering and wayfinding stay
  // in world coordinates so they stay clear at the camera's different scales.
  function panel(x, y, width, height, radius, fill, detail) {
    return '<rect x="' + x + '" y="' + y + '" width="' + width + '" height="' + height +
      '" rx="' + radius + '" fill="' + fill + '"' + (detail || '') + '/>';
  }

  function line(d, color, width, opacity) {
    return '<path d="' + d + '" fill="none" stroke="' + color + '" stroke-width="' + width +
      '" stroke-linecap="round" stroke-linejoin="round" opacity="' + (opacity == null ? 1 : opacity) + '"/>';
  }

  function lettering(x, y, value, size, color, anchor, spacing) {
    return '<text x="' + x + '" y="' + y + '" text-anchor="' + (anchor || 'middle') +
      '" font-family="Manrope, Arial, sans-serif" font-weight="600" font-size="' + size +
      '" letter-spacing="' + (spacing == null ? '.1' : spacing) + '" fill="' + color + '">' + value + '</text>';
  }

  var exits = {
    hall: 'Hall', arena: 'Arena', puzzle: 'Puzzle room', betting: 'Betting room', studio: 'Broadcast',
    gallery: 'Gallery', dungeon: 'Dungeon', shop: 'Shop', sky: 'Observatory'
  };
  var signColors = {
    hall: '#e0d4b7', arena: '#ddc188', puzzle: '#c6b6de', betting: '#abceb5', studio: '#deb0a3',
    gallery: '#d3b0ba', dungeon: '#d3ae83', shop: '#a9c8be', sky: '#b5cce0'
  };

  // Tapping a label and tapping the visible passage lead to the same threshold.
  // This group is part of the world, so a character still walks the entire path.
  function exitSign(room, door) {
    var cx = door.center[0], cy = door.center[1], label = exits[door.to], tint = signColors[door.to];
    var direction = cy < 135 ? 'north' : cy > room.h - 45 ? 'south' : cx < 45 ? 'west' : 'east';
    var width = Math.max(83, label.length * 10 + 47);
    var x = cx, y = cy;
    var near = null;
    if (direction === 'north') {
      y = 83;
      near = [cx - 100, 21, 200, 145];
    } else if (direction === 'south') {
      y = room.h - 90;
      near = [cx - 99, room.h - 110, 198, 110];
    } else if (direction === 'west') {
      x = 58 + width / 2;
      near = [0, cy - 91, 68, 182];
    } else {
      x = room.w - 58 - width / 2;
      near = [room.w - 68, cy - 91, 68, 182];
    }
    var forward = direction === 'east';
    var iconX = forward ? width / 2 - 19 : 19 - width / 2;
    var angle = {north:0, east:90, south:180, west:270}[direction];
    return '<g class="room-exit" data-exit="' + door.to + '">' +
      panel(near[0], near[1], near[2], near[3], 0, '#000', ' fill-opacity="0" pointer-events="all"') +
      '<g transform="translate(' + x + ' ' + y + ')">' +
      panel(-width / 2, -18, width, 36, 8, '#182428', ' fill-opacity=".93" stroke="#74807a" stroke-opacity=".72" stroke-width="1.2"') +
      '<g transform="translate(' + iconX + ' 0) rotate(' + angle + ')">' +
      line('M-5 2 0 -3l5 5', tint, 2.2) + '</g>' +
      lettering(forward ? -11 : 11, 6, label, 17.5, '#f1efe4') + '</g></g>';
  }

  function positions() {
    var out = '';
    for (var n = 1; n <= 16; n++) {
      var p = marker(n);
      out += '<g transform="translate(' + p[0] + ' ' + p[1] + ')">' +
        '<ellipse rx="27" ry="22" fill="#344447" fill-opacity=".48" stroke="#c1c1ab" stroke-opacity=".49" stroke-width="1.5"/>' +
        lettering(0, 7, n, 20, '#e0ddc9') + '</g>';
    }
    return out;
  }

  function payoffBoard() {
    var ink = '#e4e7dc', green = '#b2d0af';
    return lettering(663, 35, 'Your net change · 2 coins at stake', 17, ink) +
      lettering(697, 60, 'They cooperate', 15, green) +
      lettering(849, 60, 'They betray', 15, green) +
      line('M419 68h485M622 68v60M776 68v60', '#677970', 1.4, .90) +
      lettering(436, 91, 'You cooperate', 16, ink, 'start') +
      lettering(436, 119, 'You betray', 16, ink, 'start') +
      lettering(697, 93, '+1', 21, ink) + lettering(849, 93, '−2', 21, '#e1baa9') +
      lettering(697, 120, '+2', 21, ink) + lettering(849, 120, '−1', 21, '#e1baa9');
  }

  function dungeonRails() {
    var out = '';
    CELLS.forEach(function (cell) {
      var mid = (cell[0] + cell[2]) / 2;
      [[cell[0], mid - 60], [mid + 60, cell[2]]].forEach(function (span) {
        var left = span[0], right = span[1];
        out += panel(left, 479, right - left, 12, 2, '#242d2e');
        for (var x = left + 8; x < right - 4; x += 23) {
          out += panel(x, 400, 7, 85, 2, '#253337') +
            panel(x + 1, 402, 2.2, 80, 1, '#88918a');
        }
        out += panel(left, 393, right - left, 8, 2, '#64706b') +
          line('M' + (left+3) + ' 394h' + (right-left-6), '#b0ac92', 1.8) +
          line('M' + left + ' 476H' + right, '#8b9288', 2);
        [left, right - 8].forEach(function (edge) {
          out += panel(edge, 389, 8, 101, 3, '#3e4a49') + panel(edge+1, 391, 2, 95, 1, '#9ba397');
        });
      });
    });
    return out;
  }

  function portraits() {
    var out = '';
    ROOMS.gallery.frames.forEach(function (frame, index) {
      var x = frame[0], y = frame[1], size = frame[2], width = size + 16;
      out += '<g transform="translate(' + x + ' ' + y + ')">' +
        panel(-width / 2 + 2, -size / 2 - 5, width, size + 18, 8, '#142025') +
        panel(-width / 2, -size / 2 - 7, width, size + 17, 8, '#343f41', ' stroke="#a99c87" stroke-width="2.2"') +
        '<circle r="' + (size / 2 + .2) + '" fill="#18272b" stroke="#a6a590" stroke-width="1.2"/>' +
        '<path d="M-16 16q2-9 11-12q-5-4-5-10a10 10 0 0 1 20 0q0 6-5 10q9 4 11 12Z" fill="#596663"/>' +
        panel(-13, size/2+4, 26, 14, 4, '#d4c7aa') + lettering(0,size/2+15,index+1,12,'#233032') + '</g>';
    });
    return out;
  }

  // The arena's set changes with the night's match. "" leaves the covered set that is painted into the room.
  // "vaults" is Night 1: six numbered vault doors along the stage.
  var arenaSet = '';
  function setArena(kind) {
    arenaSet = kind || '';
  }

  // The shop's sign. It is open only while a match is being played.
  var shopOpen = false;
  function setShop(open) {
    shopOpen = !!open;
  }

  function vaultSet() {
    var out = panel(404, 480, 692, 314, 6, '#10171b', ' stroke="#2c3940" stroke-width="2"') +
      line('M404 794H1096', '#d4b471', 3, 0.7);
    for (var i = 0; i < 6; i++) {
      var x = 425 + i * 110;
      var cx = x + 50;
      out += panel(x, 502, 100, 270, 9, '#27323a', ' stroke="#0b1114" stroke-width="3"') +
        panel(x + 7, 509, 86, 256, 6, '#46535b', ' stroke="#8f7c4e" stroke-width="2"') +
        panel(x + 7, 509, 86, 30, 6, '#5a6870', ' opacity=".55"') +
        panel(x + 26, 522, 48, 44, 5, '#11181c', ' stroke="#d4b471" stroke-width="2"') +
        lettering(cx, 556, String(i + 1), 34, '#ecd9a4', 'middle', '0') +
        '<circle cx="' + cx + '" cy="650" r="30" fill="#1b252b" stroke="#0b1114" stroke-width="3"/>' +
        '<circle cx="' + cx + '" cy="650" r="21" fill="none" stroke="#d4b471" stroke-width="3"/>' +
        line('M' + cx + ' 624v52M' + (cx - 26) + ' 650h52M' + (cx - 18) + ' 632l36 36M' + (cx + 18) + ' 632l-36 36', '#d4b471', 3, 0.9) +
        '<circle cx="' + cx + '" cy="650" r="6" fill="#ecd9a4"/>' +
        panel(x + 16, 728, 9, 24, 2, '#11181c') + panel(x + 75, 728, 9, 24, 2, '#11181c');
    }
    return out;
  }

  // The hall was painted with two more doorways, to a dungeon and an observatory. Those rooms are closed
  // for good, so the two openings in the bottom wall are painted over to match the wall beside them.
  function hallWall() {
    var out = '<defs><linearGradient id="hall-wall" x1="0" y1="0" x2="0" y2="1">' +
      '<stop offset="0" stop-color="#1f2c2f"/><stop offset=".82" stop-color="#3b4e4e"/><stop offset=".93" stop-color="#344345"/><stop offset="1" stop-color="#1e2b30"/></linearGradient></defs>';
    [[304, 528], [1264, 1496]].forEach(function (x) {
      out += panel(x[0], 1440, x[1] - x[0], 60, 0, 'url(#hall-wall)') +
        panel(x[0], 1434, x[1] - x[0], 6, 0, '#223235') + line('M' + x[0] + ' 1438H' + x[1], '#404d4d', 2, 1);
    });
    return out;
  }

  function fixtures(id) {
    if (id === 'hall') return hallWall() + positions();
    if (id === 'arena') return arenaSet === 'vaults' ? vaultSet() : '';
    if (id === 'betting') return payoffBoard();
    if (id === 'studio') return '<circle cx="581" cy="82" r="6" fill="#e0a099"/>' + lettering(663, 93, 'ON AIR', 30, '#f0d3c6', 'middle', '3');
    if (id === 'gallery') return portraits();
    if (id === 'shop') {
      return line('M484 27l-7 24m103-24 8 24','#b8b8a0',2) +
        panel(450, 48, 165, 53, 6, '#1a2a2c', ' stroke="#96b0a7" stroke-width="2"') +
        lettering(532,83,shopOpen ? 'Open' : 'Closed',28,shopOpen ? '#ecd9a4' : '#d8e8da');
    }
    if (id === 'dungeon') {
      var cells = CELLS.map(function (c, i) {
        return lettering((c[0] + c[2]) / 2, 103, 'Cell ' + (i+1), 27, '#e1cdb2');
      }).join('');
      return cells + dungeonRails();
    }
    return '';
  }

  var roomsDrawn = {};
  function svg(id) {
    var drawn = id === 'arena' ? id + ':' + arenaSet : id === 'shop' ? id + ':' + shopOpen : id;
    if (!roomsDrawn[drawn]) {
      var room = ROOMS[id];
      roomsDrawn[drawn] = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + room.w + ' ' + room.h +
        '" width="' + room.w + '" height="' + room.h + '" class="map-art" data-room="' + id + '" aria-hidden="true">' +
        '<image href="/art/rooms/' + id + '.webp" width="' + room.w + '" height="' + room.h + '" preserveAspectRatio="none"/>' +
        fixtures(id) + room.doors.map(function (d) { return exitSign(room,d); }).join('') + '</svg>';
    }
    return roomsDrawn[drawn];
  }

  function overlays(id) {
    if (id !== 'dungeon') return [];
    var room = ROOMS.dungeon;
    return [{ z: 492, svg: '<svg xmlns="http://www.w3.org/2000/svg" class="map-over" aria-hidden="true" width="' +
      room.w + '" height="' + room.h + '" viewBox="0 0 ' + room.w + ' ' + room.h + '">' + dungeonRails() + '</svg>' }];
  }

  function lightSVG(id) {
    var room = ROOMS[id];
    // The light is baked into the set. A very slight falloff also sits over the
    // characters, so their faces stay visible near the walls.
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + room.w + ' ' + room.h +
      '" width="' + room.w + '" height="' + room.h + '" class="map-light" aria-hidden="true">' +
      '<defs><radialGradient id="dp-field-' + id + '" cx="49%" cy="48%" r="76%">' +
      '<stop offset=".58" stop-color="#0c151c" stop-opacity="0"/><stop offset="1" stop-color="#0c151c" stop-opacity=".16"/></radialGradient></defs>' +
      panel(0, 0, room.w, room.h, 0, 'url(#dp-field-' + id + ')') + '</svg>';
  }

  // Keep the room the player just left on the desk while they read a page.
  // It is inert artwork. The existing Back action restores the moving stage.
  var lastSet = null;
  var viewSize = null;
  function framePage(root, markup, scene, occupiedRoom) {
    var oldWorld = root.querySelector('.stage > .world');
    if (oldWorld && oldWorld.querySelector('.map-art')) {
      var plate = oldWorld.querySelector('.map-art');
      var id = plate.getAttribute('data-room') || 'hall';
      lastSet = { id: id, art: window.matchMedia('(min-width:900px)').matches ? oldWorld : null };
    }
    if (lastSet && occupiedRoom && occupiedRoom !== lastSet.id) lastSet = null;
    if (viewSize) viewSize.disconnect();
    viewSize = null;
    root.innerHTML = markup;
    var page = root.firstElementChild;
    if (!page || !page.classList.contains('room')) {
      if (scene === 'hall') lastSet = null;
      return;
    }
    var scenes = { standings: 'hall', arena: 'arena', puzzle: 'puzzle', deal: 'betting', onair: 'studio', sky: 'sky', cell: 'dungeon', doorlog: 'dungeon', shop: 'shop' };
    var roomId = ROOMS[occupiedRoom] ? occupiedRoom : (lastSet ? lastSet.id : scenes[scene] || 'hall');
    var set = ROOMS[roomId];
    var side = document.createElement('aside');
    side.className = 'set-side';
    var mount = document.createElement('div');
    mount.className = 'set-picture';
    mount.inert = true;
    mount.setAttribute('aria-hidden', 'true');
    side.appendChild(mount);
    var back = document.createElement('button');
    back.className = 'set-back';
    back.type = 'button';
    back.dataset.act = 'hall';
    back.setAttribute('aria-label', 'Back · ' + set.name);
    back.innerHTML = '<span class="set-back-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M3 20h18M5 19V5h14v14M8 18V7l7-2v14z"/></svg></span><span>' + set.name + '</span>';
    side.appendChild(back);
    root.appendChild(side);

    function fit() {
      var width = side.clientWidth, height = side.clientHeight;
      if (!width || !height) return;
      if (!mount.firstChild) {
        var art;
        if (lastSet && lastSet.art) {
          // Scope the detached world as a picture, leaving each active game hook unique.
          art = lastSet.art;
          art.removeAttribute('id');
          art.querySelectorAll('[id]').forEach(function (node) {
            if (node.namespaceURI === 'http://www.w3.org/1999/xhtml') node.removeAttribute('id');
          });
          art.querySelectorAll('.walking').forEach(function (node) { node.classList.remove('walking'); });
        } else {
          art = document.createElement('div');
          art.innerHTML = svg(roomId);
          if (roomId === 'hall') {
            art.insertAdjacentHTML('beforeend', '<div class="dais"><span class="dais-1">' + window.DP_ART.bag(1) + '</span><span class="dais-2">' + window.DP_ART.bag(2) + '</span></div>');
          }
        }
        art.className = 'set-still';
        art.style.width = set.w + 'px';
        art.style.height = set.h + 'px';
        mount.appendChild(art);
      }
      var scale = Math.max(width / set.w, height / set.h);
      mount.firstChild.style.transform = 'translate(-50%, -50%) scale(' + scale + ')';
    }
    if (typeof ResizeObserver !== 'undefined') {
      viewSize = new ResizeObserver(fit);
      viewSize.observe(side);
    }
    fit();
  }

  return {
    ROOMS: ROOMS, CELLS: CELLS, CX: CX, CY: CY, HUB: "hall",
    framePage: framePage, svg: svg, setArena: setArena, setShop: setShop, lightSVG: lightSVG, overlays: overlays, walkable: walkable, nearest: nearest, findPath: findPath, marker: marker, doorAt: doorAt, doorTo: doorTo, spotAt: spotAt,
  };
})();
