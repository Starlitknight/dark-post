"""End-to-end check of the Dark Post server against a local `wrangler dev`.

Run:  python3 tests/test_flow.py [base_url]
Start from an empty local database. Walks a host and 18 invited guests from the
invitation through the hall and its nine rooms, the daily puzzle, the dungeon cells,
the opening-night reveal and the deals that follow it.
"""
import json
import os
import re
import sys
import time
import urllib.error
import urllib.request

BASE = sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:8787"
FACE = {"s": 1, "h": 2, "c": 1, "g": 0, "b": 0, "m": 0, "o": 0}


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


def seat(token):
    return {"dp_seat": token}


def me(token):
    return call("GET", "/api/me", cookies=seat(token))[1]


def say(token, room, text, **extra):
    time.sleep(0.75)  # the server asks players to leave a short gap between messages
    return call("POST", "/api/messages", dict({"room": room, "body": text}, **extra), seat(token))


def read(token, room, **params):
    query = "&".join(f"{k}={v}" for k, v in dict({"room": room}, **params).items())
    return call("GET", "/api/messages?" + query, cookies=seat(token))[1].get("messages", [])


def hall_of(token):
    return call("GET", "/api/hall", cookies=seat(token))[1]


def walk(token, room, x, y):
    return call("POST", "/api/move", {"r": room, "x": x, "y": y}, seat(token))[0]


def seat_of(token, n):
    return [s for s in hall_of(token)["seats"] if s["number"] == n][0]


# --- solving the daily puzzle the way a player would, from what is on the screen ---
WORDS = re.findall(r'"([A-Z]{5,9})"', open(os.path.join(os.path.dirname(__file__), "..", "src", "puzzles.js")).read().split("const WORDS")[1].split("];")[0])


def solve(p):
    d = p["data"]
    if p["type"] == "code":
        def score(secret, guess):
            place = sum(1 for i in range(3) if guess[i] == secret[i])
            digit = sum(1 for i in range(3) if guess[i] != secret[i] and guess[i] in secret)
            return place, digit
        codes = [f"{a}{b}{c}" for a in range(1, 10) for b in range(1, 10) for c in range(1, 10) if len({a, b, c}) == 3]
        fits = [c for c in codes if all(score(c, k["guess"]) == (k["place"], k["digit"]) for k in d["clues"])]
        assert len(fits) == 1, "the clues must leave exactly one code"
        return fits[0]
    if p["type"] == "sums":
        rows = [r["sum"] for r in d["rows"]]
        fits = [a * b * c for a in range(1, 10) for b in range(1, 10) for c in range(1, 10) if [2 * a + b, 2 * b + c, 2 * c + a] == rows]
        assert len(fits) == 1
        return str(fits[0])
    if p["type"] == "cipher":
        for shift in range(1, 26):
            word = "".join(chr((ord(ch) - 65 - shift) % 26 + 65) for ch in d["text"])
            if word in WORDS:
                return word
        raise AssertionError("no word fits the cipher")
    t = d["terms"]
    if all(t[i] == t[i - 1] + t[i - 2] for i in range(2, 6)):
        return str(t[5] + t[4])
    k = t[2] - t[1]
    if t[1] == 2 * t[0] and t[3] == 2 * t[2] and t[4] == t[3] + k and t[5] == 2 * t[4]:
        return str(t[5] + k)
    step = t[5] - t[4]
    return str(t[5] + step + (step - (t[4] - t[3])))


# --- host setup ---
status, body, _ = call("GET", "/api/host/state")
check("host state is locked before sign-in", body.get("authed") is False)

status, body, _ = call("POST", "/api/host/login", {"passphrase": "short"})
check("short passphrase is refused", status == 400)

status, body, headers = call("POST", "/api/host/login", {"passphrase": "correct horse battery"})
host_cookie = headers.get("Set-Cookie", "").split(";")[0].split("=", 1)[1]
host = {"dp_host": host_cookie}
check("first sign-in sets the host passphrase", status == 200 and bool(host_cookie))

status, body, _ = call("POST", "/api/host/login", {"passphrase": "wrong passphrase"})
check("wrong passphrase is refused afterwards", status == 401)

status, body, _ = call("POST", "/api/host/invites", {"names": ["x"]})
check("host routes need the host cookie", status == 401)

names = [f"Guest {i}" for i in range(1, 19)]
status, body, _ = call("POST", "/api/host/invites", {"names": names}, host)
check("18 invitations created", status == 200 and body.get("created") == 18)

status, body, _ = call("POST", "/api/host/settings", {"opensAt": "2099-12-05T02:00:00Z", "replyBy": "2099-12-03T02:00:00Z", "letter": {"signature": "S"}}, host)
check("settings saved", status == 200)

status, state, _ = call("GET", "/api/host/state", cookies=host)
tokens = [inv["token"] for inv in state["invites"]]
check("host sees 18 invitations", len(tokens) == 18)

# --- the door ---
check("unknown link sees nothing", me("not-a-real-token").get("state") == "none")
body = me(tokens[0])
check("invited guest sees the letter", body.get("state") == "letter" and body.get("number") is None)
check("letter carries the opening date", body.get("opensAt", "").startswith("2099-12-05"))

status, body, _ = call("POST", "/api/seal", {"bag": 2}, seat(tokens[0]))
check("cannot seal before accepting", status == 403)

call("POST", "/api/respond", {"accept": False}, seat(tokens[16]))
check("declined guest sees the declined state", me(tokens[16]).get("state") == "declined")

numbers = []
for t in tokens[:16]:
    status, body, _ = call("POST", "/api/respond", {"accept": True}, seat(t))
    numbers.append(body.get("number"))
check("16 accepted, numbers are 1..16 with no repeats", sorted(numbers) == list(range(1, 17)))
check("numbers are not handed out in invitation order", numbers != list(range(1, 17)))

check("the 17th guest is told the house is full", me(tokens[17]).get("state") == "full")
status, body, _ = call("POST", "/api/respond", {"accept": True}, seat(tokens[17]))
check("the 17th guest cannot take a seat", status == 409)

check("accepted guest lands on the number screen", me(tokens[0]).get("state") == "number")
call("POST", "/api/enter", {}, seat(tokens[0]))
check("after entering, guest must choose a bag", me(tokens[0]).get("state") == "choose")

status, body, _ = call("POST", "/api/seal", {"bag": 3}, seat(tokens[0]))
check("an invalid bag is refused", status == 400)
status, body, _ = call("POST", "/api/avatar", {"avatar": FACE}, seat(tokens[0]))
check("no face before a bag is sealed", status == 409)

# 6 players take Bag 2, 9 take Bag 1, one never seals
for i, t in enumerate(tokens[:15]):
    status, body, _ = call("POST", "/api/seal", {"bag": 2 if i < 6 else 1}, seat(t))
check("15 choices sealed", status == 200)
status, body, _ = call("POST", "/api/seal", {"bag": 1}, seat(tokens[0]))
check("a sealed choice cannot be changed", status == 409)

body = me(tokens[0])
check("after sealing, the guest makes a face", body.get("state") == "avatar" and body.get("bag") == 2)
check("no other player's choice leaks before the reveal", "reveal" not in body and "results" not in json.dumps(body))

# --- faces and the hall ---
status, body, _ = call("GET", "/api/hall", cookies=seat(tokens[0]))
check("no hall before a face is made", status == 403)
status, body, _ = call("POST", "/api/avatar", {"avatar": {"s": 99, "h": 0, "c": 0, "g": 0, "b": 0, "m": 0, "o": 0}}, seat(tokens[0]))
check("an impossible face is refused", status == 400)
for i, t in enumerate(tokens[:14]):
    status, body, _ = call("POST", "/api/avatar", {"avatar": dict(FACE, o=i % 9, h=i % 20, t=i % 4, x=i % 9, e=i % 2)}, seat(t))
check("14 faces saved", status == 200)
check("with a face, the guest is in the hall", me(tokens[0]).get("state") == "hall")

A, B, C = tokens[0], tokens[1], tokens[2]
nA, nB, nC = numbers[0], numbers[1], numbers[2]
status, hall, _ = call("GET", "/api/hall", cookies=seat(A))
arrived = [s for s in hall["seats"] if s["avatar"]]
check("the hall has 16 seats, 14 filled and 2 empty", len(hall["seats"]) == 16 and len(arrived) == 14)
check("the hall names nobody and shows no bags", "name" not in json.dumps(hall) and "bag" not in json.dumps(hall))
status, body, _ = call("GET", "/api/hall", cookies=seat(tokens[15]))
check("a player still at the door cannot enter the hall", status == 403)
status, body, _ = call("GET", "/api/messages?room=table", cookies=seat(tokens[15]))
check("nor read its rooms", status == 403)

# --- standing and walking ---
check("nobody has moved yet", hall["pos"] == {} and hall["online"] == [])
status, body, _ = call("POST", "/api/move", {"r": "arena", "x": 750, "y": 440}, seat(A))
check("a player can walk somewhere", status == 200)
check("every one of the nine rooms can be walked into", all(walk(C, r, 600, 600) == 200 for r in ["hall", "arena", "puzzle", "betting", "studio", "sky", "dungeon", "gallery", "shop"]))
check("messages, the GM and the notice board are not rooms to stand in", all(walk(C, r, 600, 600) == 400 for r in ["table", "bank", "study", "board", "whisper"]))
walk(C, "hall", 900, 900)
status, body, _ = call("POST", "/api/move", {"r": "hall", "x": 99999, "y": 5}, seat(A))
check("but not outside the set", status == 400)
status, body, _ = call("POST", "/api/move", {"r": "attic", "x": 10, "y": 10}, seat(A))
check("nor into a room that does not exist", status == 400)
status, body, _ = call("POST", "/api/move", {"r": "hall", "x": 500, "y": 500}, seat(tokens[15]))
check("and not before entering the hall", status == 403)
check("others see which room that player is in, and where", call("GET", "/api/hall", cookies=seat(B))[1]["pos"].get(str(nA)) == ["arena", 750, 440])
status, body, _ = call("GET", "/api/live", cookies=seat(A))
check("the live line refuses a plain request", status == 426)

# --- the clock: what comes after the bags ---
h = call("GET", "/api/hall", cookies=seat(A))[1]
check("the next round has a name before the host sets one, and no time", h.get("nextName") == "Night 1" and h.get("nextAt") == "")
status, body, _ = call("POST", "/api/host/settings", {"nextName": "Night 1: Four Wings", "nextAt": "2099-12-06T02:00:00Z"}, host)
check("the host can name the next round and say when it begins", status == 200)
h = call("GET", "/api/hall", cookies=seat(A))[1]
check("every player's clock is told", h.get("nextName") == "Night 1: Four Wings" and h.get("nextAt", "").startswith("2099-12-06"))
status, body, _ = call("POST", "/api/host/settings", {"nextAt": "not a date"}, host)
check("a date that cannot be read is refused", status == 400)
status, body, _ = call("POST", "/api/host/settings", {"nextName": "", "nextAt": ""}, host)
h = call("GET", "/api/hall", cookies=seat(A))[1]
check("and both can be cleared again", status == 200 and h.get("nextName") == "Night 1" and h.get("nextAt") == "")

# --- the table (public) ---
status, body, _ = say(A, "table", "Good evening, strangers.")
check("a player can speak at the table", status == 200)
status, body, _ = call("POST", "/api/messages", {"room": "table", "body": "again, at once"}, seat(A))
check("two messages in the same instant are slowed down", status == 429)
status, body, _ = say(B, "table", "   ")
check("an empty message is refused", status == 400)
status, body, _ = say(B, "table", "x" * 601)
check("an over-long message is refused", status == 400)
check("another player is told there is one unread at the table", call("GET", "/api/hall", cookies=seat(B))[1]["unread"]["table"] == 1)
msgs = read(B, "table")
check("everyone at the table hears it, by number only", len(msgs) == 1 and msgs[0]["from"] == nA and msgs[0]["body"] == "Good evening, strangers.")
check("reading clears the unread count", call("GET", "/api/hall", cookies=seat(B))[1]["unread"]["table"] == 0)

# --- whispers (private) ---
status, body, _ = say(A, "whisper", "Between us: which bag?", **{"with": nB})
check("a player can whisper to another", status == 200)
status, body, _ = say(A, "whisper", "hello?", **{"with": numbers[15]})
check("no whispering to a player who has not arrived", status == 400)
status, body, _ = say(A, "whisper", "to myself", **{"with": nA})
check("no whispering to yourself", status == 400)
hallB = call("GET", "/api/hall", cookies=seat(B))[1]
check("the other player sees the whisper waiting", hallB["unread"]["whispers"] == 1 and hallB["whispers"][0]["with"] == nA)
check("and can read it", [m["body"] for m in read(B, "whisper", **{"with": nA})] == ["Between us: which bag?"])
check("a third player cannot read that whisper", read(C, "whisper", **{"with": nA}) == [] and read(C, "whisper", **{"with": nB}) == [])
check("a third player sees no trace of it in the hall", call("GET", "/api/hall", cookies=seat(C))[1]["whispers"] == [])

# --- the study (private line to the GM) ---
say(A, "study", "Is lying allowed?")
check("another player cannot read someone else's study", read(B, "study") == [])
state = call("GET", "/api/host/state", cookies=host)[1]
check("the host sees one unread question in the study", state["inbox"]["study"].get(str(nA)) == 1)
thread = call("GET", f"/api/host/messages?room=study&with={nA}", cookies=host)[1]["messages"]
check("the host reads the question", [m["body"] for m in thread] == ["Is lying allowed?"])
status, body, _ = call("POST", "/api/host/messages", {"room": "study", "to": nA, "body": "Encouraged."}, host)
check("the host answers in private", status == 200)
check("the player is told the GM answered", call("GET", "/api/hall", cookies=seat(A))[1]["unread"]["study"] == 1)
check("and reads the answer, from the GM", [(m["from"], m["body"]) for m in read(A, "study")] == [(nA, "Is lying allowed?"), (0, "Encouraged.")])

# --- the notice board: the GM writes, everyone reads ---
status, body, _ = say(C, "board", "When do the bags open?")
check("a player cannot write on the notice board", status == 403)
status, body, _ = call("POST", "/api/host/messages", {"room": "board", "body": "Notice: be kind to the furniture."}, host)
check("the host posts a notice", status == 200)
check("a player is told there is a new notice", hall_of(B)["unread"]["board"] == 1)
board = read(B, "board")
check("every player reads it, from the GM", [(m["from"], m["body"]) for m in board] == [(0, "Notice: be kind to the furniture.")])
cast = hall_of(C).get("lastCast") or {}
check("the latest broadcast is carried to every screen", cast.get("from") == nA and cast.get("body") == "Good evening, strangers.")
status, body, _ = call("POST", "/api/host/messages", {"room": "table", "body": "Welcome, all of you."}, host)
check("the host can speak at the table", status == 200 and read(A, "table")[-1]["from"] == 0)
whispers = call("GET", "/api/host/messages?room=whispers", cookies=host)[1]["messages"]
check("the host can read whispers", len(whispers) == 1 and whispers[0]["from"] == nA and whispers[0]["to"] == nB)
status, body, _ = call("GET", "/api/host/messages?room=whispers")
check("nobody else can use the host's view", status == 401)

# --- the puzzle of the day ---
status, pz, _ = call("GET", "/api/puzzle", cookies=seat(B))
check("a player gets today's puzzle, three tries, and no answer", status == 200 and pz["type"] in ["code", "sums", "cipher", "sequence"] and pz["left"] == 3 and "answer" not in pz and pz["solved"] is False)
check("the same player sees the same puzzle again", call("GET", "/api/puzzle", cookies=seat(B))[1]["data"] == pz["data"])
others = [call("GET", "/api/puzzle", cookies=seat(t))[1] for t in tokens[2:8]]
check("other players get the same kind of puzzle with different numbers", all(o["type"] == pz["type"] for o in others) and sum(1 for o in others if o["data"] != pz["data"]) >= 5)
status, body, _ = call("POST", "/api/puzzle", {"answer": "  "}, seat(B))
check("an empty answer is not counted", status == 400 and call("GET", "/api/puzzle", cookies=seat(B))[1]["left"] == 3)
status, body, _ = call("POST", "/api/puzzle", {"answer": "zzzz"}, seat(B))
check("a wrong answer costs a try", status == 200 and body["right"] is False and body["left"] == 2 and "answer" not in body)
status, body, _ = call("POST", "/api/puzzle", {"answer": " " + solve(pz).lower() + " "}, seat(B))
check("the right answer solves it", status == 200 and body["right"] is True and body["solved"] is True and body["paid"] is False)
status, body, _ = call("POST", "/api/puzzle", {"answer": solve(pz)}, seat(B))
check("it cannot be solved twice", status == 409)
check("someone else's answer is worth nothing", solve(others[5]) == solve(pz) or call("POST", "/api/puzzle", {"answer": solve(pz)}, seat(tokens[7]))[1]["right"] is False)
for _ in range(3):
    status, body, _ = call("POST", "/api/puzzle", {"answer": "0"}, seat(C))
check("after three wrong tries the answer is shown", body["left"] == 0 and body["solved"] is False and body.get("answer") == solve(others[0]))
status, body, _ = call("POST", "/api/puzzle", {"answer": solve(others[0])}, seat(C))
check("and no fourth try is allowed", status == 409)
solved_all = True
for i, t in enumerate(tokens[3:7]):
    solved_all = solved_all and call("POST", "/api/puzzle", {"answer": solve(others[i + 1])}, seat(t))[1].get("right") is True
check("four more players solve their own puzzles", solved_all)
h = hall_of(A)
check("every player card counts puzzles solved", seat_of(A, nB)["solved"] == 1 and seat_of(A, nC)["solved"] == 0)
check("the coin is held back until the bags open", h["coins"] is None and hall_of(B)["coins"] is None and hall_of(B)["banked"] == 1)
status, body, _ = call("POST", "/api/deal", {"to": nB, "choice": "c"}, seat(A))
check("no deals before the bags open", status == 409)
check("the betting room says it is closed", call("GET", "/api/deals", cookies=seat(A))[1]["open"] is False)
check("the host cannot hand out coins before the bags open either", call("POST", "/api/host/coins", {"number": nA, "amount": 3}, host)[0] == 409)

# --- the dungeon: three cells, and a door log ---
check("the door log starts empty", call("GET", "/api/doorlog", cookies=seat(A))[1] == {"entries": [], "now": {"1": [], "2": [], "3": []}, "mine": 0})
walk(A, "dungeon", 750, 760)
check("standing in the corridor is not standing in a cell", hall_of(A)["cell"] == 0 and call("GET", "/api/messages?room=cell1", cookies=seat(A))[0] == 403)
walk(A, "dungeon", 250, 300)
walk(A, "dungeon", 300, 350)
log = call("GET", "/api/doorlog", cookies=seat(C))[1]
check("walking into a cell is written in the door log, once", [(e["n"], e["cell"]) for e in log["entries"]] == [(nA, 1)] and log["now"]["1"] == [nA] and log["mine"] == 0)
status, body, _ = say(B, "cell1", "Let me in.")
check("a player outside a cell cannot speak in it", status == 403)
check("or read it", call("GET", "/api/messages?room=cell1", cookies=seat(B))[0] == 403)
walk(B, "dungeon", 400, 400)
status, body, _ = say(A, "cell1", "Say Bag 1 if anyone asks.")
check("a player can speak in the cell they stand in", status == 200)
check("the other player in the cell hears it", [(m["from"], m["body"]) for m in read(B, "cell1")] == [(nA, "Say Bag 1 if anyone asks.")])
walk(C, "dungeon", 200, 200)
check("a player who walks in later did not hear it", read(C, "cell1") == [])
say(B, "cell1", "Agreed.")
check("but hears what is said from then on", [m["body"] for m in read(C, "cell1")] == ["Agreed."])
walk(C, "dungeon", 700, 300)
check("the next cell is a different room", hall_of(C)["cell"] == 2 and read(C, "cell2") == [] and call("GET", "/api/messages?room=cell1", cookies=seat(C))[0] == 403)
walk(A, "hall", 900, 900)
check("walking out closes the cell behind you", call("GET", "/api/messages?room=cell1", cookies=seat(A))[0] == 403)
log = call("GET", "/api/doorlog", cookies=seat(A))[1]
check("the door log lists everyone who went into a cell, newest first", [(e["n"], e["cell"]) for e in log["entries"]] == [(nC, 2), (nC, 1), (nB, 1), (nA, 1)] and log["now"] == {"1": [nB], "2": [nC], "3": []})
check("cell talk never reaches the broadcasts or private messages", len(read(A, "table")) == 2 and hall_of(C)["whispers"] == [])
cells = call("GET", "/api/host/messages?room=cells", cookies=host)[1]["messages"]
check("the host hears every cell", [m["body"] for m in cells] == ["Say Bag 1 if anyone asks.", "Agreed."])
walk(B, "hall", 800, 900)
walk(C, "hall", 900, 800)

# --- moderation ---
first = read(A, "table")[0]
call("POST", "/api/host/message/remove", {"id": first["id"]}, host)
gone = read(B, "table", after=0)[0]
check("a message the host removes is blanked for everyone", gone["removed"] is True and gone["body"] == "")

# --- a face can change before the doors open ---
status, body, _ = call("POST", "/api/avatar", {"avatar": dict(FACE, h=6)}, seat(A))
check("a face can be changed before the bags open", status == 200 and me(A)["avatar"]["h"] == 6)

# --- reveal ---
status, body, _ = call("POST", "/api/host/reveal", {}, host)
check("host opens the bags", status == 200)

body = me(A)
rev = body.get("reveal") or {}
check("guest is sent to the reveal", body.get("state") == "reveal")
check("six players share 40: 6 coins each, rounded down", rev.get("bag2Count") == 6 and rev.get("bag2Share") == 6)
check("4 coins are left in the bag", rev.get("leftover") == 4)
check("the reveal lists who took Bag 2", sorted(rev.get("order") or []) == sorted(numbers[:6]))
check("Bag 2 player holds 6 coins", body.get("coins") == 6)
check("Bag 1 player holds 5 coins", me(tokens[10]).get("coins") == 5)
check("a player who never sealed holds 0 coins", me(tokens[15]).get("coins") == 0)
check("a sealed player without a face makes one before the reveal", me(tokens[14]).get("state") == "avatar")
status, body, _ = call("POST", "/api/avatar", {"avatar": FACE}, seat(A))
check("faces are fixed once the bags are open", status == 409)

call("POST", "/api/seen", {}, seat(A))
check("after watching, the guest returns to the hall", me(A).get("state") == "hall")
hall = call("GET", "/api/hall", cookies=seat(A))[1]
check("the hall now shows every seat's coins", [s.get("coins") for s in hall["seats"] if s["number"] == nA] == [6] and hall["coins"] == 6)
check("a solved puzzle is paid when the bags open", hall_of(B)["coins"] == 7 and seat_of(A, nB)["coins"] == 7 and me(B)["coins"] == 6 and me(B)["extra"] == 1)

# --- the betting room: two players, two sealed choices ---
D, E, F, G = tokens[3], tokens[4], tokens[5], tokens[6]
nD, nE, nF, nG = numbers[3], numbers[4], numbers[5], numbers[6]
deals = call("GET", "/api/deals", cookies=seat(A))[1]
check("the betting room is open, with the stake and every payoff on show", deals["open"] is True and deals["stake"] == 2 and deals["pay"] == {"cc": [1, 1], "cb": [-2, 2], "bc": [2, -2], "bb": [-1, -1]} and deals["balance"] == 6)
check("a player can deal with anyone who has arrived", len(deals["players"]) == 13 and nA not in deals["players"])
check("a deal needs a choice", call("POST", "/api/deal", {"to": nB, "choice": "x"}, seat(A))[0] == 400)
check("and another player", call("POST", "/api/deal", {"to": nA, "choice": "c"}, seat(A))[0] == 400 and call("POST", "/api/deal", {"to": numbers[15], "choice": "c"}, seat(A))[0] == 400)
status, body, _ = call("POST", "/api/deal", {"to": nB, "choice": "c"}, seat(A))
offer = (body.get("mine") or {}).get("id")
check("an offer is sealed and the stake is taken", status == 200 and body["mine"]["with"] == nB and body["balance"] == 4)
check("only one offer at a time", call("POST", "/api/deal", {"to": nC, "choice": "c"}, seat(A))[0] == 409)
hB = hall_of(B)
check("the other player is told an offer is waiting", hB["unread"]["deals"] == 1 and call("GET", "/api/deals", cookies=seat(B))[1]["incoming"] == [{"id": offer, "from": nA}])
check("the offer does not say what was chosen", "choice" not in json.dumps(call("GET", "/api/deals", cookies=seat(B))[1]["incoming"]))
check("a third player cannot answer it", call("POST", "/api/deal/answer", {"id": offer, "choice": "b"}, seat(C))[0] == 403)
check("or take it back", call("POST", "/api/deal/answer", {"id": offer, "cancel": True}, seat(C))[0] == 403)
status, body, _ = call("POST", "/api/deal/answer", {"id": offer, "choice": "b"}, seat(B))
check("betraying a player who cooperated wins 2", status == 200 and body["result"] == {"with": nA, "mine": "b", "theirs": "c", "net": 2} and body["balance"] == 9)
dA = call("GET", "/api/deals", cookies=seat(A))[1]
check("and costs the one who cooperated 2", dA["balance"] == 4 and dA["past"][0]["net"] == -2 and dA["past"][0]["theirs"] == "b" and dA["mine"] is None)
check("one deal a day, for both players", dA["doneToday"] is True and call("POST", "/api/deal", {"to": nC, "choice": "c"}, seat(A))[0] == 409 and call("POST", "/api/deal", {"to": nC, "choice": "c"}, seat(B))[0] == 409)
check("a finished offer cannot be answered again", call("POST", "/api/deal/answer", {"id": offer, "choice": "c"}, seat(B))[0] == 404)
check("nobody else is shown the result", call("GET", "/api/deals", cookies=seat(C))[1]["past"] == [])
check("every player card counts deals made", seat_of(C, nA)["deals"] == 1 and seat_of(C, nB)["deals"] == 1 and seat_of(C, nC)["deals"] == 0)

offer = call("POST", "/api/deal", {"to": nD, "choice": "c"}, seat(C))[1]["mine"]["id"]
status, body, _ = call("POST", "/api/deal/answer", {"id": offer, "cancel": True}, seat(C))
check("an offer can be taken back, and the stake returns", status == 200 and body["mine"] is None and body["balance"] == 6 and body["doneToday"] is False)
offer = call("POST", "/api/deal", {"to": nD, "choice": "c"}, seat(C))[1]["mine"]["id"]
status, body, _ = call("POST", "/api/deal/answer", {"id": offer, "decline": True}, seat(D))
check("an offer can be declined, and the stake returns", status == 200 and body["incoming"] == [] and call("GET", "/api/deals", cookies=seat(C))[1]["balance"] == 6)
offer = call("POST", "/api/deal", {"to": nD, "choice": "c"}, seat(C))[1]["mine"]["id"]
status, body, _ = call("POST", "/api/deal/answer", {"id": offer, "choice": "c"}, seat(D))
check("two players who cooperate win 1 each", body["result"]["net"] == 1 and body["balance"] == 8 and call("GET", "/api/deals", cookies=seat(C))[1]["balance"] == 7)
offer = call("POST", "/api/deal", {"to": nF, "choice": "b"}, seat(E))[1]["mine"]["id"]
status, body, _ = call("POST", "/api/deal/answer", {"id": offer, "choice": "b"}, seat(F))
check("two players who betray lose 1 each", body["result"]["net"] == -1 and body["balance"] == 6 and call("GET", "/api/deals", cookies=seat(E))[1]["balance"] == 6)
offer = call("POST", "/api/deal", {"to": nA, "choice": "c"}, seat(G))[1]["mine"]["id"]
check("a player who has dealt today cannot answer another offer", call("POST", "/api/deal/answer", {"id": offer, "choice": "c"}, seat(A))[0] == 409)
call("POST", "/api/deal/answer", {"id": offer, "cancel": True}, seat(G))
check("the coins on every card follow the deals", [seat_of(G, n)["coins"] for n in [nA, nB, nC, nD, nE, nF, nG]] == [4, 9, 7, 8, 6, 6, 6])

# --- what the host sees of the rooms, and coins given by hand ---
check("players cannot see the host's record of the rooms", call("GET", "/api/host/activity", cookies=seat(A))[0] == 401)
act = call("GET", "/api/host/activity", cookies=host)[1]
check("the host sees every deal, with both choices", [d["status"] for d in act["deals"]] == ["cancelled", "done", "done", "declined", "cancelled", "done"] and (act["deals"][-1]["a"], act["deals"][-1]["aChoice"], act["deals"][-1]["bChoice"], act["deals"][-1]["aNet"], act["deals"][-1]["bNet"]) == (nA, "c", "b", -2, 2))
rowB = [p for p in act["puzzle"]["players"] if p["n"] == nB][0]
rowC = [p for p in act["puzzle"]["players"] if p["n"] == nC][0]
check("and every player's puzzle, with its answer", len(act["puzzle"]["players"]) == 14 and rowB["solved"] is True and rowB["answer"] == solve(pz) and rowC["solved"] is False and rowC["tries"] == 3)
check("and the door log", [(e["n"], e["cell"]) for e in act["doors"]] == [(nC, 2), (nC, 1), (nB, 1), (nA, 1)])
status, body, _ = call("POST", "/api/host/coins", {"number": nG, "amount": 3}, host)
check("the host can give a player coins", status == 200 and body["coins"] == 9 and hall_of(G)["coins"] == 9)
status, body, _ = call("POST", "/api/host/coins", {"number": nG, "amount": -4}, host)
check("and take them away", status == 200 and body["coins"] == 5 and seat_of(A, nG)["coins"] == 5)
check("but not more than the player holds", call("POST", "/api/host/coins", {"number": nG, "amount": -6}, host)[0] == 409)
check("nor nothing, nor half a coin, nor to an empty seat", call("POST", "/api/host/coins", {"number": nG, "amount": 0}, host)[0] == 400 and call("POST", "/api/host/coins", {"number": nG, "amount": 1.5}, host)[0] == 400 and call("POST", "/api/host/coins", {"number": numbers[15], "amount": 1}, host)[0] == 400)
check("a player cannot hand out coins", call("POST", "/api/host/coins", {"number": nA, "amount": 50}, seat(A))[0] == 401)
check("the host is told how many cell messages are unread", call("GET", "/api/host/state", cookies=host)[1]["inbox"]["cells"] == 0)

# --- Night 1: Six Vaults ---
def night(token):
    return call("GET", "/api/night", cookies=seat(token))[1]


def open_vaults(token, a, b, throws="rpsrp"):
    return call("POST", "/api/night/open", {"vaults": [a, b], "throws": list(throws)}, seat(token))


H = tokens[7]
nH = numbers[7]
check("before a match begins there is nothing to play", night(A)["on"] is False and open_vaults(A, 2, 3)[0] == 409 and call("POST", "/api/night/buy", {}, seat(A))[0] == 409)
check("a player cannot start a match", call("POST", "/api/host/night/start", {}, seat(A))[0] == 401)
check("the vaults cannot close in the past", call("POST", "/api/host/night/start", {"endsAt": "2020-01-01T00:00:00Z"}, host)[0] == 400)
status, body, _ = call("POST", "/api/host/night/start", {"endsAt": "2099-12-08T02:00:00Z"}, host)
check("the host starts Night 1 for the 14 players in the game", status == 200 and body["players"] == 14)
check("a second match cannot start while one is on", call("POST", "/api/host/night/start", {}, host)[0] == 409)
v = night(A)
check("a player is told the rules and holds one clue", v["on"] and v["status"] == "open" and v["rules"]["amounts"] == [10, 5, 2] and v["rules"]["open"] == 2 and len(v["clue"]) > 20 and v["bought"] == "" and v["opened"] is None and v["canBuy"] is True)
check("nothing about the vaults' contents or anyone else's clue is sent", "layout" not in json.dumps(v) and "result" not in v and "players" not in v)
clues = [night(t)["clue"] for t in tokens[:14]]
check("every player's clue is different", len(set(clues)) == 14 and all(clues))
hn = call("GET", "/api/host/activity", cookies=host)[1]["night"]
check("the host sees the vaults and who holds which clue", hn["layout"] == [0, 10, 5, 0, 2, 0] and sorted(p["clue"] for p in hn["players"]) == sorted(clues))
check("the hall tells every screen a match is on", hall_of(A)["night"] == {"n": 1, "game": "vaults", "status": "open", "endsAt": "2099-12-08T02:00:00.000Z", "opened": False, "unseen": False})
status, body, _ = call("POST", "/api/night/buy", {}, seat(A))
check("the shop sells one more clue for a coin", status == 200 and len(body["bought"]) > 20 and body["bought"] != body["clue"] and body["coins"] == 3 and body["canBuy"] is False)
check("and only one", call("POST", "/api/night/buy", {}, seat(A))[0] == 409)
check("two vaults means two different vaults that exist", open_vaults(A, 2, 2)[0] == 400 and open_vaults(A, 2, 7)[0] == 400 and call("POST", "/api/night/open", {"vaults": [2], "throws": list("rpsrp")}, seat(A))[0] == 400)
check("and five throws of rock, paper or scissors", open_vaults(A, 2, 3, "rps")[0] == 400 and open_vaults(A, 2, 3, "rpsxx")[0] == 400)
status, body, _ = open_vaults(A, 3, 2)
check("a player opens two vaults and is not told what was inside", status == 200 and body["opened"] == [2, 3] and "result" not in body and "layout" not in json.dumps(body))
check("opening is final", open_vaults(A, 1, 4)[0] == 409 and night(A)["opened"] == [2, 3])
open_vaults(B, 2, 5)
check("the shop is shut to a player who has already opened", call("POST", "/api/night/buy", {}, seat(B))[0] == 409)
open_vaults(C, 1, 2)
open_vaults(D, 3, 5)
open_vaults(E, 1, 4, "rrrrr")
open_vaults(F, 4, 6, "ppppp")
for t in tokens[7:14]:
    open_vaults(t, 2, 3)
check("the hall knows who has opened", hall_of(A)["night"]["opened"] is True and hall_of(G)["night"]["opened"] is False)
check("a player cannot end the match", call("POST", "/api/host/night/end", {}, seat(A))[0] == 401)
status, body, _ = call("POST", "/api/host/night/end", {}, host)
r = body.get("result") or {}
check("the host closes the vaults and the gold is counted", status == 200 and r["layout"] == [0, 10, 5, 0, 2, 0] and [r["gold"][str(n)] for n in [nA, nB, nC, nD, nE, nF, nG]] == [15, 12, 10, 7, 0, 0, 0])
check("the three highest amounts are paid 5, 3 and 1", [r["prize"][str(n)] for n in [nA, numbers[7], nB, nC, nD, nE]] == [5, 5, 3, 1, 0, 0] and r["rank"][str(nD)] == 4)
check("three players tied for last, and the one who never opened is out", r["last"] == sorted([nE, nF, nG]) and r["out"] == nG and r["duel"]["forfeit"] is True)
check("prizes are added to coins, and the clue was paid for", [hall_of(t)["coins"] for t in [A, B, C, D, E]] == [8, 12, 8, 8, 6])
v = night(A)
check("every player can now see every vault and who opened what", v["status"] == "done" and v["result"]["plays"][str(nE)] == [1, 4] and v["result"]["out"] == nG and v["seen"] is False and hall_of(A)["night"]["unseen"] is True)
call("POST", "/api/night/seen", {}, seat(A))
check("the result is shown once", night(A)["seen"] is True and hall_of(A)["night"]["unseen"] is False)
check("the vaults are shut after the match", open_vaults(H, 1, 2)[0] == 409 and call("POST", "/api/night/buy", {}, seat(H))[0] == 409)
check("the player who is out is marked out for everyone", me(G)["out"] == 1 and seat_of(A, nG).get("out") == 1 and hall_of(G)["out"] == 1 and seat_of(A, nA).get("out") is None)
status, body, _ = say(G, "table", "I was robbed.")
check("a player who is out cannot broadcast, message, deal or solve", status == 403 and say(G, "whisper", "psst", **{"with": nA})[0] == 403 and call("POST", "/api/deal", {"to": numbers[8], "choice": "c"}, seat(G))[0] == 403 and call("POST", "/api/puzzle", {"answer": "1"}, seat(G))[0] == 403)
check("but can still ask the GM, and still look around", say(G, "study", "Can I watch?")[0] == 200 and call("GET", "/api/hall", cookies=seat(G))[0] == 200 and walk(G, "sky", 600, 600) == 200)
check("nobody can message or deal with a player who is out", say(H, "whisper", "sorry", **{"with": nG})[0] == 400 and nG not in call("GET", "/api/deals", cookies=seat(H))[1]["players"])

status, body, _ = call("POST", "/api/host/night/reset", {}, host)
check("the host can undo the match: coins go back and the player returns", status == 200 and night(A)["on"] is False and me(G)["out"] == 0 and [hall_of(t)["coins"] for t in [A, B, C, G]] == [4, 9, 7, 5])
soon = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(time.time() + 4))
call("POST", "/api/host/night/start", {"endsAt": soon}, host)
open_vaults(E, 1, 4, "rrrrr")
open_vaults(F, 4, 6, "ppppp")
open_vaults(G, 1, 6, "rpppp")
for t in [A, B, C, D] + tokens[7:14]:
    open_vaults(t, 2, 3)
time.sleep(4.5)
h = hall_of(A)
check("the vaults close by themselves when the time runs out", h["night"]["status"] == "done" and open_vaults(tokens[7], 1, 2)[0] == 409)
r = night(A)["result"]
check("a tie for last is settled by Rock Paper Scissors from the sealed throws", r["last"] == sorted([nE, nF, nG]) and r["out"] == nE and len(r["duel"]["rounds"]) == 3 and r["duel"]["rounds"][0]["losers"] == sorted([nE, nG]) and r["duel"]["wins"][str(nG)] == 2)
check("eleven players on the top amount are each paid 5", sum(1 for n in r["prize"].values() if n == 5) == 11 and r["prize"][str(nE)] == 0)
check("the host can bring a player back", call("POST", "/api/host/out", {"number": nE, "out": False}, host)[0] == 200 and me(E)["out"] == 0)
check("or send one home", call("POST", "/api/host/out", {"number": nE}, host)[0] == 200 and me(E)["out"] == 1 and call("POST", "/api/host/out", {"number": nE}, seat(A))[0] == 401)
call("POST", "/api/host/night/reset", {}, host)
check("after the undo everyone is back in", me(E)["out"] == 0 and hall_of(A)["night"] is None)

status, body, _ = call("POST", "/api/seal", {"bag": 1}, seat(tokens[15]))
check("no sealing after the reveal", status == 409)
call("POST", "/api/enter", {}, seat(tokens[15]))
check("a latecomer skips the bags and goes to make a face", me(tokens[15]).get("state") == "avatar")
call("POST", "/api/avatar", {"avatar": FACE}, seat(tokens[15]))
status, body, _ = call("POST", "/api/deal", {"to": nC, "choice": "c"}, seat(tokens[15]))
check("a player with no coins cannot stake a deal", status == 409 and "need 2 coins" in body.get("error", ""))

# --- undo, reset, and a rounding case: 3 players in Bag 2 -> 13 each ---
call("POST", "/api/host/unreveal", {}, host)
check("undoing the reveal returns guests to the hall with no coins", me(A).get("state") == "hall" and me(A).get("coins") is None)
call("POST", "/api/host/invite/reset", {"token": A}, host)
check("resetting a player erases their messages", all(m["from"] != nA for m in read(B, "table", after=0)) and read(B, "whisper", **{"with": nA}) == [])
check("and where they stood", str(nA) not in call("GET", "/api/hall", cookies=seat(B))[1]["pos"])
for t in tokens[:16]:
    call("POST", "/api/host/invite/reset", {"token": t}, host)
for i, t in enumerate(tokens[:16]):
    call("POST", "/api/respond", {"accept": True}, seat(t))
    call("POST", "/api/seal", {"bag": 2 if i < 3 else 1}, seat(t))
call("POST", "/api/host/reveal", {}, host)
check("three players share 40: 13 coins each, rounded down", me(tokens[0]).get("coins") == 13)
call("POST", "/api/host/unreveal", {}, host)

# --- host can hide who took which bag ---
call("POST", "/api/host/settings", {"showChoices": False}, host)
call("POST", "/api/host/reveal", {}, host)
rev = me(tokens[0]).get("reveal") or {}
check("with choices hidden, players get counts only", rev.get("bag2Count") == 3 and "results" not in rev and "order" not in rev)
call("POST", "/api/host/unreveal", {}, host)
call("POST", "/api/host/settings", {"showChoices": True}, host)

# --- the bags can open by themselves at the opening time ---
call("POST", "/api/host/settings", {"opensAt": "2020-01-01T00:00:00Z", "autoOpen": True}, host)
body = me(tokens[0])
check("auto-open reveals once the opening time has passed", body.get("phase") == "revealed" and body.get("coins") == 13)
call("POST", "/api/host/unreveal", {}, host)
check("undo switches auto-open off so it does not reopen at once", me(tokens[0]).get("phase") == "open")

# --- the seat can also be carried in the X-Seat header (the link itself) ---
req = urllib.request.Request(BASE + "/api/me")
req.add_header("X-Seat", tokens[0])
with urllib.request.urlopen(req) as res:
    body = json.loads(res.read())
check("the link alone identifies the player, without a cookie", body.get("state") == "avatar")

# --- the invitation link serves the site and remembers the seat ---
with urllib.request.urlopen(BASE + "/i/" + tokens[0]) as res:
    page = res.read().decode()
    set_cookie = res.headers.get("Set-Cookie", "")
check("invitation link serves the site", "Dark Post" in page and res.status == 200)
check("invitation link remembers the seat on the device", ("dp_seat=" + tokens[0]) in set_cookie)

# --- wrong passphrase lockout ---
for _ in range(5):
    status, body, _ = call("POST", "/api/host/login", {"passphrase": "wrong passphrase"})
status, body, _ = call("POST", "/api/host/login", {"passphrase": "correct horse battery"})
check("five wrong passphrases lock sign-in for a minute", status == 429)

print()
print("ALL PASSED" if not check.failed else f"{check.failed} FAILED")
sys.exit(1 if check.failed else 0)
