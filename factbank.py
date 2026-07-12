"""Fact-card catalog — pure data, edited like wordbank.py / badgebank.py.

Caleb loves dinosaurs, space, and LEGO, so finishing a practice session can
reward a collectible FACT CARD from one of those three decks. Cards are the
variable reward that pulls him back; the collection screen shows what he's
got and what's still hidden.

Rules for the content (keep them if you edit):
  - Every fact is TRUE and checkable. No myths, no "great wall from space"
    junk. Where a fact is fuzzy, soften it ("about", "some scientists think").
  - One sentence, <= 140 characters, reading level ~2nd-3rd grade. He's ahead
    in other subjects, so real numbers and real names are good — facts should
    make him feel smart.
  - Funny or "whoa" wherever possible.

Each fact: {id, cat, emoji, text}. `cat` is one of CATEGORIES.
`python3 factbank.py` prints per-deck counts and validates the catalog.
"""

CATEGORIES = {
    "dino": ("Dinosaurs", "🦕"),
    "space": ("Space", "🪐"),
    "lego": ("LEGO", "🧱"),
}

DINO = [
    "T. rex lived closer in time to you than to Stegosaurus.",
    "Birds are dinosaurs — so a chicken is a cousin of T. rex!",
    "Stegosaurus was as big as a bus, but its brain was the size of a walnut.",
    "Some dinosaurs had feathers, like giant scary birds.",
    "The word \"dinosaur\" means \"terrible lizard.\"",
    "Argentinosaurus may have weighed as much as ten elephants.",
    "Velociraptor was only about the size of a big chicken.",
    "T. rex had teeth as long as bananas.",
    "The longest dinosaurs could reach leaves five floors up.",
    "Triceratops had three horns and a big bony frill on its head.",
    "Dinosaurs lived on Earth for more than 150 million years.",
    "Some dinosaurs swallowed stones to help grind up their food.",
    "Ankylosaurus had a bony club on its tail it could swing like a hammer.",
    "Spinosaurus could swim and catch fish, like a giant crocodile.",
    "Microraptor was a dinosaur with four wings.",
    "Oviraptor sat on its nest of eggs, just like a bird.",
    "Diplodocus could crack its long tail like a whip.",
    "Dino poop that turned into rock is called a coprolite.",
    "Pterodactyls were flying reptiles — not actually dinosaurs!",
    "Compsognathus was only about as big as a house cat.",
    "The T. rex's arms were so short it couldn't reach its own mouth.",
    "Iguanodon had a spiky thumb that scientists first thought was a nose horn.",
    "Some duck-billed dinosaurs had hundreds of tiny teeth.",
    "The biggest dinosaur eggs were about the size of a soccer ball.",
    "Dinosaurs hatched from eggs, like birds and turtles do.",
    "Parasaurolophus had a long head crest it may have used to honk.",
    "The first dinosaur fossils were named almost 200 years ago.",
    "Some dinosaur footprints are bigger than a kiddie pool.",
    "Stegosaurus had bony plates on its back that may have helped it cool off.",
    "Humans have been around for only a tiny sliver of dinosaur time.",
]

SPACE = [
    "A day on Venus is longer than a whole year on Venus.",
    "Saturn is so light that it would float in a giant bathtub of water.",
    "In space, astronauts grow about two inches taller.",
    "Space is silent — there's no air to carry sound.",
    "About one million Earths could fit inside the Sun.",
    "Footprints on the Moon can last millions of years — there's no wind.",
    "All the other planets could fit inside Jupiter.",
    "A year on Neptune lasts about 165 Earth years.",
    "The Moon drifts away from Earth about as fast as your fingernails grow.",
    "Mars has the tallest volcano — three times taller than Mount Everest.",
    "There are more stars than grains of sand on all of Earth's beaches.",
    "In space, an astronaut's heart slowly gets a little rounder.",
    "Neutron stars are so heavy that a spoonful would weigh billions of tons.",
    "Light from the Sun takes about 8 minutes to reach Earth.",
    "Venus is the hottest planet, even hotter than Mercury.",
    "Jupiter, Saturn, Uranus, and Neptune all have rings.",
    "The Moon has tiny \"moonquakes.\"",
    "Space is dark even in the daytime.",
    "Jupiter has dozens and dozens of moons.",
    "Mercury is the fastest planet, racing around the Sun.",
    "The Space Station zooms all the way around Earth about every 90 minutes.",
    "Astronauts on the Space Station see about 16 sunrises every day.",
    "You'd weigh about six times lighter on the Moon.",
    "A comet's tail always points away from the Sun.",
    "The first footprint on the Moon is still there today.",
    "Pluto is smaller than Earth's Moon.",
    "The Milky Way is our home galaxy, shaped like a giant spinning pinwheel.",
    "The Sun is a star — it just looks huge because it's close.",
    "Driving nonstop, it would take about six months to reach the Moon.",
    "Saturn's rings are made of billions of chunks of ice and rock.",
]

LEGO = [
    "LEGO comes from two Danish words that mean \"play well.\"",
    "The LEGO company makes more tiny tires than any real tire company.",
    "There are about 80 LEGO bricks for every person on Earth.",
    "Six eight-stud LEGO bricks can be joined in over 915 million ways.",
    "A LEGO brick from 1958 still snaps onto a brick made today.",
    "The tallest LEGO tower ever built was over 100 feet high.",
    "There are billions of LEGO minifigures — more than there are people.",
    "Astronauts have built LEGO models up on the Space Station.",
    "Two eight-stud bricks alone can be joined 24 different ways.",
    "The little LEGO people are called \"minifigures,\" or \"minifigs.\"",
    "LEGO minifigures first got their smiley faces in 1978.",
    "The word \"LEGO\" is the same in every language.",
    "A single LEGO brick can hold a stack of hundreds of bricks without breaking.",
    "LEGO makes glow-in-the-dark and see-through bricks too.",
    "Some LEGO sets have thousands of pieces in one box.",
    "The LEGO Group started by making wooden toys before plastic bricks.",
    "LEGO once built a life-size house entirely out of bricks.",
    "Millions of LEGO bricks are made every single hour.",
    "LEGO bricks are made so precisely that very few ever come out wrong.",
    "The LEGO brick was patented over 60 years ago.",
    "LEGOLAND parks have models built from millions of bricks.",
    "LEGO has made robots you can build and program yourself.",
    "A LEGO family in Denmark started the whole company.",
    "Some rare LEGO sets are now worth far more than they cost new.",
    "LEGO once built a working, life-size car powered by air.",
    "Stepping on a LEGO really hurts because the plastic is so tough.",
    "The first LEGO sets were mostly little houses and cars.",
    "LEGO has made sets of spaceships, castles, dinosaurs, and more.",
    "A tub of LEGO can be rebuilt into a nearly endless number of things.",
    "LEGO bricks are pressed from plastic while it's hot, then cooled hard.",
]

FACTS = ([{"id": f"dino-{i:02d}", "cat": "dino", "emoji": "🦖", "text": t}
          for i, t in enumerate(DINO, 1)] +
         [{"id": f"space-{i:02d}", "cat": "space", "emoji": "🚀", "text": t}
          for i, t in enumerate(SPACE, 1)] +
         [{"id": f"lego-{i:02d}", "cat": "lego", "emoji": "🧱", "text": t}
          for i, t in enumerate(LEGO, 1)])

FACT_IDS = [f["id"] for f in FACTS]
FACT_BY_ID = {f["id"]: f for f in FACTS}

# ids by deck, for picking a themed reward (planet landings pull one from the
# planet's own deck; a normal session pulls from a random non-empty deck)
IDS_BY_CAT = {}
for _f in FACTS:
    IDS_BY_CAT.setdefault(_f["cat"], []).append(_f["id"])


if __name__ == "__main__":
    print(f"{len(FACTS)} facts across {len(CATEGORIES)} decks")
    for cat, (label, emoji) in CATEGORIES.items():
        print(f"  {emoji} {label}: {len(IDS_BY_CAT.get(cat, []))}")
    # sanity: ids unique, categories known, lengths in range, no empties
    assert len(FACT_IDS) == len(set(FACT_IDS)), "duplicate fact ids"
    for f in FACTS:
        assert f["cat"] in CATEGORIES, f"{f['id']}: unknown cat {f['cat']}"
        assert f["text"].strip(), f"{f['id']}: empty text"
        assert len(f["text"]) <= 140, f"{f['id']}: too long ({len(f['text'])})"
    print("catalog valid ✓  (all ids unique, decks known, text <= 140 chars)")
