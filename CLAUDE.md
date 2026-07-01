# CLAUDE.md

Caleb-School — kid-friendly practice apps for Caleb (8, entering 3rd grade).
Currently one app: **Spelling Practice**. Math is planned next (`docs/ROADMAP.md`).

Read these before changing anything significant:
- **`docs/DESIGN.md`** — the app's identity: who it's for, how it must feel,
  UI rules, decisions log. Keep it current when a change alters the character.
- **`docs/RESEARCH.md`** — the curriculum research behind the word bank and
  practice method (sources cited). Don't re-research what's already there.
- **`docs/ROADMAP.md`** — agreed future work and extension points.

## What this app is

A PWA served by a stdlib-Python server, deployed on **HomeHub**
(`StevG/HomeHub`) as the `spelling` app. Kid practices spelling
(look–cover–write–check: the word hides at the first keystroke) in three
modes — words, sentence fill-in (whole sentence visible, only the current
word hides), and memory sentences (read/hear it, then type the whole thing
from memory). Parents get a PIN-gated dashboard (most-missed words, accuracy,
custom school word lists). Points (⭐) are the reward currency — the parents
trade them for iPad time. The exact mode behaviors are specified in
`docs/DESIGN.md` — don't change them casually.

## Hard rules

- **Standard library Python 3 only.** No pip, no requirements.txt. The front
  end is plain HTML/CSS/JS — no frameworks, no build step, no node_modules.
- **HomeHub contract** (see HomeHub's `INTEGRATING_NEW_APPS.md`): bind
  `127.0.0.1`, read `$PORT`, run in the foreground, keep `GET /.hub/status`
  working. Prod port 8013, dev 8113.
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
| `docs/` | Design identity, research, roadmap. |

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

`GET /api/state` · `GET /api/session?mode=words|sentences|memory&count=N` ·
`POST /api/answer {word, correct, aided}` · `POST /api/session_end` ·
`POST /api/parent/login|settings|custom_words` (PIN in body) ·
`GET /api/parent/report` (PIN in `X-Parent-Pin` header) · `GET /.hub/status`.

"Aided" = a retype right after the answer was revealed: earns the point,
does **not** count toward accuracy or the mastery streak (`MASTERED_STREAK=2`).
Missed words are re-queued in-session and resurface across sessions until
mastered (spaced repetition) — that's the core pedagogy; don't break it.
