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
  resurfaces across sessions until mastered on the learning ladder
  (copy → memory → sound; rules in docs/SCORING.md).
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

## Grade ladder (added 2026-07-02, expanded to full curriculum lists same day)

`wordbank.GRADE_LISTS` carries the full grade-level curriculum at half-grade
levels 1.0-9.0 (~64-177 per half-grade; whole grades land at ~150-600 words
counting the pattern/theme groups, comparable to a published year's list).
Anchoring, per band:

- **Grades 1-3:** K12Reader's 36-week grade spelling programs (weeks 1-18 →
  X.0, weeks 19-36 → X.5) cross-checked against Fry frequency bands, Dolch
  (grades 1-3), Super Teacher and spelling-words-well grade lists.
- **Grades 4-6:** K12Reader 36-week lists + Super Teacher +
  spelling-words-well, including the standard morphology units (-tion/-sion,
  -able/-ible, plurals like alumni/cacti, homophone pairs).
- **Grades 7-9:** vocabulary.com "150 words every Nth grader should know how
  to spell" + middle-school master lists + high-school-freshman /
  commonly-misspelled canon (accommodate, occurrence, conscience,
  bureaucracy...).

Merge rules (script-enforced, 2026-07-02): every word passes the typeable
charset `[a-z'-]`; a word already anywhere in the bank keeps its original
group/level (pattern groups stay the most descriptive tag); a word listed at
two levels by different sources keeps the earliest. The X.0/X.5 split follows
the 36-week sequences where a source has them, editorial judgment elsewhere —
no published source splits by semester. Classic hard-spellers are placed at
the grade where they're conventionally taught.

## How spelling is taught in US schools (researched 2026-07)

The context Caleb's classroom almost certainly lives in:

- **The science-of-reading shift.** 40+ states now mandate evidence-based
  literacy instruction ("structured literacy"); balanced-literacy practices
  (word walls of memorized sight words, three-cueing) are being replaced by
  explicit, systematic, cumulative phonics — with spelling taught as
  *encoding*, the mirror of decoding, not visual memorization. Evidence:
  Graham & Santangelo 2014 meta-analysis (ES 0.54, transfer to reading).
  (ExcelinEd, EdWeek SoR tracker, Springer.)
- **Developmental stages (Words Their Way / Bear et al.).** Five stages;
  **a 2nd→3rd grader is typically a "Within Word Pattern" speller**: solid
  on CVC/blends/digraphs, but "uses-but-confuses" long-vowel markers (SNAIK
  for snake, FLOTE for float). That stage studies, in order: short-vs-long
  contrast → CVCe → vowel teams (ai/ay, ee/ea, oa/ow, igh) → r-controlled →
  diphthongs/ambiguous vowels → complex consonants (-ck/-tch/-dge, kn/wr,
  scr/thr) → homophones. **Our pattern groups already follow this arc.**
- **What a school week looks like.** Fundations/UFLI-style daily 30-min
  block: tap out phonemes, build with tiles, **dictation** (words then
  sentences), heavy cumulative review; or Words-Their-Way word sorts
  (Mon closed sort → Tue speed sort → Wed writing sort/word hunt →
  Thu blind sort → Fri quiz, often with unstudied transfer words).
- **Techniques with evidence:** word sorts (pattern contrast beats rote
  lists), sound walls, **phoneme-grapheme mapping** (Elkonin boxes: b|oa|t),
  dictation, distributed/spaced review (biggest effect at 28-day delay —
  Petersen-Brown 2023), morphology from ~3rd grade (largest gains for
  weaker readers), typing ≈ handwriting for spelling acquisition in 2nd
  grade once handwriting exists (Ouellette & Tims 2014).
- **Assessment:** teachers place kids with a developmental spelling
  inventory scored by *feature* (vowel pattern vs consonant vs suffix), and
  teach at the first feature where errors cluster. Mastery = *delayed* +
  *transfer* (spell unstudied words with the pattern), not Friday-test
  recall.

### Heart words (the modern take on sight words)

High-frequency words are no longer memorized whole. The **heart word**
method (Really Great Reading "Heart Word Magic", UFLI, Reading Rockets "A
New Model for Teaching High-Frequency Words"): decode the regular graphemes
normally and mark only the truly irregular part with a heart — in *said*,
s and d are regular; only **ai** must be learned by heart. This drives
orthographic mapping (Ehri): bonding spelling to pronunciation instead of
photographing word shapes.

**`wordbank.HEART_WORDS`** now holds ~110 K-3 heart words each mapped to its
irregular grapheme(s) (said→ai, was→a, of→f, come→o-e, could→oul,
friend→ie, people→eo …), compiled editorially following those published
sources (the classic lists are consistent across programs). Words the bank
lacked were added under a "Heart words" group; the mapping is data for the
planned heart-letter highlight feature (ROADMAP).

### What we already do right vs. what to add

Already aligned: pattern-grouped bank in the Within-Word-Pattern order,
look-cover-write-check + reveal-retype (≈ cover-copy-compare), spaced
resurfacing of misses, ladder mastery ending in audio recall, dictation-style
sentence modes, per-day/per-type honest reporting.

Adopted into ROADMAP from this research: feature-level miss analysis,
blind-sort style contrast practice, Elkonin "map it" step after a miss,
day-spanning mastery streaks, unstudied transfer words as the true mastery
check, and heart-letter highlighting.

## Feature-targeted instruction (the 2026-07-04 targeted-spelling loop)

How US classrooms actually act on spelling errors: they diagnose by
**feature**, not by word. *Words Their Way*'s within-word-pattern volume
(the grades 1–4 stage most 2nd–3rd graders sit in) organizes every week
around **word sorts that contrast one feature** (ai vs. ay, oi vs. oy), and
its Spell Checks exist precisely to tell the teacher **which features** a
child has mastered and which need targeted follow-up work (Invernizzi,
Johnston, Bear & Templeton, *Words Their Way: Word Sorts for Within Word
Pattern Spellers*, Pearson). Reading Rockets' practice guidance says the
same thing for parents: analyze the child's misspellings for the pattern
behind them and reteach that pattern
(readingrockets.org → Reading 101 → Spelling: In Practice).

The app now closes that exact loop, with the parent as the teacher:

1. **Diagnose** — every session stores per-word first-try results; the
   report aggregates them by the bank's category tags (`WORD_GROUP`) into
   `by_type`. A category with 6+ tries under 80% unaided accuracy is
   flagged `needs_work` — our stand-in for a failed Spell Check feature.
2. **Target** — one tap on a flagged category assigns a Hide & Spell
   mission on just that category, missed words selected first (then the
   normal spaced-repetition ladder keeps resurfacing them).
3. **Control** — the bank itself is presented category-first (each grade's
   types, not a 300-word wall), so the parent can steer week-to-week
   practice at the same granularity the analysis reports on. This is the
   sort-group as a selectable unit — the closest a checkbox UI gets to
   handing the kid a word sort.

What we deliberately did NOT copy: physical sorting (open vs. closed
sorts) — typing-based games can't do card sorts honestly, so the app keeps
its look–cover–write–check core and uses the categories for *selection and
reporting* instead.

## Open questions for future iterations

- Should mastery decay (a word mastered in July re-checked in September)?
- ~~Per-pattern reporting for parents ("he misses r-controlled vowels
  most")?~~ Done 2026-07-04 — the Word types card (`by_type`).
- Handwriting capture (Apple Pencil / finger tracing) as an alternate input.
- True contrast sorts (show two pattern columns, kid drags words) as a
  sixth game — the category data is already in place.
