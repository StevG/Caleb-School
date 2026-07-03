"""Badge catalog — pure data, edited like wordbank.py.

Each badge is one hexagon in the app with FOUR levels. A level is reached
when the child's `metric` crosses the tier threshold; the client draws a
plate on the hexagon per level (bronze/silver/gold/rainbow). Thresholds are
first-guesses — tune here, nothing else changes.

`metric` names must match keys produced by server.badge_metrics().
`lower_better` (Speed of Light) means a SMALLER value is better, and the
tiers descend in seconds-per-word.
"""

# accent tints come from the app palette (see styles.css :root)
BLUE, GREEN, AMBER, CORAL, PURPLE = (
    "#4f9dde", "#5bbf6a", "#f4b942", "#e8705a", "#8e6fc4")

BADGES = [
    # ⚡ Speed
    {"id": "speed", "name": "Speed of Light", "emoji": "⚡",
     "accent": BLUE, "category": "Speed", "metric": "speed",
     "lower_better": True, "tiers": [15, 12, 9, 6], "unit": "s/word",
     "blurb": "Spell fast in a 10-word game (still getting them right!)",
     "unlock": "finish a 10+ word game quickly"},

    # 🎯 Accuracy
    {"id": "bullseye", "name": "Bullseye", "emoji": "🎯",
     "accent": CORAL, "category": "Accuracy", "metric": "perfect_sessions",
     "tiers": [1, 5, 15, 40], "unit": "perfect games",
     "blurb": "Finish a game with every word right on the first try",
     "unlock": "get a whole game perfect"},
    {"id": "streak", "name": "Hot Streak", "emoji": "🔥",
     "accent": CORAL, "category": "Accuracy", "metric": "best_streak",
     "tiers": [10, 25, 50, 100], "unit": "in a row",
     "blurb": "Spell words correctly in a row without a miss",
     "unlock": "get 10 right in a row"},

    # 💪 Hard work
    {"id": "wizard", "name": "Word Wizard", "emoji": "🧙",
     "accent": PURPLE, "category": "Hard work", "metric": "lifetime_correct",
     "tiers": [100, 500, 2000, 5000], "unit": "words right",
     "blurb": "Spell lots and lots of words correctly",
     "unlock": "spell 100 words right"},
    {"id": "stars", "name": "Star Collector", "emoji": "⭐",
     "accent": AMBER, "category": "Hard work", "metric": "lifetime_points",
     "tiers": [100, 500, 2000, 5000], "unit": "stars",
     "blurb": "Earn stars — they never get taken away from this badge",
     "unlock": "earn 100 stars"},
    {"id": "marathon", "name": "Marathoner", "emoji": "🏃",
     "accent": GREEN, "category": "Hard work", "metric": "sessions_total",
     "tiers": [10, 50, 150, 365], "unit": "games",
     "blurb": "Finish lots of practice games",
     "unlock": "finish 10 games"},

    # 📅 Consistency
    {"id": "dino", "name": "Daily Dino", "emoji": "🦕",
     "accent": GREEN, "category": "Every day", "metric": "best_day_streak",
     "tiers": [3, 7, 14, 30], "unit": "days in a row",
     "blurb": "Practice on days in a row (a miss just restarts the count)",
     "unlock": "practice 3 days in a row"},

    # 🏆 Mastery
    {"id": "master", "name": "Word Master", "emoji": "🏆",
     "accent": AMBER, "category": "Mastery", "metric": "words_mastered",
     "tiers": [5, 25, 75, 200], "unit": "mastered",
     "blurb": "Master words all the way to the top of the ladder",
     "unlock": "master 5 words"},
    {"id": "heart", "name": "Heart Healer", "emoji": "♥",
     "accent": CORAL, "category": "Mastery", "metric": "hearts_mastered",
     "tiers": [3, 10, 25, 60], "unit": "heart words",
     "blurb": "Master tricky heart words — the ones you learn by heart",
     "unlock": "master 3 heart words"},
    {"id": "climber", "name": "Ladder Climber", "emoji": "\U0001fa9c",
     "accent": BLUE, "category": "Mastery", "metric": "stage_ups",
     "tiers": [10, 50, 150, 400], "unit": "level-ups",
     "blurb": "Level up words on the learning ladder",
     "unlock": "level up 10 times"},

    # 🗺️ Explorer
    {"id": "allrounder", "name": "All-Rounder", "emoji": "\U0001f5fa️",
     "accent": PURPLE, "category": "Explorer", "metric": "all_games",
     "tiers": [1, 5, 20, 50], "unit": "of each game",
     "blurb": "Play every one of the five games, again and again",
     "unlock": "play all 5 games once"},
    {"id": "sound", "name": "Sound Sleuth", "emoji": "\U0001f50a",
     "accent": BLUE, "category": "Explorer", "metric": "listen_correct",
     "tiers": [25, 100, 400, 1000], "unit": "heard & spelled",
     "blurb": "Spell words from sound alone in Listen & Spell",
     "unlock": "spell 25 words from sound"},
    {"id": "sentence", "name": "Sentence Builder", "emoji": "✏️",
     "accent": GREEN, "category": "Explorer", "metric": "sentence_words",
     "tiers": [10, 50, 150, 400], "unit": "sentence words",
     "blurb": "Spell words inside sentences (Fill In & Remember It)",
     "unlock": "spell 10 words in sentences"},

    # 📋 Missions
    {"id": "mission", "name": "Mission Hero", "emoji": "\U0001f4cb",
     "accent": AMBER, "category": "Missions", "metric": "missions_done",
     "tiers": [1, 5, 15, 40], "unit": "missions",
     "blurb": "Finish missions your grown-up assigns you",
     "unlock": "finish your first mission"},
]

BADGE_IDS = [b["id"] for b in BADGES]

# stars awarded when a badge reaches each level (small — a nudge, not the point)
STAR_PER_LEVEL = {1: 5, 2: 10, 3: 15, 4: 25}


def badge_tier(badge, value):
    """How many of a badge's four thresholds `value` has crossed (0-4).
    Thresholds are monotonic in difficulty, so we stop at the first miss."""
    lower = badge.get("lower_better")
    if value <= 0:
        return 0  # no data yet (a 0s pace is "never", not "instant")
    tier = 0
    for thr in badge["tiers"]:
        crossed = value <= thr if lower else value >= thr
        if not crossed:
            break
        tier += 1
    return tier


if __name__ == "__main__":
    print(f"{len(BADGES)} badges, {len(set(BADGE_IDS))} unique ids")
    cats = {}
    for b in BADGES:
        cats.setdefault(b["category"], []).append(b["name"])
    for c, names in cats.items():
        print(f"  {c}: {', '.join(names)}")
    # sanity: tiers strictly ordered by difficulty
    for b in BADGES:
        t = b["tiers"]
        ok = all(t[i] > t[i + 1] for i in range(3)) if b.get("lower_better") \
            else all(t[i] < t[i + 1] for i in range(3))
        assert ok, f"{b['id']} tiers not monotonic: {t}"
    print("all tier ladders monotonic ✓")
