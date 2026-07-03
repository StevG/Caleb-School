# Badges — IMPLEMENTED 2026-07-02 (owner-approved)

Shipped as designed. Owner said yes to all open questions: **+5/10/15/25 ⭐
per level**, **parent push on earn**, **retroactive credit**, **14 badges**.
Code map: catalog in `badgebank.py`; counters + tier engine + endpoints in
`server.py` (`badge_metrics`/`evaluate_badges`/`badges_view`, `_seed_counters`
migration, `GET /api/badges`, `new_badges` on `session_end`); SVG generator +
badge case + celebration + parent strip in `app.js`; tests in `tests/badges.mjs`.
Trophies are STICKY — `evaluate_badges` floors each level at its stored value,
so resets never un-earn (words/hearts-mastered derive from stats, which a
reset clears, but the badge keeps its level). Original plan below.

---

# Badges — original plan

Owner ask (2026-07-02): Caleb wants badges. Each badge has FOUR stages that
build on it visually — a hexagon that gains a "plate" on one of its sides per
stage, so you can read Level 1→4 at a glance. Badges for different tasks
("Speed of Light" = N words fast, etc.), organized in categories, all sharing
one family design with a different symbol in the middle.

## What the research says (why this design)

- **Tiered badges beat one-shot badges.** Duolingo's achievement system (its
  most-copied feature) is exactly this shape: ~14 named badges, each with
  levels that re-earn on bigger thresholds (Wildfire = streak, 10 levels;
  Scholar = words learned). Levels keep a badge alive instead of "done".
  Khan Academy tiers whole badge *classes* (Meteorite→Moon→Earth→Sun→Black
  Hole) — rarity tiers give long-term aspirational targets.
- **Badges work when they're competence feedback, not carrots.** The
  meta-analytic picture: gamification reliably lifts motivation/engagement
  when it supports *competence* (visible growth) and *autonomy* (optional,
  kid-driven); it backfires (overjustification effect) when rewards feel
  controlling or replace an activity's own meaning. Design consequences:
  badges celebrate what ALREADY happened, never gate content, never expire,
  never punish, and sit behind a "Badges" door the kid opens when he wants.
- **Feedback must ride along.** Badge screens that show *what's next*
  ("12/25 to Level 3") outperform pure trophies — the progress bar under
  each badge is not decoration, it's the mechanism.
- **No pressure mechanics.** This app deliberately has no timers on screen
  (docs/DESIGN.md, docs/RESEARCH.md — pressure hurts struggling spellers).
  Speed badges therefore measure *silently* and celebrate afterwards; no
  countdown, no clock UI, ever.

## The badge family (visual system)

One SVG generator (`badgeSVG(emoji, tier, accent, locked)`) draws every
badge — no image assets, works offline, matches the app's stdlib/no-build
rules. Mock approved separately (badge-design.png).

- **Shape:** flat-top hexagon, white face, ink outline, inner accent ring
  (per-badge color), big emoji symbol centered. Locked = dashed grey outline,
  faded ❓.
- **The four plates:** the hexagon's four diagonal edges each carry a beveled
  plate, added clockwise from upper-right as stages complete:
  **Level 1 bronze → 2 silver → 3 gold → 4 "rainbow"** (app-palette
  blue→green→amber gradient). Top and bottom edges stay clean so the shape
  reads as a badge, not a gear. Max-level badges show "★ MAX".
- **Progress:** under each badge, a small bar + "12/25" toward the next
  level. Locked badges show a hint of how to unlock ("finish one Listen &
  Spell session").

## Badge catalog (14 badges, 7 categories, 4 levels each)

Thresholds are first-guess; tune after real-world data. All counters are
LIFETIME per child (resets never touch them — badges are trophies).

| Category | Badge | Symbol | Earned by | L1 / L2 / L3 / L4 |
|---|---|---|---|---|
| ⚡ Speed | **Speed of Light** | ⚡ | a 10+-word session averaging ≤N sec/word with ≥80% first-try (timed silently) | 15s / 12s / 9s / 6s |
| 🎯 Accuracy | **Bullseye** | 🎯 | perfect sessions — every word right first try | 1 / 5 / 15 / 40 |
| 🎯 Accuracy | **Hot Streak** | 🔥 | correct answers in a row (carries across sessions) | 10 / 25 / 50 / 100 |
| 💪 Hard work | **Word Wizard** | 🧙 | lifetime words spelled right | 100 / 500 / 2000 / 5000 |
| 💪 Hard work | **Star Collector** | ⭐ | lifetime stars earned (immune to star resets) | 100 / 500 / 2000 / 5000 |
| 💪 Hard work | **Marathoner** | 🏃 | sessions finished | 10 / 50 / 150 / 365 |
| 📅 Consistency | **Daily Dino** | 🦕 | practice days in a row | 3 / 7 / 14 / 30 |
| 🏆 Mastery | **Word Master** | 🏆 | words mastered (ladder top) | 5 / 25 / 75 / 200 |
| 🏆 Mastery | **Heart Healer** | ♥ | heart words mastered | 3 / 10 / 25 / 60 |
| 🏆 Mastery | **Ladder Climber** | 🪜 | level-ups earned | 10 / 50 / 150 / 400 |
| 🗺️ Explorer | **All-Rounder** | 🗺️ | sessions in EVERY one of the 5 games | 1 / 5 / 20 / 50 each |
| 🗺️ Explorer | **Sound Sleuth** | 🔊 | Listen & Spell words right | 25 / 100 / 400 / 1000 |
| 🗺️ Explorer | **Sentence Builder** | ✏️ | sentences completed (fill-in + memory) | 10 / 50 / 150 / 400 |
| 📋 Missions | **Mission Hero** | 📋 | missions completed | 1 / 5 / 15 / 40 |

Design notes:
- Early levels come FAST (Bullseye L1 = one perfect session; Mission Hero
  L1 = first mission) — quick wins hook the system; L4s are school-year
  aspirations (Duolingo's pattern).
- Daily Dino is the one streak badge, tuned gentle (3 days to start).
  Streaks are the strongest habit mechanic but also the pressure-est; one is
  enough, and a broken streak just restarts the counter — the badge keeps
  its earned level forever.
- Speed of Light requires the accuracy floor so guessing fast can't farm it,
  and only counts sessions of 10+ words so three-word missions don't trigger.

## Architecture (when we implement)

- **`badgebank.py`** (like wordbank.py): the catalog as pure data —
  `{id, name, emoji, accent, category, blurb, metric, tiers[4]}`. Editing
  thresholds = edit one dict.
- **Counters** on each child (new `counters` map): lifetime_correct,
  lifetime_points, answer_streak/best, perfect_sessions, sessions_total,
  per-game session counts, stage_ups, day_streak/best, sentences_done,
  listen_correct, missions_done, fastest qualifying pace. Bumped in
  `record_answer`/`session_end` (a dozen lines); most seed retroactively
  from existing stats on migration so Caleb's history counts.
- **Engine:** `badge_tiers(counters)` = pure function → {badge_id: tier}.
  Compare to stored `state["badges"]`, persist the difference, return
  `new_badges` on the `/api/session_end` (and `/api/answer` for streak-type)
  responses.
- **Session timing:** client sends `seconds` with session_end (measured
  quietly; server sanity-clamps). No timing UI anywhere.
- **Kid UX:** a "Badges 🎖️" chip on the home screen (next to points) →
  badge-case screen: grid of hexagons by category, tap for detail + what's
  next. Done screen celebrates new earns ("🎖️ Speed of Light — Level 2!")
  with the confetti treatment; multiple earns queue politely.
- **Parent UX:** compact badges strip on the dashboard (per child, earned
  levels + next-up progress) — utilitarian, matches the Results cards.
  Optional push: "Caleb earned Speed of Light Lv 2 ⚡" through the existing
  notification plumbing.
- **Tests:** `badges.mjs` — tier math via seeded counters, retroactive
  migration, celebration rendering, per-child isolation, reset immunity.

## Open questions for the owner

1. **Stars for levels?** e.g. +5/+10/+15/+25 ⭐ per level earned — ties
   badges into the iPad-time economy. (Proposed: yes, small.)
2. **Parent push on badge earn?** (Proposed: yes — reuses missions plumbing.)
3. **Badge count OK?** 14 feels right (Duolingo has ~14); trim or grow?
4. **Retroactive credit** for Caleb's existing history? (Proposed: yes —
   waking up to 4-5 already-earned badges makes the feature land magic.)
5. Threshold sanity — especially Speed of Light seconds/word.

## Sources

- Duolingo achievement/levels system: blog.duolingo.com/achievement-badges;
  duoplanet.com/duolingo-achievements-guide (Wildfire streak levels, ~14
  badges, level frames)
- Khan Academy badge rarity tiers (Meteorite→Black Hole): trophy.so/blog/
  badges-feature-gamification-examples; prodwrks.com gamification-in-edtech
- Gamification meta-analysis (intrinsic motivation ↑ via autonomy/
  competence/relatedness): Springer, Educ Tech Research Dev 2024
  (10.1007/s11423-023-10337-7)
- Digital badges & motivation/self-efficacy, goal-setting anchor: Frontiers
  in Education 2024 (10.3389/feduc.2024.1429452); Abramovich et al. 2013
- Overjustification/gamification misuse risks: arxiv 2203.16175 ("When
  Gamification Spoils Your Learning"), arxiv 2305.08346 (negative effects
  mapping) — basis for the optional/no-gate/no-expiry guardrails
