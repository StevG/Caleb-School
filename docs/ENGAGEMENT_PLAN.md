# Engagement plan — beating start-frustration (owner-approved direction, 2026-07-12)

> **HISTORICAL — superseded in part, same day.** All five phases shipped
> 2026-07-12; the owner then reviewed the result against the app's
> "practice buddy, not a game" identity and pared the reward layer back
> (**"the great de-bloat"**, DESIGN.md decisions log): badges are the ONE
> reward system (no star payouts), stars are in-session feedback only (no
> totals, no economy), the Dino Space Trip (Phase 3's planet journey) was
> REMOVED (the progress-bar rocket stays), and Phase 2's fact-card
> collection became a no-strings **fact of the day** on the home screen.
> Do NOT re-implement the removed pieces from this document.

Owner ask: Caleb gets **immediately frustrated and doesn't want to begin**
spelling practice. He's ahead in every other subject; spelling makes him feel
uniquely bad. What has worked: (a) hear-see-type-immediately (the autoplay
say-and-spell accommodation), (b) badges — **his own idea** — so achievement
and ownership matter to him. He loves **dinosaurs, space, and LEGO**; the
owner wants funny/interesting facts about those woven in as rewards.

This plan maps every approved feature to concrete code changes so an
implementing agent can execute it phase by phase. Each phase is independently
shippable and tested. **Read docs/DESIGN.md, docs/SCORING.md and CLAUDE.md
first — every rule there still binds.**

The two problems being solved, in priority order:

1. **Activation energy** — starting means three decisions (section → game →
   count) and a 10-20 word commitment before he's warmed up. Every choice is
   a chance to bail.
2. **The miss spike** — one letter off gets the same "Almost! Look again 👀"
   + shake + ladder drop as totally wrong, and blanking mid-word *forces* a
   miss. That's where sessions end in tears.

Everything else (facts, rocket journey, new games) builds the pull that gets
him back tomorrow.

---

## Non-negotiable guardrails (inherited — repeat offenders listed)

- Stdlib Python + plain HTML/CSS/JS only. No pip, no npm, no build step.
- **No timers, no lives, no countdowns, no pressure UI.** Anything timed is
  measured silently and celebrated afterwards (the Speed of Light pattern).
- The kid never sees an error, a dead end, or a red-X wall. Every miss
  message is gentle; every state has a way forward.
- **Presentation keys off `state.mode`, never the word's ladder stage**
  (the 2026-07-02 requeue bug). New games must follow this.
- Every path that presents an item goes through `resetItemUI()` (app.js).
- Letter boxes stay on ONE line (`renderBoxes()` computes per-word size).
- Stars only go up. Aided answers earn the star, never ladder/accuracy
  credit. The ladder is the honest metric — don't inflate it (docs/SCORING.md).
- Rewards celebrate what already happened; they never gate content, never
  expire, never un-earn (the badges guardrails — apply them to facts and
  planets too).
- `data/` is gitignored and sacred; new persistent state lives inside the
  per-child object in `data/progress.json`.
- Test at 390×780 with Playwright before pushing (tests/README.md); merging
  to `main` is deploying.
- After each phase: update DESIGN.md's decisions log, SCORING.md (if modes/
  ladder touched), STATISTICS.md (if the dashboard grows), CLAUDE.md's API
  sketch, ROADMAP.md (mark items done), and tests/README.md.

---

## Phase overview

| Phase | What | New files | Risk |
|---|---|---|---|
| 1 | Start friction + miss softening: Today's Quest, warm-start, streak/greeting chips, "Show me" peek, closeness feedback, spoken reveal | — | low |
| 2 | Fact cards (dino/space/LEGO) + badge "what's next" nudges + in-session streak toasts | `factbank.py` | low |
| 3 | Dino Space Trip: in-session rocket hop + planet journey fueled by level-ups | — | low-med |
| 4 | Two new games: Which One? 🕵️ (tap the right spelling) and Build It 🧱 (LEGO letter tiles) | — | med |
| 5 | Map It (Elkonin grapheme boxes on the reveal) | — | med (data heuristic) |

Suggested commits: one commit per numbered feature, one push per phase, run
the Playwright suites between phases.

---

# Phase 1 — make starting cheap and misses survivable

## 1.1 Today's Quest (one-tap 5-word session)

The single biggest lever. A big friendly card at the very top of the home
screen — above the missions row — that starts practice in ONE tap: no
section, no game, no count choice.

**Kid UX**
- Card: `🚀 Today's Quest — 5 words. Go!` (full-width, green `go` styling,
  same family as mission cards). Tap → session starts immediately.
- After today's first completion the card flips to a calm done state:
  `✅ Quest done! Play again?` — tapping starts another 5-word session (which
  is just a normal session; the quest reward only pays once per day).
- The done screen after a quest shows a prominent `One more game? 🎮` button
  next to Home (it jumps to the games panel, not straight into a session —
  autonomy, not a treadmill).

**Server**
- `GET /api/session?quest=1&child=` → `{mode: "words", quest: true, items}`
  where items come from `build_word_session(state, 5)` **with warm-start
  ordering (1.2)**. Quest mode is Hide & Spell (`words`) — the core
  look-cover-write-check mechanic; presentation follows the mode as usual.
- `POST /api/session_end` accepts `quest: true`. Server tracks
  `state["quest"] = {"date": "YYYY-MM-DD", "done": bool}` and bumps
  `counters["quests_done"]` only on the first completion of the day.
  Response gains `quest_done_today: true` so the client flips the card.
- `/api/state` gains `quest_done_today: bool` so the card renders correctly
  on load.
- A quest session is otherwise a 100% normal words session: same
  `/api/answer` flow, same ladder, same stats, same badges. No special
  scoring — smallness IS the feature.

**Client**
- New home element above `#missions` in index.html; wire like a mission card
  (`startSession` with the quest response's mode/items, `state.quest = true`,
  echo it in `finishSession`'s `session_end` body).
- Done screen: when `state.quest`, show the `One more game?` button
  (`showPanel("games")` after `show("home")`).

**Tests** (`tests/quest.mjs` or extend `staged.mjs`): card present, one tap
reaches the play screen with 5 items, finishing flips the card to done state,
second run same day doesn't double-bump `quests_done`, `words` presentation
rules hold (hides on first keystroke).

## 1.2 Warm-start ordering (guaranteed win first)

The first 30 seconds decide the session's mood. Open every word session with
a word he'll almost certainly get.

**Server** — in `build_word_session` (server.py), after `chosen` is
shuffled, reorder so position 0 is the best "easy win" in the set:

```python
def warmth(w):
    s = stats.get(w)
    if s and s.get("streak", 0) >= 2 and not recently_missed(s):
        return (0, -s["streak"])          # proven words first
    if not s:
        return (1, len(w))                 # else: shortest fresh word
    return (2, s.get("missed", 0))         # never a struggling word
chosen.sort(...)  # stable pull-to-front of the single best; keep the rest shuffled
```

`recently_missed` = missed within the last 2 calendar days (the per-word
`days` tallies already exist). Only position 0 is manipulated (positions
0–1 for count ≥ 15) — the 40% review mix and shuffle otherwise stand.
Applies automatically to quests since they use the same builder.

**Tests**: seed a state with one high-streak word + misses; assert it lands
first across many builds; assert review ratio unchanged.

## 1.3 Home greeting: streak chip + yesterday's win

Walking in on evidence of competence, not a blank slate.

**Server** — `/api/state` gains:
- `streak_days`: `current_day_streak(state)` (function already exists for
  the Daily Dino badge).
- `yesterday`: `{"points": n, "correct": n}` from `state["days"]` for the
  most recent practice day before today, else `null`.

**Client** — a small chip row under the points display on home:
- `🦕 Day 4!` when `streak_days >= 2` (singular "Day 1" is noise — hide it).
- `Yesterday: 23 ⭐` when `yesterday` exists and today has no practice yet.
- Chips are the same visual family as the existing Badges chip. Zero reading
  burden: numbers + emoji only.

This also delivers ROADMAP's "Daily streak chip" — mark it done there.

**Tests**: seed days; assert chips render/hide correctly.

## 1.4 "Show me again 👀" peek button (the grace path)

Blanking mid-word currently forces a miss → shake → ladder drop, for
*forgetting*, not misspelling. This is ROADMAP's "word-reveal grace" — the
single highest-value item for this kid.

**Kid UX**
- In Hide & Spell and Listen & Spell only (Copy It shows the word anyway;
  sentence modes have the sentence line), a small ghost pill sits under the
  letter boxes: `Show me again 👀`.
- Tap → the word reappears (via `heartSpans`, hearts stay red) and hides
  again on his next keystroke (the existing hide-on-type path). The 🔊
  behaves per existing rules — no change.
- No limit on peeks. Copy: the hint line switches to `Peeked — still counts
  for a star! ⭐` so the deal is honest but warm.

**Mechanics (the honest part)**
- Peeking sets `state.peeked = true` (cleared in `resetItemUI`).
- A correct answer after a peek posts `aided: true` — earns the star,
  no ladder climb, no accuracy credit, `ok: false` in `sessionWords` —
  exactly the semantics of the reveal-retype (docs/SCORING.md: "a copy of a
  just-revealed answer is stage-1-level evidence at best").
- Crucially it is NOT a miss: **no ladder drop, no requeue, no shake**.
  That's the emotional trade: peek = keep your star, lose the climb.

**Client** — new button in the play screen (index.html), shown when
`state.mode === "words" || state.mode === "listen"`, hidden while the reveal
is up (`state.missedThisItem && !state.answered`) and in sentence modes.
Add it to the `mousedown → preventDefault` list in `wirePlay()` so the iOS
keyboard stays up. In `doCheck`, `aided = state.missedThisItem || state.peeked`.

**Docs**: SCORING.md gains a "peek" paragraph under aided semantics.

**Tests**: peek shows word, hides on next keystroke, correct-after-peek earns
the point but doesn't climb (assert via a follow-up `/api/state`-side check or
the answer response), no requeue happens.

## 1.5 Closeness feedback ("SO close — one letter!")

The input is length-capped to the target and Check only enables at full
length, so every wrong attempt is the **same length** as the target —
the diff is a trivial positional compare. Use it.

**Client** — in `doCheck`'s wrong branch, before the 900 ms reveal:

```js
const diff = [...val].map((ch, i) => ch !== state.target[i]);
const nDiff = diff.filter(Boolean).length;
const swapped = nDiff === 2 && (() => { const [a,b] = diff.flatMap((d,i)=>d?[i]:[]);
  return b === a+1 && val[a] === state.target[b] && val[b] === state.target[a]; })();
```

- Message priority: existing capital-letter case first, then
  `nDiff === 1` → `SO close! Just ONE letter is different 🔍`;
  `swapped` → `Ooh! Two letters swapped places 🔀`;
  `nDiff <= half` → `You got ${len-nDiff} letters right! 💪`;
  else the existing `Almost! Look again 👀`.
- Visual: during the pre-reveal beat, boxes at differing positions get a
  `.box-off` class (coral outline, gentle wiggle); matching boxes keep their
  filled look. The reveal itself is unchanged (amber study boxes).
- The whole point: "wrong" and "99% right" must FEEL different.

**Tests**: one-off, swap, and half-right messages; `.box-off` lands on the
right boxes; capital-only case still wins.

## 1.6 Speak the reveal (multisensory correction)

Hear-see-type is what works for him — apply it to the correction, the moment
that matters most.

**Client** — in `doCheck`'s reveal `setTimeout`, after the answer renders:
if `state.autoplayAudio || state.mode === "listen"`, call the existing
say-then-spell path (`speakWordAndSpell`-equivalent parts: word at
`state.wordRate`, letters at `state.spellRate`). The next keystroke already
calls `stopSpeech()` — no copy-the-audio exploit beyond what the aided
retype already is (it's aided either way).

**Tests**: with autoplay on, a miss triggers speech parts (assert via the
existing speech test hooks in the suites).

---

# Phase 2 — Fact cards 🦕🪐🧱 + badge nudges

## 2.1 `factbank.py` — the fact catalog

New stdlib data module, sibling of `wordbank.py`/`badgebank.py`:

```python
FACTS = [
    {"id": "dino-01", "cat": "dino", "emoji": "🦖",
     "text": "A T. rex bite was strong enough to crush a car."},
    ...
]
CATEGORIES = {"dino": ("Dinosaurs", "🦕"), "space": ("Space", "🪐"),
              "lego": ("LEGO", "🧱")}
```

**Content rules** (the implementing agent writes the full set):
- **90 facts: 30 dinosaurs, 30 space, 30 LEGO.** Every fact TRUE and
  verifiable — no myths (no "great wall from space"-tier junk). When a
  classic fact is disputed, soften ("about", "scientists think") or skip.
- One sentence, ≤ 140 chars, reading level ≈ 2nd–3rd grade, funny or
  "whoa" wherever possible. He's ahead in other subjects — facts should
  make him feel smart, so real numbers and real names are good.
- Tone seeds (use these, then match them):
  - 🦖 "T. rex lived closer in time to YOU than to Stegosaurus."
  - 🦕 "Birds are dinosaurs — so a chicken is a T. rex cousin."
  - 🦕 "Stegosaurus was bus-sized but its brain was walnut-sized."
  - 🪐 "A day on Venus is longer than its whole year."
  - 🪐 "Saturn is so light it would float in a giant bathtub."
  - 🪐 "Astronauts get about 2 inches taller in space."
  - 🪐 "Space is totally silent — no air, no sound."
  - 🧱 "LEGO means 'leg godt' — Danish for 'play well'."
  - 🧱 "LEGO makes more tiny tires than any real tire company."
  - 🧱 "There are about 80 LEGO bricks for every person on Earth."
  - 🧱 "Two 8-stud bricks combine 24 different ways; six make over 915 million."
- `python3 factbank.py` prints per-category counts + validates ids unique,
  text lengths, categories known (mirror `wordbank.py`'s self-check habit).

## 2.2 Earning facts (the variable reward)

- **One fact card per finished session** (any mode, `count >= 5` so a
  3-word mission can't farm), **max 3/day** — the deck should last months.
- Server, in `_api_session_end`: eligible → pick a random un-owned fact
  (random category among those with cards left); all 90 owned → no card
  (the collection screen celebrates completion instead — never repeat-award).
- Persist per child: `state["facts"] = [ids in earn order]` and
  `state["fact_daily"] = {"date": "YYYY-MM-DD", "n": 0}`. Facts are
  **sticky like badges** — progress/star resets never touch them.
- Response gains `new_fact: {id, cat, emoji, text}`.
- `/api/state` gains `facts_earned`, `facts_total`.
- New `GET /api/facts?child=` → full catalog with `owned` flags + counts
  (mirror of `/api/badges`; no PIN — his own cards).

**Kid UX**
- Done screen: under the badge celebration area, a card-flip reveal:
  face-down card (`❓` + category emoji) that flips after ~400 ms to the
  fact, headed `🦕 New fact card!`. A 🔊 on the card reads the fact aloud
  (existing `speakText` path, `state.wordRate`) — keeps reading burden
  optional per DESIGN.md.
- Home chip `📚 Facts 12/90` next to the Badges chip → collection screen
  (same pattern as the badge case): three category sections, owned cards
  show emoji + text (+ per-card 🔊), un-owned show face-down `❓`. All 90
  owned → a banner: `🏆 Every single fact — you know them ALL!`
- Parent dashboard: nothing (kid-only reward; keep the dashboard tidy).

**Tests** (`tests/facts.mjs`): award on session_end, daily cap of 3,
5-word minimum, no repeats, persistence across reload, collection renders,
sticky through a progress reset.

## 2.3 Badge nudges — progress in the moment

BADGES.md's own research: "what's next" progress is the mechanism, not
decoration. Put it where the momentum is.

- **Done screen "next up" line.** Server: in `_api_session_end`, compute the
  in-progress badge nearest its next level (max `have/need` ratio,
  tie-break: fewest absolute remaining) from the existing `badges_view`
  data; return `next_badge: {name, emoji, level, have, need}`. Client
  renders under `#level-ups`: `🎖️ Bullseye Lv 2 — 2 to go!` Skip the line
  whenever `new_badges` is present (the celebration owns that moment).
- **In-session streak toasts.** Client-only: track consecutive unaided
  corrects within the session; at 3, 5, and 10 append to the praise line:
  `🔥 3 in a row!` Reset the counter on a miss silently — the streak line
  simply doesn't appear (never "streak lost", never a downer).

**Tests**: next-badge math (ratio + tie-break), toast at 3/5/10, silent
reset, celebration suppresses the nudge line.

---

# Phase 3 — the Dino Space Trip 🦕🚀

The app icon is HIS pixel dino-in-rocket. Give it a journey that visualizes
the ladder — competence made visible, in his own iconography.

## 3.1 In-session rocket hop

Replace the bare `#progress-fill` bar with a themed track (same slot, same
math in `loadNext`):
- A thin track with a small dino-rocket (🦕🚀 emoji pair, or an `<img>` of
  the existing 96px icon at ~24px) positioned at `doneCount/total` along it,
  CSS `transition: left .4s` + a tiny hop keyframe on each advance. Words
  done leave small ⭐ dots behind on the track.
- **Not a timer, not a countdown** — pure position. It makes "10 words"
  feel finite and short, which is an anti-frustration device in itself.
- Keep the element cheap: no layout shift (absolute positioning inside the
  existing progress container), works at 390×780 and short landscape.

## 3.2 The planet journey (meta-progression)

**Mechanics**
- Fuel = **lifetime level-ups** (`counters["stage_ups"]` — already exists,
  feeds Ladder Climber, reset-immune). No new currency, no economy: the
  ladder IS the fuel, so the map is a picture of real learning.
- 12 planets at cumulative thresholds:
  `5, 12, 21, 32, 45, 60, 78, 98, 120, 145, 172, 200` stage-ups.
  First planet lands in week one (quick hook); the last is a school-year
  aspiration (the badge-tier pattern).
- Planet names mix his three loves — pre-named, silly on purpose:
  `Stegos-4 🦕 · Bricktopia 🧱 · Roara 🦖 · Studlandia 🧱 · Comet Chomp ☄️ ·
  Rexalon 🦖 · Minifig Moon 🧱 · Nebula Nest 🥚 · Plateosphere 🍽️🦕 ·
  Brickhole 🕳️🧱 · Dactyl Drift 🪽 · Dino Prime 👑🦕` (implementer may
  improve; keep them pronounceable — the 🔊 reads them).
- **Reaching a planet**: `_api_session_end` compares
  `counters["stage_ups"]` against thresholds vs. `state["planets_seen"]`
  (int, highest index celebrated); newly crossed → response
  `new_planet: {idx, name, emoji}` + **+10 ⭐** + **one bonus fact card
  from the planet's theme category** (ignores the daily cap — landings are
  special). Multiple crossings in one session celebrate the highest, award
  each. `planets_seen` is sticky (guardrails apply).

**Kid UX**
- Home chip `🚀 Space Trip` (with the Badges/Facts chips) → journey screen:
  a vertical starfield (CSS gradient + dot stars, navy like the icon) with
  the visited planets, the dino-rocket sitting between the last visited and
  the next one, and a progress bar `12 / 21 fuel ⬆️` (fuel = level-ups,
  labeled `⬆️ level-ups` so the kid connects it to the in-game "Level up!").
- Planets are drawn by one generator — `planetSVG(idx, accent, visited)` in
  app.js, sibling of `badgeSVG`: a circle with 2–3 palette-derived colors,
  optional ring/craters/stud-texture keyed off `idx` (deterministic, no
  randomness). Unvisited = dimmed silhouette + name hidden (`???`).
- Done screen celebration on landing: reuse the badge-celebration treatment:
  `🪐 You landed on Bricktopia!` + the bonus fact card flip.
- Parent dashboard: one line on the existing badges strip
  (`🚀 4/12 planets`) — no new card.

**Server** — `/api/state` gains
`trip: {planet_idx, next_name, fuel, need}` for the home chip;
`GET /api/trip?child=` returns the full planet list for the journey screen
(names, emoji, thresholds, visited flags).

**Tests** (`tests/trip.mjs`): threshold crossing awards once, +10 ⭐, bonus
fact themed and cap-exempt, multi-crossing in one session, stickiness through
resets, journey screen renders visited/unvisited correctly.

---

# Phase 4 — two lower-effort games

Typing a whole word from memory is the hardest recall form and currently the
only interaction. These two give him a way to practice on days he refuses
the hard thing. Both are real modes: `VALID_MODES`, `MODE_LABELS`, per-mode
stats, per-day buckets all extend (the dashboard's per-mode card picks them
up; add the two labels wherever MODE_LABELS renders).

**Home layout warning**: the WORDS panel goes from 3 game cards to 5. At
390×780 that may scroll — if it does, switch the games panel to a 2-column
grid of slightly smaller cards (still ≥ 44px targets) rather than shrinking
below thumb size. Verify in Playwright before styling further.

**All-Rounder badge**: its metric stays defined over the ORIGINAL five games
— new modes must not regress anyone's progress toward it. Pin the five mode
names in `badgebank.py`'s metric rather than "all modes".

## 4.1 Which One? 🕵️ (blind-sort recognition)

The classroom blind sort, honestly adapted (ROADMAP item). Hear the word,
tap the correct spelling among three.

**Mechanic**
- `GET /api/session?mode=pick&count=10` → items
  `{w, group, heart?, choices: [3 spellings, shuffled]}`.
- The word is spoken on present (like listen; replay via 🔊) and NEVER
  shown except as the choices. Three big tappable cards, stacked (≥ 44px).
- Tap right → card flashes green, praise, ⭐, auto-advance.
  Tap wrong → gentle wiggle on the tapped card, the correct card highlights
  amber (study), `That one's tricky! This is the real one 👉`, then a
  **retype-free** advance — no typing in this mode, ever. Missed words
  requeue once, later in the session (same splice pattern as words mode).
- Requires audio, exactly like Listen & Spell: when the speaker is disabled
  in settings, hide the game card (same rule the ladder already applies to
  stage-3 items).

**Distractors** — `distractors(word, n=2)` (in `wordbank.py`, near the
grapheme data so Phase 5 can share tables): plausible misspellings via
pattern-aware edits, tried in order until `n` unique non-words are found:
1. vowel-team swaps within confusion sets (`ai↔ay↔a_e`, `ee↔ea`, `oa↔ow↔o_e`,
   `igh↔ie↔y`), guided by the word's `group` tag when it names a pattern;
2. double↔single consonant (`rabbit→rabit`, `later→latter`-style);
3. `ck↔k↔c`, `ch↔tch`, `dge↔ge`;
4. silent-e drop/add;
5. fallback: swap one vowel for its most-confusable (`a↔e`, `i↔e`, `o↔u`).
Reject any candidate that is a real word (check against the full bank pool +
a small common-words set) or equals the target; last-resort fallback is an
adjacent-letter transposition. Deterministic given (word, salt) so tests can
assert; salt by date so sessions vary.

**Scoring — a deliberate SCORING.md exception**: recognition is weaker
evidence than recall in both directions, so `pick` answers update
seen/correct/missed/per-mode/per-day stats (most-missed and `by_type` keep
working) but **never move the ladder — no climb, no drop**. Implement as a
`ladder=False` flag on `record_answer` that skips the stage/stage_streak
block. Stars: +1 per first-try correct (no aided path here; a wrong tap just
advances). Document the exception in SCORING.md with this rationale.

**Tests** (`tests/pick.mjs`): choices contain the target + 2 non-words,
correct/wrong flows, requeue, ladder untouched both ways, stats/by_type do
move, speaker-off hides the game.

## 4.2 Build It 🧱 (LEGO letter tiles)

Anagram building: the letters are all there — it's a puzzle, not a test.
Sits between Copy It and Hide & Spell in difficulty; no keyboard at all
(great for bad days AND it kills the iOS keyboard dance).

**Mechanic**
- Mode `build`, counts 10/15/20 via the normal goal step.
- Present: word shows big (+ heart spans, + autoplay per settings), then
  hides on the **first tile tap** (look-cover-build-check — same contract
  as hide-on-type). Below the letter boxes: the target's letters as
  shuffled LEGO-stud tiles (CSS: rounded rects with a stud circle + the
  letter; double letters get one tile each). Shuffle must not equal the
  correct order (reshuffle if it does).
- Tap a tile → it dims and its letter fills the next box; `⌫` undo button
  returns the last letter to its tile. Check enables when full.
- **Maximum reuse**: tiles write into the existing hidden `#typed` input and
  call `onType()` — check/reveal/aided-retype/requeue all come free.
  The retype-after-reveal re-scrambles the tiles. `resetItemUI()` clears
  tile state. Keep `#typed` `readonly` in this mode so the OS keyboard
  never rises.
- Peek button (1.4) applies here too.

**Scoring**: real spelling evidence, but the constrained letter set aids
recall — so `CLIMB_CAP` for `build` = stage 2 (same cap as Copy It: climbs
copy→memory only, never further); misses drop a rung like everywhere (one
word, one truth). Add the row to SCORING.md's table.

**Tests** (`tests/build.mjs`): tiles match target multiset, hide-on-first-tap,
undo, correct/wrong/aided flows, climb cap, no keyboard focus, one-line boxes
at 390×780 for long words (tiles may wrap to a second row — TILES may wrap,
BOXES may not).

---

# Phase 5 — Map It 🗺️ (Elkonin boxes on the reveal)

The strongest instructional item from RESEARCH.md: after a miss, show the
revealed word segmented by grapheme (`b|oa|t`) so the aided retype becomes
phoneme-grapheme mapping instead of letter-copying.

**Data** — `grapheme_split(word, group=None, heart=None)` in `wordbank.py`:
- Greedy longest-match, left-to-right, against a grapheme inventory:
  consonant digraphs/trigraphs (`tch, dge, sh, ch, th, wh, ph, ck, ng, kn,
  wr, qu`), vowel teams (`igh, eigh, ai, ay, ee, ea, oa, ow, oo, ue, ew, ie,
  oi, oy, ou, au, aw`), r-controlled (`ar, or, er, ir, ur`), doubled
  consonants.
- Hints sharpen it: if the word's `group` names a pattern, prefer that
  team on ties; a `heart` grapheme is always kept whole (it's already the
  taught unit).
- Final silent-e after a consonant becomes its own chunk (`hope → h|o|p|e`
  with the `e` chunk styled as the marker; splitting true `o_e` across the
  consonant is out of scope — the visual just needs to isolate the `e`).
- **Guarantee**: chunks always rejoin to the word; any uncertainty →
  fall back to per-letter (indistinguishable from today). Never block the
  reveal on segmentation.

**Client** — reveal path only (`doCheck`'s wrong branch + the sentence
reveal): instead of uniformly-spaced answer boxes, boxes group into chunks —
small extra gap between chunks, alternating faint tint per chunk, heart
chunks red as today. Hint line: `See the chunks? Build it chunk by chunk 🧩`.
Everything else (amber study color, Try again, aided semantics) unchanged.
One-line rule still binds — chunk gaps count toward `renderBoxes`'s width
math.

**Tests**: table-driven splits (`boat→b|oa|t`, `night→n|igh|t`,
`catch→c|a|tch`, `rabbit→r|a|bb|i|t`, `said→s|ai|d` hearts-whole,
`hope→h|o|p|e`), rejoin invariant fuzzed over the whole bank
(`python3 wordbank.py` self-check), reveal renders chunked, fallback path.

---

# Cross-cutting reference

## API delta (add to CLAUDE.md's sketch when shipped)

| Endpoint | Change |
|---|---|
| `GET /api/session` | `?quest=1` (5-word warm-started words session); `mode=pick` (choices items); `mode=build` |
| `POST /api/session_end` | body: `quest`; response: `quest_done_today`, `new_fact`, `next_badge`, `new_planet` |
| `GET /api/state` | + `quest_done_today`, `streak_days`, `yesterday`, `facts_earned/total`, `trip{}` |
| `GET /api/facts?child=` | NEW — fact catalog with owned flags |
| `GET /api/trip?child=` | NEW — planet list with visited flags |
| `POST /api/answer` | `mode` accepts `pick`/`build`; `pick` records without ladder movement |

## Per-child data delta (all inside `data/progress.json`)

`quest {date, done}` · `facts []` · `fact_daily {date, n}` ·
`planets_seen int` · `counters.quests_done` — facts and planets are sticky
(reset-immune, like badges).

## New/changed constants

`CLIMB_CAP["build"] = 2` · `VALID_MODES += pick, build` ·
`MODE_LABELS += "Which One?", "Build It"` · planet thresholds list ·
fact daily cap (3) and min session size (5).

## Docs checklist per phase

DESIGN.md decisions-log entry (date + owner rationale) · SCORING.md (peek
semantics; pick's no-ladder exception; build's cap row) · STATISTICS.md
(any dashboard change — planets strip line, per-mode rows for new modes) ·
ROADMAP.md (mark done: streak chip, word-reveal grace, blind-sort, Map it) ·
CLAUDE.md API sketch · tests/README.md (new suites).

## Owner defaults assumed (flag at delivery, don't block on them)

1. Fact pacing: 1/session, 3/day, 5-word minimum — tune freely.
2. Planet thresholds (first ≈ week one, last ≈ school year) and the names —
   **consider letting Caleb rename planets**; ownership is his superpower
   (badges were his idea). A rename field in Settings is a cheap follow-up.
3. Quest = 5 words of Hide & Spell. If he'd rather start even softer, an
   alternative is quest day 1-2 of a streak = Copy It — not built; ask.
4. Which One? hides without audio (mirrors Listen & Spell's rule).
