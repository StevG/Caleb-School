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
| Word lists card | "What is he practicing, and is he ready for Friday's test?" | Two kinds of sources, same checklist UI. **The bank** (`bank`: enabled, enabled_count:total, bands[]): one PERMANENT nested list per half-grade band, each with its own checkbox, `on:total` count, and per-word checkboxes (`bank_off` stores switched-off words) — plus a "Copy words" action that clones a band's checked words into a new or existing custom list without typing. **Custom lists** (`lists` [{id, name, enabled, total, enabled_count, mastered, words:[{word, on, stage, seen, missed}]}]): same rows plus ✕ remove and Delete — deletable, unlike grades. Words: green = mastered, struck = off, ✗N = misses. Deliberately utilitarian. |
| Heart words only ♥ toggle | "Can we drill just the tricky-part words?" | `profile.hearts_only` (set via settings) + `hearts_in_pool` (how many heart words the checked sources hold — also returned by `/api/parent/lists` calls so the note stays live). Bank/list word rows carry `heart: true` → the red ♥ after the word. Filter applies to words + listen modes; zero hearts in the selection falls back to ALL heart words (never an empty session). |
| Results by list card | "Is he ready for Friday's test? Is this week's list improving?" | `progress` — `{lists: [...], bands: [...]}`. Per group: `total/practiced/mastered` (bar), `accuracy` (unaided only), `last_ts`, `trend` (last 10 practice days as `{date, seen, correct}`, summed from the per-word `days` tallies), `trouble` (top-5 missed words with counts). Lists always show (id + name, with a "start over" reset); bands only once practiced (level label). |
| Most-missed words | "What should we drill in the car?" | `most_missed` (sorted by misses; `stage` included) |
| Day by day | "Is practice actually happening?" | `daily` — one row PER DAY, never merged (words, accuracy, stars) |
| By practice type | "Which modes does he use / avoid?" | `by_mode` per words/listen/sentences/memory (tries, accuracy, sessions, stars) |
| Recent sessions | raw log | `recent_sessions` |

## Data model (data/progress.json)

The file is a family document: `{"pin": <parent PIN>, "children": [child,
...]}`. Everything below describes ONE child (`children[i]`); every stat,
list, and setting is per child. All endpoints take a `child` id (`?child=`
on GETs, a `"child"` body field on POSTs) and fall back to the first child.
`/api/state` and `/api/parent/report` return the roster (`children:
[{id, name, points}]`) plus the resolved `child` id;
`POST /api/parent/children` manages add/rename/delete (never the last one).
A pre-multi-child file (one child at top level, pin inside profile)
migrates automatically on first load.

```
profile:      name, points, show_speaker, bank_enabled, hearts_only,
              enabled_grades [1.0..9.0 halves] (max_level kept in sync =
              max(enabled_grades); legacy max_level input maps to bands)
lists:        [{id, name, enabled, words: [{w, on}]}]  (custom word lists;
              legacy flat custom_words migrates into one "School list")
bank_off:     [word]  (bank words switched off individually)
words:        word -> {seen, correct, missed, streak, last_ts,
                       stage (1-4), stage_streak, mastered_ts?,
                       days: {"YYYY-MM-DD": [seen, correct]}}  (unaided
              only, pruned to 30 days — feeds the per-list/band trends)
modes:        mode -> {seen, correct, missed, points}
days:         "YYYY-MM-DD" -> {seen, correct, missed, points,
                               modes: {mode: {seen, correct, points}}}
              (pruned to 60 days)
last_answer_ts, custom_words [str], sessions [{ts, mode, count, correct, points}]
```

Resets (all PIN-gated, all per child, none touch lists/settings):
- `settings {reset_points: true}` — stars back to 0, progress untouched.
- `settings {reset_progress: true}` — words/modes/days/sessions cleared,
  stars kept (they're the iPad-time currency, not a statistic).
- `lists {action: reset_list, list_id}` — "start over": wipes progress on
  that list's words only (a word shared with the bank restarts there too).

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
