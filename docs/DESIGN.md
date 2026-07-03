# Spelling Practice — design identity (what this app IS)

The app is a **practice buddy**, not a game and not a classroom. Caleb (8,
struggling with spelling, between 2nd and 3rd grade) opens it, does his words,
earns stars, and goes to play. Parents glance at a dashboard from their phones.

## Purpose
- Make daily spelling practice self-serve: no parent needs to sit with him.
- Earn ⭐ points the parents convert to iPad time ("go earn 10 points").
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
- Not a game with an economy — points are minutes of iPad time, period.

## Decisions log
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
