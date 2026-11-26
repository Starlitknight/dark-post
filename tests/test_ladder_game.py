"""
A whole game of The Ladder against a local server, sixteen players, start to finish.
Start from an empty local database:  python3 tests/test_ladder_game.py [base]
With "keep" as a second argument it stops after stage 1 is sealed, to leave a game to look at.
"""
import json, random, sys, urllib.request, urllib.error

BASE = sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:8787"
FACE = {"s": 1, "h": 2, "c": 1, "g": 0, "b": 0, "m": 0, "o": 0}
CARDS = ["2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K", "A", "X1", "X2"]
random.seed(7)


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
num = {}
for i, t in enumerate(tokens):
    num[t] = call("POST", "/api/respond", {"accept": True}, seat(t))[1]["number"]
    call("POST", "/api/enter", {}, seat(t))
    call("POST", "/api/seal", {"bag": 1}, seat(t))
    call("POST", "/api/avatar", {"avatar": dict(FACE, o=i % 9, h=i % 20, s=i % 6, c=i % 6)}, seat(t))
    call("POST", "/api/commit", {"play": True}, seat(t))
by = {n: t for t, n in num.items()}
check("sixteen players are seated", sorted(by) == list(range(1, 17)))

night = lambda t: call("GET", "/api/night", cookies=seat(t))[1]
hall = lambda t: call("GET", "/api/hall", cookies=seat(t))[1]
coins = lambda t: hall(t)["coins"]
seal = lambda t, plays: call("POST", "/api/night/seal", {"plays": plays}, seat(t))
A = by[1]

check("the game cannot start before the bags are open", call("POST", "/api/host/night/start", {"game": "ladder"}, host)[0] == 409)
call("POST", "/api/host/reveal", {}, host)
check("a player cannot start the game", call("POST", "/api/host/night/start", {"game": "ladder"}, seat(A))[0] == 401)
check("no cards can be sealed before it starts", seal(A, [])[0] == 409)
status, body, _ = call("POST", "/api/host/night/start", {"game": "ladder"}, host)
check("the GM starts The Ladder for sixteen", status == 200 and body["players"] == 16)
check("it cannot be started twice", call("POST", "/api/host/night/start", {"game": "ladder"}, host)[0] == 409)

v = night(A)
check("stage 1 of 5, three opponents, fifteen cards, two boosts", v["game"] == "ladder" and v["stage"] == 1 and v["stages"] == 5 and len(v["opponents"]) == 5 and all(len(o) == 3 for o in v["opponents"]) and v["hand"] == CARDS and v["boostsLeft"] == 2)
met = sorted(o for st in v["opponents"] for o in st)
check("a player meets each of the other fifteen exactly once", met == list(range(2, 17)))
check("the hall says a game is on and nothing is sealed", hall(A)["night"]["game"] == "ladder" and hall(A)["night"]["stage"] == 1 and hall(A)["night"]["opened"] is False)

# the betting room: one bet on your own final score
bet = lambda t, score, stake: call("POST", "/api/bet", {"score": score, "stake": stake}, seat(t))
betv = lambda t: call("GET", "/api/bet", cookies=seat(t))[1]
check("no bets until the GM opens the betting room", betv(A)["on"] is False and bet(A, 0, 1)[0] == 409 and hall(A)["bets"] is None)
call("POST", "/api/host/settings", {"bettingOpen": True}, host)
bv = betv(A)
check("stage 1: a coin pays 5, up to 3 coins, any score from -15 to +15", bv["on"] and bv["taking"] and bv["mult"] == 5 and bv["pays"] == [5, 4, 3, 2] and bv["maxStake"] == 3 and (bv["low"], bv["high"]) == (-15, 15) and hall(A)["bets"] == {"taking": True, "stage": 1, "placed": False})
check("four coins are too many, and +16 cannot be reached", bet(A, 0, 4)[0] == 400 and bet(A, 16, 1)[0] == 400 and bet(A, 0, 0)[0] == 400)
c0 = coins(A)
status, body, _ = bet(A, -2, 2)
check("a bet is placed and the coins are taken", status == 200 and body["bet"]["score"] == -2 and body["bet"]["pays"] == 10 and coins(A) == c0 - 2 and hall(A)["bets"]["placed"] is True)
check("one bet a player, and it cannot be changed", bet(A, 3, 1)[0] == 409 and betv(A)["bet"]["score"] == -2)
check("nobody else sees it", betv(by[2])["bet"] is None)

o = v["opponents"][0]
check("a card is needed against every opponent", seal(A, [{"opp": o[0], "card": "A"}])[0] == 400)
check("a card cannot be played twice in a stage", seal(A, [{"opp": o[0], "card": "A"}, {"opp": o[1], "card": "A"}, {"opp": o[2], "card": "K"}])[0] == 400)
check("a made-up card is refused", seal(A, [{"opp": o[0], "card": "Z"}, {"opp": o[1], "card": "A"}, {"opp": o[2], "card": "K"}])[0] == 400)
check("a Joker cannot be boosted", seal(A, [{"opp": o[0], "card": "X1", "boost": True}, {"opp": o[1], "card": "A"}, {"opp": o[2], "card": "K"}])[0] == 400)
before = coins(A)
status, body, _ = seal(A, [{"opp": o[0], "card": "9", "boost": True}, {"opp": o[1], "card": "K"}, {"opp": o[2], "card": "4"}])
check("three cards are sealed, and the boost costs a coin", status == 200 and coins(A) == before - 1 and len(body["sealed"]) == 3 and hall(A)["night"]["opened"] is True)
status, body, _ = seal(A, [{"opp": o[0], "card": "9"}, {"opp": o[1], "card": "K"}, {"opp": o[2], "card": "4"}])
check("submitted cards are final: a second try is refused and changes nothing", status == 409 and coins(A) == before - 1 and night(A)["sealed"][0]["boost"] == 1)
check("nothing is decided while the opponents have not submitted", [d["r"] for d in night(A)["live"]] == [None, None, None] and night(A)["liveCount"] == 0)
waits = [x for x in hall(by[o[0]])["notices"] if x["kind"] == "wait"]
check("each opponent is told that Player 1 is waiting for them, and nobody else is", [x["n"] for x in waits] == [1] and not [x for x in hall(by[9 if 9 not in o else 10])["notices"] if x["kind"] == "wait"] and not [x for x in hall(A)["notices"] if x["kind"] == "wait"])
check("everyone can see who has submitted, and only that", night(by[o[0]])["submitted"] == [1] and hall(by[o[0]])["night"]["subs"] == 1)
hv = call("GET", "/api/host/activity", cookies=host)[1]["night"]
check("the GM sees who has sealed", hv["sealed"] == [1] and hv["stage"] == 1)
ch = {c["n"]: c for c in hv["choices"]}
check("the GM sees the cards a player has sealed, and when each player was last online", [(p["opp"], p["card"], p["boost"]) for p in ch[1]["sealed"]] == [(o[0], "9", 1), (o[1], "K", 0), (o[2], "4", 0)] and ch[2]["sealed"] is None and len(ch) == 16 and all("seen" in c for c in ch.values()))
leak = json.dumps([night(by[o[0]]), hall(by[o[0]]), betv(by[o[0]])])
check("no player is sent anyone's sealed cards or the GM's list", '"choices"' not in leak and '"sealed": [' not in leak and call("GET", "/api/host/activity", cookies=seat(by[o[0]]))[0] == 401)

import datetime
soon = (datetime.datetime.utcnow() + datetime.timedelta(hours=5)).strftime("%Y-%m-%dT%H:%M:00.000Z")
check("a player cannot set the closing time", call("POST", "/api/host/night/ends", {"endsAt": soon}, seat(A))[0] == 401)
check("a time already gone is refused", call("POST", "/api/host/night/ends", {"endsAt": "2020-01-01T00:00:00Z"}, host)[0] == 400)
check("the GM sets when the stage closes, and players are told", call("POST", "/api/host/night/ends", {"endsAt": soon}, host)[1]["endsAt"] == soon and night(A)["endsAt"] == soon and hall(A)["night"]["endsAt"] == soon)
check("the GM can remove it again", call("POST", "/api/host/night/ends", {"endsAt": ""}, host)[0] == 200 and night(A)["endsAt"] == "")

if len(sys.argv) > 2 and sys.argv[2] == "keep":
    print("left open at stage 1"); sys.exit(0)

# a coin on someone else's duel
B = by[5]
dbet = lambda t, a, b, pick: call("POST", "/api/bet/duel", {"a": a, "b": b, "pick": pick}, seat(t))
dz = betv(B)["duels"]
check("duels between other players are open for bets, never your own", len(dz["open"]) == 21 and all(5 not in (d["a"], d["b"]) for d in dz["open"]) and dz["left"] == 3 and (dz["stake"], dz["pays"]) == (1, 2))
cB = coins(B)
picks = [d for d in dz["open"] if 16 not in (d["a"], d["b"])][:3]
status, body, _ = dbet(B, picks[0]["a"], picks[0]["b"], picks[0]["a"])
check("a coin is placed on a duel", status == 200 and coins(B) == cB - 1 and body["duels"]["left"] == 2 and body["duels"]["mine"][0]["status"] == "open")
check("not twice on the same duel, not on your own, not on a stranger", dbet(B, picks[0]["a"], picks[0]["b"], picks[0]["b"])[0] == 409 and dbet(B, 5, betv(B)["duels"]["open"][0]["a"], 5)[0] == 409 and dbet(B, picks[1]["a"], picks[1]["b"], 5)[0] == 400)
dbet(B, picks[1]["a"], picks[1]["b"], picks[1]["b"]); dbet(B, picks[2]["a"], picks[2]["b"], picks[2]["a"])
check("three duel bets a stage, no more", betv(B)["duels"]["left"] == 0 and dbet(B, *[(d["a"], d["b"], d["a"]) for d in betv(B)["duels"]["open"]][0])[0] == 409 and coins(B) == cB - 3)
check("nobody else is shown them", betv(by[6])["duels"]["mine"] == [])

# everyone but Player 16 plays random cards; Player 16 never shows up
def play_stage(stage):
    for n in range(2, 16):
        v = night(by[n])
        hand = v["hand"][:]
        random.shuffle(hand)
        s, _, _ = seal(by[n], [{"opp": opp, "card": hand[i]} for i, opp in enumerate(v["opponents"][stage - 1])])
        assert s == 200, (n, stage)

play_stage(1)
v = night(A)
dec = {d["opp"]: d["r"] for d in v["live"]}
check("a duel is decided as soon as both have submitted, and one against an absent player waits", all((dec[x] is None) == (x == 16) for x in dec) and v["liveCount"] == 21)
check("the ladder counts the decided duels at once", sum(r["w"] + r["l"] + r["t"] for r in v["table"]) == 42 and sum(r["pts"] for r in v["table"]) == 0)
check("the two who dueled see each other's card at once", all(("theirs" in d) == (d["opp"] != 16) and (d["opp"] == 16 or d["theirs"] in CARDS) for d in v["live"]))
seen_by_1 = {d["opp"]: d["theirs"] for d in v["live"] if d["opp"] != 16}
check("and each side sees the other's real card", all([x for x in night(by[k])["live"] if x["opp"] == 1][0]["theirs"] == {o[0]: "9", o[1]: "K", o[2]: "4"}[k] for k in seen_by_1))
outsider = night(by[[k for k in range(2, 16) if k not in o][0]])
check("nobody else is shown this stage's cards before it closes", v["results"] == [] and all(v["used"][k] == [] for k in v["used"]) and '"ca"' not in json.dumps(v) and all(d["opp"] != 1 for d in outsider["live"]) and outsider["used"]["1"] == [])
mine = [x for x in hall(A)["notices"] if x["kind"] == "duel" and x["mine"]]
other = [x for x in hall(A)["notices"] if x["kind"] == "duel" and not x["mine"]]
check("the two who dueled are told it is decided; the rest see it as news", sorted(x["n"] for x in mine) == sorted(x for x in dec if x != 16) and len(mine) + len(other) == 21)
check("the absent player has three players waiting on them", len([x for x in hall(by[16])["notices"] if x["kind"] == "wait"]) == 3)
mine5 = betv(B)["duels"]["mine"]
check("each duel bet is settled the moment the duel is decided", all(m["status"] in ("won", "lost", "level") for m in mine5) and coins(B) == cB - 3 + sum(m["paid"] for m in mine5) and all(m["paid"] == {"won": 2, "level": 1, "lost": 0}[m["status"]] for m in mine5))
check("and the bettor is told", len([x for x in hall(B)["notices"] if x["kind"] in ("betwon", "betlost", "betlevel")]) == 3 and not [x for x in hall(by[6])["notices"] if x["kind"].startswith("bet")])
check("decided duels are closed for bets", all(16 in (d["a"], d["b"]) for d in betv(B)["duels"]["open"]))
check("a player cannot close a stage", call("POST", "/api/host/night/stage", {}, seat(A))[0] == 401)
status, body, _ = call("POST", "/api/host/night/stage", {}, host)
check("the GM closes stage 1 and stage 2 opens", status == 200 and body["stage"] == 2)
v = night(A)
r = v["results"][0]["duels"]
check("the player sees their three duels, with the cards and the boost", len(r) == 3 and [d["mine"] for d in r] == ["9", "K", "4"] and r[0]["mb"] == 1 and v["seenStage"] == 0)
check("played cards leave the hand and are public", v["hand"] == [c for c in CARDS if c not in ("9", "K", "4")] and sorted(night(by[5])["used"]["1"]) == sorted(["9", "K", "4"]))
up = v["upset"]
RANK = {c: i for i, c in enumerate(CARDS)}
check("the talk of the stage is named for everyone", up and up["stage"] == 1 and up["kind"] in ("upset", "fall") and up == night(by[7])["upset"] and ((RANK[up["cw"]] < RANK[up["cl"]]) == (up["kind"] == "upset") or up["cw"][0] == "X"))
check("the absent player's three lowest cards are burned", sorted(v["used"]["16"]) == ["2", "3", "4"])
r16 = night(by[16])["results"][0]["duels"]
check("the absent player forfeits all three duels", [d["r"] for d in r16] == [-1, -1, -1] and all(d["mf"] == 1 and d["tf"] == 0 for d in r16) and [x for x in v["table"] if x["n"] == 16][0]["pts"] == -3)
check("and each of their opponents is given the win", all([d for d in night(by[d0["opp"]])["results"][0]["duels"] if d["opp"] == 16][0]["r"] == 1 and [d for d in night(by[d0["opp"]])["results"][0]["duels"] if d["opp"] == 16][0]["tf"] == 1 for d0 in r16))
check("one boost is left and the coin stays spent", v["boostsLeft"] == 1 and coins(A) == before - 1)
check("the ladder adds up to nothing", sum(row["pts"] for row in v["table"]) == 0 and len(v["table"]) == 16)
check("an already played card is refused", seal(A, [{"opp": v["opponents"][1][0], "card": "9"}, {"opp": v["opponents"][1][1], "card": "A"}, {"opp": v["opponents"][1][2], "card": "Q"}])[0] == 400)
bv = betv(by[2])
check("stage 2: a coin pays 4, and the reachable scores have narrowed", bv["mult"] == 4 and bv["left"] == 12 and bv["high"] - bv["low"] == 24)
c2 = coins(by[2])
check("a stage 2 bet is taken at 4", bet(by[2], 6, 1)[1]["bet"]["pays"] == 4)
v = call("POST", "/api/night/stage-seen", {}, seat(A))[1]
check("the stage result is shown once", v["seenStage"] == 1)

o = v["opponents"][1]
seal(A, [{"opp": o[0], "card": "10", "boost": True}, {"opp": o[1], "card": "A"}, {"opp": o[2], "card": "Q"}])
play_stage(2)
call("POST", "/api/host/night/stage", {}, host)
v = night(A)
o = v["opponents"][2]
pts3 = [r for r in v["table"] if r["n"] == 3][0]["pts"]
c3 = coins(by[3])
check("stage 3: a coin pays 3", betv(by[3])["mult"] == 3 and bet(by[3], pts3 - 9, 3)[1]["bet"]["pays"] == 9)
check("a third boost is refused", v["boostsLeft"] == 0 and seal(A, [{"opp": o[0], "card": "J", "boost": True}, {"opp": o[1], "card": "X1"}, {"opp": o[2], "card": "2"}])[0] == 400)
for stage in (3, 4, 5):
    v = night(A)
    hand = v["hand"]
    seal(A, [{"opp": opp, "card": hand[-1 - i]} for i, opp in enumerate(v["opponents"][stage - 1])])
    play_stage(stage)
    status, body, _ = call("POST", "/api/host/night/stage", {}, host)
    if stage == 4:
        check("stage 5: the betting room is closed", betv(by[4])["taking"] is False and betv(by[4])["mult"] == 0 and bet(by[4], 0, 1)[0] == 409 and hall(by[4])["bets"]["taking"] is False)
check("closing stage 5 ends the game", status == 200 and body["status"] == "done")
check("nothing more can be closed", call("POST", "/api/host/night/stage", {}, host)[0] == 409)

v = night(A)
final = {r["n"]: r["pts"] for r in v["table"]}
check("the seeded game ends where the bets expect", final[1] == -2 and final[2] == 6)
check("a right bet is paid: 2 coins at 5", betv(A)["bet"]["won"] is True and betv(A)["bet"]["paid"] == 10 and v["bet"]["won"] is True)
check("a right stage 2 bet is paid at 4", betv(by[2])["bet"]["paid"] == 4 and coins(by[2]) == c2 - 1 + 4 + v["result"]["prizes"].get("2", 0))
check("a wrong bet is lost", betv(by[3])["bet"]["won"] is False and betv(by[3])["bet"]["paid"] == 0)
hb = call("GET", "/api/host/activity", cookies=host)[1]["night"]["bets"]
act = call("GET", "/api/host/activity", cookies=host)[1]["active"]
rank = [x["n"] for x in act]
check("the GM gets every player ranked by activity, the absent one last", len(act) == 16 and rank[-1] == 16 and act[-1]["stages"] == 0 and act[0]["score"] >= act[5]["score"] >= act[-1]["score"] and [x for x in act if x["n"] == 1][0]["stages"] == 5 and [x for x in act if x["n"] == 1][0]["bet"] == 1)
check("no player is sent the ranking", "active" not in hall(A) and "active" not in night(A) and '"partners"' not in json.dumps([hall(A), night(A)]) and call("GET", "/api/host/activity", cookies=seat(A))[0] == 401)
check("the GM sees every bet", [(b["number"], b["score"], b["stake"], b["mult"]) for b in hb] == [(1, -2, 2, 5), (2, 6, 1, 4), (3, pts3 - 9, 3, 3)])
res = v["result"]
table = v["table"]
check("every player played all fifteen cards", all(sorted(v["used"][str(n)]) == sorted(CARDS) for n in range(1, 17)) and v["hand"] == [])
check("the ladder is final: 120 duels, points add up to nothing", sum(row["w"] for row in table) == sum(row["l"] for row in table) and sum(row["pts"] for row in table) == 0 and sum(row["w"] + row["l"] + row["t"] for row in table) == 240)
check("the top three are paid 5, 3 and 1", res["prizes"] == {str(table[0]["n"]): 5, str(table[1]["n"]): 3, str(table[2]["n"]): 1})
low = min(row["pts"] for row in table)
check("the player who is out has the fewest points", (res["out"] is None and len(res["last"]) > 1) or [row for row in table if row["n"] == res["out"]][0]["pts"] == low)
if res["out"] is not None:
    check("that player is out of the game, and is told", hall(by[res["out"]])["out"] == 1 and hall(by[res["out"]])["night"]["unseen"] is True)
    check("they can no longer play", seal(by[res["out"]], [])[0] == 403)
call("POST", "/api/night/seen", {}, seat(A))
check("the result is shown once", hall(A)["night"]["unseen"] is False)
print("ladder:", [(row["n"], row["pts"]) for row in table], "out:", res["out"], "last:", res["last"])

paid = {int(k): c for k, c in res["prizes"].items()}
bal = {n: coins(by[n]) for n in range(1, 17)}
check("the GM can undo the game: prizes and boosts go back, the player returns", call("POST", "/api/host/night/reset", {}, host)[0] == 200 and night(A)["on"] is False and coins(A) == bal[1] - paid.get(1, 0) + 2 + 2 - 10 and coins(by[3]) == bal[3] - paid.get(3, 0) + 3 and all(hall(by[n])["out"] == 0 for n in range(1, 17)))

# a new game where nobody is missing: the last seal closes the stage by itself
call("POST", "/api/host/night/start", {"game": "ladder"}, host)
for n in range(1, 17):
    v = night(by[n])
    status, body, _ = seal(by[n], [{"opp": opp, "card": v["hand"][i + (n % 5)]} for i, opp in enumerate(v["opponents"][0])])
    if n == 15:
        check("with one player still to seal, the stage stays open", body["stage"] == 1 and night(A)["results"] == [])
check("when the last player seals, the cards are turned and stage 2 opens at once", status == 200 and body["stage"] == 2 and len(body["results"]) == 1 and night(A)["stage"] == 2 and len(night(A)["results"][0]["duels"]) == 3)
call("POST", "/api/host/night/reset", {}, host)

print("\n%d failed" % check.failed)
sys.exit(1 if check.failed else 0)
