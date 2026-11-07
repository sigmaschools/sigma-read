/**
 * Fixed articles for the offline conversation eval (scripts/eval-conversations.ts).
 * Kept small and stable so runs are comparable across prompt changes.
 */

export interface EvalArticle {
  id: string;
  level: number;
  title: string;
  topic: string;
  bodyText: string;
}

export const EVAL_ARTICLES: EvalArticle[] = [
  {
    id: "octopus",
    level: 1,
    title: "The Amazing Octopus",
    topic: "octopuses",
    bodyText: `An octopus is a sea animal with eight arms. Each arm is covered in suction cups. The suction cups help the octopus grab food and hold on to rocks.

An octopus has no bones. That means it can squeeze through very small holes. If its beak can fit through a gap, the rest of its body can too.

Octopuses are also great at hiding. They can change the color of their skin in less than a second. This helps them blend in with rocks and sand so other animals can't see them.

If a hungry fish gets too close, an octopus can squirt dark ink into the water. The ink makes a cloud. While the fish is confused, the octopus swims away.

Here is one more surprising fact. An octopus has three hearts, and its blood is blue!`,
  },
  {
    id: "lighthouse",
    level: 2,
    title: "The Lighthouse Keeper's Job",
    topic: "lighthouses",
    bodyText: `Before ships had radios and satellites, a lighthouse was often the only warning that rocks were near. Someone had to keep the light burning all night, every night. That person was the lighthouse keeper.

The keeper's day started in the evening. The big lamp burned oil, and it needed to be filled, lit and watched. The lamp sat inside a giant glass lens shaped like a beehive. The lens gathered the small flame into one strong beam that could be seen many miles out at sea.

The beam had to turn, so sailors would see a flash instead of a steady glow. Each lighthouse flashed in its own pattern. A sailor who saw three flashes and then a pause could check a list and know exactly which lighthouse it was, and where their ship was.

In many lighthouses, the lens was turned by a weight on a long chain, like a grandfather clock. The weight dropped slowly down the tower. Every few hours the keeper had to climb the stairs and wind it back up. Some keepers climbed more than a hundred steps several times a night.

Keepers also cleaned the glass every day. Smoke from the lamp left black soot on the lens, and even a little soot made the light dimmer. In a storm, salt spray coated the windows outside, so keepers went out on the narrow walkway to wipe them down while the wind howled.

Many keepers lived at the lighthouse with their families, far from any town. Supplies came by boat a few times a year. Children of keepers often learned to row, fish and fix things before they learned to ride a bike.

Today almost every lighthouse runs on electricity and turns itself on at dusk. The keepers are gone, but the flashing patterns still work the same way they did a hundred years ago.`,
  },
  {
    id: "bee-dance",
    level: 3,
    title: "How Honeybees Give Directions",
    topic: "bees",
    bodyText: `When a honeybee finds a patch of flowers full of nectar, she flies back to the hive with important news. But bees can't talk. So how does she tell the other bees where the food is? She dances.

The dance is called the waggle dance. The bee walks in a straight line while shaking her body from side to side. Then she circles back and does it again, over and over. Other bees crowd around her to feel the movements in the dark hive.

The direction of the straight line is a map. Inside the hive, the bees dance on a wall of honeycomb. Straight up the wall stands for the direction of the sun. If the bee waggles straight up, the flowers are toward the sun. If she waggles a little to the right of straight up, the flowers are that same amount to the right of the sun.

The length of the waggle tells distance. A longer waggle means the flowers are farther away. For flowers very close to the hive, bees do a simpler "round dance" instead.

A scientist named Karl von Frisch spent years watching bees to figure out what the dance meant. Many people didn't believe insects could share directions this way. In 1973, he won a Nobel Prize for his discovery.

Today, scientists still study the waggle dance. It helps them understand how bees find food, and why protecting flower-filled areas near hives matters for bees and for the crops they pollinate.`,
  },
  {
    id: "voyager",
    level: 5,
    title: "Voyager: The Spacecraft That Left the Solar System",
    topic: "space exploration",
    bodyText: `In 1977, NASA launched two spacecraft, Voyager 1 and Voyager 2, on a mission that was supposed to last about five years. Nearly fifty years later, both are still sending messages back to Earth from farther away than any human-made object has ever traveled.

The timing of the launch was no accident. In the late 1970s, the outer planets lined up in a way that happens only about once every 175 years. That alignment let the spacecraft use each planet's gravity like a slingshot, gaining speed to reach the next one. Voyager 2 took advantage of it to fly past Jupiter, Saturn, Uranus, and Neptune. It is still the only spacecraft ever to visit Uranus and Neptune.

Along the way, the Voyagers made discoveries that rewrote textbooks. They found active volcanoes on Jupiter's moon Io, the first active volcanoes seen anywhere besides Earth. They revealed thin rings around Jupiter and showed that Saturn's rings are made of thousands of separate ringlets.

After the planets, the spacecraft kept going. In 2012, Voyager 1 crossed into interstellar space, the region between the stars, beyond the bubble of particles that streams out from our Sun. Voyager 2 followed in 2018. A radio signal from Voyager 1 now takes nearly a full day to reach Earth.

Each Voyager also carries a gold-plated record. It holds sounds and images chosen to represent life on Earth, including greetings in 55 languages, music from many cultures, and the sound of a human heartbeat. The record is a message for anyone who might find it, even though the spacecraft will not come close to another star for tens of thousands of years.

The Voyagers will not last forever. They are powered by the heat of decaying plutonium, which produces a little less electricity each year. Engineers have been turning off instruments one by one to save power. Sometime in the coming years, the last instrument will go quiet. Even then, the two spacecraft will keep drifting silently through the galaxy, carrying their records with them.`,
  },
  {
    id: "immune",
    level: 6,
    title: "How Your Body Remembers a Germ",
    topic: "the immune system",
    bodyText: `Every day, your body is invaded. Bacteria ride in on food, viruses drift in with each breath, and most of them never make you sick, because an army inside you is already at work. That army is the immune system, and its most remarkable feature is not its strength but its memory.

The first line of defense is general-purpose. White blood cells patrol the bloodstream and swallow anything that looks foreign. They do not need to recognize a specific germ; they react to broad warning signs, like the chemical signature of a bacterial cell wall. This response is fast, but it is also blunt, and a determined virus can slip past it.

The second line is slower and far more precise. Specialized cells called lymphocytes carry receptors, each shaped to lock onto one particular molecule. Your body produces billions of lymphocytes with billions of different receptor shapes, almost all of which will never meet their match. When a germ does arrive, the few lymphocytes whose receptors happen to fit it begin to multiply furiously. Within days there are millions of them, each producing antibodies, proteins that stick to the germ and mark it for destruction.

This is why you feel sick for several days: the precise response needs time to build. But when the infection ends, something unusual happens. Most of the specialized cells die off, yet a small number remain in reserve. These are memory cells, and they can last for decades. If the same germ ever returns, memory cells recognize it immediately and launch the precise response within hours instead of days. Often, you never notice you were infected at all.

Vaccines borrow this trick. A vaccine shows the immune system a harmless piece or weakened form of a germ, enough to trigger the precise response and leave behind memory cells, without causing the disease. The body ends up prepared for an enemy it has technically never fought.

The system is not perfect. Some viruses, like the ones that cause flu, change their surface molecules often enough that old memory cells no longer recognize them, which is why flu vaccines are updated every year. And sometimes the immune system mistakes the body's own cells for invaders, causing autoimmune diseases. Still, the fact that a scar-free encounter decades ago can still protect you today remains one of the strangest and most useful facts about being alive.`,
  },
];
