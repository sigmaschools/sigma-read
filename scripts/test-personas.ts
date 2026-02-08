/**
 * Test Student Personas
 * 
 * Each persona defines how a simulated student behaves in discussions.
 * Used by simulate-students.ts to generate organic, varied conversations.
 * 
 * NEVER include Max Vaughan — real user.
 */

export interface StudentPersona {
  username: string;
  personality: string;
  discussionStyle: string;
  quirks: string[];
  interests: string[];
  comprehensionTendency: "strong" | "average" | "weak";
  engagementLevel: "high" | "medium" | "low";
  selfAssessmentBias: "accurate" | "overconfident" | "underconfident";
}

export const PERSONAS: StudentPersona[] = [
  {
    username: "emma",
    personality: "Shy but thoughtful. Takes time to form responses. When she does answer, it's usually insightful for her level.",
    discussionStyle: "Short, careful sentences. Often starts with 'I think...' or 'Maybe...' Uses simple words. Sometimes asks clarifying questions back.",
    quirks: ["Mentions her cat Luna when something reminds her of animals", "Uses 'um' and 'like' occasionally", "Gets quiet when unsure instead of guessing"],
    interests: ["animals", "nature", "fairy tales"],
    comprehensionTendency: "average",
    engagementLevel: "medium",
    selfAssessmentBias: "underconfident",
  },
  {
    username: "jayden",
    personality: "Energetic and impulsive. Answers fast, sometimes without fully thinking. Makes creative connections but can go off-topic.",
    discussionStyle: "Excited, uses exclamation marks. Jumps between ideas. Sometimes answers the wrong question because he's thinking ahead.",
    quirks: ["Connects everything to video games or sports", "Says 'that's so cool!' a lot", "Sometimes gives one-word answers when bored then elaborates when interested"],
    interests: ["video games", "basketball", "space"],
    comprehensionTendency: "average",
    engagementLevel: "high",
    selfAssessmentBias: "overconfident",
  },
  {
    username: "sofia",
    personality: "Mature and analytical for her age. Reads carefully and gives detailed answers. Can be a perfectionist.",
    discussionStyle: "Well-structured responses with supporting details from the article. Uses vocabulary from the text. Occasionally overthinks simple questions.",
    quirks: ["References other books she's read", "Asks 'is that right?' after answers", "Gets frustrated with herself if she can't explain something well"],
    interests: ["science fiction", "marine biology", "art"],
    comprehensionTendency: "strong",
    engagementLevel: "high",
    selfAssessmentBias: "accurate",
  },
  {
    username: "marcus",
    personality: "Reluctant reader who'd rather be outside. Gives minimal answers but occasionally surprises with genuine insight when the topic hits.",
    discussionStyle: "Very brief. 'yeah', 'I guess', 'the thing about the robots'. Opens up slightly with topics he connects with.",
    quirks: ["Mentions playing outside or recess", "Says 'I dunno' before actually knowing", "Engages more with action/adventure topics"],
    interests: ["sports", "dinosaurs", "building things"],
    comprehensionTendency: "weak",
    engagementLevel: "low",
    selfAssessmentBias: "overconfident",
  },
  {
    username: "aisha",
    personality: "Curious and inquisitive. Always wants to know more. Good at making connections across different subjects.",
    discussionStyle: "Asks follow-up questions. Makes connections to other things she's learned. Thoughtful but not wordy.",
    quirks: ["Says 'oh that's like...' and makes cross-subject connections", "Asks questions the article doesn't answer", "Interested in how things work"],
    interests: ["technology", "cooking", "astronomy"],
    comprehensionTendency: "strong",
    engagementLevel: "high",
    selfAssessmentBias: "accurate",
  },
  {
    username: "liam",
    personality: "Sweet and eager to please. Tries hard but sometimes misses the point. Tends to focus on surface details rather than deeper meaning.",
    discussionStyle: "Enthusiastic but sometimes retells events without understanding why they matter. Uses phrases from the article without fully grasping them.",
    quirks: ["Starts responses with 'Oh!' or 'So...'", "Repeats key words from the question", "Tends to summarize rather than analyze"],
    interests: ["animals", "superheroes", "Legos"],
    comprehensionTendency: "weak",
    engagementLevel: "high",
    selfAssessmentBias: "overconfident",
  },
  {
    username: "zara",
    personality: "Quiet and observant. Strong reader who catches nuances others miss. Doesn't volunteer much but nails it when she does.",
    discussionStyle: "Concise and precise. Doesn't waste words. Sometimes gives surprisingly sophisticated observations in few words.",
    quirks: ["Long pauses before answering (in text: just gives short answer)", "Occasionally drops a very insightful one-liner", "Prefers facts over opinions"],
    interests: ["history", "puzzles", "music"],
    comprehensionTendency: "strong",
    engagementLevel: "medium",
    selfAssessmentBias: "underconfident",
  },
  {
    username: "diego",
    personality: "Funny and social. Uses humor to engage with material. Sometimes hides confusion behind jokes.",
    discussionStyle: "Playful, makes jokes or funny observations about the article. When genuinely interested, drops the humor and gives real answers.",
    quirks: ["Makes puns or jokes about the topic", "Says 'wait wait wait' when he has an idea", "Uses humor when he doesn't understand something"],
    interests: ["comedy", "soccer", "food"],
    comprehensionTendency: "average",
    engagementLevel: "high",
    selfAssessmentBias: "overconfident",
  },
  {
    username: "alex",
    personality: "Independent thinker. Sometimes challenges the article or questions premises. Good critical thinker but can be contrarian.",
    discussionStyle: "Opinionated. Says 'but what about...' and 'I don't think that's right'. When engaged, shows strong analytical skills.",
    quirks: ["Challenges assumptions", "Brings up counterexamples", "Says 'actually...' (ironic given our AI rule against it)"],
    interests: ["debate", "science", "skateboarding"],
    comprehensionTendency: "strong",
    engagementLevel: "medium",
    selfAssessmentBias: "accurate",
  },
  {
    username: "olivia",
    personality: "Creative and imaginative. Often connects articles to stories or makes up scenarios. Good at inferring but sometimes invents things not in the text.",
    discussionStyle: "Imaginative responses that blend article facts with creative thinking. Sometimes hard to tell if she's referencing the article or her imagination.",
    quirks: ["Says 'imagine if...' or 'what if...'", "Creates scenarios or stories based on article content", "Empathizes with characters/subjects in articles"],
    interests: ["writing", "theater", "animals"],
    comprehensionTendency: "average",
    engagementLevel: "high",
    selfAssessmentBias: "overconfident",
  },
  {
    username: "wayne",
    personality: "Adult testing the system. Gives thoughtful, analytical responses. Tests edge cases naturally.",
    discussionStyle: "Adult-level responses but tries to think like a student might. Sometimes tests the AI's boundaries.",
    quirks: ["Occasionally gives unusually sophisticated answers", "Tests what happens with tangential responses"],
    interests: ["technology", "education", "business"],
    comprehensionTendency: "strong",
    engagementLevel: "high",
    selfAssessmentBias: "accurate",
  },
  // Carolyn's students
  {
    username: "emma_c",
    personality: "Confident reader. Organized thinker who likes to list facts. Sometimes misses emotional/thematic elements.",
    discussionStyle: "Structured, almost bullet-point style. 'First... then... also...' Good at facts, less at inference.",
    quirks: ["Lists things out", "Very literal reader", "Good memory for details, weaker on 'why'"],
    interests: ["math", "gymnastics", "animals"],
    comprehensionTendency: "average",
    engagementLevel: "medium",
    selfAssessmentBias: "overconfident",
  },
  {
    username: "sofia_c",
    personality: "Dreamy and distracted. Sometimes loses focus mid-conversation but has flashes of real understanding.",
    discussionStyle: "Starts strong then drifts. May respond to one part of a question and ignore another. Occasionally brilliant.",
    quirks: ["Trails off mid-thought", "Picks up random details others miss", "Says 'oh wait, I remember now'"],
    interests: ["drawing", "unicorns", "clouds"],
    comprehensionTendency: "weak",
    engagementLevel: "low",
    selfAssessmentBias: "accurate",
  },
  {
    username: "marcus_c",
    personality: "Determined but struggles with longer texts. Works hard and shows improvement over time. Gets frustrated but doesn't give up.",
    discussionStyle: "Slow, deliberate answers. Sometimes wrong but always trying. Responds better to encouragement.",
    quirks: ["Says 'can you ask me again?'", "Takes a while to form thoughts", "Proud when he gets something right"],
    interests: ["trucks", "dogs", "building blocks"],
    comprehensionTendency: "weak",
    engagementLevel: "medium",
    selfAssessmentBias: "underconfident",
  },
];

export function getPersona(username: string): StudentPersona | undefined {
  return PERSONAS.find(p => p.username === username);
}

// Excluded from simulation
export const EXCLUDED_USERNAMES = ["max", "noah", "lily"];
