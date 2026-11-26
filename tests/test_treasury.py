"""
The treasury against a local server: sixteen players, one passcode, sixteen puzzles.
Start from an empty local database:  python3 tests/test_treasury.py [base]
"""
import json, sys, itertools, urllib.request, urllib.error

BASE = sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:8787"
CODE = "QUIETLITTLEWORDS"  # a passcode for this test only


def call(method, path, body=None, cookies=None):
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(BASE + path, data=data, method=method)
    req.add_header("Content-Type", "application/json")
    if cookies:
        req.add_header("Cookie", "; ".join(f"{k}={v}" for k, v in cookies.items()))
    try:
        with urllib.request.urlopen(req) as res:
            return res.status, json.loads(res.read() or b"{}"), res.headers
    except urllib.error.HTTPError as err:
        return err.code, json.loads(err.read() or b"{}"), err.headers


def check(label, cond):
    print(("PASS  " if cond else "FAIL  ") + label)
    if not cond:
        check.failed += 1


check.failed = 0
seat = lambda t: {"dp_seat": t}


W, H, SOURCE = 7, 9, 31
turn = lambda m: ((m << 1) & 15) | (m >> 3)
DIRS = [(1, 0, -1, 4), (2, 1, 0, 8), (4, 0, 1, 1), (8, -1, 0, 2)]


def powered(cells):
    seen, stack, loose = {SOURCE}, [SOURCE], 0
    for i in range(W * H):
        for bit, dx, dy, back in DIRS:
            if cells[i] & bit:
                x, y = i % W + dx, i // W + dy
                if not (0 <= x < W and 0 <= y < H and cells[y * W + x] & back): loose += 1
    while stack:
        i = stack.pop()
        for bit, dx, dy, back in DIRS:
            x, y = i % W + dx, i // W + dy
            if cells[i] & bit and 0 <= x < W and 0 <= y < H and cells[y * W + x] & back and y * W + x not in seen:
                seen.add(y * W + x); stack.append(y * W + x)
    return len(seen) == W * H and loose == 0


def solve(start):
    """Turn the pieces of a dealt board until every piece has power. Returns 63 hex characters."""
    pieces = [int(c, 16) for c in start]
    cells = [0] * (W * H)
    def options(p):
        out = []
        for _ in range(4):
            if p not in out: out.append(p)
            p = turn(p)
        return out
    opts = [options(p) for p in pieces]
    def go(i):
        if i == W * H: return powered(cells)
        x, y = i % W, i // W
        for q in opts[i]:
            if bool(q & 8) != (x > 0 and bool(cells[i - 1] & 2)): continue
            if bool(q & 1) != (y > 0 and bool(cells[i - W] & 4)): continue
            if (x == W - 1 and q & 2) or (y == H - 1 and q & 4): continue
            cells[i] = q
            if go(i + 1): return True
        cells[i] = 0
        return False
    assert go(0), "a board could not be solved"
    return "".join("%x" % c for c in cells)


status, body, headers = call("POST", "/api/host/login", {"passphrase": "correct horse battery"})
host = {"dp_host": headers.get("Set-Cookie", "").split(";")[0].split("=", 1)[1]}
call("POST", "/api/host/invites", {"names": [f"Guest {i}" for i in range(1, 17)]}, host)
call("POST", "/api/host/settings", {"opensAt": "2099-12-05T02:00:00Z", "replyBy": "2099-12-03T02:00:00Z", "letter": {"signature": "S"}}, host)
tokens = [inv["token"] for inv in call("GET", "/api/host/state", cookies=host)[1]["invites"]]
by = {}
for i, t in enumerate(tokens):
    n = call("POST", "/api/respond", {"accept": True}, seat(t))[1]["number"]
    by[n] = t
    call("POST", "/api/enter", {}, seat(t))
    call("POST", "/api/seal", {"bag": 1}, seat(t))
    call("POST", "/api/avatar", {"avatar": {"s": 1, "h": i % 20, "c": 1, "g": 0, "b": 0, "m": 0, "o": i % 9}}, seat(t))
    call("POST", "/api/commit", {"play": True}, seat(t))
call("POST", "/api/host/reveal", {}, host)

view = lambda n: call("GET", "/api/treasury", cookies=seat(by[n]))[1]
hall = lambda n: call("GET", "/api/hall", cookies=seat(by[n]))[1]
coins = lambda n: hall(n)["coins"]
puzzle = lambda n, slot: call("GET", f"/api/treasury/puzzle?slot={slot}", cookies=seat(by[n]))
submit = lambda n, slot, cells: call("POST", "/api/treasury/solve", {"slot": slot, "cells": cells}, seat(by[n]))
door = lambda n, code: call("POST", "/api/treasury/open", {"code": code}, seat(by[n]))
gm = lambda: call("GET", "/api/host/activity", cookies=host)[1]["treasury"]

check("nothing to play before the GM opens it", view(1)["on"] is False and hall(1)["treasury"] is None and door(1, CODE)[0] == 409)
check("a player cannot open the treasury for play", call("POST", "/api/host/treasury", {"code": CODE}, seat(by[1]))[0] == 401)
check("a passcode must be sixteen letters", call("POST", "/api/host/treasury", {"code": "TOO SHORT"}, host)[0] == 400)
check("the GM can arm it for when stage 1 closes", call("POST", "/api/host/treasury", {"code": CODE, "arm": True}, host)[1].get("armed") is True and gm()["armed"] == CODE and view(1)["on"] is False)
status, body, _ = call("POST", "/api/host/treasury", {"code": "quiet little words"}, host)
check("the GM opens it for play, spaces and small letters allowed", status == 200 and body.get("started") is True and gm()["on"] and gm()["code"] == CODE)

v = view(1)
slots = {n: view(n)["mine"] for n in range(1, 17)}
check("every player holds one place of the sixteen, each a different one", sorted(slots.values()) == list(range(16)) and v["length"] == 16 and v["pot"] == 80 and v["reward"] == 5)
check("nobody starts with a character", all(view(n)["letters"] == [] for n in (1, 7, 16)) and hall(1)["treasury"] == {"on": True, "opened": False, "slot": slots[1], "solved": False, "found": 0, "of": 16})
check("the passcode is not sent to players", CODE not in json.dumps([view(1), hall(1), puzzle(1, slots[1])[1]]))

status, pz, _ = puzzle(1, slots[1])
check("a player is dealt the board of their own puzzle, not its answer", status == 200 and len(pz["start"]) == 63 and (pz["w"], pz["h"], pz["source"]) == (W, H, SOURCE) and pz["solved"] is False and pz["mask"] is None and pz["cells"] is None and not powered([int(c, 16) for c in pz["start"]]))
other = [n for n in range(2, 17)][0]
check("and may not open another player's puzzle", puzzle(1, slots[other])[0] == 403 and submit(1, slots[other], pz["start"])[0] == 403)
check("an unfinished board is not accepted", submit(1, slots[1], pz["start"])[1]["ok"] is False and view(1)["letters"] == [])
check("nor a board made of other pieces", submit(1, slots[1], "f" * 63)[0] == 400 and call("POST", "/api/treasury/work", {"slot": slots[1], "cells": "f" * 63}, seat(by[1]))[0] == 400)
cells = solve(pz["start"])
half = cells[:30] + pz["start"][30:]
call("POST", "/api/treasury/work", {"slot": slots[1], "cells": half}, seat(by[1]))
check("unfinished work is kept", puzzle(1, slots[1])[1]["work"] == half)
status, body, _ = submit(1, slots[1], cells)
check("the letter's squares come with the answer", body.get("mask") and len(body["mask"]) == 63 and body["mask"].count("1") > 6 and puzzle(1, slots[1])[1]["mask"] == body["mask"])
check("the finished board gives the letter and its place", body["ok"] is True and body["letter"] == CODE[slots[1]] and body["place"] == slots[1] + 1 and view(1)["letters"] == [{"slot": slots[1], "letter": CODE[slots[1]]}])
check("the others are told a character was found, not which", [x["n"] for x in hall(other)["notices"] if x["kind"] == "tfound"] == [1] and CODE[slots[1]] not in json.dumps([x for x in hall(other)["notices"]]) and view(other)["slots"][slots[1]]["found"] is True and view(other)["letters"] == [])

# asking for help
check("a puzzle can be opened to everyone", call("POST", "/api/treasury/help", {"on": True}, seat(by[2]))[1]["slots"][slots[2]]["help"] is True and [x["n"] for x in hall(3)["notices"] if x["kind"] == "thelp"] == [2])
status, pz2, _ = puzzle(3, slots[2])
status, body, _ = submit(3, slots[2], solve(pz2["start"]))
check("another player solves it: both now hold that character", body["ok"] and body["letter"] == CODE[slots[2]] and {"slot": slots[2], "letter": CODE[slots[2]]} in view(3)["letters"] and view(2)["letters"] == [{"slot": slots[2], "letter": CODE[slots[2]]}])
check("and the holder is told who cracked it", [x["n"] for x in hall(2)["notices"] if x["kind"] == "tsolved"] == [3])

# every other player solves their own
for n in range(3, 17):
    s, pzn, _ = puzzle(n, slots[n])
    assert submit(n, slots[n], solve(pzn["start"]))[1]["ok"], n
found = "".join(next(l["letter"] for l in view(n)["letters"] if l["slot"] == slot) for slot, n in sorted((slot, n) for n, slot in slots.items()))
check("the sixteen characters, in their places, spell the passcode", found == CODE)
check("all sixteen puzzles could be solved", hall(5)["treasury"]["found"] == 16)

# the door
before = {n: coins(n) for n in range(1, 17)}
status, body, _ = door(4, "QUIETLITTLEWORDZ")
check("a wrong passcode is refused, and says how many letters were right", body["ok"] is False and body["right"] == 15 and body["triesLeft"] == 2 and coins(4) == before[4])
door(4, "A" * 16); door(4, "B" * 16)
check("three tries a player", door(4, CODE)[0] == 409 and view(4)["triesLeft"] == 0)
check("the passcode must be sixteen letters", door(5, "QUIET")[0] == 400 and view(5)["triesLeft"] == 3)
status, body, _ = door(5, "quiet little words")
check("the right passcode opens the treasury", status == 200 and body["ok"] is True and body["view"]["opened"]["by"] == 5 and body["view"]["opened"]["code"] == CODE and body["view"]["opened"]["said"] == "QUIET LITTLE WORDS")
check("the Gamemaster says it out loud", call("GET", "/api/host/gm", cookies=host)[1].get("line") == "QUIET LITTLE WORDS")
check("every player is paid 5 coins: 80 in all", all(coins(n) == before[n] + 5 for n in range(1, 17)))
check("everyone is told", [x["n"] for x in hall(9)["notices"] if x["kind"] == "topen"] == [5] and hall(9)["treasury"]["opened"] is True)
check("it cannot be opened twice", door(6, CODE)[0] == 409 and coins(6) == before[6] + 5)
g = gm()
check("the GM sees every place, who found it and every try", g["opened"]["by"] == 5 and len(g["slots"]) == 16 and all(s["found"] for s in g["slots"]) and len(g["tries"]) == 4)
check("the GM can take it away, and the coins go back", call("POST", "/api/host/treasury", {"off": True}, host)[0] == 200 and view(1)["on"] is False and all(coins(n) == before[n] for n in range(1, 17)))

print("\n%d failed" % check.failed)
sys.exit(1 if check.failed else 0)
