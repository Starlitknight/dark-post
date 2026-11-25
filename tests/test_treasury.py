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


def fits(clue, known):
    n, out = len(known), []
    def place(i, pos, line):
        if i == len(clue):
            if any(known[p] == 1 for p in range(pos, n)): return
            out.append(line + [0] * (n - pos)); return
        rest = sum(c + 1 for c in clue[i + 1:])
        for start in range(pos, n - clue[i] - rest + 1):
            if any(known[p] == 1 for p in range(pos, start)): break
            if any(known[p] == 0 for p in range(start, start + clue[i])): continue
            end = start + clue[i]
            if end < n and known[end] == 1: continue
            place(i + 1, min(n, end + 1), line + [0] * (start - pos) + [1] * clue[i] + ([0] if end < n else []))
    place(0, 0, [])
    return out


def solve(clues):
    """Solve by reasoning one line at a time, as a player would. Returns 100 characters of 0 and 1."""
    g = [[-1] * 10 for _ in range(10)]
    for _ in range(60):
        moved = False
        for axis in (0, 1):
            for i in range(10):
                known = [g[r][i] for r in range(10)] if axis else g[i][:]
                alls = fits(clues["cols"][i] if axis else clues["rows"][i], known)
                for p in range(10):
                    if known[p] == -1 and all(l[p] == alls[0][p] for l in alls):
                        if axis: g[p][i] = alls[0][p]
                        else: g[i][p] = alls[0][p]
                        moved = True
        if not moved: break
    assert all(v != -1 for r in g for v in r), "a puzzle needed guessing"
    return "".join(str(v) for r in g for v in r)


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
check("a player is given the number clues of their own puzzle", status == 200 and len(pz["clues"]["rows"]) == 10 and len(pz["clues"]["cols"]) == 10 and pz["solved"] is False and pz["grid"] is None)
other = [n for n in range(2, 17)][0]
check("and may not open another player's puzzle", puzzle(1, slots[other])[0] == 403 and submit(1, slots[other], "0" * 100)[0] == 403)
check("a wrong grid is not accepted", submit(1, slots[1], "0" * 100)[1]["ok"] is False and view(1)["letters"] == [])
cells = solve(pz["clues"])
call("POST", "/api/treasury/work", {"slot": slots[1], "cells": cells[:50] + "0" * 50}, seat(by[1]))
check("unfinished work is kept", puzzle(1, slots[1])[1]["work"] == cells[:50] + "0" * 50)
status, body, _ = submit(1, slots[1], cells.replace("0", "2", 5))
check("the right grid gives the letter and its place", body["ok"] is True and body["letter"] == CODE[slots[1]] and body["place"] == slots[1] + 1 and view(1)["letters"] == [{"slot": slots[1], "letter": CODE[slots[1]]}])
check("the others are told a character was found, not which", [x["n"] for x in hall(other)["notices"] if x["kind"] == "tfound"] == [1] and CODE[slots[1]] not in json.dumps([x for x in hall(other)["notices"]]) and view(other)["slots"][slots[1]]["found"] is True and view(other)["letters"] == [])

# asking for help
check("a puzzle can be opened to everyone", call("POST", "/api/treasury/help", {"on": True}, seat(by[2]))[1]["slots"][slots[2]]["help"] is True and [x["n"] for x in hall(3)["notices"] if x["kind"] == "thelp"] == [2])
status, pz2, _ = puzzle(3, slots[2])
status, body, _ = submit(3, slots[2], solve(pz2["clues"]))
check("another player solves it: both now hold that character", body["ok"] and body["letter"] == CODE[slots[2]] and {"slot": slots[2], "letter": CODE[slots[2]]} in view(3)["letters"] and view(2)["letters"] == [{"slot": slots[2], "letter": CODE[slots[2]]}])
check("and the holder is told who cracked it", [x["n"] for x in hall(2)["notices"] if x["kind"] == "tsolved"] == [3])

# every other player solves their own
for n in range(3, 17):
    s, pzn, _ = puzzle(n, slots[n])
    assert submit(n, slots[n], solve(pzn["clues"]))[1]["ok"], n
found = "".join(next(l["letter"] for l in view(n)["letters"] if l["slot"] == slot) for slot, n in sorted((slot, n) for n, slot in slots.items()))
check("the sixteen characters, in their places, spell the passcode", found == CODE)
check("all sixteen puzzles could be solved without guessing", hall(5)["treasury"]["found"] == 16)

# the door
before = {n: coins(n) for n in range(1, 17)}
status, body, _ = door(4, "QUIETLITTLEWORDZ")
check("a wrong passcode is refused, and says how many letters were right", body["ok"] is False and body["right"] == 15 and body["triesLeft"] == 2 and coins(4) == before[4])
door(4, "A" * 16); door(4, "B" * 16)
check("three tries a player", door(4, CODE)[0] == 409 and view(4)["triesLeft"] == 0)
check("the passcode must be sixteen letters", door(5, "QUIET")[0] == 400 and view(5)["triesLeft"] == 3)
status, body, _ = door(5, "quiet little words")
check("the right passcode opens the treasury", status == 200 and body["ok"] is True and body["view"]["opened"]["by"] == 5 and body["view"]["opened"]["code"] == CODE)
check("every player is paid 5 coins: 80 in all", all(coins(n) == before[n] + 5 for n in range(1, 17)))
check("everyone is told", [x["n"] for x in hall(9)["notices"] if x["kind"] == "topen"] == [5] and hall(9)["treasury"]["opened"] is True)
check("it cannot be opened twice", door(6, CODE)[0] == 409 and coins(6) == before[6] + 5)
g = gm()
check("the GM sees every place, who found it and every try", g["opened"]["by"] == 5 and len(g["slots"]) == 16 and all(s["found"] for s in g["slots"]) and len(g["tries"]) == 4)
check("the GM can take it away, and the coins go back", call("POST", "/api/host/treasury", {"off": True}, host)[0] == 200 and view(1)["on"] is False and all(coins(n) == before[n] for n in range(1, 17)))

print("\n%d failed" % check.failed)
sys.exit(1 if check.failed else 0)
