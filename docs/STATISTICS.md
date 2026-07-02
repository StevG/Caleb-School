# Statistics — what the parent sees, where it comes from

Principle (owner-stated): **don't tie all the stats into one metric.** Each
view answers one question a parent of a struggling speller actually asks.

| Dashboard element | Question it answers | Source (parent_report field) |
|---|---|---|
| Words mastered ★ tile | "Is he actually learning?" | `summary.mastered` |
| Still learning tile | "How much is in flight?" | `summary.learning` |
| Stars earned tile | "How much effort?" (iPad-time currency) | `summary.points` |
| Accuracy tile | "How is he doing overall?" | `summary.accuracy` (unaided only) |
| Last practiced bar | "Did he do it today?" | `last_practice_ts` |
| Learning journey card | "Where is everything on the ladder?" | `journey` {copy, memory, sound, mastered} + `summary.mastered_this_week` |
| School spelling list card | "Is he ready for Friday's test?" | `custom_status` [{word, stage, seen, missed}] — chips: grey = not tried, amber = learning (shows rung), green ★ = mastered, ✗N = miss count. Summary line: "★ X of Y mastered" |
| Most-missed words | "What should we drill in the car?" | `most_missed` (sorted by misses; `stage` included) |
| Day by day | "Is practice actually happening?" | `daily` — one row PER DAY, never merged (words, accuracy, stars) |
| By practice type | "Which modes does he use / avoid?" | `by_mode` per words/listen/sentences/memory (tries, accuracy, sessions, stars) |
| Recent sessions | raw log | `recent_sessions` |

## Data model (data/progress.json)

```
profile:      name, points, pin, show_speaker, max_level (1.0-9.0 halves)
words:        word -> {seen, correct, missed, streak, last_ts,
                       stage (1-4), stage_streak, mastered_ts?}
modes:        mode -> {seen, correct, missed, points}
days:         "YYYY-MM-DD" -> {seen, correct, missed, points,
                               modes: {mode: {seen, correct, points}}}
              (pruned to 60 days)
last_answer_ts, custom_words [str], sessions [{ts, mode, count, correct, points}]
```

Semantics to preserve:
- `seen/correct/missed` count **unaided** attempts only; aided retypes add
  points but touch nothing else (see docs/SCORING.md).
- `sessions.count`/`correct` are **word units** in every mode.
- Day buckets and mode buckets are written in the same `record_answer` call
  that updates the word — they can't drift apart.

## Adding a new statistic (checklist for future agents)

1. Record it in `record_answer` (or `_api_session_end`) — one write path.
2. Expose it in `parent_report` — pure read, no side effects.
3. Render it in `renderReport` (app.js) + a card in index.html.
4. Decide: does it merge into an existing metric? Default is NO — new row,
   new card, per-day/per-mode kept separate.
5. Add a check to tests/staged.mjs or tests/new-features.mjs.
