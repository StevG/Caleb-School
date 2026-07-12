# Scoring & the learning ladder

Two currencies, deliberately separate:

- **Stars (⭐ points)** — effort currency. +1 for every correct answer,
  *including* aided retypes (he fixed it; that deserves the star). Stars are
  what the parents convert to iPad time. They only go up. Never make stars
  contingent on being right the first time — for a struggling speller the
  star has to reward showing up.
- **The ladder** — the honest progress metric. Stars measure effort; the
  ladder measures learning. Parents read the ladder, the kid feels the stars.

## The ladder (per word)

Every word climbs four rungs. Since 2026-07-02 the rungs map 1:1 to the
word GAMES the kid picks on the home screen — presentation follows the
game, and each game can only prove skills up to its own rung
(`CLIMB_CAP` in server.py):

| Stage | Name | Game (mode) | Advance after | Game's climb cap |
|---|---|---|---|---|
| 1 | Copy it 👀 | Copy It (`copy`): word stays visible while typing | 1 unaided correct | can only climb 1→2 |
| 2 | From memory 🙈 | Hide & Spell (`words`): hides at the first keystroke | 2 unaided corrects | can climb up to 3 |
| 3 | From sound 🔊 | Listen & Spell (`listen`): audio only, never shown | 2 unaided corrects | uncapped (can master) |
| 4 | Mastered ★ | — | (records `mastered_ts`) | |

Two extra games (added 2026-07-12) sit off to the side of this ladder:
- **Build It 🧱** (`build`): tap scrambled letter tiles to spell the word
  (it hides on the first tile). The constrained letter set makes it *aided*
  recall, so `CLIMB_CAP["build"] = 2` — it climbs copy→memory only, never
  further, and a miss drops a rung like everywhere (one word, one truth).
- **Which One? 🕵️** (`pick`): hear the word, tap the right spelling of three.
  Recognition is weaker evidence than recall in BOTH directions, so `pick`
  answers **never move the ladder** — no climb, no drop (`NO_LADDER_MODES` in
  server.py). They still record seen/correct/missed + per-mode/per-day stats,
  so most-missed and the by-type analysis keep working; stars pay +1 per
  first-try correct (no aided path — a wrong tap just moves on).

Rules (implemented in `server.record_answer`, constants at top of server.py):
- **Any miss drops the word one rung** (min stage 1) and resets its
  stage streak — in every game. Rebuilding from a lower rung is the
  pedagogy, not a bug.
- **A capped game neither climbs nor banks streaks**: five perfect copies
  of a stage-2 word change nothing — "mastered" always means "spelled it
  from sound alone", so only Listen & Spell can finish a word.
- **Aided retypes never advance anything** — a copy of a just-revealed
  answer is stage-1-level evidence at best.
- **A peek ("Show me again 👀") is aided, not a miss.** In Hide & Spell and
  Listen & Spell the kid can re-show the word (it hides again on the next
  keystroke). A correct answer after a peek earns the star but posts
  `aided:true` — no ladder climb, no accuracy credit (same as a post-reveal
  retype). Crucially it is NOT scored as a miss: no rung drop, no requeue.
  Blanking mid-word is forgetting, not misspelling; the trade is "keep your
  star, lose the climb", never a punishment (added 2026-07-12).
- Stage-up news rides back on the `/api/answer` response
  (`{stage_up, stage}`) so the kid gets "⬆️ Level up!" in the moment and a
  level-up count on the done screen.
- Answers from ANY mode move the same ladder (a miss in sentence mode drops
  the word too; sentence modes climb uncapped like listen). One word, one
  truth.
- If the parent disabled the speaker, stage-3 items outside listen mode
  present as stage 2 (`presentWordItem` in app.js) — no audio means no
  audio test.
- In-session requeue after a miss re-presents the word one rung down,
  mirroring the drop the server just recorded.

## Session selection (spaced repetition)

The pool comes from the sources the parent switched on in the Word lists
card: the built-in bank (grade-capped, one checkbox) and/or enabled custom
lists (each word individually toggleable). If everything is off, the bank is
used as a fallback — the kid must never get an empty session.

`build_word_session`: ~40% of a session is *review* — seen-but-unmastered
words, most-missed first, parent's school words before bank words (including
brand-new school words, so a fresh list surfaces immediately) — the rest
fresh words, topped up with least-recently-seen mastered words if the pool
runs dry. Mastered words stop being pushed; they only reappear as filler.

## Legacy data migration

Word records written before the ladder existed have no `stage` field.
`word_stage()` migrates lazily on first touch: old streak ≥ 2 → mastered,
anything else that was practiced → stage 2 (the only mechanic that existed),
never-seen → stage 1. Don't write a migration script; the lazy path covers it.

## Why these numbers

1/2/2 thresholds ≈ 5 spaced unaided successes to master a word, ending with
auditory recall — consistent with the cover-copy-compare and dictation
research in docs/RESEARCH.md. If mastery seems too easy/hard in practice,
tune `STAGE_UP` in server.py (one dict), not the client.
