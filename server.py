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

import hashlib
import json
import os
import random
import subprocess
import sys
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse, parse_qs

import wordbank

HERE = os.path.dirname(os.path.abspath(__file__))
STATIC_DIR = os.path.join(HERE, "static")
DATA_DIR = os.path.join(HERE, "data")
DATA_FILE = os.path.join(DATA_DIR, "progress.json")

DEFAULT_PIN = "1234"

# --- The learning ladder ----------------------------------------------------
# Every word climbs: 1 Copy it (word stays visible while typing) ->
# 2 From memory (hides at the first keystroke) -> 3 From sound (audio only)
# -> 4 Mastered. Unaided corrects advance it; any miss drops it one stage.
# Aided retypes (after the answer was revealed) never advance anything.
STAGE_COPY, STAGE_MEMORY, STAGE_SOUND, STAGE_MASTERED = 1, 2, 3, 4
STAGE_UP = {STAGE_COPY: 1, STAGE_MEMORY: 2, STAGE_SOUND: 2}
STAGE_NAMES = {1: "copy", 2: "memory", 3: "sound", 4: "mastered"}

WORDS, SENTENCES = wordbank.build_pool()
WORD_GROUP = {item["w"]: item["group"] for item in WORDS}

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

VALID_MODES = ("words", "listen", "sentences", "memory")


def _default_state():
    return {
        "profile": {
            "name": "Caleb",
            "points": 0,
            "pin": DEFAULT_PIN,
            "show_speaker": True,
            "max_level": 3,
        },
        "words": {},          # word -> {seen, correct, missed, streak, last_ts}
        "lists": [],          # [{id, name, enabled, words: [{w, on}]}]
        "bank_off": [],       # bank words switched off individually
        "modes": {},          # mode -> {seen, correct, missed, points}
        "days": {},           # "YYYY-MM-DD" -> {seen, correct, missed, points,
                              #                  modes: {mode: {...}}}
        "last_answer_ts": 0,  # when Caleb last answered anything
        "custom_words": [],   # parent-added words
        "sessions": [],       # list of {ts, mode, count, correct, points}
    }


def load_state():
    with _lock:
        try:
            with open(DATA_FILE, "r", encoding="utf-8") as f:
                state = json.load(f)
        except (FileNotFoundError, ValueError):
            state = _default_state()
        # Fill in any keys added since the file was written.
        base = _default_state()
        for k, v in base.items():
            if k not in state:
                state[k] = v
        for k, v in base["profile"].items():
            state["profile"].setdefault(k, v)
        state["profile"].setdefault("bank_enabled", True)
        # migrate the old single "max level" cap into per-band selection
        if "enabled_grades" not in state["profile"]:
            state["profile"]["enabled_grades"] = default_bands(
                state["profile"].get("max_level", 3))
        # migrate the old flat school list into the lists model
        if state.get("custom_words") and not state["lists"]:
            state["lists"].append({
                "id": new_list_id(state),
                "name": "School list",
                "enabled": True,
                "words": [{"w": clean_token(w), "on": True}
                          for w in state["custom_words"] if clean_token(w)],
            })
        return state


def save_state(state):
    with _lock:
        os.makedirs(DATA_DIR, exist_ok=True)
        tmp = DATA_FILE + ".tmp"
        with open(tmp, "w", encoding="utf-8") as f:
            json.dump(state, f, indent=2)
        os.replace(tmp, DATA_FILE)


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
    raw = state["profile"].get("enabled_grades")
    bands = {float(b) for b in raw if float(b) in BAND_COUNTS} if raw else set()
    # nobody left a kid with zero words: empty selection = the default bands
    return bands or set(default_bands(state["profile"].get("max_level", 3)))


def bank_words(state):
    bands = enabled_bands(state)
    off = set(state.get("bank_off", []))
    return [item["w"] for item in WORDS
            if float(item["level"]) in bands and item["w"] not in off]


def bank_status(state):
    """The bank as the Word-lists card shows it: one entry per grade band,
    each with its words (individually switchable, never removable)."""
    stats = state["words"]
    off = set(state.get("bank_off", []))
    on_bands = enabled_bands(state)
    bands = []
    total_on = 0
    for b in GRADE_BANDS:
        words = []
        n_on = 0
        for item in WORDS:
            if float(item["level"]) != b:
                continue
            w = item["w"]
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
        if b in on_bands:
            total_on += n_on
        bands.append({
            "level": b,
            "enabled": b in on_bands,
            "total": len(words),
            "enabled_count": n_on,
            "words": words,
        })
    return {
        "enabled": state["profile"].get("bank_enabled", True),
        "total": len(WORDS),
        "enabled_count": total_on,
        "bands": bands,
    }


def source_pool(state):
    """The words from the sources the parent has switched on: the built-in
    bank (grade-capped) and/or any enabled custom lists. List words count
    even above the grade cap — the parent asked for them. If everything ends
    up switched off, fall back to the bank: the kid must never tap Practice
    and get nothing."""
    pool = []
    if state["profile"].get("bank_enabled", True):
        pool.extend(bank_words(state))
    pool.extend(enabled_list_words(state))
    if not pool:
        pool = bank_words(state)
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
    out = []
    for w in chosen:
        item = {"w": w, "group": WORD_GROUP.get(w, "My words"),
                "stage": word_stage(stats.get(w))}
        heart = wordbank.HEART_WORDS.get(w)
        if heart:
            item["heart"] = heart  # irregular grapheme(s) to highlight
        out.append(item)
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

    if correct and aided:
        state["profile"]["points"] = state["profile"].get("points", 0) + 1
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
        # climb the ladder
        if stage < STAGE_MASTERED:
            s["stage_streak"] = s.get("stage_streak", 0) + 1
            if s["stage_streak"] >= STAGE_UP[stage]:
                s["stage"] = stage + 1
                s["stage_streak"] = 0
                stage_up = True
                if s["stage"] == STAGE_MASTERED:
                    s["mastered_ts"] = int(time.time())
    else:
        s["missed"] += 1
        s["streak"] = 0
        m["missed"] += 1
        d["missed"] += 1
        # slide one rung down and rebuild from there
        s["stage"] = max(STAGE_COPY, stage - 1)
        s["stage_streak"] = 0
    return (stage_up, s.get("stage"))


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
    recent = list(reversed(sessions[-14:]))

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
            "max_level": state["profile"].get("max_level", 3),
            "bank_enabled": state["profile"].get("bank_enabled", True),
            "hearts_only": state["profile"].get("hearts_only", False),
        },
        "bank_count": len(bank_words(state)),
        "hearts_in_pool": count_pool_hearts(state),
        "bank": bank_status(state),
        "summary": {
            "points": state["profile"].get("points", 0),
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

    def _pin_ok(self, state, body):
        supplied = str(body.get("pin", "") or self.headers.get("X-Parent-Pin", ""))
        return supplied == str(state["profile"].get("pin", DEFAULT_PIN))

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
            return self._api_state()
        if path == "/api/session":
            return self._api_session(parse_qs(parsed.query))
        if path == "/api/parent/report":
            return self._api_parent_report()
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
        return self._send_json({"error": "not found"}, 404)

    # -- API handlers --
    def _api_state(self):
        state = load_state()
        p = state["profile"]
        self._send_json({
            "name": p.get("name", "Caleb"),
            "points": p.get("points", 0),
            "show_speaker": p.get("show_speaker", True),
            # lets the gate show a first-run hint until the PIN is changed
            "pin_is_default": p.get("pin", DEFAULT_PIN) == DEFAULT_PIN,
        })

    def _api_session(self, query):
        mode = (query.get("mode", ["words"])[0] or "words").lower()
        try:
            count = int(query.get("count", ["10"])[0])
        except ValueError:
            count = 10
        count = max(1, min(count, 30))
        state = load_state()
        if mode in ("sentences", "memory"):
            items = build_sentence_session(state, max(1, min(count, 12)))
        else:
            items = build_word_session(state, count)
        self._send_json({"mode": mode, "items": items})

    def _api_answer(self, body):
        with _lock:
            state = load_state()
            stage_up, new_stage = record_answer(
                state, body.get("word", ""),
                bool(body.get("correct")), bool(body.get("aided")),
                str(body.get("mode", "words")))
            save_state(state)
            points = state["profile"].get("points", 0)
        self._send_json({"points": points,
                         "stage_up": stage_up, "stage": new_stage})

    def _api_session_end(self, body):
        def as_int(v):
            try:
                return max(0, int(v))
            except (ValueError, TypeError):
                return 0

        with _lock:
            state = load_state()
            state.setdefault("sessions", []).append({
                "ts": int(time.time()),
                "mode": str(body.get("mode", "words"))[:20],
                "count": as_int(body.get("count", 0)),
                "correct": as_int(body.get("correct", 0)),
                "points": as_int(body.get("points", 0)),
            })
            state["sessions"] = state["sessions"][-200:]
            save_state(state)
            points = state["profile"].get("points", 0)
        self._send_json({"points": points})

    def _api_parent_login(self, body):
        state = load_state()
        supplied = str(body.get("pin", ""))
        actual = str(state["profile"].get("pin", DEFAULT_PIN))
        # "final" tells the gate this entry can't become right by typing more
        # digits, so it knows when to show "wrong" vs. wait (PINs are 4-8).
        self._send_json({
            "ok": supplied == actual,
            "final": len(supplied) >= len(actual),
        })

    def _api_parent_report(self):
        # Report endpoint is GET; PIN passed via header so it can be linked.
        state = load_state()
        if not self._pin_ok(state, {}):
            return self._send_json({"error": "bad pin"}, 403)
        self._send_json(parent_report(state))

    def _api_parent_settings(self, body):
        with _lock:
            state = load_state()
            if not self._pin_ok(state, body):
                return self._send_json({"error": "bad pin"}, 403)
            p = state["profile"]
            if "name" in body and str(body["name"]).strip():
                p["name"] = str(body["name"]).strip()[:24]
            if "show_speaker" in body:
                p["show_speaker"] = bool(body["show_speaker"])
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
            new_pin = str(body.get("new_pin", "")).strip()
            pin_changed = False
            if new_pin:
                if new_pin.isdigit() and 4 <= len(new_pin) <= 8:
                    p["pin"] = new_pin
                    pin_changed = True
                else:
                    return self._send_json(
                        {"ok": False, "error": "PIN must be 4-8 digits"}, 400)
            save_state(state)
        self._send_json({"ok": True, "pin_changed": pin_changed})

    def _api_custom_words(self, body):
        """Legacy endpoint: operates on a default 'School list'. Kept so old
        clients/tests keep working; the Word-lists UI uses /api/parent/lists."""
        with _lock:
            state = load_state()
            if not self._pin_ok(state, body):
                return self._send_json({"error": "bad pin"}, 403)
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
            save_state(state)
            flat = [wd["w"] for l in state["lists"] for wd in l["words"]]
            status = lists_status(state)
        self._send_json({"custom_words": flat, "lists": status})

    def _api_lists(self, body):
        """Word-lists management: create/delete lists, toggle a whole list,
        toggle or remove single words, append words to a list."""
        with _lock:
            state = load_state()
            if not self._pin_ok(state, body):
                return self._send_json({"error": "bad pin"}, 403)
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
            elif action == "bank_copy":
                # copy a band's checked words into a list (new or existing) —
                # a school list without any typing
                try:
                    band = float(body.get("level"))
                except (ValueError, TypeError):
                    return self._send_json({"error": "bad level"}, 400)
                off = set(state.get("bank_off", []))
                words = [item["w"] for item in WORDS
                         if float(item["level"]) == band
                         and item["w"] not in off]
                if lst is None:
                    name = str(body.get("name", "")).strip()[:40] or \
                        f"Grade {band:g} words"
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
            save_state(state)
            status = lists_status(state)
            bank = bank_status(state)
            hearts = count_pool_hearts(state)
        self._send_json({"lists": status, "bank": bank,
                         "hearts_in_pool": hearts})

    def _hub_status(self):
        state = load_state()
        practiced = words_practiced(state["words"])
        points = state["profile"].get("points", 0)
        name = state["profile"].get("name", "Caleb")
        sessions = state.get("sessions", [])
        last = "never"
        last_ts = state.get("last_answer_ts", 0) or (
            sessions[-1].get("ts", 0) if sessions else 0)
        if last_ts:
            ago = int(time.time()) - last_ts
            if ago < 3600:
                last = f"{max(1, ago // 60)} min ago"
            elif ago < 86400:
                last = f"{ago // 3600} hr ago"
            else:
                last = f"{ago // 86400} day(s) ago"
        mastered = sum(1 for s in state["words"].values()
                       if s.get("seen", 0) and word_stage(s) >= STAGE_MASTERED)
        self._send_json({
            "summary": f"{name}: {points} ⭐ · {mastered} words mastered",
            "fields": [
                {"label": "Points", "value": str(points)},
                {"label": "Words mastered", "value": str(mastered)},
                {"label": "Words practiced", "value": str(practiced)},
                {"label": "Sessions", "value": str(len(sessions))},
                {"label": "Last practice", "value": last},
            ],
        })

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
        interval = max(15, int(os.environ.get("AUTO_UPDATE_INTERVAL", "90")))
    except ValueError:
        interval = 90
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
