# Research notes — spelling practice for a 2nd→3rd grader

Compiled 2026-07-01 for the initial build. Future agents: extend, don't
re-do. Word lists below are already encoded in `wordbank.py`.

## Word sources used (and licensing)

| Source | What we took | License |
|---|---|---|
| **Dolch lists** (E.W. Dolch, 1936–48) | 2nd-grade (46) + 3rd-grade (41) service words + common nouns | Public domain |
| **Fry Instant Words** | The grade-2/3 zone (~101–300) informed sight-word coverage | Ranked lists freely reproducible |
| **Phonics pattern groups** | Silent-e, vowel teams (ai/ay/ee/ea/oa/ow/igh/ie), r-controlled (ar/or/er/ir/ur), digraphs (sh/ch/th/wh), diphthongs (oi/oy/ou/ow/au/aw), double consonants, ck, blends, soft c/g, suffixes (-ing/-ed/-er/-est/-ly/-ful/-less), prefixes (un-/re-) | Compiled from standard curricula (K5 Learning, Literacy Learn, Reading Universe, NC DPI) |
| **Tricky words** | High-frequency irregulars kids misspell (because, friend, said, their…) | Compiled (YourDictionary, spelling-words-well, SpellingPower) |
| **Sentences** | 32 short decodable dictation sentences, capitals + end punctuation | Written to the construction rules below |

Useful raw datasets if the bank ever needs to grow programmatically:
SCOWL (github.com/en-wl/wordlist, ~public domain), wordfreq
(github.com/rspeer/wordfreq, data CC BY-SA 4.0 — attribution + share-alike if
redistributed), CMU Pronouncing Dictionary (BSD-ish; has syllable/phoneme data).

## Method evidence (why the app works the way it does)

- **Explicit, systematic spelling instruction beats incidental learning.**
  Graham & Santangelo 2014 meta-analysis (53 studies, 6,037 students): direct
  teaching of patterns improves spelling AND reading. → the bank is organized
  by phonics pattern, not random lists.
- **Look–cover–write–check / cover-copy-compare** are the evidence-backed
  drill forms; the power ingredient is **immediate feedback with
  self-correction**. → hide-on-first-keystroke + reveal-then-retype flow.
  (Intervention Central; ERIC EJ1098122.)
- **Spaced repetition of the child's own missed words** beats re-drilling
  known words (Iowa Reading Research Center). → miss re-queues in-session and
  resurfaces across sessions until 2 unaided corrects (`MASTERED_STREAK`).
- **Session size:** quality over count; typical school lists are 10–15/week;
  struggling spellers need shorter, more frequent sets. → goals of 10/15/20
  with "as many as he wants" allowed.
- **Typing vs handwriting:** handwriting aids encoding for typical learners,
  but for kids where the motor act is a barrier, typing reduces cognitive
  load and is a standard accommodation (Nature Sci Reports 2025;
  ScienceDirect S095947522500043X). → a typing app is legitimate; handwriting
  practice at school complements it.
- **Dictation sentence construction** (All About Learning, Reading Rockets,
  Phonic Books): 4–8 words, natural word order, only taught patterns + a few
  sight words, always capital + end punctuation, said aloud → repeated →
  written → checked. 1–2 sentences is a full activity for a struggling
  speller. → sentence bank follows these rules; sentence mode keeps sessions
  short (6 sentences).
- **No timers/pressure for struggling spellers** — anxiety suppresses recall;
  encouragement + streaks of success build the habit. → no countdowns, gentle
  miss language.

## Word bank shape (as built)

~710 unique words, 49 groups (phonics patterns + theme units: compound words,
number words, days of the week, colors, family words, contractions), levels 2
(easier, served first at level cap 2) and 3. 103 sentences at levels 1–3
(~35 per level, original compositions following the dictation-construction
rules below). `wordbank.build_pool()` flattens with de-dup;
`server.build_word_session()` mixes ~40% review (missed/unmastered,
custom-first) with fresh words, filling with least-recently-seen mastered
words. Parent-added custom words always join the pool regardless of level cap.

**Session sizes** (All About Learning Press dictation guidance: 2–5 sentences
per day for typical learners, 1–2 for working-memory struggles): 10/15/20
words (kid picks), 6 fill-in sentences (memory load is one word at a time),
3 memory sentences (whole-sentence recall is the heavy lift).

## Grade ladder (added 2026-07-02)

`wordbank.GRADE_LISTS` adds ~840 words at half-grade levels 1.0-9.0
(35-50 per level, no duplicates with the pattern/theme groups). Anchoring:
Fry frequency bands + Dolch (grades 1-3), K12Reader / Super Teacher /
spelling-words-well grade lists (1-6), vocabulary.com "150 words every Nth
grader should know how to spell" + middle-school master lists (6-8), and
9th-grade/high-school freshman lists including the commonly-misspelled canon
(accommodate, occurrence, conscience, bureaucracy...). The X.0/X.5
first-half/second-half split is editorial judgment guided by 36-week
curriculum sequences — no published source splits by semester; thinnest at
6.5/7.5/8.5. Classic hard-spellers are placed at the grade where they're
conventionally taught.

## Open questions for future iterations

- Should mastery decay (a word mastered in July re-checked in September)?
- Per-pattern reporting for parents ("he misses r-controlled vowels most")?
  The data already exists (`group` tags per word) — it's a UI question.
- Handwriting capture (Apple Pencil / finger tracing) as an alternate input.
