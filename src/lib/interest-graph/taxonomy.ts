/**
 * The seed topic map: domain → category → topic, three levels deep.
 *
 * Slugs are stable IDs (they travel to Compass), so never rename one; add an alias instead.
 * Labels are what students, guides and parents see. Aliases are extra phrases that resolve to
 * the topic; plurals, case and punctuation are handled by normalizePhrase, so list only real
 * alternatives ("great whites" for sharks, not "shark").
 *
 * drizzle/0011_interest_graph.sql is generated from this file (scripts/gen-topic-seed.ts), and
 * taxonomy.test.ts fails if the two drift.
 */

export interface TopicNode {
  slug: string;
  label: string;
  aliases?: string[];
  children?: TopicNode[];
}

const t = (slug: string, label: string, aliases: string[] = []): TopicNode => ({ slug, label, aliases });
const group = (slug: string, label: string, children: TopicNode[], aliases: string[] = []): TopicNode => ({ slug, label, aliases, children });

export const TAXONOMY: TopicNode[] = [
  group("animals", "Animals", [
    group("marine-animals", "Ocean animals", [
      t("sharks", "Sharks", ["great white", "great whites", "hammerhead"]),
      t("whales", "Whales", ["orca", "orcas", "killer whale", "blue whale"]),
      t("dolphins", "Dolphins", ["porpoise"]),
      t("octopuses", "Octopuses and squid", ["octopus", "squid", "cephalopod"]),
      t("sea-turtles", "Sea turtles"),
      t("coral-reefs", "Coral reefs", ["coral", "reef"]),
      t("deep-sea", "Deep-sea creatures", ["deep sea", "anglerfish", "deep ocean"]),
    ], ["sea animals", "sea creatures", "ocean life", "marine life"]),
    group("mammals", "Mammals", [
      t("big-cats", "Big cats", ["lion", "tiger", "cheetah", "leopard", "jaguar"]),
      t("wolves", "Wolves", ["wolf", "foxes", "fox"]),
      t("bears", "Bears", ["polar bear", "grizzly", "panda", "pandas"]),
      t("elephants", "Elephants"),
      t("primates", "Monkeys and apes", ["monkey", "monkeys", "apes", "gorilla", "chimpanzee", "orangutan"]),
      t("horses", "Horses", ["pony", "ponies", "horseback riding"]),
      t("bats", "Bats"),
    ]),
    group("birds", "Birds", [
      t("birds-of-prey", "Birds of prey", ["eagle", "eagles", "hawk", "owl", "owls", "falcon"]),
      t("penguins", "Penguins"),
      t("parrots", "Parrots", ["parrot", "macaw"]),
      t("bird-migration", "Bird migration"),
    ]),
    group("reptiles-amphibians", "Reptiles and amphibians", [
      t("snakes", "Snakes"),
      t("lizards", "Lizards", ["gecko", "chameleon", "komodo dragon", "iguana"]),
      t("crocodiles", "Crocodiles and alligators", ["crocodile", "alligator", "alligators"]),
      t("frogs", "Frogs and salamanders", ["frog", "toad", "toads", "salamander", "axolotl"]),
      t("turtles", "Turtles and tortoises", ["turtle", "tortoise"]),
    ], ["reptiles", "amphibians"]),
    group("insects", "Insects and spiders", [
      t("bees", "Bees", ["honeybee", "beekeeping"]),
      t("ants", "Ants"),
      t("butterflies", "Butterflies and moths", ["butterfly", "moth", "caterpillar"]),
      t("spiders", "Spiders", ["tarantula"]),
      t("beetles", "Beetles"),
    ], ["bugs", "insects"]),
    group("pets", "Pets", [
      t("dogs", "Dogs", ["dog", "puppy", "puppies", "dog breeds"]),
      t("cats", "Cats", ["cat", "kitten", "kittens"]),
      t("small-pets", "Small pets", ["hamster", "guinea pig", "rabbit", "rabbits", "bunny", "fish tank"]),
    ]),
    group("dinosaurs-prehistoric", "Dinosaurs and prehistoric life", [
      t("dinosaurs", "Dinosaurs", ["t rex", "t-rex", "tyrannosaurus", "velociraptor", "triceratops"]),
      t("fossils", "Fossils", ["paleontology", "paleontologist"]),
      t("ice-age-animals", "Ice Age animals", ["mammoth", "woolly mammoth", "saber tooth tiger"]),
    ]),
    t("endangered-animals", "Endangered animals", ["endangered species", "wildlife conservation", "animal conservation"]),
    t("animal-behavior", "Animal behavior", ["animal intelligence", "how animals communicate"]),
  ], ["animal", "wildlife", "zoology"]),

  group("nature-earth", "Nature and Earth", [
    group("weather", "Weather", [
      t("storms", "Storms", ["hurricane", "hurricanes", "tornado", "tornadoes", "thunderstorm", "lightning"]),
      t("climate", "Climate and climate change", ["climate change", "global warming"]),
      t("seasons", "Seasons and weather patterns", ["snow", "rain", "weather forecast"]),
    ]),
    group("geology", "Rocks and the Earth", [
      t("volcanoes", "Volcanoes", ["volcano", "lava", "eruption"]),
      t("earthquakes", "Earthquakes", ["earthquake", "tsunami", "tsunamis", "plate tectonics"]),
      t("rocks-minerals", "Rocks, crystals and gems", ["rocks", "crystals", "gems", "gemstones", "minerals"]),
      t("caves", "Caves"),
    ], ["earth science"]),
    group("ecosystems", "Places in nature", [
      t("oceans", "Oceans", ["ocean", "sea", "the ocean"]),
      t("rainforests", "Rainforests", ["rainforest", "jungle", "amazon rainforest"]),
      t("deserts", "Deserts", ["desert"]),
      t("mountains", "Mountains", ["mountain", "mount everest", "mountain climbing"]),
      t("polar-regions", "The Arctic and Antarctica", ["arctic", "antarctica", "north pole", "south pole", "glaciers"]),
      t("rivers-lakes", "Rivers and lakes"),
    ], ["ecosystems", "habitats", "biomes"]),
    group("plants", "Plants and trees", [
      t("trees", "Trees", ["forest", "forests"]),
      t("flowers", "Flowers"),
      t("gardening", "Gardening", ["growing plants", "garden"]),
      t("carnivorous-plants", "Carnivorous plants", ["venus fly trap", "venus flytrap"]),
      t("fungi", "Mushrooms and fungi", ["mushroom", "mushrooms", "fungus"]),
    ], ["plant", "botany"]),
    t("environment", "Protecting the environment", ["recycling", "pollution", "conservation", "saving the planet"]),
  ], ["nature", "earth", "the outdoors"]),

  group("space", "Space", [
    t("planets", "Planets", ["solar system", "mars", "jupiter", "saturn", "venus", "pluto"]),
    t("stars-galaxies", "Stars and galaxies", ["stars", "galaxy", "galaxies", "the sun", "milky way"]),
    t("black-holes", "Black holes"),
    t("astronauts", "Astronauts", ["astronaut", "space station", "iss"]),
    t("space-exploration", "Space exploration", ["nasa", "rockets", "rocket", "spacex", "moon landing", "space travel"]),
    t("moon", "The Moon", ["the moon", "lunar"]),
    t("aliens", "Life on other planets", ["alien", "aliens", "extraterrestrial", "ufo", "ufos"]),
    t("astronomy", "Stargazing and telescopes", ["telescope", "telescopes", "stargazing", "constellations"]),
  ], ["outer space", "the universe", "cosmos", "astrophysics"]),

  group("science", "Science", [
    group("human-body", "The human body", [
      t("brain", "The brain", ["neuroscience", "how the brain works"]),
      t("health", "Health and germs", ["germs", "viruses", "vaccines", "medicine", "doctors"]),
      t("nutrition", "Food and nutrition", ["healthy eating"]),
      t("senses", "The five senses", ["eyes", "hearing", "taste", "smell"]),
    ], ["anatomy", "body"]),
    group("chemistry", "Chemistry", [
      t("experiments", "Science experiments", ["experiments", "science projects", "slime"]),
      t("elements", "Elements and atoms", ["atoms", "periodic table", "molecules"]),
    ]),
    group("physics", "Physics", [
      t("energy", "Energy and electricity", ["electricity", "magnets", "magnetism", "solar power", "renewable energy"]),
      t("light-sound", "Light and sound", ["light", "sound", "rainbows", "optical illusions"]),
      t("forces-motion", "Forces and motion", ["gravity", "motion", "physics of sports"]),
    ]),
    group("biology", "Biology", [
      t("cells-dna", "Cells and DNA", ["dna", "genetics", "cells"]),
      t("evolution", "Evolution", ["natural selection", "darwin"]),
      t("microbes", "Microbes", ["bacteria", "microscopic life", "microscope"]),
    ]),
    t("inventions", "Inventions and inventors", ["inventors", "invention", "how things work"]),
    t("math", "Math", ["mathematics", "numbers", "puzzles and math", "geometry"]),
  ], ["stem"]),

  group("technology", "Technology", [
    t("robots", "Robots", ["robot", "robotics"]),
    t("artificial-intelligence", "Artificial intelligence", ["ai", "a i", "machine learning", "chatbots"]),
    t("coding", "Coding", ["programming", "computer programming", "scratch", "python"]),
    t("computers", "Computers and the internet", ["computer", "internet", "the internet"]),
    t("video-game-design", "Making video games", ["game design", "game development"]),
    t("gadgets", "Gadgets and phones", ["smartphones", "phones", "tech gadgets"]),
    t("3d-printing", "3D printing"),
  ], ["tech"]),

  group("vehicles-engineering", "Vehicles and engineering", [
    t("cars", "Cars", ["car", "race cars", "racing cars", "supercars", "electric cars", "tesla"]),
    t("trains", "Trains", ["train", "railroads", "subway"]),
    t("airplanes", "Airplanes and flight", ["airplane", "planes", "aviation", "flying", "pilots", "helicopters"]),
    t("ships", "Ships and submarines", ["ship", "boats", "boat", "submarine", "submarines", "titanic"]),
    t("trucks", "Trucks and construction machines", ["construction vehicles", "diggers", "monster trucks"]),
    t("buildings", "Buildings and bridges", ["architecture", "skyscrapers", "bridges"]),
    t("engineering", "Engineering", ["engineers", "machines"]),
  ], ["vehicles", "transportation"]),

  group("history", "History", [
    group("ancient-world", "The ancient world", [
      t("ancient-egypt", "Ancient Egypt", ["egypt", "pyramids", "mummies", "pharaohs"]),
      t("ancient-greece", "Ancient Greece", ["greek mythology", "greek gods", "olympus"]),
      t("ancient-rome", "Ancient Rome", ["romans", "roman empire", "gladiators"]),
      t("ancient-china", "Ancient China", ["great wall of china"]),
      t("mayans-aztecs", "Maya, Aztecs and Inca", ["mayans", "aztecs", "inca"]),
    ], ["ancient history", "ancient civilizations"]),
    t("medieval-times", "Knights and castles", ["knights", "castles", "middle ages", "medieval"]),
    t("vikings", "Vikings", ["viking"]),
    t("pirates", "Pirates", ["pirate"]),
    t("explorers", "Explorers", ["exploration", "christopher columbus", "lewis and clark"]),
    t("american-history", "American history", ["us history", "presidents", "founding fathers", "civil rights"]),
    t("world-wars", "World War history", ["world war 2", "world war ii", "world war 1", "ww2", "wwii"]),
    t("famous-people", "Famous people", ["biographies", "heroes", "historical figures"]),
    t("archaeology", "Archaeology", ["archaeologist", "ancient ruins"]),
  ]),

  group("people-places", "People and places", [
    t("countries-cultures", "Countries and cultures", ["cultures", "countries", "world cultures", "traditions"]),
    t("geography", "Maps and geography", ["maps", "geography"]),
    t("languages", "Languages", ["learning languages", "spanish", "sign language"]),
    t("holidays", "Holidays and celebrations", ["holidays", "festivals", "christmas", "halloween"]),
    t("cities", "Cities", ["city", "big cities"]),
    t("mythology", "Myths and legends", ["myths", "legends", "norse mythology", "folklore"]),
  ], ["social studies", "world"]),

  group("arts-entertainment", "Arts and entertainment", [
    t("drawing", "Drawing and painting", ["art", "painting", "drawing", "artists", "sketching"]),
    t("music", "Music", ["songs", "singing", "musical instruments", "piano", "guitar", "drums"]),
    t("movies", "Movies and animation", ["movies", "films", "animation", "cartoons", "disney", "pixar"]),
    t("books-writing", "Books and writing", ["books", "reading", "writing stories", "authors", "poetry"]),
    t("theater-dance", "Theater and dance", ["dance", "dancing", "ballet", "acting", "theater", "musicals"]),
    t("comics", "Comics and graphic novels", ["comics", "manga", "graphic novels", "superheroes", "marvel"]),
    t("photography", "Photography", ["photos", "cameras"]),
    t("fashion", "Fashion and design", ["fashion", "clothes", "design"]),
  ], ["entertainment"]),

  group("sports", "Sports", [
    t("soccer", "Soccer", ["football soccer", "world cup", "messi", "ronaldo"]),
    t("basketball", "Basketball", ["nba", "wnba"]),
    t("football", "Football", ["american football", "nfl", "super bowl"]),
    t("baseball", "Baseball", ["mlb", "softball"]),
    t("swimming", "Swimming", ["swim"]),
    t("gymnastics", "Gymnastics"),
    t("olympics", "The Olympics", ["olympic games", "olympics"]),
    t("skateboarding", "Skateboarding and BMX", ["skateboard", "skating", "bmx", "scooters"]),
    t("winter-sports", "Winter sports", ["skiing", "snowboarding", "ice skating", "hockey", "ice hockey"]),
    t("martial-arts", "Martial arts", ["karate", "taekwondo", "judo", "jiu jitsu"]),
    t("tennis", "Tennis", ["pickleball", "badminton"]),
    t("racing", "Racing", ["formula 1", "f1", "nascar", "motorsports"]),
    t("running", "Running and track", ["track and field", "marathons"]),
  ], ["sport", "athletes"]),

  group("games-hobbies", "Games and hobbies", [
    t("video-games", "Video games", ["gaming", "minecraft", "fortnite", "roblox", "nintendo", "pokemon", "mario"]),
    t("board-games", "Board games and chess", ["chess", "board games", "card games"]),
    t("puzzles", "Puzzles and riddles", ["riddles", "puzzles", "rubiks cube", "brain teasers"]),
    t("lego", "LEGO and building", ["legos", "building blocks"]),
    t("magic-tricks", "Magic tricks", ["magic", "magicians"]),
    t("crafts", "Crafts", ["origami", "knitting", "sewing", "diy"]),
    t("collecting", "Collecting", ["trading cards", "pokemon cards", "coins", "stamps"]),
    t("camping", "Camping and the outdoors", ["camping", "hiking", "fishing", "survival skills"]),
  ], ["hobbies", "games"]),

  group("food", "Food and cooking", [
    t("cooking", "Cooking and baking", ["baking", "recipes", "chefs"]),
    t("food-science", "The science of food", ["candy", "chocolate", "ice cream"]),
    t("food-around-world", "Food around the world", ["pizza", "sushi", "world food"]),
  ], ["snacks", "treats"]),

  group("money-careers", "Money and careers", [
    t("business", "Business and money", ["money", "entrepreneurs", "making money", "economics"]),
    t("jobs", "Jobs and careers", ["careers", "what i want to be", "firefighters", "police", "veterinarian"]),
  ]),
];

export interface FlatTopic { slug: string; label: string; parentSlug: string | null; domain: string; depth: number; aliases: string[] }

/** Every node with its parent and top-level domain, in tree order (parents before children) */
export function flattenTaxonomy(nodes: TopicNode[] = TAXONOMY, parent: FlatTopic | null = null): FlatTopic[] {
  return nodes.flatMap(n => {
    const row: FlatTopic = {
      slug: n.slug, label: n.label, parentSlug: parent?.slug ?? null,
      domain: parent?.domain ?? n.slug, depth: (parent?.depth ?? 0) + 1, aliases: n.aliases ?? [],
    };
    return [row, ...flattenTaxonomy(n.children ?? [], row)];
  });
}

/**
 * Seeded "related" links across branches of the tree (siblings, parents and children are
 * already related through the tree). Learned links will be added from student behaviour.
 */
export const RELATED: [string, string][] = [
  ["sharks", "oceans"], ["whales", "oceans"], ["deep-sea", "ships"],
  ["dinosaurs", "fossils"], ["dinosaurs", "volcanoes"], ["fossils", "archaeology"],
  ["volcanoes", "earthquakes"], ["storms", "climate"], ["climate", "polar-regions"],
  ["penguins", "polar-regions"], ["bears", "polar-regions"], ["coral-reefs", "environment"],
  ["endangered-animals", "environment"], ["rainforests", "endangered-animals"],
  ["planets", "space-exploration"], ["astronauts", "airplanes"], ["space-exploration", "engineering"],
  ["robots", "artificial-intelligence"], ["robots", "engineering"], ["coding", "video-game-design"],
  ["video-games", "video-game-design"], ["video-games", "coding"], ["lego", "engineering"], ["lego", "buildings"],
  ["cars", "racing"], ["cars", "engineering"], ["trains", "engineering"], ["ships", "pirates"],
  ["pirates", "explorers"], ["vikings", "ships"], ["vikings", "mythology"], ["ancient-greece", "mythology"],
  ["ancient-egypt", "archaeology"], ["medieval-times", "mythology"], ["horses", "medieval-times"],
  ["cooking", "food-science"], ["food-science", "experiments"], ["nutrition", "cooking"],
  ["drawing", "comics"], ["movies", "comics"], ["movies", "books-writing"], ["music", "theater-dance"],
  ["soccer", "olympics"], ["swimming", "olympics"], ["gymnastics", "olympics"], ["running", "olympics"],
  ["winter-sports", "olympics"], ["forces-motion", "skateboarding"], ["camping", "mountains"],
  ["puzzles", "math"], ["board-games", "math"], ["magic-tricks", "light-sound"], ["brain", "animal-behavior"],
  ["dogs", "animal-behavior"], ["cats", "big-cats"], ["wolves", "dogs"], ["birds-of-prey", "dinosaurs"],
  ["business", "inventions"], ["energy", "environment"], ["aliens", "planets"], ["microbes", "health"],
];
