# CLAUDE.md

Caleb-School — kid-friendly practice apps for Caleb (8, entering 3rd grade).
Currently one app: **Spelling Practice**. Math is planned next (`docs/ROADMAP.md`).

Read these before changing anything significant:
- **`docs/DESIGN.md`** — the app's identity: who it's for, how it must feel,
  UI rules, decisions log. Keep it current when a change alters the character.
- **`docs/SCORING.md`** — stars vs. the learning ladder (stage rules,
  aided semantics, migration). The pedagogy contract; don't break it.
- **`docs/STATISTICS.md`** — every dashboard element ↔ API field ↔ data
  model, plus the checklist for adding a new statistic.
- **`docs/RESEARCH.md`** — the curriculum research behind the word bank and
  practice method (sources cited). Don't re-research what's already there.
- **`docs/ROADMAP.md`** — agreed future work and extension points.
- **`docs/HOSTING.md`** — standalone (Raspberry Pi) vs. HomeHub: the env-var
  knobs (`HOST`, `AUTO_UPDATE`) and git self-update, and what changes
  (nothing in the code) when migrating to HomeHub.
- **`tests/README.md`** — the Playwright suites; run them before pushing.

## What this app is

A PWA served by a stdlib-Python server, deployed on **HomeHub**
(`StevG/HomeHub`) as the `spelling` app. Kid practices spelling
(look–cover–write–check: the word hides at the first keystroke) in four
modes — words, listen & spell (audio only, word never shown), sentence
fill-in (whole sentence visible, only the current word hides; capitals
count), and memory sentences (read/hear it, then type the whole thing from
memory; capitals count). Word bank is graded 1st-9th in half-grade steps
(`max_level` float, default 3). Parents get a PIN-gated dashboard
(most-missed words, per-mode and per-day stats, custom school word lists).
Points (⭐) are the reward currency — the parents trade them for iPad time.
The exact mode behaviors are specified in `docs/DESIGN.md` — don't change
them casually.

## Hard rules

- **Standard library Python 3 only.** No pip, no requirements.txt. The front
  end is plain HTML/CSS/JS — no frameworks, no build step, no node_modules.
- **HomeHub contract** (see HomeHub's `INTEGRATING_NEW_APPS.md`): bind
  `127.0.0.1`, read `$PORT`, run in the foreground, keep `GET /.hub/status`
  working. Prod port 8013, dev 8113. Standalone-only behavior (`HOST=0.0.0.0`,
  `AUTO_UPDATE` git self-update) is env-gated and auto-disables under HomeHub
  — see `docs/HOSTING.md`. Don't make it default-on.
- **Version/refresh**: the server derives a content hash of `static/`
  (`asset_version()`), serves it at `GET /api/version`, and stamps it into
  `sw.js` so every deploy is a new service worker. The client polls
  `/api/version` and shows an "Update" bar → tap reloads. Don't cache
  `/api/*`; keep `sw.js` served no-store.
- **`data/` is gitignored and sacred.** Progress lives in
  `data/progress.json`; HomeHub auto-pulls `main` every ~30 s, so anything not
  gitignored gets clobbered. Never commit data; never write outside `data/`.
- **The kid never sees an error, a stack trace, or a dead end.** Every state
  needs a way forward and a calm message.
- HomeHub deploys from **`main`** — merging there is deploying.

## Layout

| Path | What |
|---|---|
| `server.py` | HTTP server + JSON API + persistence. One file on purpose. |
| `wordbank.py` | Graded word/sentence bank. Edit lists here to change content. |
| `static/` | Front end: `index.html`, `styles.css`, `app.js`, PWA bits, icons. |
| `generate_icons.py` | Regenerates icons (pixel-art dino-in-rocket). Edit `SPRITE`, run it. |
| `docs/` | Design identity, scoring/ladder, statistics, research, roadmap. |
| `tests/` | Playwright browser suites — run before pushing (see tests/README.md). |

## Working on it

```bash
PORT=9911 python3 server.py         # run locally
python3 wordbank.py                 # sanity-check the bank (counts per group)
python3 generate_icons.py           # regenerate icons after editing SPRITE
```

Test in a real browser (Playwright + the preinstalled Chromium) before
pushing; the app's core is a UI state machine (`resetItemUI()`/`beginWord()` in
`app.js`) and regressions there soft-lock the kid. Simulate at 390×780. Things
that have bitten before: sentence tokens carry punctuation (`display` vs
`answer` — always spell against the *typeable* form via `toTarget()`); every
path that presents a word must go through `resetItemUI()`; letter boxes must
stay on ONE line (box size is computed per word).

## API sketch

`GET /api/state` · `GET /api/session?mode=words|listen|sentences|memory&count=N` ·
`POST /api/answer {word, correct, aided, mode}` · `POST /api/session_end` ·
`POST /api/parent/login|settings|custom_words|lists` (PIN in body;
`lists` actions: create/delete/toggle_list/toggle_word/add_words/remove_word/
bank_toggle_band/bank_toggle_word/bank_copy; settings accepts
`enabled_grades` list — legacy `max_level` maps onto it) ·
`GET /api/parent/report` (PIN in `X-Parent-Pin` header) · `GET /.hub/status`.

"Aided" = a retype right after the answer was revealed: earns the point,
does **not** count toward accuracy or the learning ladder. Words-mode words
climb a per-word ladder — copy (visible) → from memory (hides) → from sound
(audio only) → mastered — advancing on unaided corrects, dropping a rung on
misses (`STAGE_UP` in server.py; full rules in docs/SCORING.md). Missed words
re-queue in-session and resurface across sessions until mastered (spaced
repetition) — that's the core pedagogy; don't break it.
