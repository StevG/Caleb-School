# Spelling Practice — design identity (what this app IS)

The app is a **practice buddy**, not a game and not a classroom. Caleb (8,
struggling with spelling, between 2nd and 3rd grade) opens it, does his words,
earns stars, and goes to play. Parents glance at a dashboard from their phones.

## Purpose
- Make daily spelling practice self-serve: no parent needs to sit with him.
- Keep him engaged with ONE reward system — badges (his own idea) — plus
  small in-session ⭐ feedback while he plays. (Stars were retired as a
  lifetime currency 2026-07-12; see the decisions log.)
- Tell the parents exactly which words to work on (most-missed list).

## Who it's for
- **Caleb, 8** — big targets, few words on screen, instant feedback, zero
  reading burden beyond the practice words themselves. He must never feel
  punished: a miss is "Almost! Look again 👀", never a buzzer or a red X wall.
- **Steven + wife** — a quick glance on a phone: what's he missing, how much
  is he practicing. Enter his weekly school list in ten seconds.

## The feeling
- **Kid side:** warm, calm, encouraging. Cream paper background, rounded
  cards, one thing to do per screen, small celebrations (stars, confetti
  emoji). Light theme by explicit owner choice.
- **Parent side:** tidy iOS-Settings feel (matches the HomeHub taste:
  glanceable stats first, plain words, no dead ends).

## The core mechanic (don't dilute it)
Look–cover–write–check: the word shows big → **hides the instant he types the
first letter** → he types from memory into letter boxes → Check. Wrong →
gentle shake, then the correct spelling is **revealed to study** (amber boxes)
→ "Try again" → he retypes it (counts as *aided* — a point, but no mastery
credit). Missed words come back later in the session and in later sessions
until mastered.

Five games in two home-screen sections share that mechanic (owner-specified
2026-07-02 — each word game is one ladder rung, chosen BY THE KID, and a
game can only prove skills up to its own rung; see docs/SCORING.md):

**WORDS 🔤** (each asks 10/15/20)
- **Copy It 👀** — the word stays visible the whole time he types. The
  gentle on-ramp; a correct climbs a brand-new word copy→memory, nothing
  more.
- **Hide & Spell 🙈** — the word shows big and hides at the first
  keystroke (look–cover–write–check). Corrects climb up to from-sound;
  it can never mark a word mastered.
- **Listen & Spell 🔊** — the word is spoken (auto + 🔊 to repeat) and
  NEVER shown; he types it from sound alone. The only game that finishes
  a word off as mastered — true recall.

**SENTENCES 📝**
- **Fill In ✏️** — the WHOLE sentence stays visible the whole time. The
  word he's on is highlighted and stays readable until his first
  keystroke; then only that word hides and he fills it in. Sequential,
  word by word. Completed words turn green in place. 6 per session.
- **Remember It 🧠** — he reads the whole sentence big (and can tap 🔊 to
  hear it — the speaker always shows here, it's dictation), taps
  "I'm ready!", the entire sentence becomes blanks, and he types every
  word from memory. The speaker re-reads the full sentence any time.
  3 per session (dictation guidance: fewer, harder items).

## UI rules (learned + confirmed)
- Letter boxes stay on **one line** — the word's shape is a memory cue; box
  size shrinks for long words (computed in `renderBoxes()`).
- The big prompt word scales down rather than clipping (`beginWord()`).
- Tap targets ≥ 44px; primary action is a full-width bottom button.
- Feedback text never contradicts the current state (clear "Almost!" when the
  reveal appears).
- The parent area hides behind a small ⚙️ + PIN — visible enough for parents,
  boring enough that a kid ignores it.
- No audio requirement: the optional 🔊 uses the device voice, off-switchable
  in settings. Never rely on sound for anything essential.
- No timers, no lives, no leaderboards — pressure works against a struggling
  speller (see docs/RESEARCH.md).

## Visual identity
- Palette: cream `#fdf6ec` bg, ink `#2d2a26`, blue `#4f9dde` (actions), green
  `#5bbf6a` (success/go), amber `#f4b942` (reveal/study), coral `#e8705a`
  (gentle wrong). Rounded 18–22px corners, soft warm shadows, SF system font.
- **Icon:** pixel-art green dino riding a white rocket through a starry navy
  sky (`generate_icons.py`, stdlib-only). Playful and kid-owned on purpose —
  it's *his* app, not a school tool.

## Non-goals
- Not a general ed-tech platform; one kid, one family, one Mac mini.
- No accounts, no cloud services, no analytics, no third-party anything.
- Not a game with an economy — no currencies, no shops, ONE trophy system
  (badges). Stars exist only as in-the-moment feedback during a session.

## Decisions log
- 2026-07-14 — Device pick is parent-only, and it's ONE selection
  (owner-specified): the home-screen "who's spelling?" chip row is GONE — a
  kid can no longer switch the app to a sibling and do their practice. The
  PIN-gated dashboard's child tabs now double as the device pick: whichever
  child the parent is viewing is who this device practices as (synced in
  openParent, stored on the device as before; a one-line note under the tabs
  says so, shown with 2+ kids). No second selector — the owner explicitly
  rejected separate "viewing" and "practicing" pickers. Per-child settings
  are unchanged: each tab still edits that kid's own world.
- 2026-07-12 — **The great de-bloat** (owner, after reviewing the engagement
  phases with screenshots + research): the app had grown THREE parallel
  reward systems (badges + 90 fact cards + 12 planets), each with its own
  chip, screen, and done-screen celebration — the worst-case done screen
  measured 966px on a 780px phone with the Home button unreachable, and in a
  seeded run 11 of 20 lifetime stars came from meta-bonuses instead of
  spelling. Owner's calls, all implemented:
  (1) **Badges are THE reward system** (Caleb's own idea, untouched — names,
  tiers, screen, chip all stay). Badge levels no longer pay stars — the badge
  is the trophy (`STAR_PER_LEVEL` removed).
  (2) **Stars demoted to in-session feedback only.** The play pill still
  counts +1s during a session (answers feel rewarded in the moment) but
  there is no home-screen total, no done-screen tally ("You spelled N
  words!" instead), no iPad-time economy, no parent Stars tile (replaced by
  Day streak), no reset-stars button (the API keeps accepting
  `reset_points`). The internal `points`/`lifetime_points` counters still
  tick quietly to feed the Star Collector badge. The greeting chip now says
  "Yesterday: N right ✅" instead of stars.
  (3) **Dino Space Trip removed** (planets, journey screen, chip, +10 ⭐
  landings, `/api/trip` — all gone). The little rocket riding the in-session
  progress bar stays: it's presentation, not a reward system.
  (4) **Fact cards → fact of the day.** No collection, no awards, no caps,
  no screen: one dino/space/LEGO fact (`factbank.py`, deterministic daily
  rotation via `server.daily_fact`) shows on the home screen every day with
  a 🔊 — pure fun, zero mechanics, always visible (`state.daily_fact`).
  (5) The done screen is scrollable as a safety net so stacked badge
  celebrations can never push the buttons off-screen again.
  Research basis: unified reward systems beat parallel ones (K-12
  gamification meta-analyses; "When Gamification Spoils Your Learning");
  the loved apps in this space are single-focus (Duolingo ABC, Khan Kids,
  Squeebles = one collection/one currency).
- 2026-07-12 — Engagement Phase 5: Map It (Elkonin boxes on the reveal). After
  a miss, the revealed answer's letter boxes group into grapheme chunks
  (b|oa|t, n|igh|t, r|a|bb|i|t) — an extra gap + alternating tint between
  chunks, heart letters still red — so the aided retype is phoneme-grapheme
  mapping, not letter-copying (the strongest instructional item in
  docs/RESEARCH.md). `wordbank.grapheme_split()` (greedy longest-match over a
  taught-grapheme inventory + doubled-consonant merge; GUARANTEE: chunks
  rejoin, else per-letter fallback) is mirrored by `graphemeSplit()` in app.js
  for the client reveal; `renderRevealBoxes()` applies the chunk gaps (they're
  reserved in `renderBoxes`'s one-line width math). Hint: "See the chunks?
  Build it chunk by chunk 🧩".
- 2026-07-12 — Engagement Phase 4: two lower-effort games (owner: give him a
  way to practice on bad days when typing a whole word feels like too much).
  Both are real modes (per-mode/per-day stats, missions, `MODE_LABELS`).
  (1) **Which One? 🕵️** (`pick`) — hear the word, tap the right spelling of
  three. `wordbank.distractors()` builds two pattern-aware misspellings
  (vowel-team swaps, double/single consonant, ck/k/c, silent-e, close-vowel;
  rejects real bank words). Recognition, not recall → it **never moves the
  ladder** (no climb, no drop; `NO_LADDER_MODES`), but still feeds stats.
  Needs audio like Listen & Spell (force-shows the speaker). Missed words
  requeue once; no typing, no retype. (`GET /api/session?mode=pick`.)
  (2) **Build It 🧱** (`build`) — tap scrambled LEGO-stud letter tiles (no
  keyboard) to spell the word; it hides on the first tile (look–cover–build–
  check). Tiles write into the hidden `#typed` input and call `onType()`, so
  check/reveal/aided-retype/requeue all reuse the existing flow; the peek
  works too. Constrained letters = aided recall, so `CLIMB_CAP["build"] = 2`
  (climbs copy→memory only); misses drop a rung. The Words section is now a
  2-column grid of 5 games so they still fit without scrolling.
- 2026-07-12 — Engagement Phase 3: the Dino Space Trip (owner: he loves the
  dino-in-rocket icon — make it a journey). Full spec in ENGAGEMENT_PLAN.md.
  (1) **In-session rocket** — a 🚀 rides the progress track one hop per word
  (position, never a timer), making "10 words" feel finite and short.
  (2) **Planet journey** — 12 planets (Stegos-4 … Dino Prime, names mixing
  dinosaurs/space/LEGO) at cumulative thresholds `5,12,21,32,45,60,78,98,120,
  145,172,200`. FUEL = lifetime level-ups (`counters.stage_ups`, reset-immune),
  so the map is a picture of real learning, not a separate economy. Reaching a
  planet pays **+10 ⭐** and a **bonus fact card** from the planet's theme deck
  (cap-exempt). A "🚀 Space Trip" home chip opens a starfield journey screen
  (`planetSVG` draws each planet deterministically; unvisited = dimmed ???).
  The done screen celebrates a landing; the parent dashboard shows "N/12
  planets" under the badges strip. `planets_seen` is sticky and baselined on
  upgrade so no landing-dump. Server: `PLANETS`, `check_planet_landing()`,
  `state.trip` / `GET /api/trip`, `session_end.new_planet`.
- 2026-07-12 — Engagement Phase 2: fact cards + badge nudges (owner: Caleb
  loves dinosaurs, space, and LEGO — weave in fun facts). Full spec in
  docs/ENGAGEMENT_PLAN.md. Shipped:
  (1) **Fact cards** — a new `factbank.py` deck of 90 true, kid-readable facts
  (30 dinosaurs / 30 space / 30 LEGO). Finishing a real session (5+ items)
  flips over one new card on the done screen (with a 🔊 to read it); capped at
  3/day so the deck lasts months; never repeats. A "📚 N/90 facts" home chip
  opens the collection screen (owned cards face-up, the rest face-down ❓);
  all 90 shows a "you know them ALL" banner. Cards are STICKY (resets never
  clear them, like badges). Server: `state.facts` / `fact_daily`,
  `award_fact()`, `GET /api/facts`, `session_end.new_fact`,
  `state.facts_earned/total`. Kid-only — the parent dashboard stays tidy.
  (2) **Badge "what's next" nudge** — the done screen shows the badge nearest
  its next level ("🎖️ Bullseye Lv 2 — 2 to go!", `session_end.next_badge`),
  suppressed when a badge was actually earned (that moment owns the screen).
  (3) **In-session streak toasts** — client-only "🔥 N in a row!" at 3/5/10
  consecutive unaided corrects; a miss resets it silently (never a downer).
- 2026-07-12 — Anti-frustration engagement pass, Phase 1 (owner: Caleb gets
  frustrated and won't *begin*; the enemy is activation energy and the miss
  spike). Full spec in `docs/ENGAGEMENT_PLAN.md`. Shipped:
  (1) **Today's Quest** — a one-tap green card at the top of home that starts
  a 5-word warm-started Hide & Spell session with zero decisions (section/
  game/count all skipped). Smallness is the feature. Reward counts once/day
  (`counters.quests_done`); the card flips to "Quest done! ✅ Play again?".
  The done screen offers "One more game? 🎮" (→ the games menu, not a
  treadmill). Server: `GET /api/session?quest=1`, `session_end {quest}`,
  `state.quest {date,done}` + `quest_done_today`.
  (2) **Warm start** — every word session leads with a near-certain win (a
  proven word, else the shortest fresh one, never a lately-missed struggle);
  only position 0–1 is reordered, the rest stays shuffled (`build_word_session`).
  (3) **Home greeting chips** — 🦕 "Day N!" (streak ≥ 2) and "Yesterday: N ⭐"
  (until he practices today), from new `/api/state` fields `streak_days` /
  `yesterday` / `practiced_today`. (Delivers the ROADMAP "daily streak chip".)
  (4) **"Show me again 👀" peek** — a grace pill under the boxes in Hide &
  Spell / Listen & Spell: re-shows the word (hides again on the next
  keystroke), earns the star as *aided* (no ladder climb) but is NOT a miss —
  no shake, no rung drop, no requeue. Blanking shouldn't punish him.
  (Delivers the ROADMAP "word-reveal grace".)
  (5) **Closeness feedback** — a wrong try is length-matched to the target, so
  a positional diff drives the message: "SO close! Just ONE letter is
  different 🔍" / "Two letters swapped 🔀" / "You got N letters right 💪",
  and the off-letters get a coral `.box-off` wiggle. "Wrong" and "99% right"
  must feel different.
  (6) **Spoken reveal** — when audio is already in play (autoplay on, or
  Listen & Spell), a miss says+spells the correct answer (multisensory
  correction; the next keystroke stops it).
- 2026-07-02 — Parent-tunable audio speeds (owner): Settings "Audio speed"
  section with two sliders — Word reading (`word_rate`, 0.5–1.2, default
  0.8) and Spelling speed (`spell_rate`, 0.3–1.0, default 0.45), per child,
  clamped server-side. Releasing a slider reads an example back at the new
  rate (word slider → says "spelling"; spell slider → spells it) and saves;
  a 🔊 button replays. `SPELL_RATE` constant is gone — `speakText`/
  `speakWordAndSpell` read `state.wordRate`/`state.spellRate`.
- 2026-07-02 — Audio refinements (owner): (1) the spelling reads SLOWER than
  the word — speech is now a sequence of `{text, rate}` parts (`speakParts`),
  word at 0.8, letters at `SPELL_RATE` 0.45. (2) The manual 🔊 spells the
  word only BEFORE the child starts typing; once he's begun (tracked by
  `state.typedStarted`, set in onType, cleared in resetItemUI) it says the
  word name only, so the spelling can't be used to copy. Auto-play still
  says word+spell on show and stops on the first keystroke.
- 2026-07-02 — Badges (owner-approved, docs/BADGES.md). 14 badges in 7
  categories, each 4 levels drawn as plates added clockwise to a hexagon
  (bronze/silver/gold/rainbow), one SVG generator (`badgeSVG` in app.js,
  no assets). Lifetime per-child `counters` (immune to resets, seeded
  retroactively so history counts) feed a pure tier engine; earning pays
  +5/10/15/25 ⭐ per level and pushes the parents. A "🎖️ Badges" chip on the
  home screen opens the trophy case; the done screen celebrates new levels;
  the dashboard shows a compact strip. Guardrails from the gamification
  research: badges are optional, never gate content, never expire, and are
  STICKY — a progress reset can't un-earn a trophy. Catalog/thresholds live
  in `badgebank.py`.
- 2026-07-02 — Per-child "auto-play audio when a word is shown" (owner
  accommodation). A Settings toggle (`profile.autoplay_audio`, default off,
  per child). When on, each shown word in Copy It / Hide & Spell is spoken
  then spelled out ("planet. p. l. a. n. e. t"; `'`→"apostrophe", `-`→"dash")
  via `maybeAutoplayWord()`. `onType()` calls `stopSpeech()` on the first
  keystroke so the spelling can't be copied. The manual 🔊 in those modes
  also says-then-spells; Listen & Spell stays word-only (spelling would give
  the answer). Speaker button shows whenever auto-play is on (for replay).
- 2026-07-02 — Fixed: Hide & Spell could show the word while typing (owner
  bug). A missed word re-queues a ladder rung down (stage 1), and
  `presentWordItem` had keyed presentation off the item's stage — so the
  requeued word came back as stage-1 "Copy It" (keepVisible), staying
  visible mid-round. Presentation now keys off `state.mode` only (copy =
  visible, words = hide-on-type), so every Hide & Spell word hides on the
  first keystroke regardless of its rung. The requeue no longer carries a
  stage. `staged.mjs` gained a direct regression check.
- 2026-07-02 — Keyboard stays up all session (owner: the bounce/resize
  between words was distracting). The text input was never disabled
  (`state.locked` freezes typing instead), but tapping Check / Next / 🔊 /
  the boxes moved focus off it, closing the iOS keyboard — which then
  reopened on the next word and resized the screen. Those controls now
  `preventDefault` on mousedown so focus stays in `#typed` (the click still
  fires); the keyboard never closes between words. Memory mode still lowers
  it for the read phase on purpose.
- 2026-07-02 — Faster refresh (owner): Pi `AUTO_UPDATE_INTERVAL` default
  90 s → 15 s and the client `/api/version` poll 60 s → 15 s, so a push to
  `main` reaches the phone's "Update" bar in ~15 s instead of ~90 s.
- 2026-07-02 — Home is a three-step drill-down (owner: five cards no longer
  fit without scrolling). Step 1: two big section cards, **Words 🔤** /
  **Sentences 📝**. Step 2: that section's games (Words → Copy It / Hide &
  Spell / Listen & Spell; Sentences → Fill In / Remember It) with a "⬅ Back".
  Step 3 (word games only): the 10/15/20 count. Each step shows only a few
  big targets so nothing scrolls; panels slide in; Back steps up one level;
  sentence games start on one tap. Implemented as `.home-panel`s toggled by
  `showPanel()` (replaced the old glide-away `chooseMode`). This supersedes
  the earlier "Home menu flow" and "Home split into sections" entries below.
- 2026-07-02 — Home split into Words/Sentences sections with five explicit
  games (owner-specified): Copy It 👀 / Hide & Spell 🙈 / Listen & Spell 🔊
  and Fill In ✏️ / Remember It 🧠. The adaptive per-word stage mix inside
  the old "Spell Words" is gone — the KID picks the difficulty, and
  `CLIMB_CAP` (server.py) keeps the ladder honest: Copy It climbs only
  copy→memory, Hide & Spell up to from-sound, and only Listen & Spell can
  mark a word mastered (streaks don't bank while capped). Presentation
  follows the game, not the word's stage. Journey rungs and games now
  share names/emojis, so the parent report reads 1:1 against the games.
- 2026-07-02 — Switched-off sources look switched off (owner report): when
  a grade band, custom list, or the whole Word bank is unchecked, its
  contents grey out (`.src-off`) — but the word checkmarks stay visible in
  grey. They were always REMEMBERED server-side (band toggles never touch
  `bank_off`); now the UI says so: re-checking the section re-activates
  exactly the selection you had. Checkmarks are still editable while grey,
  so a parent can pre-select words before switching a section on.
- 2026-07-02 — Word-row ordering (owner-specified): every word checklist
  (bank bands and custom lists) shows the heart words A–Z first, then all
  remaining words A–Z — the hard ones a parent scans for sit on top.
  Ordered server-side in bank_status()/lists_status().
- 2026-07-02 — Assignments + notifications (owner-specified). Parents hand
  out "missions": any of the four modes, optionally pinned to a word list,
  to one child or every child. Missions sit at the top of the kid's home
  screen as green tappable cards; a list-pinned word test is every enabled
  word once, shuffled, always hidden-on-type (no copy crutch) — a real
  spelling test whose answers still feed the normal stats. Finishing
  stores the score on the parent's Assignments card and pushes
  "Caleb finished a mission ⭐ 9/10" to parent devices; assigning pushes
  "New mission! 📋" to the kid's devices. Web Push is pure-stdlib VAPID
  (P-256 ECDSA in server.py) with EMPTY pushes — the service worker pulls
  the message from /api/push/pull (payload crypto avoided on purpose).
  iOS only pushes to Home-Screen apps, so the kid side shows a dismissible
  "Share ⬆️ → Add to Home Screen" hint in the browser and a "🔔 Turn on
  mission alerts" button once installed; parents have the same button in
  Settings. Notifications are conveniences, never the system of record.
- 2026-07-02 — Home menu flow (owner-specified): tapping Spell Words /
  Listen & Spell no longer pops the count chips at the bottom of the
  screen, disconnected from the card. The OTHER game cards glide away
  (staggered fade-slide), the chosen card stays with "How many words?" +
  chips popping in 1-2-3 directly beneath it, and a "⬅ All games" button
  returns to the full menu without starting. Sentence modes still start
  on one tap. Kid-side animation only; the parent side stays utilitarian.
- 2026-07-02 — Speech hardened for iOS (owner field report): speak-after-
  cancel settle delay (a tap mid-utterance used to be silently dropped),
  resume() before speaking (synth wakes paused after app switches), a
  silent unlock utterance inside the session-start tap (auto-speak was
  blocked until the first manual 🔊 tap), a kept utterance reference (GC
  kills audio mid-word), and the 🔊 button pulses while actually talking —
  visible proof it's working even when the iPhone ring/silent switch has
  muted speech (iOS mutes speechSynthesis on silent; nothing an app can do).
- 2026-07-02 — Checkboxes are predictable (owner bug report): unchecking
  every grade band STICKS — no more silent snap-back to the up-to-3rd-grade
  defaults. An empty selection shows a calm amber heads-up in the Word
  lists card ("that's fine while you set things up…") and sessions quietly
  fall back to the starter bands so the kid still gets words. The
  `sources_empty` flag rides on report/lists/settings responses.
- 2026-07-02 — Results by list (owner-specified, "the spelling-test view"):
  a dashboard card showing, per school list (and per practiced grade band,
  folded), mastery bar, unaided accuracy, day-by-day trend chips (from new
  per-word daily tallies), and the list's own trouble words. Resets are
  TARGETED rather than account-wide: "start over" per list, and separate
  Settings buttons for stars and practice progress (lists/settings always
  survive; stars and progress reset independently — stars are currency,
  progress is data).
- 2026-07-02 — Multiple children (owner-specified): the family doc is
  `{pin, children:[...]}` — ONE parent PIN, each child carrying their entire
  world (progress, word lists, bank switches, hearts-only, speaker, points).
  The home screen grows a "who's spelling?" chip row only when there are 2+
  kids (each device remembers its pick); the dashboard gets child tabs at
  the top — every card below belongs to the selected child only. Children
  can be added (+ tab), renamed (settings name field), and removed (danger
  button, confirm, never the last one). A pre-multi-child progress.json
  migrates automatically into child #1.
- 2026-07-01 — Web app/PWA on HomeHub over native iOS (owner approved):
  no App Store friction, instant deploys, reuses Cloudflare Access login.
- 2026-07-01 — Server-side storage (command app, not static) so the parent
  dashboard syncs across the kid's iPad and both parents' phones.
- 2026-07-01 — Points: aided retypes still earn a star (motivation) but never
  mastery/accuracy credit (honest reporting).
- 2026-07-01 — Light theme, no timers/pressure, misses phrased gently.
- 2026-07-01 — Icon changed from ABC tiles to dino-in-rocket (owner asked for
  playful over literal).
- 2026-07-01 — Sentence fill-in respec'd by owner: whole sentence visible,
  only the current word hides (on first keystroke), strictly sequential.
  Added Memory Sentences (whole-sentence dictation with read-aloud) as a
  third mode. Play-screen pill now counts session points ("go earn 10").
- 2026-07-01 — Bank expanded to ~710 words (+compounds, numbers, days,
  colors, family, contractions) and 103 sentences (levels 1-3).
- 2026-07-02 — Owner additions: pulsing "active" letter box (cursor);
  sentence modes are CASE-SENSITIVE (capitals count, with a friendly
  "check the capital letter" nudge when that's the only error); new
  Listen & Spell mode (audio-only words); per-mode statistics, per-day
  history rows, and a "last practiced" readout on the parent dashboard —
  stats deliberately NOT rolled into one metric.
- 2026-07-02 — Word bank regraded: 1st-9th grade ladder in half-grade steps
  (~1,550 words). Parent Level select is "Nth grade · early/later"; the
  server clamps max_level to 1.0-9.0. Word modes stay lowercase-only.
- 2026-07-02 — Learning ladder (owner-specified): per-word stages
  copy→memory→sound→mastered replace the flat streak; stars stay effort
  currency, the ladder is the progress metric. Dashboard reframed for a
  parent of a struggling speller: Mastered/Learning headline tiles, Learning
  journey card, school-list card with per-word status chips + "X of Y
  mastered · ready for the test!" summary, textarea paste for lists.
  Docs split: SCORING.md + STATISTICS.md; tests committed to tests/.
- 2026-07-02 — Word lists (owner-specified): school words are no longer
  mixed invisibly into the bank. The parent picks sources — the bank (one
  checkbox, grade-capped) and named custom lists, each with an
  enabled:total count, each word toggleable (on by default). Everything
  off falls back to the bank (no empty sessions). Legacy custom_words
  migrates into a "School list".
- 2026-07-02 — Heart words: irregular graphemes render red (♥ hints) in the
  word prompt and post-miss reveal, per the science-of-reading heart-word
  method. Data in `wordbank.HEART_WORDS`; rendering via `heartSpans()`.
- 2026-07-02 — Word bank expanded to full grade-level curriculum lists
  (~2,870 words; each grade now carries a published-program-scale list from
  K12Reader/Super Teacher/spelling-words-well 36-week sequences for 1-6 and
  vocabulary.com/middle-school master lists for 7-9). Existing placements
  and pattern-group tags were preserved; sources + merge rules in
  docs/RESEARCH.md.
- 2026-07-02 — Heart words in the Word lists card (owner-specified): every
  heart word shows a small red ♥ to the right of the word in the bank bands
  and custom lists, and a "Heart words only ♥" toggle at the top of the card
  narrows practice (words + listen modes) to the heart words inside whatever
  sources are checked — with a note showing how many that gives. A selection
  with zero hearts falls back to ALL heart words, never an empty session.
- 2026-07-02 — Grade selection moved INTO Word lists (owner: "why does it
  say up to 3rd grade?"): the bank is now one permanent nested list per
  half-grade band — band checkboxes, per-word checkboxes (bank_off), and a
  "Copy words" action to clone a band into a custom list without typing.
  Bands/bank words can be switched off but never deleted; custom lists can.
  The Settings "Level" dropdown is gone (legacy max_level API still maps).
- 2026-07-04 — Targeted spelling loop (owner-specified): the parent
  dashboard now diagnoses and treats by word TYPE, the way US classrooms
  do (Words Their Way feature analysis — docs/RESEARCH.md):
  (a) Recent sessions are CLICKABLE — each opens to the actual words,
  misses first, every word tagged with its category and ♥;
  (b) a new "Word types" card aggregates accuracy per category, floats
  struggling types up (6+ tries, <80%) with their trouble words and a
  one-tap "Assign practice" button;
  (c) assignments can target a school list, a word TYPE, or a whole grade
  (dropdown optgroups; type/grade missions pick missed words first, then
  shuffle — it's a test);
  (d) the bank is category-first: each grade shows its types with
  tri-state checkboxes (all/some/none), words one fold deeper, plus a
  per-category "Copy to a list". The parent picks categories, not one
  word at a time — but can still fine-tune single words.
