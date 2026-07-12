# Roadmap / extension notes

Owner-stated direction: this repo will grow into Caleb's practice hub —
**spelling first, math next**, possibly more subjects later.

## Engagement plan (owner-approved 2026-07-12 — NEXT UP)

**`docs/ENGAGEMENT_PLAN.md`** fully maps the anti-frustration work the owner
approved: Today's Quest one-tap sessions, warm-start ordering, the "Show me
again" peek, closeness feedback, dino/space/LEGO fact cards, the Dino Space
Trip, and two new games (Which One? / Build It). It subsumes several items
below (daily streak chip, word-reveal grace, blind-sort practice, "Map it"
Elkonin boxes) — implement from that plan, then mark them off here.

## Adding Math mode (the agreed next step)

The pieces already generalize; don't fork the app, extend it:

- **Home screen** gets a third mode card (e.g. "Math Facts 🧮") next to
  Spell Words / Spell Sentences.
- **Server:** add a `mathbank.py` (problem generator: addition/subtraction
  within 100, then times tables — check with the owner for where Caleb is)
  and a `mode=math` branch in `/api/session`. Reuse the same
  `/api/answer` + points + sessions plumbing; record per-fact stats in the
  same `state["words"]` map using keys like `"7+8"` (they're just tokens).
- **Front end:** the play screen already handles prompt → hidden entry →
  check → feedback; math swaps letter boxes for a number pad / digit boxes.
  Keep `resetItemUI()` as the single state reset.
- **Parent dashboard:** most-missed facts falls out for free (same stats map);
  add a mode filter only if it gets noisy.

## From the 2026-07 instruction research (docs/RESEARCH.md — prioritized)

- ~~**Heart-letter highlighting**~~ — DONE 2026-07-02: heart words render
  their irregular grapheme(s) in red in the prompt and the reveal, with a
  "learn it by heart ♥" hint, across all modes (data: `wordbank.HEART_WORDS`).
- **"Map it" on misses (Elkonin boxes)** — after the reveal, show the word
  segmented by grapheme (b|oa|t) before the aided retype, turning copying
  into phoneme-grapheme mapping.
- **Feature-level miss analysis** — log *which grapheme* was wrong (vowel
  team vs consonant vs suffix) and report "most misses are long-o teams" —
  the same placement logic as a spelling inventory.
- **Blind-sort practice** — a contrast interaction: hear a word, choose
  between plausible spellings (coat/cote/cott). Replicates the
  highest-value classroom sort.
- **Day-spanning mastery** — require ladder stage-ups to span different
  days (spacing effect: gains show at the 28-day delay, not Friday).
- **Transfer checks** — occasionally test an *unpracticed* word from a
  mastered pattern group; that's what school programs call mastery.

## Smaller ideas (unscheduled, sanity-checked)

- ~~**Daily streak** chip on the home screen~~ — DONE 2026-07-12 (Phase 1,
  docs/ENGAGEMENT_PLAN.md): 🦕 "Day N!" greeting chip from `state.streak_days`.
- **Per-pattern parent insight** — "most misses are r-controlled vowels"
  (each word already carries a `group` tag).
- **Mastery decay** — resurface long-mastered words after N weeks.
- **Celebration upgrade** — a tiny CSS confetti burst on the done screen.
- **Sentence bank growth** — more level-3 sentences as he improves
  (follow the construction rules in docs/RESEARCH.md).
- **Months of the year** — a standard 3rd-grade unit, deliberately left out
  of the bank for now (long words, capital-letter convention); add as a
  theme group when he's ready.
- ~~**Word-reveal grace** — a "show me again" button that counts as aided~~
  — DONE 2026-07-12 (Phase 1): the "Show me again 👀" peek (aided, never a
  miss — see docs/SCORING.md).
- **Spend/adjust stars** — "Reset stars to 0" shipped 2026-07-02 alongside
  per-list ("start over") and per-child progress resets. Still open if
  wanted: decrementing a specific amount ("spent 30 min = −30 ⭐").
- **Ladder tuning** — if mastery proves too easy/hard, adjust `STAGE_UP`
  in server.py (see docs/SCORING.md) rather than adding mechanisms.

## Deployment reminders

- Registered in HomeHub `projects.json` as `spelling`, dev-first
  (dev-spelling.smacgray.com, port 8113; prod 8013). Promotion = one-line
  stage flip PR in HomeHub — say "promote spelling on HomeHub".
- HomeHub auto-pulls `main` every ~30 s; merging to `main` IS deploying.
- `data/progress.json` survives deploys because it's gitignored — keep it so.
- Default parent PIN is **1234**; remind the owner to change it in Settings
  after first launch.
