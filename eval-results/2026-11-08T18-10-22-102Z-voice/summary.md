# Tutor voice eval

18 conversations. Kids simulated by claude-sonnet-4-6; pairs judged blind by claude-fable-5-1. Each setup is compared with `sigma-v1` on the same kid, article and run.

| Setup | Convos | Errors | Wins vs sigma-v1 | Losses | Ties | Person /5 | Keep talking /5 | Fun /5 | Grader lines | Debate lines | Muddled lines | Exchanges | Closed | Fixes | Median reply s | p90 | Cost / convo $ |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| sigma-v1 | 9 | 0 | - | - | - | 3.4 | 2.8 | 2.4 | 2.2 | 2.3 | 0.7 | 7.0 | 100% | 0 | 2.6 | 4.3 | 0.106 |
| sigma-opus-low | 9 | 0 | 9 | 0 | 0 | 4.1 | 4.3 | 4.3 | 1.3 | 0.0 | 0.6 | 8.0 | 100% | 2 | 2.5 | 3.7 | 0.123 |

Cost is the tutor plus (for sigma) the observer, per conversation, with prompt caching as the API reported it. Prep notes cost $0.111 for 5 articles in this run, once per article for every student. Reply time is the tutor's API time per turn without streaming.

## Measured patterns (share of tutor messages)

| Setup | "tell me" | imagine/picture | ! | grader's remark | debate move | correction | repeated opener | same move as last turn | ends with ? | words | length variety |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| sigma-v1 | 12% | 6% | 0% | 0% | 23% | 0% | 39% | 3% | 4% | 52 | 0.17 |
| sigma-opus-low | 1% | 2% | 1% | 1% | 0% | 2% | 28% | 0% | 40% | 52 | 0.16 |

Live-site reference (Lily, 2-7 Nov 2026): Opus 4.6 had "tell me" 64%, ! 19%; Sonnet 5.5 had "tell me" 70%, ! 7%.

## Why the judge picked (a sample)

### sigma-opus-low vs sigma-v1

- nico/octopus r0: sigma-opus-low (clear). B stays playful and kid-sized (rainbow octopus, 'say it extra gross for the lunch table', toothpaste backwards, cookie jar) and builds a running story the kid is driving, while A's 'Make up a reason you think an octopus would need three hearts' turns thinky and A's turns settle into a repeated reaction-then-'picture/pick/tell me' shape.
- nico/lighthouse r0: sigma-opus-low (clear). B follows the kid more naturally (answers 'why cant it just turn by itself', warmly handles 'i cant ride a bike yet') and brings the tutor's own life in ('I huffed a little on my apartment stairs'), while A twice counters the kid ('They'd still see some light, at least' after 'crash into rocks', and 'I'd make the last one longer instead of bigger') and presses for an explanation the kid can't give.
- maya/lighthouse r0: sigma-opus-low (clear). A slips into the two failure modes: 'Tell me what that sailor now knows' is a comprehension check, 'Your string alarm is clever' grades the kid, and 'Defend your pick' is a debate prompt, with nearly every turn ending in the same 'Describe...' shape. B keeps it playful and shares its own reactions ('I'd be out on the boat holding my breath', 'Powdered donuts would be my top request too'), varies the prompts (yell, shout, would-you-rather, what's in the crates), and closes warmly without a report card.
- maya/bee-dance r0: sigma-opus-low (big). A runs the same 'Say you're X... Make the case / Convince me' shape nearly every turn, with four make-the-case prompts and recurring quiet grading like 'Your test is a real one' and 'Your leaning idea is close to what she does'; B plays with the kid ('Describe walking back into that hive', 'Directions with their butts. That's going to be stuck in my head') and ends with a genuine shared reaction instead of a summary.
- theo/bee-dance r0: sigma-opus-low (clear). A slips into debate-partner mode twice with "Convince me you know what that changes" and "Make the case for why she'd bother switching dances," and nearly every turn has the same "Say you're X... tell me Y" shape; B stays playful and varied ("Give the round dance a better name," the would-you-rather, "The chill dance. That's it, that's the name now"), though its closing lines drift into recap-quiz territory.
- jules/bee-dance r0: sigma-opus-low (clear). A stays playful and on the article with real reactions of its own ('I'd still pick the dancing', 'I'd love to have seen the faces'), while B slides into 'Convince me' and 'Make the case' until the kid says 'why do i have to lol' twice, and the tutor even admits 'I've asked you to defend things three times in a row.'

## Weakest lines

### sigma-v1

- nico/octopus: It is weird. I picture blue blood and think of ink in a pen. Make up a reason you think an octopus would need three hearts.
- nico/lighthouse: Fair enough. If it were me, I'd make the last one longer instead of bigger, easier to spot from a boat. Something else I noticed: even a little soot on the glass made the whole light dimmer, so keepers cleaned it every single day.
- maya/lighthouse: Would you rather wind the weight up a hundred steps or go out on that walkway? Defend your pick.
- maya/bee-dance: Scientists still study this dance today, partly to protect flowers near hives. Convince me why bee directions would matter to people.
- theo/bee-dance: Convince me you know what that changes about your search.

### sigma-opus-low

- nico/octopus: That "ewwww" would get the whole lunch table. And it has three hearts too. Here's another weird one: no bones. Look around the room. Pick a spot an octopus could squeeze through.
- nico/lighthouse: A code is the right word for it. Sailors even had a list to look it up. Make up your own lighthouse code, like two quick flashes and a long one. Tap it out on the table.
- maya/lighthouse: The article doesn't say, but as far as I know most had a railing.
- maya/bee-dance: Now say she's waggling a little to the right of straight up the wall. You just flew out of the hive. Which way are you heading?
- theo/bee-dance: Your friend's fully set now: direction from the wiggle, distance from how long it lasts.

