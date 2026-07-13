# Browser test suites

Playwright scripts that drive the real app in Chromium — the app's core is a
UI state machine, and these suites are what has caught every serious
regression so far. **Run them before pushing to `main`** (HomeHub deploys
from main).

| Suite | Covers |
|---|---|
| `verify-fixes.mjs` | Historical bug regressions: sentence punctuation, retry soft-lock, PIN gate (4-8 digits), aided-vs-mastery, double session-end, custom words above level cap, path traversal |
| `sentence-modes.mjs` | Fill-in spec (whole sentence visible, current word hides on first keystroke) + memory mode (read → hide all → type from memory, read-aloud) |
| `new-features.mjs` | Active-box cursor, capitals in sentences, Listen & Spell, per-mode / per-day stats, last-practiced |
| `matrix.mjs` | Layout bounds at iPhone/iPad × portrait/landscape + mid-word rotation |
| `staged.mjs` | The learning ladder: stage-1 copy stays visible, stage-2 hides, stage-3 audio-only, level-up feedback, journey card, school-list statuses |
| `updates.mjs` | The PWA update prompt: `/api/version` change → "Update" bar appears → tap reloads (touches a static file to simulate a deploy) |
| `lists.mjs` | Word-lists manager: create/toggle lists, per-word switches, on:total counts, pool filtering, bank checkbox, everything-off fallback |
| `hearts.mjs` | Heart words: heart fields on session items/tokens, red grapheme spans in prompt + reveal, heart hints, `heartSpans()` edge cases, ♥ list markers + the hearts-only filter |
| `children.mjs` | Multiple children: per-child lists/settings/points, home-screen picker, dashboard child tabs, add/rename/remove, device pick persistence |
| `progress.mjs` | Results by list: per-list/band mastery + accuracy + daily trend + trouble words, per-list "start over", settings resets (stars / progress), reset scoping per child |
| `audio.mjs` | Speech: iOS-safe speak path (cancel→settle→speak, resume, last-tap-wins), session-start audio unlock, speaker pulse, memory-mode whole-sentence dictation in both phases, quit cancels |
| `autoplay.mjs` | Per-child auto-play-on-show: off by default, says word then spells it in Copy It / Hide & Spell, stops on typing, never spells in Listen & Spell, setting persists per child |
| `badges.mjs` | Badges: 14-badge catalog + tier engine, earning (NO star payout — the badge is the trophy), Speed-of-Light pace math, sticky levels (reset immunity), per-child isolation, home chip + badge case + detail + parent strip |
| `home-flow.mjs` | Home drill-down: pick a section (Words/Sentences) → game → count; each step fits without scrolling; Back steps up; sentence games one-tap; gear on top + opens gate |
| `types.mjs` | Targeted spelling: per-word session results (requeued word = own line, ✗ tagged with category), clickable Recent-sessions drill-down, `by_type` needs-work analysis + Word-types card with one-tap assign, category & whole-grade missions (only that group's words, misses picked first), category-first bank (tri-state toggle, grey remembered checkmarks, per-category copy), session-words sanitization |
| `assign.mjs` | Assignments + push: assign via the dashboard (list picker, every-child), mission card on kid home, list-words-only test session, completion score + done row, VAPID tickles to a local push sink + `/api/push/pull` messages, cancel |
| `engagement.mjs` | Anti-frustration Phase 1 (docs/ENGAGEMENT_PLAN.md): Today's Quest one-tap 5-word session + done-state flip + once/day reward, warm-start ordering (proven word leads), home greeting chips (streak / yesterday render logic), the "Show me again" peek (aided, no ladder climb, never a miss), closeness feedback (one-off / swap / mostly-right messages) |
| `facts.mjs` | Fact of the day: `state.daily_fact` (deterministic, same all day), no collection mechanics (`facts_earned`/`new_fact`/`new_planet` gone), the home card renders + 🔊 reads it aloud + tucks away while drilling into a game |
| `games.mjs` | Which One? + Build It (Phase 4): pick session shape (3 choices incl. target, 2 misspellings), pick never moves the ladder (climb or drop) but records stats, Build It climbs 1→2 then caps + a miss drops a rung, both game cards in the Words grid, pick choice interaction, Build It tile-tap (word hides on first tile, correct build celebrated) |
| `mapit.mjs` | Map It (Phase 5): the client `graphemeSplit` matches the table (b\|oa\|t, n\|igh\|t, r\|a\|bb\|i\|t…), chunks rejoin over sampled bank words, and a miss's reveal renders chunked boxes (chunk gaps + heart letters red) |
| `feedback.mjs` | Parent feedback → server-notes loop: PIN gate (403) + empty reject (400), text + screenshot submission (`data/feedback/`), the note on `/.hub/status` (count + snippet), the dashboard card (textarea + speech-to-text hint), in-browser screenshot downscale to JPEG, send + confirm + form clear |

## Running

```bash
rm -rf data && PORT=9911 python3 server.py &   # ALWAYS a fresh data dir
node tests/verify-fixes.mjs                     # then each suite
```

- Suites assume `http://127.0.0.1:9911` and **fresh data** — they mutate
  progress (PIN changes, custom words) and pollute each other on reruns
  (e.g. session counts double, words get mastered and correctly stop
  appearing). Restart with `rm -rf data` between full runs.
- Environment paths (adjust to where you run them): Playwright is imported
  from `/opt/node22/lib/node_modules/playwright/index.js` and Chromium from
  `/opt/pw-browsers/chromium-1194/chrome-linux/chrome`. In the Claude remote
  env both exist; elsewhere `npm i playwright` and drop `executablePath`.
- Chromium can't emulate the iOS keyboard or speech audio. Keyboard
  handling is tested by shrinking the viewport to keyboard-open sizes
  (390×450, 844×210); speech by stubbing `speechSynthesis.speak` and
  asserting the utterance text. Real-device checks that still matter:
  keyboard stays open between words; speech actually sounds.

## Writing new checks

Follow the existing pattern: `check(name, ok, extra)` lines, exit code 1 on
any FAIL, screenshots into the scratch dir for visual review. Prefer adding
to an existing suite over creating a new one.
