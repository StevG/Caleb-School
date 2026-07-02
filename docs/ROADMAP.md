# Roadmap / extension notes

Owner-stated direction: this repo will grow into Caleb's practice hub —
**spelling first, math next**, possibly more subjects later.

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

## Smaller ideas (unscheduled, sanity-checked)

- **Daily streak** chip on the home screen (data exists in `sessions`).
- **Per-pattern parent insight** — "most misses are r-controlled vowels"
  (each word already carries a `group` tag).
- **Mastery decay** — resurface long-mastered words after N weeks.
- **Celebration upgrade** — a tiny CSS confetti burst on the done screen.
- **Sentence bank growth** — more level-3 sentences as he improves
  (follow the construction rules in docs/RESEARCH.md).
- **Months of the year** — a standard 3rd-grade unit, deliberately left out
  of the bank for now (long words, capital-letter convention); add as a
  theme group when he's ready.
- **Word-reveal grace** — a "show me again" button that counts as aided,
  for when he genuinely forgot mid-word.
- **Spend/adjust stars** — points are add-only today; parents "spend" them
  for iPad time verbally. A parent-side spend/reset control would close the
  loop (owner-aware, unscheduled).
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
