# Spelling Practice

A light, kid-friendly spelling app for an 8-year-old (2nd–3rd grade), with a
PIN-protected parent dashboard. Built to run on **HomeHub** and install to an
iPhone/iPad home screen like a real app. No third-party packages — standard
library Python 3 only.

Made for Caleb: he practices spelling to earn ⭐ points; parents see which
words he misses most from their own phones.

## What it does

**For the kid**
- Two big buttons: **Spell Words** and **Spell Sentences**.
- The word appears; **as soon as he types the first letter it disappears**, and
  he fills in the rest from memory into big letter boxes (look–cover–write–check,
  the evidence-backed method).
- Tap **Check** → happy feedback + a ⭐, or a gentle "try again" that reveals the
  correct spelling to study, then lets him retype it.
- **Sentence mode** does the same word-by-word through a sentence (e.g.
  *"Please can I have a drink?"*), building the sentence as he goes.
- Missed words are automatically repeated later in the session and in future
  sessions (spaced repetition) until he's got them.
- He picks a goal (10 / 15 / 20 words) or just keeps going, and earns points.

**For parents** (tap ⚙️ → PIN, default `1234`)
- Most-missed words, accuracy, words practiced, sessions, total points.
- Add his real weekly **school spelling list** — those words show up more often.
- Settings: child's name, level (2nd grade / 2nd–3rd), show/hide the optional
  tap-to-hear speaker button, and change the PIN.

## Run it locally

```bash
PORT=9999 python3 server.py
# open http://127.0.0.1:9999
```

## Files

| File | What it is |
|---|---|
| `server.py` | Stdlib HTTP server: serves the app + a small JSON API, stores progress. |
| `wordbank.py` | The graded word/sentence bank (Dolch, Fry, phonics patterns, tricky words, sentences). Edit the lists here to change content. |
| `static/` | The front-end (`index.html`, `styles.css`, `app.js`), PWA `manifest.json`, `sw.js`, icons. |
| `generate_icons.py` | Regenerates the app icons (stdlib only): `python3 generate_icons.py`. |
| `data/progress.json` | The child's progress. **Gitignored** so it survives HomeHub's auto-pulls. Created on first use. |

## Content & method

The built-in bank (~640 words, 32 sentences) is drawn from public-domain /
freely-reproducible elementary sources: **Dolch** 2nd & 3rd grade sight words +
nouns, **Fry** instant words for this grade band, **phonics-pattern** groups
(silent-e, vowel teams, r-controlled, digraphs, blends, double consonants,
suffixes/prefixes, soft c/g), and a set of commonly-misspelled "tricky" words.
Sentences are short, decodable, and properly punctuated for an 8-year-old.

Method follows the research: explicit pattern practice, immediate feedback with
self-correction (cover-copy-compare), and spaced repetition of the specific
words the child gets wrong rather than re-drilling known words.

## Deploying on HomeHub

This is a `command`-type app. Register it in HomeHub's `projects.json`
(dev-first) with:

- **slug**: `spelling`
- **type**: `command`
- **prod port**: `8013`, **dev port**: `8113`
- **start**: `PORT=$PORT python3 server.py`

It reads `$PORT`, binds `127.0.0.1`, runs in the foreground, and exposes
`GET /.hub/status` for the dashboard card. See HomeHub's
`INTEGRATING_NEW_APPS.md`.

## Later

The engine is structured so a **Math** practice type can be added alongside
spelling as a second mode without reworking the progress/points/parent pieces.
