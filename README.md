# Spelling Practice

A light, kid-friendly spelling app for an 8-year-old (2nd–3rd grade), with a
PIN-protected parent dashboard. Built to run on **HomeHub** and install to an
iPhone/iPad home screen like a real app. No third-party packages — standard
library Python 3 only.

Made for Caleb: he practices spelling to earn ⭐ points; parents see which
words he misses most from their own phones.

## What it does

**For the kid**
- Four big buttons: **Spell Words**, **Listen & Spell** (hear the word — it's
  never shown — and type it), **Spell Sentences**, **Memory Sentences**.
- **Every word climbs a ladder**: first he copies it (it stays visible),
  then spells it from memory (hides as he types), then from sound alone —
  then it's mastered ★. Climbs earn a "⬆️ Level up!"; misses drop a rung and
  rebuild. Stars reward effort; the ladder measures real learning.
- Sentence modes check **capital letters** too ("The" typed as "the" gets a
  friendly "check the capital letter" nudge). The letter box waiting for the
  next letter gently pulses so he always knows where he is.
- The word appears; **as soon as he types the first letter it disappears**, and
  he fills in the rest from memory into big letter boxes (look–cover–write–check,
  the evidence-backed method).
- Tap **Check** → happy feedback + a ⭐, or a gentle "try again" that reveals the
  correct spelling to study, then lets him retype it.
- **Spell Sentences (fill-in):** the whole sentence stays visible; the word
  he's on is highlighted and hides only when he starts typing it — sequential,
  word by word, no memorizing the sentence.
- **Memory Sentences:** he reads the sentence (or taps 🔊 to hear it), taps
  "I'm ready!", the whole sentence hides, and he types every word from memory —
  real dictation practice.
- Missed words are automatically repeated later in the session and in future
  sessions (spaced repetition) until he's got them.
- He picks a goal (10 / 15 / 20 words) and the play screen counts the stars
  earned this session — perfect for "go earn 10 points".

**For parents** (tap ⚙️ → PIN, default `1234`)
- Progress first: **words mastered**, still learning, and a **Learning
  journey** view of where every word sits on the ladder — plus most-missed
  words, accuracy, **day-by-day history**, **per-practice-type stats**, and
  when he **last practiced** (each metric kept separate on purpose).
- **School spelling list**: paste the weekly list (spaces, commas, or one per
  line), then watch each word's chip go grey → amber (learning, with its
  rung) → green ★, with a "★ 7 of 10 mastered — ready for the test!" summary.
- **Level** goes from 1st through 9th grade in half-grade steps, so the app
  grows with him.
- Add his real weekly **school spelling list** — those words show up more often.
- Settings: child's name, level (2nd grade / 2nd–3rd), show/hide the optional
  tap-to-hear speaker button, and change the PIN.

## Run it locally

```bash
PORT=9999 python3 server.py
# open http://127.0.0.1:9999
```

## Test it on a Raspberry Pi (or any spare box on the LAN)

No pip, no dependencies — a stock Raspberry Pi OS install has everything.

```bash
git clone https://github.com/StevG/Caleb-School.git
cd Caleb-School
HOST=0.0.0.0 PORT=8013 AUTO_UPDATE=1 python3 server.py
```

Then on the iPad/iPhone open `http://<pi-ip>:8013` (find the IP with
`hostname -I` on the Pi) and use Share → **Add to Home Screen** for the
full-screen app icon. Progress saves to `data/progress.json` on the Pi.

- **`AUTO_UPDATE=1`** makes the Pi self-update: it checks git every ~90 s and,
  on new commits to `main`, fast-forwards and restarts itself — so you never
  have to SSH in to pull. Leave it off to update manually (`git pull` +
  restart).
- The installed app also shows its own **"Update" bar** when a new version is
  deployed (it watches `/api/version`) — one tap refreshes the phone, so it
  never keeps a stale copy.
- `HOST=0.0.0.0` is for LAN use only — never on the HomeHub Mac. Offline
  caching is off over plain HTTP; everything else works. Keep it running with
  `nohup env HOST=0.0.0.0 PORT=8013 AUTO_UPDATE=1 python3 server.py &`, or set
  it up as a service (see **`docs/HOSTING.md`**).

See **`docs/HOSTING.md`** for the full standalone-vs-HomeHub guide — including
exactly what changes (nothing in the code) when you later deploy on HomeHub.

## Files

| File | What it is |
|---|---|
| `server.py` | Stdlib HTTP server: serves the app + a small JSON API, stores progress. |
| `wordbank.py` | The graded word/sentence bank (Dolch, Fry, phonics patterns, tricky words, sentences). Edit the lists here to change content. |
| `static/` | The front-end (`index.html`, `styles.css`, `app.js`), PWA `manifest.json`, `sw.js`, icons. |
| `generate_icons.py` | Regenerates the app icons (pixel-art dino-in-rocket, stdlib only): `python3 generate_icons.py`. |
| `data/progress.json` | The child's progress. **Gitignored** so it survives HomeHub's auto-pulls. Created on first use. |
| `CLAUDE.md` + `docs/` | Orientation for future work: design identity (`docs/DESIGN.md`), curriculum research + sources (`docs/RESEARCH.md`), roadmap incl. Math mode (`docs/ROADMAP.md`). |

## Content & method

The built-in bank (~1,550 words graded 1st-9th in half-grade steps,
103 sentences) is drawn from public-domain /
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
