"""
Four liars against a local server: the GM starts it, one answer fits, it pays.
Start from an empty local database:  python3 tests/test_liars.py [base]
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


HOUSEHOLD = ["Ada", "Basil", "Clara", "Dev", "Esme", "Felix", "Greta", "Hugo", "Iris", "Jonah"]
hall = lambda n: call("GET", "/api/hall", cookies=seat(by[n]))[1]
coins = lambda n: hall(n)["coins"]
pz = lambda n: call("GET", "/api/puzzle", cookies=seat(by[n]))[1]
answer = lambda n, a, no: call("POST", "/api/puzzle", {"answer": a, "no": no}, seat(by[n]))


def fits(says, liar):
    return all((c["lie"] == liar[c["who"]]) != liar[i] for i, s in enumerate(says) for c in s)


def solutions(says):
    return [l for l in itertools.combinations(range(10), 4) if fits(says, [i in l for i in range(10)])]


check("a player cannot start a puzzle", call("POST", "/api/host/puzzle", {"next": True, "kind": "truth"}, seat(by[1]))[0] == 401)
before = pz(1)
status, _, _ = call("POST", "/api/host/puzzle", {"next": True, "kind": "truth"}, host)
p = pz(1)
check("the GM starts AI among us", status == 200 and p["type"] == "truth" and p["title"] == "AI among us" and p["day"] == before["day"] + 1)
d = p["data"]
check("ten subjects, each saying something", sorted(d["cast"]) == list(range(10)) and len(d["says"]) == 10 and all(1 <= len(s) <= 3 for s in d["says"]) and d["liars"] == 4)
check("the answer is not sent before it is solved", p.get("answer") is None)
sols = solutions(d["says"])
check("exactly one set of four AIs fits", len(sols) == 1)
right = " ".join(HOUSEHOLD[d["cast"][i]].upper() for i in sols[0])
check("every player gets the same puzzle", pz(2)["data"] == d and pz(16)["no"] == p["no"])
wrong = " ".join(HOUSEHOLD[d["cast"][i]].upper() for i in [j for j in range(10) if j not in sols[0]][:4])
had = coins(1)
r = answer(1, wrong, p["no"])[1]
check("a wrong four costs a try", r["right"] is False and r["left"] == 2)
r = answer(1, right.lower(), p["no"])[1]
check("the right four solves it and pays", r["right"] is True and r["solved"] is True and coins(1) == had + 1 and r["answer"].upper().split() == right.split())
act = call("GET", "/api/host/activity", cookies=host)[1]
check("the GM sees it in the console", "puzzle" in act)
# the next ordinary puzzle goes back to the daily turns
call("POST", "/api/host/puzzle", {"next": True}, host)
check("the next puzzle after it is an ordinary one", pz(1)["type"] in ("code", "keys", "cipher"))

print()
print(f"{check.failed} failed")
sys.exit(1 if check.failed else 0)
