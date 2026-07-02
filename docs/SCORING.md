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

Every word climbs four rungs, and words-mode presents each word AT its rung:

| Stage | Name | Presentation | Advance after |
|---|---|---|---|
| 1 | Copy it 🐣 | word stays visible while typing (errorless copying) | 1 unaided correct |
| 2 | From memory ✏️ | hides at the first keystroke (look–cover–write–check) | 2 unaided corrects |
| 3 | From sound 🔊 | audio only, never shown | 2 unaided corrects |
| 4 | Mastered ★ | — | (records `mastered_ts`) |

Rules (implemented in `server.record_answer`, constants at top of server.py):
- **Any miss drops the word one rung** (min stage 1) and resets its
  stage streak. Rebuilding from a lower rung is the pedagogy, not a bug.
- **Aided retypes never advance anything** — a copy of a just-revealed
  answer is stage-1-level evidence at best.
- Stage-up news rides back on the `/api/answer` response
  (`{stage_up, stage}`) so the kid gets "⬆️ Level up!" in the moment and a
  level-up count on the done screen.
- Answers from ANY mode move the same ladder (a miss in sentence mode drops
  the word too; a correct in Listen mode climbs it). One word, one truth.
- If the parent disabled the speaker, stage-3 words present as stage 2
  (`presentWordItem` in app.js) — no audio means no audio test.
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
