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

import json
import os
import random
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse, parse_qs

import wordbank

HERE = os.path.dirname(os.path.abspath(__file__))
STATIC_DIR = os.path.join(HERE, "static")
DATA_DIR = os.path.join(HERE, "data")
DATA_FILE = os.path.join(DATA_DIR, "progress.json")

MASTERED_STREAK = 2          # correct-in-a-row before a word is "learned"
DEFAULT_PIN = "1234"

WORDS, SENTENCES = wordbank.build_pool()
WORD_GROUP = {item["w"]: item["group"] for item in WORDS}

_lock = threading.RLock()

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


def eligible_words(state):
    """Pool words at or below the profile's max level, plus custom words."""
    max_level = int(state["profile"].get("max_level", 3))
    pool = [item["w"] for item in WORDS if item["level"] <= max_level]
    for w in state.get("custom_words", []):
        cw = clean_token(w)
        if cw and cw not in WORD_GROUP:
            pool.append(cw)
    # de-dup, keep order
    seen, out = set(), []
    for w in pool:
        if w not in seen:
            seen.add(w)
            out.append(w)
    return out


def build_word_session(state, count):
    """Choose `count` words, favouring not-yet-mastered/missed words (spaced
    repetition) while mixing in fresh words so it never feels repetitive."""
    stats = state["words"]
    custom = {clean_token(w) for w in state.get("custom_words", [])}
    pool = eligible_words(state)
    pool_set = set(pool)

    def is_mastered(w):
        s = stats.get(w)
        return bool(s) and s.get("streak", 0) >= MASTERED_STREAK

    # Review = seen but not yet mastered (missed words bubble to the top).
    review = [w for w in pool if w in stats and not is_mastered(w)]
    review.sort(key=lambda w: (-stats[w].get("missed", 0),
                               stats[w].get("last_ts", 0)))
    # Custom words the child hasn't mastered are worth surfacing often.
    review.sort(key=lambda w: 0 if w in custom else 1)

    fresh = [w for w in pool if w not in stats]
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
    return [{"w": w, "group": WORD_GROUP.get(w, "My words")} for w in chosen]


def build_sentence_session(state, count):
    max_level = int(state["profile"].get("max_level", 3))
    pool = [s for s in SENTENCES if s["level"] <= max_level] or SENTENCES
    picks = random.sample(pool, min(count, len(pool)))
    items = []
    for s in picks:
        tokens = [{"display": tok, "answer": clean_token(tok)}
                  for tok in s["s"].split()]
        items.append({"s": s["s"], "tokens": tokens})
    return items


def record_answer(state, word, correct):
    w = clean_token(word)
    if not w:
        return
    s = state["words"].setdefault(
        w, {"seen": 0, "correct": 0, "missed": 0, "streak": 0, "last_ts": 0})
    s["seen"] += 1
    s["last_ts"] = int(time.time())
    if correct:
        s["correct"] += 1
        s["streak"] = s.get("streak", 0) + 1
        state["profile"]["points"] = state["profile"].get("points", 0) + 1
    else:
        s["missed"] += 1
        s["streak"] = 0


# --- parent report ---------------------------------------------------------

def parent_report(state):
    stats = state["words"]
    practiced = sum(1 for s in stats.values() if s["seen"] > 0)
    total_seen = sum(s["seen"] for s in stats.values())
    total_correct = sum(s["correct"] for s in stats.values())
    accuracy = round(100 * total_correct / total_seen) if total_seen else 0

    missed = [
        {
            "word": w,
            "missed": s["missed"],
            "seen": s["seen"],
            "mastered": s.get("streak", 0) >= MASTERED_STREAK,
        }
        for w, s in stats.items() if s["missed"] > 0
    ]
    missed.sort(key=lambda x: (-x["missed"], x["word"]))

    sessions = state.get("sessions", [])
    recent = list(reversed(sessions[-14:]))
    return {
        "profile": {
            "name": state["profile"].get("name", "Caleb"),
            "points": state["profile"].get("points", 0),
            "show_speaker": state["profile"].get("show_speaker", True),
            "max_level": state["profile"].get("max_level", 3),
        },
        "summary": {
            "points": state["profile"].get("points", 0),
            "words_practiced": practiced,
            "total_attempts": total_seen,
            "accuracy": accuracy,
            "sessions": len(sessions),
        },
        "most_missed": missed[:25],
        "recent_sessions": recent,
        "custom_words": state.get("custom_words", []),
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
        length = int(self.headers.get("Content-Length", 0) or 0)
        if not length:
            return {}
        try:
            return json.loads(self.rfile.read(length).decode("utf-8"))
        except ValueError:
            return {}

    def _pin_ok(self, state, body):
        supplied = str(body.get("pin", "") or self.headers.get("X-Parent-Pin", ""))
        return supplied == str(state["profile"].get("pin", DEFAULT_PIN))

    # -- routing --
    def do_GET(self):
        parsed = urlparse(self.path)
        path = parsed.path
        if path == "/.hub/status":
            return self._hub_status()
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
        return self._send_json({"error": "not found"}, 404)

    # -- API handlers --
    def _api_state(self):
        state = load_state()
        p = state["profile"]
        self._send_json({
            "name": p.get("name", "Caleb"),
            "points": p.get("points", 0),
            "show_speaker": p.get("show_speaker", True),
        })

    def _api_session(self, query):
        mode = (query.get("mode", ["words"])[0] or "words").lower()
        try:
            count = int(query.get("count", ["10"])[0])
        except ValueError:
            count = 10
        count = max(1, min(count, 30))
        state = load_state()
        if mode == "sentences":
            items = build_sentence_session(state, max(1, min(count, 12)))
        else:
            items = build_word_session(state, count)
        self._send_json({"mode": mode, "items": items})

    def _api_answer(self, body):
        with _lock:
            state = load_state()
            record_answer(state, body.get("word", ""), bool(body.get("correct")))
            save_state(state)
            points = state["profile"].get("points", 0)
        self._send_json({"points": points})

    def _api_session_end(self, body):
        with _lock:
            state = load_state()
            state.setdefault("sessions", []).append({
                "ts": int(time.time()),
                "mode": str(body.get("mode", "words"))[:20],
                "count": int(body.get("count", 0) or 0),
                "correct": int(body.get("correct", 0) or 0),
                "points": int(body.get("points", 0) or 0),
            })
            state["sessions"] = state["sessions"][-200:]
            save_state(state)
            points = state["profile"].get("points", 0)
        self._send_json({"points": points})

    def _api_parent_login(self, body):
        state = load_state()
        self._send_json({"ok": self._pin_ok(state, body)})

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
            if "max_level" in body:
                try:
                    p["max_level"] = max(2, min(3, int(body["max_level"])))
                except (ValueError, TypeError):
                    pass
            new_pin = str(body.get("new_pin", "")).strip()
            if new_pin.isdigit() and 4 <= len(new_pin) <= 8:
                p["pin"] = new_pin
            save_state(state)
        self._send_json({"ok": True})

    def _api_custom_words(self, body):
        with _lock:
            state = load_state()
            if not self._pin_ok(state, body):
                return self._send_json({"error": "bad pin"}, 403)
            action = body.get("action", "add")
            words = state.setdefault("custom_words", [])
            if action == "add":
                incoming = body.get("words", [])
                if isinstance(incoming, str):
                    incoming = incoming.replace(",", " ").split()
                for raw in incoming:
                    cw = clean_token(str(raw))
                    if cw and cw not in [clean_token(w) for w in words]:
                        words.append(cw)
            elif action == "remove":
                target = clean_token(str(body.get("word", "")))
                state["custom_words"] = [
                    w for w in words if clean_token(w) != target]
            save_state(state)
            current = state.get("custom_words", [])
        self._send_json({"custom_words": current})

    def _hub_status(self):
        state = load_state()
        stats = state["words"]
        practiced = sum(1 for s in stats.values() if s["seen"] > 0)
        points = state["profile"].get("points", 0)
        name = state["profile"].get("name", "Caleb")
        sessions = state.get("sessions", [])
        last = "never"
        if sessions:
            ago = int(time.time()) - sessions[-1].get("ts", 0)
            if ago < 3600:
                last = f"{max(1, ago // 60)} min ago"
            elif ago < 86400:
                last = f"{ago // 3600} hr ago"
            else:
                last = f"{ago // 86400} day(s) ago"
        self._send_json({
            "summary": f"{name}: {points} points · {practiced} words practiced",
            "fields": [
                {"label": "Points", "value": str(points)},
                {"label": "Words practiced", "value": str(practiced)},
                {"label": "Sessions", "value": str(len(sessions))},
                {"label": "Last practice", "value": last},
            ],
        })

    # -- static files --
    def _serve_static(self, path):
        if path == "/":
            path = "/index.html"
        rel = path.lstrip("/")
        full = os.path.normpath(os.path.join(STATIC_DIR, rel))
        if not full.startswith(STATIC_DIR) or not os.path.isfile(full):
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


def main():
    port = int(os.environ.get("PORT", "8013"))
    httpd = ThreadingHTTPServer(("127.0.0.1", port), Handler)
    print(f"[spelling] listening on http://127.0.0.1:{port} "
          f"({len(WORDS)} words, {len(SENTENCES)} sentences)")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        httpd.server_close()


if __name__ == "__main__":
    main()
