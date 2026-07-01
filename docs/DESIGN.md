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
until mastered. Sentence mode is the same mechanic walked word-by-word with a
progress line of blanks filling in green.

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
- 2026-07-01 — Web app/PWA on HomeHub over native iOS (owner approved):
  no App Store friction, instant deploys, reuses Cloudflare Access login.
- 2026-07-01 — Server-side storage (command app, not static) so the parent
  dashboard syncs across the kid's iPad and both parents' phones.
- 2026-07-01 — Points: aided retypes still earn a star (motivation) but never
  mastery/accuracy credit (honest reporting). MASTERED_STREAK=2 unaided.
- 2026-07-01 — Light theme, no timers/pressure, misses phrased gently.
- 2026-07-01 — Icon changed from ABC tiles to dino-in-rocket (owner asked for
  playful over literal).
