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
                     "who", "how", "whip", "wheat", "wheel", "whale",
                     "whistle"]),
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

# --- Theme groups (standard 2nd/3rd-grade units the pattern list misses) ----

THEME_GROUPS = {
    "Compound words": (2, ["into", "upon", "inside", "outside", "without",
                           "maybe", "cannot", "someone", "something",
                           "sometimes", "everyone", "anything", "birthday",
                           "baseball", "bedroom", "snowman"]),
    "Compound words (harder)": (3, ["playground", "homework", "backpack",
                                    "butterfly", "sidewalk", "afternoon",
                                    "everything", "grandmother"]),
    "Number words": (2, ["one", "two", "three", "four", "five", "six",
                         "seven", "eight", "nine", "ten"]),
    "Number words (harder)": (3, ["eleven", "twelve", "thirteen", "fourteen",
                                  "fifteen", "sixteen", "seventeen",
                                  "eighteen", "nineteen", "twenty", "thirty",
                                  "forty", "fifty", "hundred"]),
    "Days of the week": (2, ["sunday", "monday", "tuesday", "wednesday",
                             "thursday", "friday", "saturday"]),
    "Color words": (2, ["red", "blue", "green", "orange", "yellow", "purple",
                        "brown", "white", "pink", "gray", "black"]),
    "Family words": (2, ["mother", "father", "sister", "brother", "grandma",
                         "grandpa", "aunt", "uncle", "cousin", "family"]),
    "Contractions": (2, ["don't", "can't", "it's", "i'm", "isn't", "didn't",
                         "won't", "let's", "i'll", "that's", "wasn't",
                         "doesn't"]),
    "Contractions (harder)": (3, ["we're", "they're", "you're", "couldn't",
                                  "wouldn't", "aren't"]),
}

# --- Graded word ladder: grades 1-9 in half-grade steps ---------------------
# X.0 ≈ first half of that school year, X.5 ≈ second half. Anchored on Fry
# frequency bands, Dolch, and published grade-level spelling lists; sourcing
# notes live in docs/RESEARCH.md. The parent "Level" setting caps the pool.

GRADE_LISTS = {
    1.0: ["am", "an", "and", "at", "bed", "big", "bug", "bus", "but", "can",
          "cap", "cat", "dad", "did", "dog", "fun", "get", "go", "had", "hat",
          "he", "him", "his", "in", "is", "it", "leg", "let", "man", "map",
          "me", "mom", "no", "not", "on", "pan", "pen", "pet", "pig", "ran",
          "run", "sad", "sat", "top", "sun", "the", "to", "up", "we", "you"],
    1.5: ["all", "are", "ate", "bake", "by", "came", "camp", "clip", "club",
          "do", "drum", "fed", "feed", "fine", "flat", "flip", "for", "fox",
          "gum", "has", "have", "help", "here", "hid", "hide", "hug", "jump",
          "just", "king", "like", "line", "look", "lot", "love", "mad",
          "milk", "moon", "must", "new", "next", "old", "our", "pond", "put",
          "ring", "rug", "sang", "shine", "sled", "step"],
    2.0: ["after", "air", "also", "any", "ask", "band", "belt", "bend",
          "bent", "brick", "bump", "cash", "cost", "damp", "desk", "dust",
          "end", "fact", "felt", "gift", "grab", "grand", "grin", "held",
          "hunt", "kept", "lamp", "land", "last", "left", "lift", "list",
          "lost", "mask", "melt", "nest", "past", "pump", "quit", "raft",
          "rest", "send", "soft", "spent", "stamp", "swing", "tent", "test",
          "trap", "trip"],
    2.5: ["bark", "barn", "bathtub", "beak", "bean", "beat", "bedtime",
          "braid", "peek", "cheap", "cheek", "couch", "crowd", "cupcake",
          "fair", "faint", "frown", "groan", "growl", "hair", "howl", "lean",
          "leap", "more", "neat", "paid", "pancake", "peel", "popcorn",
          "pouch", "pound", "rainbow", "raise", "scout", "seed", "seek",
          "smart", "sneak", "south", "spark", "speak", "steam", "store",
          "stream", "sweep", "voice", "weak", "weekend", "yarn"],
    3.0: ["across", "almost", "along", "badge", "begin", "below", "between",
          "bottom", "bounce", "breakfast", "carried", "catch", "chance",
          "climb", "early", "earth", "easy", "front", "heard", "heavy",
          "hour", "hurried", "juice", "knee", "knew", "lamb", "match",
          "meet", "month", "often", "pair", "patch", "peace", "piece",
          "ready", "scratch", "second", "since", "stretch", "switch",
          "thumb", "touch", "twice", "until", "wear", "whole", "wood",
          "world", "wrong", "young"],
    3.5: ["able", "against", "animal", "answer", "bottle", "bought",
          "brought", "building", "busy", "candle", "caught", "choose",
          "cough", "couple", "daughter", "double", "eagle", "field",
          "fought", "fourth", "half", "handle", "idea", "jungle", "listen",
          "middle", "minute", "needle", "nothing", "ocean", "pickle",
          "pretty", "promise", "puddle", "puzzle", "question", "rough",
          "simple", "single", "sugar", "sure", "taught", "though", "threw",
          "tough", "trouble", "woman", "women", "wonderful", "wrote"],
    4.0: ["although", "area", "become", "certain", "chief", "complete",
          "contain", "correct", "decide", "during", "empty", "except",
          "famous", "finger", "finish", "happened", "heart", "hospital",
          "however", "instead", "island", "itself", "judge", "kitchen",
          "lonely", "machine", "million", "movement", "ninety", "o'clock",
          "office", "opinion", "pattern", "perhaps", "quarter", "reason",
          "remember", "sentence", "several", "suddenly", "suppose",
          "surprise", "thousand", "toward", "understand", "vacation",
          "weather", "worried", "yesterday", "zero"],
    4.5: ["breath", "breathe", "camera", "carrying", "dessert", "disappear",
          "easier", "eighty", "energy", "enormous", "exercise", "groceries",
          "guard", "happiness", "hungry", "imagine", "interest", "laughter",
          "natural", "neighbor", "neither", "nervous", "notice", "pleasant",
          "practice", "prepare", "president", "probably", "problem",
          "purpose", "regular", "search", "special", "squirrel", "straight",
          "strength", "stubborn", "sudden", "terrible", "tongue", "usual",
          "weight", "whether", "wonder"],
    5.0: ["actually", "approach", "attention", "average", "balance",
          "beneath", "business", "century", "chocolate", "choice",
          "condition", "courage", "curious", "daily", "dangerous",
          "delicious", "describe", "develop", "diamond", "dictionary",
          "disease", "distance", "doubt", "either", "enemy", "escape",
          "excellent", "excitement", "expensive", "freight", "future",
          "gasoline", "grateful", "height", "honest", "ignore",
          "instrument", "invitation", "journey", "language", "library",
          "lightning", "liquid", "magazine", "medicine", "memory",
          "message", "police", "umbrella", "whisper"],
    5.5: ["argument", "character", "comfortable", "community", "decision",
          "especially", "experience", "finally", "government", "knowledge",
          "muscle", "museum", "mysterious", "opposite", "ordinary",
          "oxygen", "peculiar", "period", "pleasure", "poison", "popular",
          "position", "possible", "pressure", "realize", "receive",
          "recognize", "region", "scene", "scissors", "serious", "similar",
          "sincerely", "soldier", "solution", "stomach", "struggle",
          "success", "suggest", "surround", "survive", "system",
          "temperature", "thief", "treasure", "truly", "usually",
          "valuable", "vegetable", "weird"],
    6.0: ["accept", "accident", "ancient", "appearance", "athlete",
          "audience", "awkward", "bargain", "beginning", "behavior",
          "bicycle", "brilliant", "calendar", "caution", "ceiling",
          "celebration", "challenge", "chimney", "citizen", "column",
          "companion", "concentrate", "confident", "curiosity", "debt",
          "desperate", "disappoint", "disguise", "eighth", "emergency",
          "encourage", "entertain", "envelope", "environment", "examine",
          "familiar", "fierce", "foreign", "furniture", "generous",
          "genius", "immediately", "incredible", "innocent", "intelligent",
          "jealous", "necessary", "separate", "theater", "variety"],
    6.5: ["anxious", "appreciate", "arrangement", "atmosphere", "career",
          "category", "ceremony", "deceive", "definite", "embarrass",
          "employee", "exhaust", "exhibit", "fascinate", "genuine",
          "gorgeous", "grammar", "hoarse", "horizon", "independence",
          "influence", "jewelry", "marriage", "miracle", "mosquito",
          "neighborhood", "niece", "obstacle", "obvious", "occasion",
          "opportunity", "patience", "persuade", "previous", "principal",
          "professor", "recipe", "relieve", "responsible", "restaurant",
          "salary", "scenery", "society", "succeed", "twelfth", "unique",
          "vehicle", "vocabulary", "wilderness", "wrestle"],
    7.0: ["achievement", "apologize", "athletic", "biscuit", "boundary",
          "bruise", "budget", "cafeteria", "campaign", "capable",
          "chemistry", "cinnamon", "civilization", "committee",
          "competition", "compromise", "courageous", "courtesy",
          "definitely", "discipline", "essential", "exaggerate",
          "explanation", "fatigue", "geography", "gymnasium", "hesitate",
          "humorous", "immense", "independent", "individual", "inherit",
          "interfere", "kindergarten", "literature", "maintain",
          "marvelous", "mathematics", "mischief", "miserable", "misspell",
          "occur", "parachute", "permanent", "receipt", "recommend",
          "rhythm", "sympathy", "technology", "tragedy"],
    7.5: ["accidentally", "amateur", "analyze", "appropriate", "bizarre",
          "boycott", "brochure", "candidate", "chaos", "commitment",
          "congratulate", "conscious", "consequence", "convenience",
          "criticize", "democracy", "eliminate", "emphasize", "enthusiasm",
          "extraordinary", "financial", "graffiti", "guarantee",
          "guidance", "handkerchief", "ingredient", "intelligence",
          "interpret", "judgment", "juvenile", "leisure", "license",
          "miniature", "opponent", "orchestra", "panicked", "politician",
          "precise", "privilege", "procedure", "pursue", "rehearsal",
          "religious", "responsibility", "ridiculous", "sacrifice",
          "satellite", "schedule", "solemn", "tournament"],
    8.0: ["accommodate", "acknowledge", "acquire", "aggressive",
          "analysis", "anonymous", "anxiety", "apparently",
          "approximately", "architect", "bouquet", "catastrophe",
          "competent", "condemn", "conscience", "controversy",
          "criticism", "descend", "dilemma", "disastrous", "efficient",
          "existence", "fiery", "fulfill", "gauge", "grievance", "hygiene",
          "insufficient", "irresistible", "maintenance", "mischievous",
          "noticeable", "nuisance", "occasionally", "occurred", "optimism",
          "outrageous", "parallel", "perceive", "persistent", "philosophy",
          "physician", "preferred", "proceed", "prominent", "seize",
          "subtle", "thorough", "unnecessary", "vacuum"],
    8.5: ["acquaintance", "adolescent", "beneficial", "bibliography",
          "caffeine", "camouflage", "changeable", "chauffeur", "colleague",
          "conceive", "correspondence", "counterfeit", "curriculum",
          "descendant", "discrepancy", "efficiency", "eligible",
          "etiquette", "exquisite", "forfeit", "grotesque", "haphazard",
          "harass", "hypothesis", "inevitable", "initiative", "irrelevant",
          "lieutenant", "maneuver", "mediocre", "millennium",
          "miscellaneous", "mortgage", "naive", "negotiate", "occurrence",
          "parliament", "perseverance", "personnel", "pneumonia",
          "precede", "pronunciation", "psychology", "questionnaire",
          "queue", "sergeant", "siege", "silhouette", "transferred",
          "unanimous"],
    9.0: ["acquiesce", "ambiguity", "animosity", "apparatus", "authentic",
          "auxiliary", "benevolent", "bureaucracy", "connoisseur",
          "conscientious", "consensus", "deteriorate", "diaphragm",
          "entrepreneur", "equilibrium", "exhilarate", "facsimile",
          "fictitious", "fluorescent", "hierarchy", "hypocrisy",
          "idiosyncrasy", "incessant", "indict", "indispensable",
          "kaleidoscope", "liaison", "metamorphosis", "nauseous",
          "onomatopoeia", "pandemonium", "permissible", "plagiarism",
          "predecessor", "presumptuous", "pretentious", "publicly",
          "rendezvous", "ricochet", "sabotage", "soliloquy", "strenuous",
          "supersede", "surveillance", "susceptible", "turbulence",
          "versatile", "vying"],
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
# Level 1 = short CVC / early; Level 2 = a step up; Level 3 = everyday
# sentences with varied punctuation. Construction rules in docs/RESEARCH.md:
# 4-10 words, natural kid topics, capital first letter, end punctuation,
# only letters + apostrophes inside words.

SENTENCES = [
    # --- Level 1: 4-6 words, short vowels + basic sight words ---
    (1, "The cat sat on the mat."),
    (1, "The cat naps on the bed."),
    (1, "A bug is on the rug."),
    (1, "A big dog ran up."),
    (1, "Dad and I ran to the van."),
    (1, "Dad had a red cup."),
    (1, "Mom can hop and run."),
    (1, "The pig can dig."),
    (1, "The pig sat in mud."),
    (1, "The sun is up."),
    (1, "The sun is hot."),
    (1, "Sam sat on his lap."),
    (1, "Sam got a big box."),
    (1, "Ned went to bed."),
    (1, "The fish is in a dish."),
    (1, "Can the big dog run?"),
    (1, "The frog sat on a log."),
    (1, "I can see the sun."),
    (1, "He has a tan hat."),
    (1, "We sat on the rug."),
    (1, "The hen is in a pen."),
    (1, "My pet can sit up."),
    (1, "It is fun to run."),
    (1, "The bug is on top."),
    (1, "Ben hid the map."),
    (1, "She can pat the cat."),
    (1, "A fox sat in the den."),
    (1, "Tim has ten pens."),
    (1, "The kid can hop up."),
    (1, "Mud got on my leg."),
    (1, "His cap is red."),
    (1, "We dig a big pit."),
    (1, "Pam fed the dog."),
    (1, "The bus is not big."),
    (1, "Ken can get the net."),
    # --- Level 2: 5-8 words, digraphs/blends/long vowels ---
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
    (2, "Beth made a wish on a star."),
    (2, "The black cat sleeps in the shade."),
    (2, "Can you check the clock for me?"),
    (2, "We rode the bus to the lake."),
    (2, "My best friend likes to paint."),
    (2, "The white duck swam in the pond."),
    (2, "When will the rain stop?"),
    (2, "I like to read funny books."),
    (2, "The train went fast down the track."),
    (2, "Mom baked a sweet peach pie."),
    (2, "That snake has black and brown spots."),
    (2, "We planted seeds in the spring."),
    (2, "His teeth are so white and clean."),
    (2, "Jane will bring her lunch to school."),
    (2, "The moon shines bright at night."),
    (2, "Which shell do you like best?"),
    (2, "Grandpa told us a long story."),
    (2, "The sheep sleep in the barn."),
    (2, "I need a drink of cold milk."),
    (2, "Chip the dog can catch the ball."),
    (2, "Three ships sailed on the sea."),
    (2, "We made a snowman with a black hat."),
    (2, "Keep your feet off the seat!"),
    # --- Level 3: 6-10 words, everyday 3rd grade, varied punctuation ---
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
    (3, "My little brother won't eat his green beans."),
    (3, "Did you finish your homework before dinner?"),
    (3, "The dinosaur bones were bigger than our car!"),
    (3, "We're going to the beach on Saturday."),
    (3, "What should we name our new puppy?"),
    (3, "It's too cold to play outside today."),
    (3, "Our teacher read us a story about space."),
    (3, "I can't wait for my birthday party!"),
    (3, "The astronaut flew all the way to the moon."),
    (3, "Please don't forget to feed the goldfish."),
    (3, "May I have another slice of pizza?"),
    (3, "Everyone cheered when our team won the game!"),
    (3, "Grandma is coming to visit us next week."),
    (3, "Do you think dinosaurs could really roar?"),
    (3, "We built a huge fort out of blankets."),
    (3, "The library is my favorite place at school."),
    (3, "After lunch we played soccer with our friends."),
    (3, "Watch out for that giant mud puddle!"),
    (3, "Why does the moon change shape every night?"),
    (3, "I'm learning to ride my bike without help."),
    (3, "Let's make pancakes for breakfast this morning!"),
    (3, "That thunder was so loud it shook the house!"),
    (3, "Sometimes my sister lets me borrow her markers."),
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
    for group, (level, words) in THEME_GROUPS.items():
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
    for level, words in sorted(GRADE_LISTS.items()):
        grade = int(level)
        half = " · later" if level != grade else " · early"
        for w in words:
            add(w, f"Grade {grade}{half}", level)

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
