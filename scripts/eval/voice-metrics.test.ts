import assert from "node:assert/strict";
import { voiceMetrics } from "./voice-metrics";

// A dry transcript from the live site, 6 Nov 2026 (Sonnet 5.5, thinking off)
const dry = [
  "Right, old wires doing a brand new job. I wonder if the people who built them ever pictured solar panels. Tell me why you think reusing them was a good idea.",
  "Saving money is a smart guess. The article says coal went from about 75 percent of Utah's power to about half. Tell me why you think that change matters for the valley.",
  "Using less coal and making less pollution, those two go together. The batteries are my favorite part, since panels only work in sun. Tell me why you think they matter so much.",
  "Without batteries, solar would be like a bakery that only has power at noon. Picture a cloudy week in Utah and tell me what you think the plant does.",
];
{
  const m = voiceMetrics(dry);
  assert.equal(m.messages, 4);
  assert.equal(m.tellMe, 1, "every message says tell me");
  assert.equal(m.grading, 0.25, "'smart guess' is a grader's remark");
  assert.equal(m.exclaim, 0);
  assert.equal(m.repeatMove, 0.5, "'tell me' moves on turns 2 and 3 repeat the one before");
  console.log("✅ dry transcript measures dry");
}

// A livelier set
const lively = [
  "Okay, I did not know bread is puffy because tiny living things are burping inside it. That changes how I look at a sandwich. Tell me the part that got you.",
  "Same, I had the oven getting all the credit. Here's what I keep wondering: people made bread for thousands of years without knowing yeast existed. Make a guess at how they figured it out.",
  "A happy accident they kept repeating, I buy that. Now take the yeast out. Walk me through what happens to the loaf.",
  "A cracker is exactly where I landed too! I'd rather have the cracker than the sad flat loaf, honestly. Convince me the fluffy kind is better.",
];
{
  const m = voiceMetrics(lively);
  assert.equal(m.tellMe, 0.25);
  assert.equal(m.grading, 0);
  assert.equal(m.repeatMove, 0, "every move verb differs from the one before");
  assert.equal(m.exclaim, 0.25);
  assert.equal(m.repeatOpener, 0.5, "two messages open with A");
  console.log("✅ lively transcript measures lively");
}

// Grading phrases
{
  for (const line of ["That's a good way to put it. Now pick one.", "You put the two together nicely.", "Good catch, thousands of years is a long time.", "Your point that families can still buy treats is a clear way to split that debate."]) {
    assert.equal(voiceMetrics([line]).grading, 1, line);
  }
  for (const line of ["Two months with no snacks. I'd be so grumpy.", "Fish on the brain. The huddle part is my favorite."]) {
    assert.equal(voiceMetrics([line]).grading, 0, line);
  }
  console.log("✅ grader's remarks are spotted");
}

{
  const m = voiceMetrics([]);
  assert.equal(m.messages, 0);
  console.log("✅ empty transcript is safe");
}
