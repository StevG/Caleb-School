# Spelling Practice — design identity (what this app IS)

The app is a **practice buddy**, not a game and not a classroom. Caleb (8,
struggling with spelling, between 2nd and 3rd grade) opens it, does his words,
earns stars, and goes to play. Parents glance at a dashboard from their phones.

## Purpose
- Make daily spelling practice self-serve: no parent needs to sit with him.
- Earn ⭐ points the parents convert to iPad time ("go earn 10 points").
- Tell the parents exactly which words to work on (most-missed list).

## Who it's for
- **Caleb, 8** — big targets, few words on screen, instant feedback, zero
  reading burden beyond the practice words themselves. He must never feel
  punished: a miss is "Almost! Look again 👀", never a buzzer or a red X wall.
- **Steven + wife** — a quick glance on a phone: what's he missing, how much
  is he practicing. Enter his weekly school list in ten seconds.

## The feeling
- **Kid side:** warm, calm, encouraging. Cream paper background, rounded
  cards, one thing to do per screen, small celebrations (stars, confetti
  emoji). Light theme by explicit owner choice.
- **Parent side:** tidy iOS-Settings feel (matches the HomeHub taste:
  glanceable stats first, plain words, no dead ends).

## The core mechanic (don't dilute it)
Look–cover–write–check: the word shows big → **hides the instant he types the
first letter** → he types from memory into letter boxes → Check. Wrong →
gentle shake, then the correct spelling is **revealed to study** (amber boxes)
→ "Try again" → he retypes it (counts as *aided* — a point, but no mastery
credit). Missed words come back later in the session and in later sessions
until mastered.

Four modes share that mechanic (owner-specified behavior — keep it exact):
- **Spell Words** — one word at a time, goal of 10/15/20. Each word is
  presented at its LADDER stage (owner-specified progression): stage 1 the
  word stays visible while he copies it; stage 2 it hides at the first
  keystroke; stage 3 it's audio-only. Unaided successes climb, misses drop a
  rung, "Level up!" celebrates climbs (full rules: docs/SCORING.md).
- **Listen & Spell** — the word is spoken (auto + 🔊 to repeat) and NEVER
  shown; he types it from sound alone. True recall, one step harder than
  look-cover-write. Wrong answers reveal-and-retry like everywhere else.
- **Spell Sentences (fill-in)** — the WHOLE sentence stays visible the whole
  time. The word he's on is highlighted and stays readable until his first
  keystroke; then only that word hides and he fills it in. Sequential, word
  by word — he never memorizes more than the word he just looked at.
  Completed words turn green in place. 6 sentences per session.
- **Memory Sentences** — he reads the whole sentence big (and can tap 🔊 to
  hear it — the speaker always shows in this mode, it's dictation), taps
  "I'm ready!", the entire sentence becomes blanks, and he types every word
  from memory. The speaker re-reads the full sentence any time. 3 sentences
  per session (dictation guidance: fewer, harder items).

## UI rules (learned + confirmed)
- Letter boxes stay on **one line** — the word's shape is a memory cue; box
  size shrinks for long words (computed in `renderBoxes()`).
- The big prompt word scales down rather than clipping (`beginWord()`).
- Tap targets ≥ 44px; primary action is a full-width bottom button.
- Feedback text never contradicts the current state (clear "Almost!" when the
  reveal appears).
- The parent area hides behind a small ⚙️ + PIN — visible enough for parents,
  boring enough that a kid ignores it.
- No audio requirement: the optional 🔊 uses the device voice, off-switchable
  in settings. Never rely on sound for anything essential.
- No timers, no lives, no leaderboards — pressure works against a struggling
  speller (see docs/RESEARCH.md).

## Visual identity
- Palette: cream `#fdf6ec` bg, ink `#2d2a26`, blue `#4f9dde` (actions), green
  `#5bbf6a` (success/go), amber `#f4b942` (reveal/study), coral `#e8705a`
  (gentle wrong). Rounded 18–22px corners, soft warm shadows, SF system font.
- **Icon:** pixel-art green dino riding a white rocket through a starry navy
  sky (`generate_icons.py`, stdlib-only). Playful and kid-owned on purpose —
  it's *his* app, not a school tool.

## Non-goals
- Not a general ed-tech platform; one kid, one family, one Mac mini.
- No accounts, no cloud services, no analytics, no third-party anything.
- Not a game with an economy — points are minutes of iPad time, period.

## Decisions log
- 2026-07-01 — Web app/PWA on HomeHub over native iOS (owner approved):
  no App Store friction, instant deploys, reuses Cloudflare Access login.
- 2026-07-01 — Server-side storage (command app, not static) so the parent
  dashboard syncs across the kid's iPad and both parents' phones.
- 2026-07-01 — Points: aided retypes still earn a star (motivation) but never
  mastery/accuracy credit (honest reporting).
- 2026-07-01 — Light theme, no timers/pressure, misses phrased gently.
- 2026-07-01 — Icon changed from ABC tiles to dino-in-rocket (owner asked for
  playful over literal).
- 2026-07-01 — Sentence fill-in respec'd by owner: whole sentence visible,
  only the current word hides (on first keystroke), strictly sequential.
  Added Memory Sentences (whole-sentence dictation with read-aloud) as a
  third mode. Play-screen pill now counts session points ("go earn 10").
- 2026-07-01 — Bank expanded to ~710 words (+compounds, numbers, days,
  colors, family, contractions) and 103 sentences (levels 1-3).
- 2026-07-02 — Owner additions: pulsing "active" letter box (cursor);
  sentence modes are CASE-SENSITIVE (capitals count, with a friendly
  "check the capital letter" nudge when that's the only error); new
  Listen & Spell mode (audio-only words); per-mode statistics, per-day
  history rows, and a "last practiced" readout on the parent dashboard —
  stats deliberately NOT rolled into one metric.
- 2026-07-02 — Word bank regraded: 1st-9th grade ladder in half-grade steps
  (~1,550 words). Parent Level select is "Nth grade · early/later"; the
  server clamps max_level to 1.0-9.0. Word modes stay lowercase-only.
- 2026-07-02 — Learning ladder (owner-specified): per-word stages
  copy→memory→sound→mastered replace the flat streak; stars stay effort
  currency, the ladder is the progress metric. Dashboard reframed for a
  parent of a struggling speller: Mastered/Learning headline tiles, Learning
  journey card, school-list card with per-word status chips + "X of Y
  mastered · ready for the test!" summary, textarea paste for lists.
  Docs split: SCORING.md + STATISTICS.md; tests committed to tests/.
- 2026-07-02 — Word lists (owner-specified): school words are no longer
  mixed invisibly into the bank. The parent picks sources — the bank (one
  checkbox, grade-capped) and named custom lists, each with an
  enabled:total count, each word toggleable (on by default). Everything
  off falls back to the bank (no empty sessions). Legacy custom_words
  migrates into a "School list".
