# Tutor voice eval

64 conversations. Kids simulated by claude-sonnet-4-6; pairs judged blind by claude-opus-5-5. Each setup is compared with `today` on the same kid, article and run.

| Setup | Convos | Errors | Wins vs today | Losses | Ties | Person /5 | Keep talking /5 | Grader lines | Muddled lines | Exchanges | Closed | Fixes | Median reply s | p90 | Cost / convo $ |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| today | 16 | 0 | - | - | - | 2.6 | 2.6 | 2.8 | 1.6 | 5.4 | 100% | 0 | 1.8 | 2.2 | 0.027 |
| sigma-sonnet-low | 16 | 0 | 15 | 1 | 0 | 4.0 | 3.7 | 2.1 | 1.2 | 7.4 | 100% | 7 | 2.8 | 5.0 | 0.088 |
| sigma-opus-low | 16 | 0 | 16 | 0 | 0 | 4.3 | 4.2 | 1.5 | 1.1 | 7.6 | 100% | 1 | 2.5 | 4.1 | 0.119 |
| sigma-fable-low | 16 | 0 | 16 | 0 | 0 | 4.4 | 4.1 | 2.0 | 1.0 | 7.6 | 100% | 0 | 2.7 | 5.9 | 0.199 |

Cost is the tutor plus (for sigma) the observer, per conversation, with prompt caching as the API reported it. Prep notes cost $0.115 for 5 articles in this run, once per article for every student. Reply time is the tutor's API time per turn without streaming.

## Measured patterns (share of tutor messages)

| Setup | "tell me" | imagine/picture | ! | grader's remark | repeated opener | same move as last turn | ends with ? | words | length variety |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| today | 53% | 21% | 9% | 17% | 17% | 5% | 19% | 39 | 0.11 |
| sigma-sonnet-low | 16% | 2% | 0% | 4% | 40% | 6% | 11% | 50 | 0.20 |
| sigma-opus-low | 16% | 6% | 0% | 2% | 28% | 8% | 8% | 53 | 0.16 |
| sigma-fable-low | 22% | 6% | 0% | 4% | 24% | 1% | 0% | 60 | 0.16 |

Live-site reference (Lily, 2-7 Nov 2026): Opus 4.6 had "tell me" 64%, ! 19%; Sonnet 5.5 had "tell me" 70%, ! 7%.

## Why the judge picked (a sample)

### sigma-sonnet-low vs today

- nico/octopus r0: sigma-sonnet-low (clear). A has the tutor's own reactions ("It's basically a smoke bomb," "I can barely keep track of one") and never grades, though it hops from fact to fact after the kid's "me too" replies. B repeats "Here's one I didn't expect… Wild, right?" and the same "Tell me…" shape, praises answers ("Ink clouds, nice trick!"), and closes with a report card ("Smart thinking!").
- nico/octopus r1: sigma-sonnet-low (clear). B's tutor has real reactions of their own: "I keep picturing the rest of it just pouring through," "Basically a smoke bomb," and "I can't think why... so I'm making up reasons." It also builds on the kid's ideas, the beak test and spare hearts, and closes on the kid's idea instead of a recap. A repeats the same shape: "Tell me which...," "Wild, right?" twice, and ends with a report-card summary. B still has some evaluative lines ("Squishing is the right word," "That's a good reason") and abrupt topic hops to the ink and the suction cups.
- nico/lighthouse r0: sigma-sonnet-low (big). A builds on the kid's own five-flash pattern all the way through, ties it to the winding chain, and shares real reactions like "I'd be holding on with one hand and wiping with the other," with no grading. B hops between topics, asks two things at once ("Tell me how you'd feel, and what you'd do next"), grades the kid ("Checking the list is smart"), and closes like a report card.
- nico/lighthouse r1: sigma-sonnet-low (big). A has its own reactions ('I'd lose track around three', 'I'd keep one hand on the rail') and follows the kid's 'gross' and 'my dad likes fish' remarks to a warm close. B runs the same 'Tell me what…' prompt every turn, steers the kid through a quiz chain, and ends grading the kid: 'Calling the flashes a code was a good way to see it.'
- maya/lighthouse r0: sigma-sonnet-low (clear). B builds on the kid's own ideas, from the birthday flash code to the dark climb where they lose count at 50, and ends with a personal 'I'd have done the same.' A keeps using the 'Imagine X and tell me Y' shape, jumps topics with 'Convince me why someone far from the sea should care,' never answers the pets question, and closes with a report-card summary.
- maya/lighthouse r1: sigma-sonnet-low (clear). A builds on the kid's own Sparkle Tower and follows her questions (wet list, falling asleep, dropped rag) with its own reactions like "Sparkle Tower. I'd know it anywhere." B hops topics ("Now zoom out", then a jump to the sailor scenario that skips her crash question), grades her with "Good thinking about the late boat," and closes like a report card with "says it all."

### sigma-opus-low vs today

- nico/octopus r0: sigma-opus-low (big). A follows the kid's threads, like Tyler at recess and the fish swimming past a hidden octopus, and offers its own reactions such as 'I'd feel a little silly as that fish.' B repeats the 'Here's one I didn't expect... Wild, right?' template, grades with 'nice trick!' and 'is just right', and closes like a report card with 'Smart thinking!'
- nico/octopus r1: sigma-opus-low (clear). A builds on the kid's answers (the beak, the couch, 'because its really big') and shares its own reactions, like 'Three hearts is weirder to me' and its guess about the eight arms. B repeats the same 'Tell me which... and why' and 'Wild, right?' shapes, hops between facts, and closes like a report card ('You picked no bones and the ink cloud').
- nico/lighthouse r0: sigma-opus-low (big). A builds on the kid's own 'five flashes' lighthouse and nap answer with real reactions ('I'd be setting an alarm', 'the 3 a.m. climb would be harder than the storm'). B hops from steps to walkway to codes to keeper kids, asks yes-bait like 'Pretty clever, right?', grades with 'Checking the list is smart', and closes like a report card.
- nico/lighthouse r1: sigma-opus-low (big). B builds on the kid's own flash pattern, has its own reactions ('I'd be counting in the fog and lose track around seven', 'I'd be tempted too') and varies its moves. A repeats 'Imagine/Picture... tell me' nearly every turn, grades with 'A code is a great way to say it', and closes like a report card with 'Calling the flashes a code was a good way to see it'.
- maya/lighthouse r0: sigma-opus-low (clear). B follows Maya's ideas, such as her birthday flash pattern, the 3 a.m. climb and her soot question, offers its own takes ("I think 3 a.m. on a quiet night is harder than the storm," "I'd let someone else lick it first") and closes warmly on her lighthouse. A repeats the "Imagine/Picture... tell me" shape, ignores the kid's last question about pets and ends with a report-card line praising her Kansas point.
- maya/lighthouse r1: sigma-opus-low (clear). A's tutor has its own reactions ('I'd want a rope on the kid at least,' 'I can't decide if that's sad or kind of cool') and follows the kid's questions. B leans on 'Imagine you're... tell me' prompts, grades ('Good thinking about the late boat'), and closes like a report card ('your picture... says it all').

### sigma-fable-low vs today

- nico/octopus r0: sigma-fable-low (big). A has its own reactions and follows the kid ('my blood is red' → 'Mine too. So that's one more way we're not octopuses'; 'Sneaky, not mean. I like that about it'; 'I'd be the rock'), and it closes warmly with no grading. B runs the same 'Here's one I didn't expect... Wild, right?' template twice, grades the kid ('nice trick!', 'just right', 'Smart thinking!'), and ends on a report-card summary.
- nico/octopus r1: sigma-fable-low (clear). B's tutor brings its own thinking: making up a reason for three hearts, pushing back with 'I'd give the fish a break,' and 'Every trick in the article is about getting away, not fighting.' It also builds on the kid's answers. A repeats the 'Tell me which… and why' shape and 'Wild, right?', hops from the brother's room to the ink, and closes like a report card with 'You picked no bones and the ink cloud.'
- nico/lighthouse r0: sigma-fable-low (big). A follows the kid's own remarks ('thats a lot of stairs', 'storms r scary', 'i cant ride a bike yet') with real reactions of its own ('I'd want a storm now and then just to stay awake') and ends warmly. B skips past the kid's answers, grades with 'Checking the list is smart,' hops topics with 'Here's one I loved/didn't expect,' and closes with a report-card summary.
- nico/lighthouse r1: sigma-fable-low (big). B shares its own reactions ("I'd take the hundred stairs over that any night," "I'd want gloves"), follows the kid's own question "what did they eat," and closes on the kid's lighthouse rather than a verdict. A repeats "Imagine/Picture... tell me" every turn, offers praise ("A code is a great way to say it"), and ends with a report-card summary.
- maya/lighthouse r0: sigma-fable-low (clear). B has its own reactions ('I expected the light to just mean "rocks here," not "you are here"'), pushes back ('Here's my worry… Convince me five quick flashes is enough'), and builds on the kid's ideas from flash pattern to sticker chart. A repeats the 'Imagine X and tell me Y' shape, jumps topics ('Convince me why someone far from the sea…'), skips the pets question, and ends on a report-card summary.
- maya/lighthouse r1: sigma-fable-low (big). B has opinions of its own ("I think I'd take it for a summer, not a childhood," "Fruit on the first day, candy the second. That's my order"), follows the kid's rope and scurvy tangents, and varies its prompts. A keeps repeating "Imagine you're... tell me," says "Good thinking about the late boat," and ends on a report-card summary.

## Weakest lines

### today

- nico/octopus: Hiding so fish can't find it is just right, and you picked the ink squirt as your octopus escape trick too. Smart thinking!
- nico/octopus: You picked no bones and the ink cloud, and I loved the idea of squeezing into your brother's room like an octopus.
- nico/lighthouse: You can fish, so you'd fit right in at a lighthouse, and you picked checking the list as your sailor move, which is just what the flash patterns were for.
- nico/lighthouse: Calling the flashes a code was a good way to see it, and checking the list is just how a sailor would crack it and find out which lighthouse they were looking at.
- maya/lighthouse: Your point that people in Kansas still depend on the keeper, because ships carry their food and clothes, is such a great reminder that one dim window could affect so many lives.

### sigma-sonnet-low

- nico/octopus: Stuck, yep. The beak is the limit, so it has to find a bigger hole. If I were that octopus, I'd squirt ink and hope the fish got confused. It's basically a smoke bomb.
- nico/octopus: Fingers are good, but an octopus has eight arms with suction cups all over, and it uses them to grab food and hang on to rocks.
- nico/lighthouse: Rocks is where a lighthouse earns its keep.
- nico/lighthouse: Tell me what's the worst part of being out there in that storm.
- maya/lighthouse: You picked the right job to worry about.

### sigma-opus-low

- nico/octopus: I'm still picturing that octopus puddle sliding out of the jar, beak first.
- nico/octopus: Under the couch cushions. Nobody would check there. And if your sister got close, you could squirt a dark ink cloud and slip away. That's what an octopus does to a hungry fish.
- nico/lighthouse: A loud alarm and a nap. That might be the smartest plan a keeper ever had.
- nico/lighthouse: Or no lighthouse they know at all, which might be worse. So the nap is out. What gets me is that even a little soot on the glass made the light dimmer, so the keepers wiped it every single day. One smudge mattered.
- maya/lighthouse: Counting on your fingers is smart, though.

### sigma-fable-low

- nico/octopus: Mine too. So that's one more way we're not octopuses. The color trick is the other one I'd want: skin that turns rock-colored faster than a blink.
- nico/octopus: Blue blood might need extra pushing. I can't say you're wrong, since nobody in the article says. The color change is the one I'd want for myself. Under a second, and it just vanishes against the rock. Pick the octopus trick you'd want.
- nico/lighthouse: Neither could those keeper kids, probably. Nowhere to ride one on a rock in the ocean.
- nico/lighthouse: Black soot every morning, from a lamp that burned oil all night. The lamp was inside a glass lens shaped like a beehive, so you'd be wiping the inside of a giant glass beehive. I'd want gloves. Tell me the one chore from the whole job you'd pick, if you had to do just one.
- maya/lighthouse: Your "wait and count again" point is fair. Sailors had all night. Now the other chore: soot on the glass.

