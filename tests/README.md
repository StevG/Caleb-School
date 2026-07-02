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
