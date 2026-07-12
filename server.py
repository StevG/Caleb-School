#!/usr/bin/env python3
"""Spelling Practice — tiny standard-library server.

Serves the kid + parent front-end from ./static and a small JSON API backed by
a single JSON file (data/progress.json). No third-party packages.

HomeHub contract:
  - reads the listen port from $PORT (defaults to 8013 for local dev),
  - binds 127.0.0.1 (loopback only),
  - runs in the foreground,
  - exposes GET /.hub/status for the dashboard.

Run locally:   PORT=9999 python3 server.py   then open http://127.0.0.1:9999
"""

import base64
import hashlib
import json
import os
import random
import secrets
import subprocess
import sys
import threading
import time
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse, parse_qs, urlsplit

import wordbank
import badgebank
import factbank

HERE = os.path.dirname(os.path.abspath(__file__))
STATIC_DIR = os.path.join(HERE, "static")
DATA_DIR = os.path.join(HERE, "data")
DATA_FILE = os.path.join(DATA_DIR, "progress.json")
PUSH_FILE = os.path.join(DATA_DIR, "push.json")

DEFAULT_PIN = "1234"

# --- The learning ladder ----------------------------------------------------
# Every word climbs: 1 Copy it (word stays visible while typing) ->
# 2 From memory (hides at the first keystroke) -> 3 From sound (audio only)
# -> 4 Mastered. Unaided corrects advance it; any miss drops it one stage.
# Aided retypes (after the answer was revealed) never advance anything.
STAGE_COPY, STAGE_MEMORY, STAGE_SOUND, STAGE_MASTERED = 1, 2, 3, 4
STAGE_UP = {STAGE_COPY: 1, STAGE_MEMORY: 2, STAGE_SOUND: 2}
STAGE_NAMES = {1: "copy", 2: "memory", 3: "sound", 4: "mastered"}
# Each word game maps to a rung, and a game can only prove skills up to its
# own rung: copying a word can never mark it "spells it from memory", and
# only Listen & Spell (true from-sound recall) can finish a word off as
# mastered. Modes not listed (listen, sentences, memory) climb uncapped.
CLIMB_CAP = {"copy": STAGE_MEMORY, "words": STAGE_SOUND, "build": STAGE_MEMORY}
# "pick" (Which One?) is recognition, not recall — weaker evidence in BOTH
# directions, so it never moves the ladder (no climb, no drop). See
# docs/SCORING.md; enforced by record_answer skipping the stage block.
NO_LADDER_MODES = {"pick"}


WORDS, SENTENCES = wordbank.build_pool()
WORD_GROUP = {item["w"]: item["group"] for item in WORDS}

# Category catalog: every bank word belongs to one named group (a phonics
# pattern like "Long a (ai)", a theme, sight/tricky words, or a grade's
# general list), and every group lives in exactly one half-grade band.
# GROUP_ORDER preserves wordbank's build order — phonics patterns first,
# then themes, sight words, grade lists — which is the teaching order the
# parent dashboard shows categories in.
GROUP_ORDER = []
GROUP_LEVEL = {}
for _item in WORDS:
    if _item["group"] not in GROUP_LEVEL:
        GROUP_ORDER.append(_item["group"])
        GROUP_LEVEL[_item["group"]] = float(_item["level"])
# "Grade N · early/later" catch-alls are general word lists, not a taught
# feature — the dashboard labels them differently and the type analysis
# keeps them apart from the pattern work.
GENERAL_GROUPS = {g for g in GROUP_ORDER if g.startswith("Grade ")}
_GROUP_WORDS = {}
for _item in WORDS:
    _GROUP_WORDS.setdefault(_item["group"], []).append(_item["w"])
# the catalog the parent's "assign by category / grade" dropdowns draw from
TYPE_GROUPS = [{"name": g, "level": GROUP_LEVEL[g],
                "general": g in GENERAL_GROUPS, "total": len(_GROUP_WORDS[g])}
               for g in GROUP_ORDER]

# The bank is organized in half-grade bands (1.0, 1.5, ... 9.0). Each band is
# individually selectable in the parent's Word lists card; a word belongs to
# the band matching its level.
BAND_COUNTS = {}
for _item in WORDS:
    BAND_COUNTS[float(_item["level"])] = \
        BAND_COUNTS.get(float(_item["level"]), 0) + 1
GRADE_BANDS = sorted(BAND_COUNTS)


def default_bands(max_level=3.0):
    return [b for b in GRADE_BANDS if b <= float(max_level)]

_lock = threading.RLock()

# A short hash of everything in static/ (name + size + mtime). It changes the
# moment any front-end file changes, which lets an installed PWA notice a new
# deploy and prompt the user to refresh — the same code path serves the app on
# the Raspberry Pi and on HomeHub, so this works identically in both.
_version_cache = {"sig": None, "version": "dev"}


def asset_version():
    parts = []
    for root, _dirs, files in os.walk(STATIC_DIR):
        for name in files:
            try:
                st = os.stat(os.path.join(root, name))
            except OSError:
                continue
            parts.append(f"{name}:{st.st_size}:{int(st.st_mtime)}")
    sig = "|".join(sorted(parts))
    if sig != _version_cache["sig"]:
        _version_cache["sig"] = sig
        _version_cache["version"] = hashlib.sha1(sig.encode()).hexdigest()[:12]
    return _version_cache["version"]

MIME = {
    ".html": "text/html; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".js": "application/javascript; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".png": "image/png",
    ".webmanifest": "application/manifest+json",
    ".ico": "image/x-icon",
    ".svg": "image/svg+xml",
}


# --- persistence -----------------------------------------------------------

VALID_MODES = ("copy", "words", "listen", "sentences", "memory",
               "pick", "build")


def _default_child(name="Caleb"):
    """One kid's entire world — progress, sources, settings. Every helper in
    this file (sessions, ladder, report, lists) operates on ONE of these."""
    return {
        "id": "c1",
        "profile": {
            "name": name,
            "points": 0,
            "show_speaker": True,
            "max_level": 3,
        },
        "words": {},          # word -> {seen, correct, missed, streak, last_ts}
        "lists": [],          # [{id, name, enabled, words: [{w, on}]}]
        "bank_off": [],       # bank words switched off individually
        "modes": {},          # mode -> {seen, correct, missed, points}
        "days": {},           # "YYYY-MM-DD" -> {seen, correct, missed, points,
                              #                  modes: {mode: {...}}}
        "last_answer_ts": 0,  # when the kid last answered anything
        "custom_words": [],   # parent-added words
        "sessions": [],       # list of {ts, mode, count, correct, points}
        "assignments": [],    # parent-assigned tests ("missions") — see
                              # _api_assign: {id, mode, list_id, name, count,
                              #               ts, status, result?, done_ts?}
        "counters": {},       # lifetime tallies for badges (badgebank.py) —
                              # immune to resets; seeded from history on first
                              # load (see _seed_counters)
        "badges": {},         # badge id -> earned level (0-4)
        "quest": {},          # Today's Quest: {date, done}
    }


def _fill_child(child):
    """Fill in any keys added since the file was written + run migrations."""
    base = _default_child()
    for k, v in base.items():
        if k not in child:
            child[k] = v
    for k, v in base["profile"].items():
        child["profile"].setdefault(k, v)
    child["profile"].setdefault("bank_enabled", True)
    child["profile"].setdefault("hearts_only", False)
    child["profile"].setdefault("autoplay_audio", False)
    child["profile"].setdefault("word_rate", 0.8)    # TTS reading speed
    child["profile"].setdefault("spell_rate", 0.45)  # slower for letters
    # migrate the old single "max level" cap into per-band selection
    if "enabled_grades" not in child["profile"]:
        child["profile"]["enabled_grades"] = default_bands(
            child["profile"].get("max_level", 3))
    # migrate the old flat school list into the lists model
    if child.get("custom_words") and not child["lists"]:
        child["lists"].append({
            "id": new_list_id(child),
            "name": "School list",
            "enabled": True,
            "words": [{"w": clean_token(w), "on": True}
                      for w in child["custom_words"] if clean_token(w)],
        })
    # badges: seed lifetime counters from existing history the first time, so
    # a kid who's been practicing wakes up to the badges he already earned
    if "_counters_seeded" not in child:
        _seed_counters(child)
        child["_counters_seeded"] = True
        # baseline the earned levels WITHOUT celebrating — these are already his
        child["badges"] = {b["id"]: badgebank.badge_tier(b, m)
                           for b, m in (
                               (bd, badge_metrics(child).get(bd["metric"], 0))
                               for bd in badgebank.BADGES)}
    return child


def _seed_counters(child):
    """Best-effort lifetime tallies from a child's existing data — floors, not
    exact history. Going forward the live counters accumulate precisely."""
    stats = child.get("words", {})
    modes = child.get("modes", {})
    sessions = child.get("sessions", [])
    c = child.setdefault("counters", {})
    c.setdefault("lifetime_correct",
                 sum(s.get("correct", 0) for s in stats.values()))
    c.setdefault("lifetime_points", child["profile"].get("points", 0))
    c.setdefault("best_streak", max((s.get("streak", 0)
                                     for s in stats.values()), default=0))
    c.setdefault("answer_streak", 0)
    c.setdefault("sessions_total", len(sessions))
    c.setdefault("perfect_sessions",
                 sum(1 for s in sessions
                     if s.get("count", 0) > 0
                     and s.get("correct", 0) >= s.get("count", 0)))
    gs = {}
    for s in sessions:
        mode = s.get("mode", "words")
        gs[mode] = gs.get(mode, 0) + 1
    c.setdefault("game_sessions", gs)
    c.setdefault("stage_ups", sum(max(0, word_stage(s) - 1)
                                  for s in stats.values() if s.get("seen", 0)))
    c.setdefault("listen_correct", modes.get("listen", {}).get("correct", 0))
    c.setdefault("sentence_words",
                 modes.get("sentences", {}).get("correct", 0)
                 + modes.get("memory", {}).get("correct", 0))
    c.setdefault("missions_done",
                 sum(1 for a in child.get("assignments", [])
                     if a.get("status") == "done"))
    c.setdefault("fastest_pace", 0)  # no historical timing
    streak = current_day_streak(child)
    c.setdefault("day_streak", streak)
    c.setdefault("best_day_streak", streak)


# --- Badges (badgebank.py catalog, per-child counters + tier engine) --------

def current_day_streak(state):
    """Consecutive calendar days with practice, counting back from today."""
    days = state.get("days", {})
    if not days:
        return 0
    streak = 0
    t = time.time()
    for _ in range(400):
        if time.strftime("%Y-%m-%d", time.localtime(t)) in days:
            streak += 1
            t -= 86400
        else:
            break
    return streak


def quest_done_today(state):
    """Whether the kid already finished today's one-tap Quest (the small
    5-word warm-up). Reward only pays once/day; the card flips to a calm
    'play again?' state after that."""
    q = state.get("quest") or {}
    return q.get("date") == time.strftime("%Y-%m-%d") and bool(q.get("done"))


def yesterday_stats(state):
    """The most recent PRACTICED day before today — used to greet the kid
    with evidence of yesterday's competence ('Yesterday: 23 ⭐')."""
    days = state.get("days", {})
    today = time.strftime("%Y-%m-%d")
    past = sorted(d for d in days if d < today)
    if not past:
        return None
    d = days[past[-1]]
    return {"points": d.get("points", 0), "correct": d.get("correct", 0)}


def badge_metrics(state):
    """Every value the catalog measures against, from counters (live) plus a
    few derived straight from the word stats (always current)."""
    c = state.get("counters", {})
    stats = state.get("words", {})
    mastered = sum(1 for s in stats.values()
                   if s.get("seen", 0) and word_stage(s) >= STAGE_MASTERED)
    hearts = sum(1 for w, s in stats.items()
                 if w in wordbank.HEART_WORDS and s.get("seen", 0)
                 and word_stage(s) >= STAGE_MASTERED)
    gs = c.get("game_sessions", {})
    all_games = min((gs.get(mode, 0) for mode in VALID_MODES), default=0)
    return {
        "speed": c.get("fastest_pace", 0),
        "perfect_sessions": c.get("perfect_sessions", 0),
        "best_streak": c.get("best_streak", 0),
        "lifetime_correct": c.get("lifetime_correct", 0),
        "lifetime_points": c.get("lifetime_points", 0),
        "sessions_total": c.get("sessions_total", 0),
        "best_day_streak": c.get("best_day_streak", 0),
        "words_mastered": mastered,
        "hearts_mastered": hearts,
        "stage_ups": c.get("stage_ups", 0),
        "all_games": all_games,
        "listen_correct": c.get("listen_correct", 0),
        "sentence_words": c.get("sentence_words", 0),
        "missions_done": c.get("missions_done", 0),
    }


def evaluate_badges(state):
    """Recompute every badge's level, persist, and return the levels newly
    reached this call (for celebration) with the stars they awarded."""
    metrics = badge_metrics(state)
    prev = state.get("badges", {})
    now = {}
    newly = []
    for b in badgebank.BADGES:
        old = prev.get(b["id"], 0)
        # trophies never un-earn: a progress reset clears the words a couple of
        # metrics derive from, but a badge already won stays won (floor at old)
        tier = max(old, badgebank.badge_tier(b, metrics.get(b["metric"], 0)))
        now[b["id"]] = tier
        if tier > old:
            # the badge IS the reward — no star payout (owner 2026-07-12:
            # stars are in-session feedback only, badges the one trophy system)
            newly.append({"id": b["id"], "name": b["name"],
                          "emoji": b["emoji"], "level": tier})
    state["badges"] = now
    return newly


def badges_view(state):
    """The catalog with this child's level + progress — drives the badge case
    and the parent's badges strip."""
    metrics = badge_metrics(state)
    stored = state.get("badges", {})
    out = []
    for b in badgebank.BADGES:
        val = metrics.get(b["metric"], 0)
        # earned level is sticky (see evaluate_badges); progress uses live value
        tier = max(stored.get(b["id"], 0), badgebank.badge_tier(b, val))
        out.append({
            "id": b["id"], "name": b["name"], "emoji": b["emoji"],
            "accent": b["accent"], "category": b["category"],
            "blurb": b["blurb"], "unlock": b.get("unlock", ""),
            "unit": b.get("unit", ""), "lower_better": bool(b.get("lower_better")),
            "level": tier, "value": val,
            "tiers": b["tiers"],
            "prev_at": b["tiers"][tier - 1] if tier > 0 else None,
            "next_at": b["tiers"][tier] if tier < 4 else None,
        })
    return out


def badges_earned_count(state):
    return sum(1 for lv in state.get("badges", {}).values() if lv > 0)


# --- Fact of the day (factbank.py catalog) -----------------------------------
# One dino/space/LEGO fact shows on the home screen each day, no strings
# attached (owner 2026-07-12: fun content, not a collection to grind).
# Deterministic daily rotation so every device shows the same fact all day
# and the deck takes ~3 months to cycle.

def daily_fact():
    day_number = int(time.strftime("%Y")) * 366 + int(time.strftime("%j"))
    f = factbank.FACTS[day_number % len(factbank.FACTS)]
    return {"emoji": f["emoji"], "text": f["text"]}


def next_badge(state):
    """The badge closest to its next level — the done-screen 'what's next'
    nudge that turns each session into a micro-goal (BADGES.md: the progress
    hint IS the mechanism). Skips maxed badges, speed (lower-better, no clean
    fraction), and ones with no progress yet; ranks by fraction-to-next then
    fewest remaining."""
    best = None
    for b in badges_view(state):
        if b["level"] >= 4 or b["next_at"] is None or b.get("lower_better"):
            continue
        val, prev, need = b["value"], (b["prev_at"] or 0), b["next_at"]
        if val <= prev or need <= prev:
            continue  # no progress toward the next level yet
        key = ((val - prev) / (need - prev), -(need - val))
        if best is None or key > best[0]:
            best = (key, {"name": b["name"], "emoji": b["emoji"],
                          "level": b["level"], "have": val, "need": need})
    return best[1] if best else None


def load_doc():
    """The whole family: {"pin": parent PIN, "children": [child, ...]}.
    A pre-multi-child progress.json (one kid's dict at the top level)
    migrates in place: it becomes child #1 and its PIN moves up to the doc.
    There is always at least one child."""
    with _lock:
        try:
            with open(DATA_FILE, "r", encoding="utf-8") as f:
                doc = json.load(f)
        except (FileNotFoundError, ValueError):
            doc = None
        if not isinstance(doc, dict):
            doc = {"pin": DEFAULT_PIN, "children": [_default_child()]}
        elif "children" not in doc:
            legacy = doc
            pin = str(legacy.get("profile", {}).pop("pin", DEFAULT_PIN))
            legacy["id"] = "c1"
            doc = {"pin": pin, "children": [legacy]}
        doc.setdefault("pin", DEFAULT_PIN)
        kids = [k for k in doc.get("children", []) if isinstance(k, dict)]
        doc["children"] = kids or [_default_child()]
        for i, kid in enumerate(doc["children"]):
            kid.setdefault("id", f"c{i + 1}")
            _fill_child(kid)
        return doc


def save_doc(doc):
    with _lock:
        os.makedirs(DATA_DIR, exist_ok=True)
        tmp = DATA_FILE + ".tmp"
        with open(tmp, "w", encoding="utf-8") as f:
            json.dump(doc, f, indent=2)
        os.replace(tmp, DATA_FILE)


def get_child(doc, cid):
    """The child a request is about; falls back to the first child so a
    stale/missing id (deleted kid, old client) never breaks anything."""
    for kid in doc["children"]:
        if kid.get("id") == str(cid or ""):
            return kid
    return doc["children"][0]


def new_child_id(doc):
    have = {kid.get("id") for kid in doc["children"]}
    n = 1
    while f"c{n}" in have:
        n += 1
    return f"c{n}"


def children_roster(doc):
    """What pickers render: every kid's id, name, points."""
    return [{"id": kid["id"],
             "name": kid["profile"].get("name", "Kid"),
             "points": kid["profile"].get("points", 0)}
            for kid in doc["children"]]


# --- Web Push (pure stdlib) --------------------------------------------------
# Push services demand VAPID: an ES256-signed JWT proving who's sending. The
# stdlib has no elliptic-curve crypto, so the P-256 math lives here (~50
# lines — sign-only, no secrets travel through it). Payload ENCRYPTION
# (aes128gcm) is deliberately avoided: we send empty "tickle" pushes and the
# service worker pulls the actual message from /api/push/pull. Notifications
# here are conveniences, never the system of record.

_EC_P = 0xffffffff00000001000000000000000000000000ffffffffffffffffffffffff
_EC_N = 0xffffffff00000000ffffffffffffffffbce6faada7179e84f3b9cac2fc632551
_EC_G = (0x6b17d1f2e12c4247f8bce6e563a440f277037d812deb33a0f4a13945d898c296,
         0x4fe342e2fe1a7f9b8ee7eb4a7c0f9e162bce33576b315ececbb6406837bf51f5)


def _ec_add(a, b):
    if a is None:
        return b
    if b is None:
        return a
    if a[0] == b[0] and (a[1] + b[1]) % _EC_P == 0:
        return None  # point at infinity
    if a == b:
        # P-256 is y^2 = x^3 - 3x + b, so the tangent slope carries the -3
        lam = (3 * a[0] * a[0] - 3) * pow(2 * a[1], -1, _EC_P) % _EC_P
    else:
        lam = (b[1] - a[1]) * pow(b[0] - a[0], -1, _EC_P) % _EC_P
    x = (lam * lam - a[0] - b[0]) % _EC_P
    return (x, (lam * (a[0] - x) - a[1]) % _EC_P)


def _ec_mul(k, pt):
    out = None
    while k:
        if k & 1:
            out = _ec_add(out, pt)
        pt = _ec_add(pt, pt)
        k >>= 1
    return out


def _ecdsa_sign(d, message):
    z = int.from_bytes(hashlib.sha256(message).digest(), "big")
    while True:
        k = secrets.randbelow(_EC_N - 1) + 1
        r = _ec_mul(k, _EC_G)[0] % _EC_N
        if not r:
            continue
        s = pow(k, -1, _EC_N) * (z + r * d) % _EC_N
        if s:
            return r.to_bytes(32, "big") + s.to_bytes(32, "big")


def _b64url(raw):
    return base64.urlsafe_b64encode(raw).rstrip(b"=").decode()


def load_push():
    with _lock:
        try:
            with open(PUSH_FILE, "r", encoding="utf-8") as f:
                store = json.load(f)
        except (FileNotFoundError, ValueError):
            store = {}
        fresh_key = "vapid_d" not in store
        if fresh_key:
            store["vapid_d"] = secrets.randbelow(_EC_N - 1) + 1
        store.setdefault("subs", [])   # [{role, child, endpoint}]
        store.setdefault("queue", {})  # endpoint -> [{title, body, ts}]
        if fresh_key:
            save_push(store)  # the key must survive restarts — subscriptions
        return store          # made against it die if it changes


def save_push(store):
    with _lock:
        os.makedirs(DATA_DIR, exist_ok=True)
        tmp = PUSH_FILE + ".tmp"
        with open(tmp, "w", encoding="utf-8") as f:
            json.dump(store, f)
        os.replace(tmp, PUSH_FILE)


def vapid_public_key(store):
    x, y = _ec_mul(store["vapid_d"], _EC_G)
    return _b64url(b"\x04" + x.to_bytes(32, "big") + y.to_bytes(32, "big"))


def vapid_headers(store, endpoint):
    bits = urlsplit(endpoint)
    claims = {"aud": f"{bits.scheme}://{bits.netloc}",
              "exp": int(time.time()) + 12 * 3600,
              "sub": "mailto:spelling@localhost"}
    head = _b64url(json.dumps({"typ": "JWT", "alg": "ES256"}).encode())
    body = _b64url(json.dumps(claims).encode())
    signing = f"{head}.{body}".encode()
    jwt = f"{head}.{body}.{_b64url(_ecdsa_sign(store['vapid_d'], signing))}"
    return {"Authorization": f"vapid t={jwt}, k={vapid_public_key(store)}",
            "TTL": "86400"}


def _push_deliver(endpoint, headers):
    """One empty 'tickle' POST to a push service. Runs on a worker thread —
    never on a request thread, never with the lock held."""
    try:
        req = urllib.request.Request(endpoint, data=b"", method="POST",
                                     headers=headers)
        urllib.request.urlopen(req, timeout=10)
        return True
    except urllib.error.HTTPError as e:
        if e.code in (404, 410):  # the device unsubscribed — forget it
            with _lock:
                store = load_push()
                store["subs"] = [s for s in store["subs"]
                                 if s["endpoint"] != endpoint]
                store["queue"].pop(endpoint, None)
                save_push(store)
        return False
    except Exception:
        return False  # best-effort: a missed ping must never break practice


def notify(role, child_id, title, body):
    """Queue a message for every matching device and tickle each one.
    role 'child': that kid's devices. role 'parent': every parent device."""
    with _lock:
        store = load_push()
        targets = [s for s in store["subs"] if s["role"] == role and
                   (role == "parent" or s.get("child") == child_id)]
        for s in targets:
            q = store["queue"].setdefault(s["endpoint"], [])
            q.append({"title": title, "body": body, "ts": int(time.time())})
            del q[:-5]  # a device that's been away only needs the recent few
        if targets:
            save_push(store)
        jobs = [(s["endpoint"], vapid_headers(store, s["endpoint"]))
                for s in targets]
    for endpoint, headers in jobs:
        threading.Thread(target=_push_deliver, args=(endpoint, headers),
                         daemon=True).start()


# --- word helpers ----------------------------------------------------------

def clean_token(raw):
    """Lowercase a word and strip surrounding punctuation for comparison."""
    return raw.strip().strip(".,!?;:\"'").lower()


def typeable(raw):
    """Reduce a word to the characters the practice input accepts."""
    return "".join(c for c in clean_token(raw) if c.isalpha() or c in "'-")


def words_practiced(stats):
    return sum(1 for s in stats.values() if s["seen"] > 0)


def word_stage(s):
    """Current ladder stage for a word's stats dict (None -> brand new).

    Migrates legacy records (written before stages existed): a word with a
    2+ streak was already "learned" under the old rule -> mastered; anything
    else that was being practiced sits at "from memory" (the old mechanic).
    """
    if not s:
        return STAGE_COPY
    if "stage" not in s:
        if s.get("streak", 0) >= 2:
            s["stage"] = STAGE_MASTERED
            s["stage_streak"] = 0
        else:
            s["stage"] = STAGE_MEMORY if s.get("seen", 0) else STAGE_COPY
            s["stage_streak"] = s.get("streak", 0)
    return s["stage"]


def new_list_id(state):
    used = {l.get("id") for l in state.get("lists", [])}
    n = 1
    while f"l{n}" in used:
        n += 1
    return f"l{n}"


def enabled_list_words(state):
    """Words from enabled lists, skipping words switched off individually."""
    out = []
    for lst in state.get("lists", []):
        if not lst.get("enabled", True):
            continue
        for wd in lst.get("words", []):
            if wd.get("on", True):
                cw = clean_token(wd.get("w", ""))
                if cw:
                    out.append(cw)
    return out


def enabled_bands(state):
    """Exactly what the parent checked — an empty selection stays empty
    (predictable checkboxes; the parent may be mid-switch between grades).
    The kid-never-gets-nothing guarantee lives in source_pool() instead."""
    raw = state["profile"].get("enabled_grades")
    if raw is None:  # never set: pre-bands data — the migration default
        return set(default_bands(state["profile"].get("max_level", 3)))
    return {float(b) for b in raw if float(b) in BAND_COUNTS}


def bank_words(state):
    bands = enabled_bands(state)
    off = set(state.get("bank_off", []))
    return [item["w"] for item in WORDS
            if float(item["level"]) in bands and item["w"] not in off]


def bank_status(state):
    """The bank as the Word-lists card shows it: one entry per grade band,
    each split into its CATEGORIES (phonics patterns, themes, sight words,
    the grade's general list). The parent switches whole categories on or
    off; opening one still shows — and toggles — the single words inside
    (switchable, never removable)."""
    stats = state["words"]
    off = set(state.get("bank_off", []))
    on_bands = enabled_bands(state)
    by_band = {}
    for item in WORDS:
        b = float(item["level"])
        g = by_band.setdefault(b, {})
        g.setdefault(item["group"], []).append(item["w"])
    bands = []
    total_on = 0
    for b in GRADE_BANDS:
        groups = []
        band_total = 0
        band_on = 0
        for name in GROUP_ORDER:
            if GROUP_LEVEL[name] != b or name not in by_band.get(b, {}):
                continue
            words = []
            n_on = 0
            for w in by_band[b][name]:
                s = stats.get(w)
                is_on = w not in off
                n_on += is_on
                entry = {
                    "word": w,
                    "on": is_on,
                    "stage": word_stage(s) if s and s.get("seen", 0) else 0,
                }
                if w in wordbank.HEART_WORDS:
                    entry["heart"] = True
                words.append(entry)
            # heart words first (the hard ones a parent scans for), then
            # the rest — each section alphabetical
            words.sort(key=lambda e: (0 if e.get("heart") else 1, e["word"]))
            band_total += len(words)
            band_on += n_on
            groups.append({
                "name": name,
                "general": name in GENERAL_GROUPS,
                "total": len(words),
                "enabled_count": n_on,
                "words": words,
            })
        if b in on_bands:
            total_on += band_on
        bands.append({
            "level": b,
            "enabled": b in on_bands,
            "total": band_total,
            "enabled_count": band_on,
            "groups": groups,
        })
    return {
        "enabled": state["profile"].get("bank_enabled", True),
        "total": len(WORDS),
        "enabled_count": total_on,
        "bands": bands,
    }


def sources_empty(state):
    """True when the parent's current selection yields zero words — the
    dashboard shows a warning and sessions use the starter fallback."""
    if state["profile"].get("bank_enabled", True) and bank_words(state):
        return False
    return not enabled_list_words(state)


def source_pool(state):
    """The words from the sources the parent has switched on: the built-in
    bank (grade-capped) and/or any enabled custom lists. List words count
    even above the grade cap — the parent asked for them. If everything ends
    up switched off (even every grade band unchecked), fall back to the
    starter bands: the kid must never tap Practice and get nothing."""
    pool = []
    if state["profile"].get("bank_enabled", True):
        pool.extend(bank_words(state))
    pool.extend(enabled_list_words(state))
    if not pool:
        starter = set(default_bands(state["profile"].get("max_level", 3)))
        off = set(state.get("bank_off", []))
        pool = [item["w"] for item in WORDS
                if float(item["level"]) in starter and item["w"] not in off]
    return list(dict.fromkeys(pool))


def count_pool_hearts(state):
    """How many heart words the current source selection holds (what the
    hearts-only filter would practice)."""
    return sum(1 for w in source_pool(state) if w in wordbank.HEART_WORDS)


def eligible_words(state):
    """source_pool(), narrowed to heart words when the parent switched on
    "heart words only". If the selection has no heart words at all, practice
    every heart word instead — honors the filter and never leaves the kid
    with an empty session."""
    pool = source_pool(state)
    if state["profile"].get("hearts_only", False):
        hearts = [w for w in pool if w in wordbank.HEART_WORDS]
        pool = hearts or sorted(wordbank.HEART_WORDS)
    return pool


def _recently_missed(s, days=2):
    """True if this word was missed within the last `days` calendar days —
    used to keep a lately-troublesome word out of the warm-start slot."""
    if not s:
        return False
    cutoff = time.strftime("%Y-%m-%d",
                           time.localtime(time.time() - days * 86400))
    for day, tally in s.get("days", {}).items():
        seen, ok = (tally + [0, 0])[:2]
        if day >= cutoff and ok < seen:
            return True
    return False


def build_word_session(state, count):
    """Choose `count` words, favouring not-yet-mastered/missed words (spaced
    repetition) while mixing in fresh words so it never feels repetitive."""
    stats = state["words"]
    custom = set(enabled_list_words(state))  # school words get priority
    pool = eligible_words(state)
    pool_set = set(pool)

    def is_mastered(w):
        return bool(stats.get(w)) and word_stage(stats[w]) >= STAGE_MASTERED

    # Priority bucket = words to keep working: anything seen-but-unmastered,
    # PLUS every not-yet-mastered school word — even brand-new ones, so a list
    # the parent just pasted starts showing up right away (not by luck in a
    # 1,500-word pool). School words sort ahead, then most-missed / oldest.
    priority = [w for w in pool
                if (w in stats and not is_mastered(w))
                or (w in custom and not is_mastered(w))]
    priority.sort(key=lambda w: (
        0 if w in custom else 1,
        -stats.get(w, {}).get("missed", 0),
        stats.get(w, {}).get("last_ts", 0)))
    review = priority

    fresh = [w for w in pool if w not in stats and w not in custom]
    random.shuffle(fresh)

    # Least-recently-practised mastered words, as filler if we run short.
    mastered = [w for w in pool if w in stats and is_mastered(w)]
    mastered.sort(key=lambda w: stats[w].get("last_ts", 0))

    review_take = min(len(review), max(1, round(count * 0.4)))
    chosen = review[:review_take]
    for w in fresh:
        if len(chosen) >= count:
            break
        chosen.append(w)
    for bucket in (review[review_take:], mastered):
        for w in bucket:
            if len(chosen) >= count:
                break
            if w not in chosen:
                chosen.append(w)
    chosen = chosen[:count]
    random.shuffle(chosen)
    # Warm start: lead with a near-certain win. The first 30 seconds decide
    # the session's mood for a struggling speller, so the opening word (two
    # for longer sets) is the easiest in the set — a word he already owns, or
    # else the shortest fresh one, never a lately-missed struggle. The rest of
    # the mix stays shuffled.
    if chosen:
        def warmth(w):
            s = stats.get(w)
            if s and s.get("streak", 0) >= 2 and not _recently_missed(s):
                return (0, -s.get("streak", 0))   # proven, not lately missed
            if not s:
                return (1, len(w))                 # fresh: shortest first
            return (2, s.get("missed", 0))         # never a struggle up top
        lead = min(1 if count < 15 else 2, len(chosen))
        front_idx = sorted(range(len(chosen)),
                           key=lambda i: warmth(chosen[i]))[:lead]
        front = {i: chosen[i] for i in front_idx}  # preserve warmth order
        chosen = [front[i] for i in front_idx] + \
                 [w for i, w in enumerate(chosen) if i not in front]
    out = []
    for w in chosen:
        item = {"w": w, "group": WORD_GROUP.get(w, "My words"),
                "stage": word_stage(stats.get(w))}
        heart = wordbank.HEART_WORDS.get(w)
        if heart:
            item["heart"] = heart  # irregular grapheme(s) to highlight
        out.append(item)
    return out


def build_pick_session(state, count):
    """Which One? items: the same spaced-repetition word pool, each paired
    with two plausible misspellings (wordbank.distractors). Words that can't
    produce two clean distractors are skipped, so we over-fetch and trim."""
    salt = int(time.strftime("%j"))  # day-of-year — choices vary daily
    base = build_word_session(state, max(count * 2, count + 4))
    out = []
    for item in base:
        ds = wordbank.distractors(item["w"], 2, salt=salt)
        if len(ds) < 2:
            continue
        choices = [item["w"]] + ds
        random.shuffle(choices)
        pick = {"w": item["w"], "group": item.get("group", "My words"),
                "choices": choices}
        if item.get("heart"):
            pick["heart"] = item["heart"]
        out.append(pick)
        if len(out) >= count:
            break
    return out


def build_sentence_session(state, count):
    max_level = float(state["profile"].get("max_level", 3))
    pool = [s for s in SENTENCES if s["level"] <= max_level] or SENTENCES
    picks = random.sample(pool, min(count, len(pool)))
    items = []
    for s in picks:
        tokens = []
        for tok in s["s"].split():
            t = {"display": tok, "answer": clean_token(tok)}
            heart = wordbank.HEART_WORDS.get(t["answer"])
            if heart:
                t["heart"] = heart
            tokens.append(t)
        items.append({"s": s["s"], "tokens": tokens})
    return items


# --- Assignments ("missions") ------------------------------------------------
# The parent hands a child a specific test: one of the four modes, optionally
# pinned to a word list. It sits on the kid's home screen until finished;
# finishing stores the score and pings the parents' devices.

MODE_LABELS = {"copy": "Copy It", "words": "Hide & Spell",
               "listen": "Listen & Spell",
               "sentences": "Fill In", "memory": "Remember It",
               "pick": "Which One?", "build": "Build It"}


def find_assignment(state, aid):
    for a in state.get("assignments", []):
        if a.get("id") == aid:
            return a
    return None


def assignments_status(state):
    todo = [a for a in state.get("assignments", []) if a["status"] == "todo"]
    done = [a for a in state.get("assignments", []) if a["status"] == "done"]
    done.sort(key=lambda a: a.get("done_ts", 0), reverse=True)
    return {"todo": todo, "done": done[:8]}


def build_assignment_session(state, a):
    """The session for one mission. A list-pinned words/listen test is every
    enabled word of that list, once, shuffled — a real spelling test. The
    ladder is ignored on purpose: test words always hide on the first
    keystroke (no copy crutch), and answers still feed the normal stats."""
    mode = a["mode"]
    if mode in ("sentences", "memory"):
        return build_sentence_session(state, a.get("count", 6))
    stats = state["words"]
    lst = next((l for l in state.get("lists", [])
                if l.get("id") == a.get("list_id")), None)
    if lst:
        words = [wd["w"] for wd in lst["words"] if wd.get("on", True)]
    elif a.get("group") in _GROUP_WORDS or a.get("level") in BAND_COUNTS:
        # a CATEGORY or whole-grade mission: the targeted-practice case.
        # Words the parent switched off stay out (unless that empties it);
        # missed/unmastered words come first — that's what needs the work —
        # then fresh ones, and already-mastered words only pad the tail.
        if a.get("group") in _GROUP_WORDS:
            pool = list(_GROUP_WORDS[a["group"]])
        else:
            pool = [item["w"] for item in WORDS
                    if float(item["level"]) == a["level"]]
        off = set(state.get("bank_off", []))
        pool = [w for w in pool if w not in off] or pool
        random.shuffle(pool)  # ties land in a fresh order every time

        def urgency(w):
            s = stats.get(w)
            if not s or not s.get("seen", 0):
                return (1, 0)                     # fresh: after the misses
            if word_stage(s) >= STAGE_MASTERED:
                return (2, 0)                     # mastered: filler only
            return (0, -s.get("missed", 0))       # unmastered, most-missed
        pool.sort(key=urgency)
        words = pool[:a.get("count", 10)]
    else:
        words = eligible_words(state)
        random.shuffle(words)
        words = words[:a.get("count", 10)]
    words = words[:25]  # a test, not a marathon
    random.shuffle(words)
    out = []
    for w in words:
        item = {"w": w, "group": WORD_GROUP.get(w, "My words"),
                "stage": STAGE_COPY if mode == "copy"
                else STAGE_MEMORY if mode == "words"
                else word_stage(stats.get(w))}
        heart = wordbank.HEART_WORDS.get(w)
        if heart:
            item["heart"] = heart
        out.append(item)
    return out


def record_answer(state, word, correct, aided=False, mode="words"):
    """Record one attempt.

    An *aided* correct is a retype right after the spelling was revealed —
    it still earns a point (the kid fixed it), but it must not count toward
    accuracy or the ladder, or two copy-types would mark a missed word
    "learned". Per-mode counters mirror the same rules so the parent report
    can break results down by practice type.

    Returns (stage_up, new_stage) so the kid can be congratulated live.
    """
    w = clean_token(word)
    if not w:
        return (False, None)
    mode = mode if mode in VALID_MODES else "words"
    state["last_answer_ts"] = int(time.time())
    m = state.setdefault("modes", {}).setdefault(
        mode, {"seen": 0, "correct": 0, "missed": 0, "points": 0})
    # per-day bucket — each day stands on its own in the report
    today = time.strftime("%Y-%m-%d")
    days = state.setdefault("days", {})
    d = days.setdefault(
        today, {"seen": 0, "correct": 0, "missed": 0, "points": 0, "modes": {}})
    dm = d["modes"].setdefault(mode, {"seen": 0, "correct": 0, "points": 0})
    if len(days) > 60:  # keep two months of history
        for old in sorted(days)[:-60]:
            del days[old]

    c = state.setdefault("counters", {})
    if correct and aided:
        state["profile"]["points"] = state["profile"].get("points", 0) + 1
        c["lifetime_points"] = c.get("lifetime_points", 0) + 1
        m["points"] += 1
        d["points"] += 1
        dm["points"] += 1
        return (False, None)
    s = state["words"].setdefault(
        w, {"seen": 0, "correct": 0, "missed": 0, "streak": 0, "last_ts": 0,
            "stage": STAGE_COPY, "stage_streak": 0})
    stage = word_stage(s)  # also migrates legacy records in place
    stage_up = False
    s["seen"] += 1
    s["last_ts"] = int(time.time())
    m["seen"] += 1
    d["seen"] += 1
    dm["seen"] += 1
    # per-word daily tally [seen, correct] — lets the report show how any
    # GROUP of words (a school list, a grade band) trends day by day
    wd = s.setdefault("days", {}).setdefault(today, [0, 0])
    wd[0] += 1
    wd[1] += 1 if correct else 0
    if len(s["days"]) > 30:
        for old in sorted(s["days"])[:-30]:
            del s["days"][old]
    if correct:
        s["correct"] += 1
        s["streak"] = s.get("streak", 0) + 1
        state["profile"]["points"] = state["profile"].get("points", 0) + 1
        m["correct"] += 1
        m["points"] += 1
        d["correct"] += 1
        d["points"] += 1
        dm["correct"] += 1
        dm["points"] += 1
        # badge counters: lifetime tallies + the cross-session answer streak
        c["lifetime_correct"] = c.get("lifetime_correct", 0) + 1
        c["lifetime_points"] = c.get("lifetime_points", 0) + 1
        c["answer_streak"] = c.get("answer_streak", 0) + 1
        c["best_streak"] = max(c.get("best_streak", 0), c["answer_streak"])
        if mode == "listen":
            c["listen_correct"] = c.get("listen_correct", 0) + 1
        if mode in ("sentences", "memory"):
            c["sentence_words"] = c.get("sentence_words", 0) + 1
        # climb the ladder — but a game can only prove up to its own rung
        # (CLIMB_CAP): copying never advances a from-memory word, and only
        # from-sound games push a word to mastered. Streaks don't bank while
        # capped, so an easy game can't pre-pay a harder one's climb.
        # Which One? (pick) is recognition, not recall — it never climbs.
        if (mode not in NO_LADDER_MODES
                and stage < min(STAGE_MASTERED,
                                CLIMB_CAP.get(mode, STAGE_MASTERED))):
            s["stage_streak"] = s.get("stage_streak", 0) + 1
            if s["stage_streak"] >= STAGE_UP[stage]:
                s["stage"] = stage + 1
                s["stage_streak"] = 0
                stage_up = True
                c["stage_ups"] = c.get("stage_ups", 0) + 1
                if s["stage"] == STAGE_MASTERED:
                    s["mastered_ts"] = int(time.time())
    else:
        s["missed"] += 1
        s["streak"] = 0
        m["missed"] += 1
        d["missed"] += 1
        c["answer_streak"] = 0  # a miss breaks the Hot Streak
        # slide one rung down and rebuild from there — but recognition
        # (pick) never drops the ladder either, only recall does
        if mode not in NO_LADDER_MODES:
            s["stage"] = max(STAGE_COPY, stage - 1)
            s["stage_streak"] = 0
    return (stage_up, s.get("stage"))


def _group_progress(stats, words):
    """Results for one GROUP of words (a school list or a grade band) — the
    view a parent needs the week of a spelling test: how many are mastered,
    the unaided accuracy, which words keep going wrong, and a day-by-day
    trend built from the per-word daily tallies."""
    seen = [w for w in words if stats.get(w, {}).get("seen", 0)]
    total_seen = sum(stats[w]["seen"] for w in seen)
    total_correct = sum(stats[w]["correct"] for w in seen)
    daily = {}
    for w in words:
        for day, (n, ok) in stats.get(w, {}).get("days", {}).items():
            d = daily.setdefault(day, [0, 0])
            d[0] += n
            d[1] += ok
    trend = [{"date": day, "seen": v[0], "correct": v[1]}
             for day, v in sorted(daily.items())[-10:]]
    trouble = sorted(
        ({"word": w, "missed": stats[w].get("missed", 0),
          "stage": word_stage(stats[w])}
         for w in seen if stats[w].get("missed", 0) > 0),
        key=lambda t: -t["missed"])[:5]
    return {
        "total": len(words),
        "practiced": len(seen),
        "mastered": sum(1 for w in words if stats.get(w)
                        and stats[w].get("seen", 0)
                        and word_stage(stats[w]) >= STAGE_MASTERED),
        "accuracy": round(100 * total_correct / total_seen)
                    if total_seen else 0,
        "last_ts": max((stats[w].get("last_ts", 0) for w in seen), default=0),
        "trend": trend,
        "trouble": trouble,
    }


def source_progress(state):
    """Per-source results: every custom list (the school-test story), then
    every ENABLED grade band that has been practiced (long-running view)."""
    stats = state["words"]
    off = set(state.get("bank_off", []))
    lists = []
    for lst in state.get("lists", []):
        words = [wd["w"] for wd in lst.get("words", []) if wd.get("on", True)]
        entry = _group_progress(stats, words)
        entry["id"] = lst.get("id", "")
        entry["name"] = lst.get("name", "List")
        lists.append(entry)
    bands = []
    for b in enabled_bands(state):
        words = [item["w"] for item in WORDS
                 if float(item["level"]) == b and item["w"] not in off]
        entry = _group_progress(stats, words)
        if not entry["practiced"]:
            continue  # an untouched band is noise, not a result
        entry["level"] = b
        bands.append(entry)
    bands.sort(key=lambda e: e["level"])
    return {"lists": lists, "bands": bands}


def type_analysis(state):
    """Per-CATEGORY results across everything he's practiced — the heart of
    targeted instruction (US classrooms teach spelling by FEATURE — a child
    who misses "coin" and "voice" needs the oi/oy pattern, not those two
    words; see docs/RESEARCH.md). One entry per category with any practice,
    worst accuracy first, flagged needs_work when there's enough signal
    (6+ tries) and accuracy is under 80% — those are the categories the
    dashboard suggests assigning extra practice on."""
    stats = state["words"]
    out = []
    for g in GROUP_ORDER:
        words = _GROUP_WORDS[g]
        seen_words = [w for w in words if stats.get(w, {}).get("seen", 0)]
        if not seen_words:
            continue
        seen = sum(stats[w]["seen"] for w in seen_words)
        correct = sum(stats[w]["correct"] for w in seen_words)
        acc = round(100 * correct / seen) if seen else 0
        trouble = sorted(
            ({"word": w, "missed": stats[w].get("missed", 0),
              "stage": word_stage(stats[w])}
             for w in seen_words if stats[w].get("missed", 0) > 0),
            key=lambda t: -t["missed"])[:4]
        out.append({
            "name": g,
            "level": GROUP_LEVEL[g],
            "general": g in GENERAL_GROUPS,
            "total": len(words),
            "practiced": len(seen_words),
            "mastered": sum(1 for w in seen_words
                            if word_stage(stats[w]) >= STAGE_MASTERED),
            "seen": seen,
            "accuracy": acc,
            "needs_work": seen >= 6 and acc < 80,
            "trouble": trouble,
        })
    out.sort(key=lambda e: (not e["needs_work"], e["accuracy"], -e["seen"]))
    return out


def lists_status(state):
    """Every custom list with counts and per-word ladder status — what the
    parent's Word lists card renders."""
    stats = state["words"]
    out = []
    for lst in state.get("lists", []):
        words = []
        mastered = 0
        for wd in lst.get("words", []):
            cw = clean_token(wd.get("w", ""))
            if not cw:
                continue
            s = stats.get(cw)
            stage = word_stage(s) if s and s.get("seen", 0) else 0
            if stage >= STAGE_MASTERED:
                mastered += 1
            entry = {
                "word": cw,
                "on": bool(wd.get("on", True)),
                "stage": stage,
                "seen": s.get("seen", 0) if s else 0,
                "missed": s.get("missed", 0) if s else 0,
            }
            if cw in wordbank.HEART_WORDS:
                entry["heart"] = True
            words.append(entry)
        # same ordering rule as the bank: hearts A-Z, then the rest A-Z
        words.sort(key=lambda e: (0 if e.get("heart") else 1, e["word"]))
        out.append({
            "id": lst.get("id", ""),
            "name": lst.get("name", "List"),
            "enabled": bool(lst.get("enabled", True)),
            "total": len(words),
            "enabled_count": sum(1 for w in words if w["on"]),
            "mastered": mastered,
            "words": words,
        })
    return out


# --- parent report ---------------------------------------------------------

def parent_report(state):
    stats = state["words"]
    practiced = words_practiced(stats)
    total_seen = sum(s["seen"] for s in stats.values())
    total_correct = sum(s["correct"] for s in stats.values())
    accuracy = round(100 * total_correct / total_seen) if total_seen else 0

    missed = [
        {
            "word": w,
            "missed": s["missed"],
            "seen": s["seen"],
            "stage": word_stage(s),
            "mastered": word_stage(s) >= STAGE_MASTERED,
        }
        for w, s in stats.items() if s["missed"] > 0
    ]
    missed.sort(key=lambda x: (-x["missed"], x["word"]))

    # the learning journey: where every practiced word sits on the ladder
    journey = {"copy": 0, "memory": 0, "sound": 0, "mastered": 0}
    week_ago = int(time.time()) - 7 * 86400
    mastered_this_week = 0
    for s in stats.values():
        if s.get("seen", 0) <= 0:
            continue
        journey[STAGE_NAMES[word_stage(s)]] += 1
        if word_stage(s) >= STAGE_MASTERED and s.get("mastered_ts", 0) >= week_ago:
            mastered_this_week += 1

    lists = lists_status(state)

    sessions = state.get("sessions", [])
    # newest first, each word tagged with its category + heart mark so the
    # parent can open a session and see WHAT was practiced, not just a score
    recent = []
    for s in reversed(sessions[-14:]):
        s = dict(s)
        if s.get("words"):
            tagged = []
            for it in s["words"]:
                t = {"w": it["w"], "ok": bool(it.get("ok"))}
                cw = clean_token(it["w"])
                g = WORD_GROUP.get(cw)
                if g:
                    t["group"] = g
                if cw in wordbank.HEART_WORDS:
                    t["heart"] = True
                tagged.append(t)
            s["words"] = tagged
        recent.append(s)

    # last 14 practice days, newest first — each day is its own row,
    # deliberately NOT rolled into the lifetime numbers
    daily = []
    for date in sorted(state.get("days", {}), reverse=True)[:14]:
        d = state["days"][date]
        seen = d.get("seen", 0)
        daily.append({
            "date": date,
            "seen": seen,
            "correct": d.get("correct", 0),
            "missed": d.get("missed", 0),
            "points": d.get("points", 0),
            "accuracy": round(100 * d.get("correct", 0) / seen) if seen else 0,
        })

    by_mode = {}
    for mode in VALID_MODES:
        m = state.get("modes", {}).get(mode)
        n_sessions = sum(1 for s in sessions if s.get("mode") == mode)
        if not m and not n_sessions:
            continue
        m = m or {"seen": 0, "correct": 0, "missed": 0, "points": 0}
        by_mode[mode] = {
            "seen": m.get("seen", 0),
            "correct": m.get("correct", 0),
            "missed": m.get("missed", 0),
            "points": m.get("points", 0),
            "sessions": n_sessions,
        }

    return {
        "profile": {
            "name": state["profile"].get("name", "Caleb"),
            "points": state["profile"].get("points", 0),
            "show_speaker": state["profile"].get("show_speaker", True),
            "autoplay_audio": state["profile"].get("autoplay_audio", False),
            "word_rate": state["profile"].get("word_rate", 0.8),
            "spell_rate": state["profile"].get("spell_rate", 0.45),
            "max_level": state["profile"].get("max_level", 3),
            "bank_enabled": state["profile"].get("bank_enabled", True),
            "hearts_only": state["profile"].get("hearts_only", False),
        },
        "bank_count": len(bank_words(state)),
        "hearts_in_pool": count_pool_hearts(state),
        "sources_empty": sources_empty(state),
        "assignments": assignments_status(state),
        "progress": source_progress(state),
        "badges": badges_view(state),
        "bank": bank_status(state),
        "summary": {
            "streak_days": current_day_streak(state),
            "words_practiced": practiced,
            "total_attempts": total_seen,
            "accuracy": accuracy,
            "sessions": len(sessions),
            "mastered": journey["mastered"],
            "learning": journey["copy"] + journey["memory"] + journey["sound"],
            "mastered_this_week": mastered_this_week,
        },
        "journey": journey,
        "lists": lists,
        "by_type": type_analysis(state),
        "type_groups": TYPE_GROUPS,
        "most_missed": missed[:25],
        "by_mode": by_mode,
        "daily": daily,
        "last_practice_ts": state.get("last_answer_ts", 0),
        "recent_sessions": recent,
    }


# --- HTTP handler ----------------------------------------------------------

class Handler(BaseHTTPRequestHandler):
    server_version = "Spelling/1.0"

    def log_message(self, *args):
        pass  # keep the hub logs quiet; errors still surface via exceptions

    # -- helpers --
    def _send_json(self, obj, status=200):
        body = json.dumps(obj).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def _read_body(self):
        try:
            length = int(self.headers.get("Content-Length", 0) or 0)
        except (ValueError, TypeError):
            return {}
        if length <= 0 or length > 65536:  # cap request bodies at 64 KB
            return {}
        try:
            body = json.loads(self.rfile.read(length).decode("utf-8"))
        except (ValueError, UnicodeDecodeError):
            return {}
        return body if isinstance(body, dict) else {}

    def _pin_ok(self, doc, body):
        supplied = str(body.get("pin", "") or self.headers.get("X-Parent-Pin", ""))
        return supplied == str(doc.get("pin", DEFAULT_PIN))

    # -- routing --
    def do_GET(self):
        parsed = urlparse(self.path)
        path = parsed.path
        if path == "/.hub/status":
            return self._hub_status()
        if path == "/api/version":
            return self._send_json({"version": asset_version()})
        if path == "/sw.js":
            return self._serve_sw()
        if path == "/api/state":
            return self._api_state(parse_qs(parsed.query))
        if path == "/api/push/key":
            return self._send_json({"key": vapid_public_key(load_push())})
        if path == "/api/badges":
            return self._api_badges(parse_qs(parsed.query))
        if path == "/api/session":
            return self._api_session(parse_qs(parsed.query))
        if path == "/api/parent/report":
            return self._api_parent_report(parse_qs(parsed.query))
        return self._serve_static(path)

    def do_POST(self):
        path = urlparse(self.path).path
        body = self._read_body()
        if path == "/api/answer":
            return self._api_answer(body)
        if path == "/api/session_end":
            return self._api_session_end(body)
        if path == "/api/parent/login":
            return self._api_parent_login(body)
        if path == "/api/parent/settings":
            return self._api_parent_settings(body)
        if path == "/api/parent/custom_words":
            return self._api_custom_words(body)
        if path == "/api/parent/lists":
            return self._api_lists(body)
        if path == "/api/parent/children":
            return self._api_children(body)
        if path == "/api/parent/assign":
            return self._api_assign(body)
        if path == "/api/push/subscribe":
            return self._api_push_subscribe(body)
        if path == "/api/push/pull":
            return self._api_push_pull(body)
        return self._send_json({"error": "not found"}, 404)

    # Which kid a request is about: the client remembers its pick per device
    # (localStorage) and sends it as ?child= / a "child" body field. Unknown
    # or missing ids resolve to the first child, so nothing ever 404s.
    def _query_child(self, query):
        return (query.get("child", [""])[0] or "").strip()

    # -- API handlers --
    def _api_state(self, query):
        doc = load_doc()
        state = get_child(doc, self._query_child(query))
        p = state["profile"]
        self._send_json({
            "child": state["id"],
            "children": children_roster(doc),
            "name": p.get("name", "Caleb"),
            "points": p.get("points", 0),
            "show_speaker": p.get("show_speaker", True),
            "autoplay_audio": p.get("autoplay_audio", False),
            "word_rate": p.get("word_rate", 0.8),
            "spell_rate": p.get("spell_rate", 0.45),
            "badges_earned": badges_earned_count(state),
            "badges_total": len(badgebank.BADGES),
            "daily_fact": daily_fact(),  # home-screen fact of the day
            # home greeting: a streak chip + yesterday's win (walk in on
            # evidence of competence, not a blank slate) + the one-tap Quest
            "streak_days": current_day_streak(state),
            "yesterday": yesterday_stats(state),
            "quest_done_today": quest_done_today(state),
            "practiced_today": time.strftime("%Y-%m-%d") in state.get("days", {}),
            # open missions land on the kid's home screen
            "missions": [{"id": a["id"], "mode": a["mode"],
                          "name": a.get("name", ""),
                          "count": a.get("count", 10)}
                         for a in state.get("assignments", [])
                         if a["status"] == "todo"],
            # lets the gate show a first-run hint until the PIN is changed
            "pin_is_default": doc.get("pin", DEFAULT_PIN) == DEFAULT_PIN,
        })

    def _api_badges(self, query):
        # the kid's badge case — no PIN, it's his own trophies
        doc = load_doc()
        state = get_child(doc, self._query_child(query))
        self._send_json({"child": state["id"], "badges": badges_view(state),
                         "earned": badges_earned_count(state),
                         "total": len(badgebank.BADGES)})

    def _api_session(self, query):
        mode = (query.get("mode", ["words"])[0] or "words").lower()
        try:
            count = int(query.get("count", ["10"])[0])
        except ValueError:
            count = 10
        count = max(1, min(count, 30))
        doc = load_doc()
        state = get_child(doc, self._query_child(query))
        # Today's Quest: one tap, no choices — a tiny warm-started Hide & Spell
        # set. Smallness is the feature (start-frustration is the enemy); it's
        # otherwise a normal words session (same ladder, stats, badges).
        if (query.get("quest", [""])[0] or "").strip() in ("1", "true"):
            return self._send_json({
                "mode": "words", "child": state["id"], "quest": True,
                "items": build_word_session(state, 5)})
        aid = (query.get("assignment", [""])[0] or "").strip()
        if aid:
            a = find_assignment(state, aid)
            if a and a["status"] == "todo":
                return self._send_json({
                    "mode": a["mode"], "child": state["id"],
                    "assignment": a["id"],
                    "items": build_assignment_session(state, a)})
            # stale mission (finished/removed on another device): plain
            # session — the client's next state refresh clears its card
        if mode in ("sentences", "memory"):
            items = build_sentence_session(state, max(1, min(count, 12)))
        elif mode == "pick":
            # Which One? — recognition: each word paired with 2 misspellings
            items = build_pick_session(state, count)
        else:
            items = build_word_session(state, count)
            # presentation follows the GAME, not the ladder: Copy It always
            # shows the word, Hide & Spell (and Build It) always hide it on the
            # first keystroke/tile (listen ignores stage — it's audio-only)
            if mode == "copy":
                for it in items:
                    it["stage"] = STAGE_COPY
            elif mode in ("words", "build"):
                for it in items:
                    it["stage"] = STAGE_MEMORY
        self._send_json({"mode": mode, "child": state["id"], "items": items})

    def _api_answer(self, body):
        with _lock:
            doc = load_doc()
            state = get_child(doc, body.get("child"))
            stage_up, new_stage = record_answer(
                state, body.get("word", ""),
                bool(body.get("correct")), bool(body.get("aided")),
                str(body.get("mode", "words")))
            save_doc(doc)
            points = state["profile"].get("points", 0)
        self._send_json({"points": points,
                         "stage_up": stage_up, "stage": new_stage})

    def _api_session_end(self, body):
        def as_int(v):
            try:
                return max(0, int(v))
            except (ValueError, TypeError):
                return 0

        finished = None
        with _lock:
            doc = load_doc()
            state = get_child(doc, body.get("child"))
            mode = str(body.get("mode", "words"))[:20]
            count = as_int(body.get("count", 0))
            correct = as_int(body.get("correct", 0))
            entry = {
                "ts": int(time.time()),
                "mode": mode,
                "count": count,
                "correct": correct,
                "points": as_int(body.get("points", 0)),
            }
            # per-word results (ok = right on the FIRST try) — lets the
            # parent open a session and see exactly what was practiced and
            # what went wrong. Sanitized hard: it's kid-device input.
            raw_words = body.get("words")
            if isinstance(raw_words, list):
                seen_words = []
                for it in raw_words[:60]:
                    if not isinstance(it, dict):
                        continue
                    w = str(it.get("w", ""))[:32].strip()
                    if w:
                        seen_words.append({"w": w, "ok": bool(it.get("ok"))})
                if seen_words:
                    entry["words"] = seen_words
            state.setdefault("sessions", []).append(entry)
            state["sessions"] = state["sessions"][-200:]
            # --- badge counters for the finished session ---
            c = state.setdefault("counters", {})
            c["sessions_total"] = c.get("sessions_total", 0) + 1
            gs = c.setdefault("game_sessions", {})
            gs[mode] = gs.get(mode, 0) + 1
            if count > 0 and correct >= count:
                c["perfect_sessions"] = c.get("perfect_sessions", 0) + 1
            # Speed of Light: only real word games of 10+ words, and only if
            # mostly right (≥80% first try) so fast guessing can't farm it
            if mode in ("copy", "words", "listen") and count >= 10 \
                    and correct / count >= 0.8:
                secs = as_int(body.get("seconds", 0))
                pace = secs / count if secs else 0
                if 1 <= pace <= 120:  # clamp implausible clocks
                    best = c.get("fastest_pace", 0)
                    c["fastest_pace"] = pace if not best else min(best, pace)
            streak = current_day_streak(state)
            c["day_streak"] = streak
            c["best_day_streak"] = max(c.get("best_day_streak", 0), streak)
            # Today's Quest: mark done + count it once per calendar day
            if body.get("quest"):
                today = time.strftime("%Y-%m-%d")
                q = state.setdefault("quest", {})
                if not (q.get("date") == today and q.get("done")):
                    c["quests_done"] = c.get("quests_done", 0) + 1
                q["date"] = today
                q["done"] = True
            aid = str(body.get("assignment", "") or "")
            a = find_assignment(state, aid) if aid else None
            if a and a["status"] == "todo":
                a["status"] = "done"
                a["done_ts"] = int(time.time())
                a["result"] = {"count": count, "correct": correct}
                c["missions_done"] = c.get("missions_done", 0) + 1
                finished = (state["id"], state["profile"].get("name", "Kid"),
                            a)
            new_badges = evaluate_badges(state)  # persists levels (no payout)
            resp = {"assignment_done": bool(finished),
                    "new_badges": new_badges,
                    "quest_done_today": quest_done_today(state)}
            # the "what's next" badge nudge — but not when we're already
            # celebrating a fresh badge (that moment owns the screen)
            resp["next_badge"] = None if new_badges else next_badge(state)
            save_doc(doc)
            points = state["profile"].get("points", 0)
            resp["points"] = points
            cid = state["id"]
            kid_name = state["profile"].get("name", "Kid")
        if finished:
            _, _, a = finished
            r = a["result"]
            notify("parent", cid, f"{kid_name} finished a mission! ⭐",
                   f"{MODE_LABELS.get(a['mode'], a['mode'])} — "
                   f"{a.get('name', '')}: {r['correct']}/{r['count']} right")
        for nb in new_badges:  # ping the parents for each new badge level
            notify("parent", cid, f"{kid_name} earned a badge! {nb['emoji']}",
                   f"{nb['name']} — Level {nb['level']}")
        self._send_json(resp)

    def _api_parent_login(self, body):
        doc = load_doc()
        supplied = str(body.get("pin", ""))
        actual = str(doc.get("pin", DEFAULT_PIN))
        # "final" tells the gate this entry can't become right by typing more
        # digits, so it knows when to show "wrong" vs. wait (PINs are 4-8).
        self._send_json({
            "ok": supplied == actual,
            "final": len(supplied) >= len(actual),
        })

    def _api_parent_report(self, query):
        # Report endpoint is GET; PIN passed via header so it can be linked.
        doc = load_doc()
        if not self._pin_ok(doc, {}):
            return self._send_json({"error": "bad pin"}, 403)
        state = get_child(doc, self._query_child(query))
        report = parent_report(state)
        report["child"] = state["id"]
        report["children"] = children_roster(doc)
        self._send_json(report)

    def _api_children(self, body):
        """Manage the kids themselves: add, rename, delete (never the last
        one — the app always has someone to practice)."""
        with _lock:
            doc = load_doc()
            if not self._pin_ok(doc, body):
                return self._send_json({"error": "bad pin"}, 403)
            action = str(body.get("action", ""))
            if action == "add":
                name = str(body.get("name", "")).strip()[:24] or \
                    f"Kid {len(doc['children']) + 1}"
                kid = _default_child(name)
                kid["id"] = new_child_id(doc)
                doc["children"].append(kid)
                new_id = kid["id"]
            elif action == "rename":
                kid = get_child(doc, body.get("child"))
                name = str(body.get("name", "")).strip()[:24]
                if name:
                    kid["profile"]["name"] = name
                new_id = kid["id"]
            elif action == "delete":
                if len(doc["children"]) <= 1:
                    return self._send_json(
                        {"error": "there must be at least one child"}, 400)
                target = str(body.get("child", ""))
                if not any(k["id"] == target for k in doc["children"]):
                    return self._send_json({"error": "no such child"}, 400)
                doc["children"] = [k for k in doc["children"]
                                   if k["id"] != target]
                new_id = doc["children"][0]["id"]
            else:
                return self._send_json({"error": "bad action"}, 400)
            save_doc(doc)
            out = {"children": children_roster(doc), "child": new_id}
        self._send_json(out)

    def _api_assign(self, body):
        """Create or remove a mission. Create targets the selected child, or
        every child with all_children — the same test for the whole family."""
        notices = []
        with _lock:
            doc = load_doc()
            if not self._pin_ok(doc, body):
                return self._send_json({"error": "bad pin"}, 403)
            state = get_child(doc, body.get("child"))
            action = str(body.get("action", "create"))
            if action == "delete":
                aid = str(body.get("assignment_id", ""))
                state["assignments"] = [a for a in state["assignments"]
                                        if a.get("id") != aid]
            elif action == "create":
                mode = str(body.get("mode", "words"))
                if mode not in VALID_MODES:
                    return self._send_json({"error": "bad mode"}, 400)
                list_id = str(body.get("list_id", "") or "")
                # category / whole-grade sources (targeted practice)
                group = str(body.get("group", "") or "")
                group = group if group in _GROUP_WORDS else ""
                level = None
                try:
                    level = float(body.get("level"))
                except (ValueError, TypeError):
                    pass
                if level not in BAND_COUNTS:
                    level = None
                targets = doc["children"] if body.get("all_children") \
                    else [state]
                for kid in targets:
                    lst = next((l for l in kid.get("lists", [])
                                if l.get("id") == list_id), None)
                    try:
                        count = max(5, min(25, int(body.get("count", 10))))
                    except (ValueError, TypeError):
                        count = 10
                    if mode in ("sentences", "memory"):
                        count = 3 if mode == "memory" else 6
                        name = f"{count} sentences"
                    elif lst:
                        count = min(25, sum(1 for wd in lst["words"]
                                            if wd.get("on", True)))
                        name = lst.get("name", "List")
                    elif group:
                        count = min(count, len(_GROUP_WORDS[group]))
                        name = group
                    elif level is not None:
                        count = min(count, BAND_COUNTS[level])
                        name = f"Grade {level:g} words"
                    else:
                        name = "Practice words"
                    n = 1
                    have = {a.get("id") for a in kid["assignments"]}
                    while f"a{n}" in have:
                        n += 1
                    entry = {
                        "id": f"a{n}", "mode": mode,
                        "list_id": lst.get("id") if lst else "",
                        "name": name, "count": count,
                        "ts": int(time.time()), "status": "todo",
                    }
                    if not lst and group:
                        entry["group"] = group
                    elif not lst and level is not None:
                        entry["level"] = level
                    kid["assignments"].append(entry)
                    notices.append((kid["id"],
                                    f"{MODE_LABELS[mode]} — {name}"))
            else:
                return self._send_json({"error": "bad action"}, 400)
            save_doc(doc)
            out = assignments_status(state)
        for cid, what in notices:
            notify("child", cid, "New mission! 📋", what)
        self._send_json({"assignments": out})

    def _api_push_subscribe(self, body):
        """Register this device for pings. Parent devices prove the PIN;
        a kid device just names its child."""
        role = str(body.get("role", ""))
        sub = body.get("subscription") or {}
        endpoint = str(sub.get("endpoint", "") or body.get("endpoint", ""))
        if role not in ("parent", "child") or not endpoint.startswith("http"):
            return self._send_json({"error": "bad subscription"}, 400)
        with _lock:
            doc = load_doc()
            if role == "parent" and not self._pin_ok(doc, body):
                return self._send_json({"error": "bad pin"}, 403)
            child = get_child(doc, body.get("child"))["id"]
            store = load_push()
            store["subs"] = [s for s in store["subs"]
                             if s["endpoint"] != endpoint]
            if not body.get("unsubscribe"):
                store["subs"].append({"role": role, "child": child,
                                      "endpoint": endpoint})
            save_push(store)
        self._send_json({"ok": True})

    def _api_push_pull(self, body):
        """The service worker's half of a payload-free push: the tickle wakes
        it, this hands over what to show. Knowing the endpoint URL is the
        capability — it's unguessable and only that device ever has it."""
        endpoint = str(body.get("endpoint", ""))
        with _lock:
            store = load_push()
            messages = store["queue"].pop(endpoint, [])
            if messages:
                save_push(store)
        self._send_json({"messages": messages})

    def _api_parent_settings(self, body):
        with _lock:
            doc = load_doc()
            if not self._pin_ok(doc, body):
                return self._send_json({"error": "bad pin"}, 403)
            state = get_child(doc, body.get("child"))
            p = state["profile"]
            if "name" in body and str(body["name"]).strip():
                p["name"] = str(body["name"]).strip()[:24]
            if "show_speaker" in body:
                p["show_speaker"] = bool(body["show_speaker"])
            if "autoplay_audio" in body:
                p["autoplay_audio"] = bool(body["autoplay_audio"])
            # audio speeds (TTS rate) — parent-tunable, clamped to the range
            for key, lo, hi in (("word_rate", 0.05, 1.0),
                                ("spell_rate", 0.05, 1.0)):
                if key in body:
                    try:
                        p[key] = max(lo, min(hi, round(float(body[key]), 2)))
                    except (ValueError, TypeError):
                        pass
            if "bank_enabled" in body:
                p["bank_enabled"] = bool(body["bank_enabled"])
            if "hearts_only" in body:
                p["hearts_only"] = bool(body["hearts_only"])
            if "max_level" in body:
                try:
                    # legacy single cap: keep working by selecting every band
                    # at or below it (grade levels 1.0-9.0, half steps)
                    lvl = round(float(body["max_level"]) * 2) / 2
                    p["max_level"] = max(1.0, min(9.0, lvl))
                    p["enabled_grades"] = default_bands(p["max_level"])
                except (ValueError, TypeError):
                    pass
            if "enabled_grades" in body:
                try:
                    bands = sorted({float(b) for b in body["enabled_grades"]
                                    if float(b) in BAND_COUNTS})
                    p["enabled_grades"] = bands
                    # sentences and labels follow the highest selected band
                    p["max_level"] = max(bands) if bands else 3.0
                except (ValueError, TypeError):
                    pass
            # targeted resets (owner-specified): scores stay meaningful per
            # list/band, so these are scoped — stars and practice progress
            # reset separately, and lists/settings always survive.
            if body.get("reset_points"):
                p["points"] = 0
            if body.get("reset_progress"):
                state["words"] = {}
                state["modes"] = {}
                state["days"] = {}
                state["sessions"] = []
                state["last_answer_ts"] = 0
            # the PIN is the PARENTS' pin — one per family, not per child
            new_pin = str(body.get("new_pin", "")).strip()
            pin_changed = False
            if new_pin:
                if new_pin.isdigit() and 4 <= len(new_pin) <= 8:
                    doc["pin"] = new_pin
                    pin_changed = True
                else:
                    return self._send_json(
                        {"ok": False, "error": "PIN must be 4-8 digits"}, 400)
            save_doc(doc)
            empty = sources_empty(state)
        self._send_json({"ok": True, "pin_changed": pin_changed,
                         "sources_empty": empty})

    def _api_custom_words(self, body):
        """Legacy endpoint: operates on a default 'School list'. Kept so old
        clients/tests keep working; the Word-lists UI uses /api/parent/lists."""
        with _lock:
            doc = load_doc()
            if not self._pin_ok(doc, body):
                return self._send_json({"error": "bad pin"}, 403)
            state = get_child(doc, body.get("child"))
            action = body.get("action", "add")
            if action == "add":
                incoming = body.get("words", [])
                if isinstance(incoming, str):
                    incoming = incoming.replace(",", " ").split()
                lst = next((l for l in state["lists"]
                            if l.get("name") == "School list"), None)
                if lst is None:
                    lst = {"id": new_list_id(state), "name": "School list",
                           "enabled": True, "words": []}
                    state["lists"].append(lst)
                have = {wd["w"] for wd in lst["words"]}
                for raw in incoming:
                    cw = typeable(str(raw))
                    if cw and cw not in have:
                        have.add(cw)
                        lst["words"].append({"w": cw, "on": True})
            elif action == "remove":
                target = clean_token(str(body.get("word", "")))
                for lst in state["lists"]:
                    lst["words"] = [wd for wd in lst["words"]
                                    if wd["w"] != target]
            save_doc(doc)
            flat = [wd["w"] for l in state["lists"] for wd in l["words"]]
            status = lists_status(state)
        self._send_json({"custom_words": flat, "lists": status})

    def _api_lists(self, body):
        """Word-lists management: create/delete lists, toggle a whole list,
        toggle or remove single words, append words to a list."""
        with _lock:
            doc = load_doc()
            if not self._pin_ok(doc, body):
                return self._send_json({"error": "bad pin"}, 403)
            state = get_child(doc, body.get("child"))
            action = str(body.get("action", ""))
            lists = state["lists"]
            lst = next((l for l in lists
                        if l.get("id") == body.get("list_id")), None)

            def parse_words(raw):
                if isinstance(raw, str):
                    raw = raw.replace(",", " ").split()
                out = []
                for r in raw or []:
                    cw = typeable(str(r))
                    if cw:
                        out.append(cw)
                return out

            if action == "create":
                name = str(body.get("name", "")).strip()[:40] or \
                    f"List {len(lists) + 1}"
                words = parse_words(body.get("words", []))
                seen = set()
                lists.append({
                    "id": new_list_id(state), "name": name, "enabled": True,
                    "words": [{"w": w, "on": True} for w in words
                              if not (w in seen or seen.add(w))],
                })
            elif action == "delete" and lst is not None:
                lists.remove(lst)
            elif action == "toggle_list" and lst is not None:
                lst["enabled"] = bool(body.get("enabled", True))
            elif action == "toggle_word" and lst is not None:
                target = clean_token(str(body.get("word", "")))
                for wd in lst["words"]:
                    if wd["w"] == target:
                        wd["on"] = bool(body.get("enabled", True))
            elif action == "add_words" and lst is not None:
                have = {wd["w"] for wd in lst["words"]}
                for w in parse_words(body.get("words", [])):
                    if w not in have:
                        have.add(w)
                        lst["words"].append({"w": w, "on": True})
            elif action == "remove_word" and lst is not None:
                target = clean_token(str(body.get("word", "")))
                lst["words"] = [wd for wd in lst["words"]
                                if wd["w"] != target]
            elif action == "reset_list" and lst is not None:
                # start this list fresh: wipe its words' progress (ladder,
                # counters, daily tallies). A word shared with the bank
                # starts over there too — that's what "fresh" means.
                for wd in lst["words"]:
                    state["words"].pop(wd["w"], None)
            elif action == "bank_toggle_band":
                try:
                    band = float(body.get("level"))
                except (ValueError, TypeError):
                    return self._send_json({"error": "bad level"}, 400)
                bands = enabled_bands(state)
                if bool(body.get("enabled", True)):
                    bands.add(band)
                else:
                    bands.discard(band)
                state["profile"]["enabled_grades"] = sorted(bands)
                state["profile"]["max_level"] = max(bands) if bands else 3.0
            elif action == "bank_toggle_word":
                # bank words can be switched off, never removed
                target = clean_token(str(body.get("word", "")))
                off = set(state.get("bank_off", []))
                if bool(body.get("enabled", True)):
                    off.discard(target)
                elif target in WORD_GROUP:
                    off.add(target)
                state["bank_off"] = sorted(off)
            elif action == "bank_toggle_group":
                # one checkbox per CATEGORY: switch every word of a group on
                # or off at once (still stored per-word in bank_off, so any
                # finer word-level tweaks the parent makes stay possible)
                group = str(body.get("group", ""))
                if group not in _GROUP_WORDS:
                    return self._send_json({"error": "bad group"}, 400)
                off = set(state.get("bank_off", []))
                if bool(body.get("enabled", True)):
                    off -= set(_GROUP_WORDS[group])
                else:
                    off |= set(_GROUP_WORDS[group])
                state["bank_off"] = sorted(off)
            elif action == "bank_copy":
                # copy a band's — or one category's — checked words into a
                # list (new or existing): a school list without any typing
                group = str(body.get("group", "") or "")
                if group and group not in _GROUP_WORDS:
                    return self._send_json({"error": "bad group"}, 400)
                band = None
                if not group:
                    try:
                        band = float(body.get("level"))
                    except (ValueError, TypeError):
                        return self._send_json({"error": "bad level"}, 400)
                off = set(state.get("bank_off", []))
                if group:
                    words = [w for w in _GROUP_WORDS[group] if w not in off]
                else:
                    words = [item["w"] for item in WORDS
                             if float(item["level"]) == band
                             and item["w"] not in off]
                if lst is None:
                    name = str(body.get("name", "")).strip()[:40] or \
                        (group if group else f"Grade {band:g} words")
                    lst = {"id": new_list_id(state), "name": name,
                           "enabled": True, "words": []}
                    lists.append(lst)
                have = {wd["w"] for wd in lst["words"]}
                for w in words:
                    if w not in have:
                        have.add(w)
                        lst["words"].append({"w": w, "on": True})
            else:
                return self._send_json({"error": "bad action"}, 400)
            save_doc(doc)
            status = lists_status(state)
            bank = bank_status(state)
            hearts = count_pool_hearts(state)
            empty = sources_empty(state)
        self._send_json({"lists": status, "bank": bank,
                         "hearts_in_pool": hearts, "sources_empty": empty})

    def _hub_status(self):
        # one line per kid — the hub card should show the whole family
        doc = load_doc()
        summaries = []
        fields = []
        last_ts_all = 0
        for kid in doc["children"]:
            name = kid["profile"].get("name", "Kid")
            points = kid["profile"].get("points", 0)
            mastered = sum(1 for s in kid["words"].values()
                           if s.get("seen", 0) and
                           word_stage(s) >= STAGE_MASTERED)
            summaries.append(f"{name}: {points} ⭐ · {mastered} mastered")
            fields.append({"label": name,
                           "value": f"{points} ⭐ · {mastered} mastered · "
                                    f"{words_practiced(kid['words'])} practiced"})
            sessions = kid.get("sessions", [])
            last_ts_all = max(last_ts_all, kid.get("last_answer_ts", 0) or (
                sessions[-1].get("ts", 0) if sessions else 0))
        last = "never"
        if last_ts_all:
            ago = int(time.time()) - last_ts_all
            if ago < 3600:
                last = f"{max(1, ago // 60)} min ago"
            elif ago < 86400:
                last = f"{ago // 3600} hr ago"
            else:
                last = f"{ago // 86400} day(s) ago"
        fields.append({"label": "Last practice", "value": last})
        self._send_json({"summary": " · ".join(summaries), "fields": fields})

    def _serve_sw(self):
        """Serve the service worker with the current version stamped in, so
        its bytes change on every deploy and the browser installs the update.
        Served no-store so the browser always re-checks it."""
        try:
            with open(os.path.join(STATIC_DIR, "sw.js"), "r",
                      encoding="utf-8") as f:
                body = f.read().replace("%%VERSION%%", asset_version())
        except OSError:
            self.send_error(404)
            return
        data = body.encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", "application/javascript; charset=utf-8")
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Cache-Control", "no-cache, no-store, must-revalidate")
        self.end_headers()
        self.wfile.write(data)

    # -- static files --
    def _serve_static(self, path):
        if path == "/":
            path = "/index.html"
        rel = path.lstrip("/")
        full = os.path.normpath(os.path.join(STATIC_DIR, rel))
        # trailing separator so a sibling like static-backup/ can't match
        if (not full.startswith(STATIC_DIR + os.sep)
                or not os.path.isfile(full)):
            self.send_error(404)
            return
        ext = os.path.splitext(full)[1].lower()
        ctype = MIME.get(ext, "application/octet-stream")
        try:
            with open(full, "rb") as f:
                data = f.read()
        except OSError:
            self.send_error(404)
            return
        self.send_response(200)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(data)))
        # The app shell can cache; the service worker manages updates.
        self.send_header("Cache-Control", "no-cache")
        self.end_headers()
        self.wfile.write(data)


# --- optional git auto-update (for standalone hosts like a Raspberry Pi) ----
# Off by default. Enable with AUTO_UPDATE=1 and the server will, on an
# interval, `git fetch` + fast-forward the current branch and re-exec itself
# so new code takes effect — the same self-updating behavior HomeHub gives its
# apps. Under HomeHub (which already auto-pulls) this stays disabled so the two
# never fight. Data lives in the gitignored data/ dir, so pulls never touch it.

def _git(*args, timeout=45):
    return subprocess.run(["git", "-C", HERE, *args],
                          capture_output=True, text=True, timeout=timeout)


def _auto_update_enabled():
    flag = os.environ.get("AUTO_UPDATE", "").strip().lower()
    if flag not in ("1", "true", "yes", "on"):
        return False
    if os.environ.get("HUB_SLUG") or os.environ.get("HUB_ENV"):
        return False  # HomeHub manages updates itself
    try:
        inside = _git("rev-parse", "--is-inside-work-tree", timeout=10)
        return inside.returncode == 0 and inside.stdout.strip() == "true"
    except Exception:
        return False


def _auto_update_loop(httpd, interval, branch):
    script = os.path.join(HERE, "server.py")
    while True:
        time.sleep(interval)
        try:
            before = _git("rev-parse", "HEAD").stdout.strip()
            if _git("fetch", "origin", branch).returncode != 0:
                continue  # offline / transient — try again next tick
            merged = _git("merge", "--ff-only", f"origin/{branch}")
            after = _git("rev-parse", "HEAD").stdout.strip()
            if merged.returncode == 0 and after and after != before:
                print(f"[spelling] auto-update {before[:7]} -> {after[:7]}; "
                      f"restarting", flush=True)
                try:
                    httpd.server_close()
                except Exception:
                    pass
                # replace this process with a fresh one running the new code
                os.execv(sys.executable, [sys.executable, script] + sys.argv[1:])
        except Exception:
            continue  # never let the updater take the server down


def start_auto_updater(httpd):
    if not _auto_update_enabled():
        return
    branch = os.environ.get("AUTO_UPDATE_BRANCH", "").strip()
    if not branch:
        cur = _git("rev-parse", "--abbrev-ref", "HEAD", timeout=10)
        branch = cur.stdout.strip() if cur.returncode == 0 else "main"
    try:
        interval = max(15, int(os.environ.get("AUTO_UPDATE_INTERVAL", "15")))
    except ValueError:
        interval = 15
    t = threading.Thread(target=_auto_update_loop,
                         args=(httpd, interval, branch), daemon=True)
    t.start()
    print(f"[spelling] auto-update ON (branch {branch}, every {interval}s)",
          flush=True)


class QuietServer(ThreadingHTTPServer):
    """Don't spew tracebacks when a phone drops a connection mid-request —
    iOS does that constantly (speculative connections, app switching)."""

    def handle_error(self, request, client_address):
        exc = sys.exc_info()[1]
        if isinstance(exc, (ConnectionResetError, BrokenPipeError,
                            ConnectionAbortedError, TimeoutError)):
            return
        super().handle_error(request, client_address)


def main():
    port = int(os.environ.get("PORT", "8013"))
    # Default loopback per the HomeHub contract. For LAN testing on another
    # box (e.g. a Raspberry Pi), opt in with HOST=0.0.0.0 so phones/iPads on
    # the network can reach it. Never set that on the HomeHub Mac.
    host = os.environ.get("HOST", "127.0.0.1")
    httpd = QuietServer((host, port), Handler)
    print(f"[spelling] listening on http://{host}:{port} "
          f"({len(WORDS)} words, {len(SENTENCES)} sentences)")
    start_auto_updater(httpd)
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        httpd.server_close()


if __name__ == "__main__":
    main()
