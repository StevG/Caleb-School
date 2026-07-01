#!/usr/bin/env python3
"""Spelling word bank for the practice app.

Curated from public-domain / freely-reproducible elementary sources:
  - Dolch 2nd & 3rd grade sight words + common Dolch nouns (public domain).
  - Fry instant-words zone for grades 2-3.
  - Phonics/spelling-pattern groups (silent-e, vowel teams, r-controlled,
    digraphs, blends, double consonants, suffixes/prefixes, soft c/g).
  - "Tricky" high-frequency words kids commonly misspell.
  - Age-appropriate dictation sentences.

Each word is tagged with a `group` (the pattern it teaches) and a `level`
(2 = eases in first, 3 = a step up). `build_pool()` flattens everything into a
de-duplicated list of dicts the server can draw sessions from.

Editing: just add/remove strings in the lists below. Keep words lowercase.
Parents can also add their own words at runtime through the parent screen;
those are stored separately in the progress file, not here.
"""

# --- Sight words -----------------------------------------------------------

DOLCH_2 = [
    "always", "around", "because", "been", "before", "best", "both", "buy",
    "call", "cold", "does", "don't", "fast", "first", "five", "found", "gave",
    "goes", "green", "its", "made", "many", "off", "or", "pull", "read",
    "right", "sing", "sit", "sleep", "tell", "their", "these", "those", "upon",
    "us", "use", "very", "wash", "which", "why", "wish", "work", "would",
    "write", "your",
]

DOLCH_3 = [
    "about", "better", "bring", "carry", "clean", "cut", "done", "draw",
    "drink", "eight", "fall", "far", "full", "got", "grow", "hold", "hot",
    "hurt", "if", "keep", "kind", "laugh", "light", "long", "much", "myself",
    "never", "only", "own", "pick", "seven", "shall", "show", "six", "small",
    "start", "ten", "today", "together", "try", "warm",
]

NOUNS = [
    "apple", "baby", "ball", "bear", "bird", "boat", "box", "bread", "cake",
    "chair", "chicken", "children", "corn", "cow", "duck", "egg", "farm",
    "father", "fish", "flower", "game", "garden", "girl", "grass", "ground",
    "hand", "head", "home", "horse", "house", "letter", "money", "morning",
    "mother", "name", "night", "paper", "picture", "rabbit", "rain", "school",
    "sheep", "sister", "snow", "song", "street", "table", "time", "tree",
    "water", "window",
]

# --- Phonics / spelling patterns -------------------------------------------
# group name -> (level, [words])

PATTERN_GROUPS = {
    # Silent-e / magic-e
    "Silent-e (a_e)": (2, ["cake", "make", "lake", "gate", "game", "name",
                            "plate", "snake", "plane", "grape", "shape",
                            "brave", "whale", "race"]),
    "Silent-e (i_e)": (2, ["bike", "kite", "time", "five", "nine", "ride",
                            "side", "nice", "rice", "mile", "slide", "smile",
                            "white", "prize"]),
    "Silent-e (o_e)": (2, ["bone", "home", "hope", "nose", "rose", "note",
                            "joke", "hole", "rope", "stone", "close", "those",
                            "globe"]),
    "Silent-e (u_e)": (3, ["cube", "tube", "cute", "mule", "june", "rule",
                            "tune", "huge", "flute", "use"]),
    # Long vowel teams
    "Long a (ai)": (2, ["rain", "train", "paint", "wait", "tail", "nail",
                        "mail", "sail", "snail", "plain", "chain", "brain",
                        "afraid", "trail"]),
    "Long a (ay)": (2, ["day", "play", "say", "way", "may", "stay", "gray",
                        "tray", "clay", "spray", "away", "today", "birthday",
                        "holiday"]),
    "Long e (ee)": (2, ["bee", "see", "tree", "feet", "week", "green",
                        "sheep", "sleep", "sweet", "need", "deep", "queen",
                        "three", "street", "teeth", "keep"]),
    "Long e (ea)": (2, ["eat", "sea", "tea", "read", "beach", "leaf", "seat",
                        "mean", "clean", "team", "meat", "teach", "treat",
                        "reach", "peach", "dream"]),
    "Long o (oa)": (2, ["boat", "coat", "road", "soap", "goat", "toast",
                        "goal", "load", "coast", "throat", "float", "soak",
                        "toad"]),
    "Long o (ow)": (2, ["snow", "grow", "low", "row", "blow", "flow", "glow",
                        "slow", "throw", "know", "show", "yellow", "window",
                        "pillow", "follow", "elbow"]),
    "Long i (igh)": (3, ["high", "night", "light", "right", "might", "tight",
                         "bright", "fight", "sight", "flight", "fright",
                         "knight", "tonight", "midnight"]),
    "Long i (ie/y)": (3, ["pie", "tie", "cried", "tried", "fried", "dried",
                          "flies", "cries", "tries", "sky", "fly", "cry",
                          "try", "why"]),
    # R-controlled
    "Bossy r (ar)": (2, ["car", "jar", "star", "arm", "park", "part", "hard",
                         "dark", "farm", "yard", "start", "shark", "sharp",
                         "chart", "march"]),
    "Bossy r (or)": (2, ["corn", "fork", "storm", "short", "horse", "sport",
                         "porch", "north", "born", "fort", "form", "horn",
                         "thorn", "morning"]),
    "Bossy r (er)": (3, ["her", "herd", "fern", "term", "germ", "clerk",
                         "serve", "sister", "winter", "letter", "water",
                         "paper", "over", "under", "spider"]),
    "Bossy r (ir)": (3, ["bird", "girl", "dirt", "first", "third", "stir",
                         "shirt", "skirt", "birth", "chirp", "swirl", "circle",
                         "thirty", "firm"]),
    "Bossy r (ur)": (3, ["fur", "turn", "burn", "hurt", "curl", "church",
                         "burst", "nurse", "purse", "surf", "turtle", "purple",
                         "turkey", "return"]),
    # Digraphs
    "sh words": (2, ["she", "ship", "shop", "shut", "shed", "shell", "shelf",
                     "dish", "fish", "wish", "wash", "push", "trash", "brush",
                     "crush", "fresh", "splash"]),
    "ch words": (2, ["chat", "chop", "chip", "chin", "much", "such", "rich",
                     "each", "inch", "lunch", "bunch", "chest", "check",
                     "chick", "chair", "chase", "cheese", "child", "peach"]),
    "th words": (2, ["this", "that", "them", "then", "they", "thin", "thing",
                     "think", "thank", "thick", "three", "bath", "math",
                     "path", "with", "cloth", "teeth", "tooth"]),
    "wh words": (2, ["what", "when", "where", "which", "while", "white", "why",
                     "who", "whip", "wheat", "wheel", "whale", "whistle"]),
    # Diphthongs
    "oi / oy": (3, ["oil", "boil", "coin", "join", "soil", "point", "spoil",
                    "moist", "noise", "boy", "toy", "joy", "enjoy", "royal",
                    "loyal"]),
    "ou / ow (ow sound)": (3, ["out", "loud", "found", "sound", "ground",
                               "mouth", "house", "around", "cloud", "count",
                               "proud", "shout", "about", "mouse", "round",
                               "cow", "how", "now", "owl", "down", "town",
                               "brown", "clown", "crown", "flower", "power"]),
    "au / aw": (3, ["sauce", "cause", "pause", "fault", "haul", "author",
                    "autumn", "august", "because", "saw", "law", "jaw", "paw",
                    "draw", "claw", "straw", "yawn", "dawn", "lawn", "crawl",
                    "hawk", "awful"]),
    # Double consonants
    "Double l/s/f (ll ss ff)": (2, ["ball", "call", "tall", "wall", "fall",
                                    "bell", "tell", "sell", "well", "hill",
                                    "will", "doll", "roll", "full", "pull",
                                    "spell", "small", "shell", "miss", "kiss",
                                    "less", "mess", "pass", "glass", "grass",
                                    "dress", "press", "cross", "class",
                                    "guess", "off", "puff", "cliff", "stuff"]),
    # ck / k
    "ck words": (2, ["back", "pack", "black", "crack", "snack", "deck", "neck",
                     "kick", "pick", "sick", "stick", "trick", "block",
                     "clock", "knock", "lock", "rock", "sock", "duck",
                     "truck"]),
    # Blends
    "Beginning blends": (2, ["black", "clap", "flag", "glad", "plus", "slam",
                             "brush", "crab", "dress", "frog", "grass", "press",
                             "truck", "scan", "skip", "smell", "snap", "spin",
                             "stop", "swim", "twin", "stand", "spot", "plan"]),
    # Soft c / g
    "Soft c": (3, ["cent", "cell", "city", "ice", "mice", "nice", "rice",
                   "race", "face", "place", "space", "slice", "price", "dance",
                   "fence", "circle", "pencil"]),
    "Soft g": (3, ["gem", "germ", "gym", "giant", "gentle", "cage", "page",
                   "stage", "huge", "large", "magic", "engine", "danger",
                   "orange", "change", "bridge", "village"]),
    # Suffixes / inflections
    "Adding -ing": (2, ["jumping", "playing", "reading", "singing", "running",
                        "swimming", "eating", "sleeping", "walking", "helping",
                        "looking", "going"]),
    "Adding -ed": (2, ["jumped", "played", "walked", "wanted", "helped",
                       "hopped", "cleaned", "looked", "called", "rained",
                       "asked", "landed"]),
    "Adding -er / -est": (3, ["taller", "faster", "bigger", "teacher",
                              "farmer", "tallest", "fastest", "biggest",
                              "longest", "happiest", "loudest", "smaller"]),
    "Adding -ly": (3, ["slowly", "quickly", "gladly", "sadly", "safely",
                       "kindly", "loudly", "softly", "happily", "easily"]),
    "Adding -ful / -less": (3, ["helpful", "careful", "hopeful", "useful",
                                "thankful", "joyful", "helpless", "careless",
                                "useless", "fearless", "endless", "harmless"]),
    # Prefixes
    "Prefix un-": (3, ["unhappy", "unlock", "undo", "untie", "unfair",
                       "unkind", "unsafe", "unable", "unwrap", "unpack"]),
    "Prefix re-": (3, ["redo", "retell", "reread", "refill", "replay",
                       "return", "rewrite", "rebuild", "reuse", "reheat"]),
}

# --- Tricky high-frequency words (kids misspell these a lot) ----------------

TRICKY = [
    "because", "friend", "said", "they", "where", "there", "their", "they're",
    "would", "could", "should", "people", "again", "does", "was", "come",
    "some", "one", "two", "who", "what", "want", "went", "very", "been",
    "before", "from", "other", "another", "little", "only", "once", "every",
    "know", "don't", "favorite", "beautiful", "different", "important",
    "together", "enough", "tomorrow", "morning", "cousin", "believe", "quiet",
    "money", "clothes", "thought", "through", "always",
]

# --- Sentences for dictation practice --------------------------------------
# Level 1 = short CVC / early; Level 2 = a step up; Level 3 = everyday sentences.

SENTENCES = [
    (1, "The cat sat on the mat."),
    (1, "A bug is on the rug."),
    (1, "Dad and I ran to the van."),
    (1, "The pig can dig."),
    (1, "The sun is up."),
    (1, "Sam sat on his lap."),
    (1, "Ned went to bed."),
    (1, "The fish is in a dish."),
    (1, "Can the big dog run?"),
    (1, "The frog sat on a log."),
    (2, "I can see the red bird."),
    (2, "We had lunch with Mom."),
    (2, "The kids play in the sand."),
    (2, "Can you help me clap?"),
    (2, "She will wish for a gift."),
    (2, "That duck can swim fast."),
    (2, "Jump up on the ship!"),
    (2, "The green frog can hop."),
    (2, "My best friend is here."),
    (2, "Please can I have a drink?"),
    (3, "We will go to the park today."),
    (3, "The train is very fast."),
    (3, "Can I please have some water?"),
    (3, "My mother made a good cake."),
    (3, "The little bird can fly high."),
    (3, "I found my book under the bed."),
    (3, "We saw a big brown horse."),
    (3, "Please clean up your room."),
    (3, "The moon comes out at night."),
    (3, "I like to read before I sleep."),
    (3, "Do you want to play a game?"),
    (3, "The happy dog ran around the yard."),
]


def build_pool():
    """Return (words, sentences).

    words: list of {"w": str, "group": str, "level": int}, de-duplicated by
    word (first tag wins). sentences: list of {"s": str, "level": int}.
    """
    seen = {}
    order = []

    def add(word, group, level):
        w = word.strip().lower()
        if not w or w in seen:
            return
        seen[w] = True
        order.append({"w": w, "group": group, "level": level})

    # Pattern groups first so a word keeps its most descriptive tag.
    for group, (level, words) in PATTERN_GROUPS.items():
        for w in words:
            add(w, group, level)
    for w in DOLCH_2:
        add(w, "Sight words (2nd grade)", 2)
    for w in DOLCH_3:
        add(w, "Sight words (3rd grade)", 3)
    for w in NOUNS:
        add(w, "Everyday nouns", 2)
    for w in TRICKY:
        add(w, "Tricky words", 3)

    sentences = [{"s": s, "level": lvl} for (lvl, s) in SENTENCES]
    return order, sentences


if __name__ == "__main__":
    words, sentences = build_pool()
    groups = {}
    for item in words:
        groups.setdefault(item["group"], 0)
        groups[item["group"]] += 1
    print(f"{len(words)} unique words across {len(groups)} groups; "
          f"{len(sentences)} sentences")
    for g, n in groups.items():
        print(f"  {n:>3}  {g}")
