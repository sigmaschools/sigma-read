const welcomeArticles: Record<number, { bodyText: string; wordCount: number }> = {
  1: {
    bodyText: `# Welcome to SigmaRead

SigmaRead picks articles just for you. When you told us what you like, we listened! Now we find fun things for you to read about those topics.

Here is how it works. First, you pick an article from your list. Read it at your own speed. There is no timer, so take your time.

When you are done reading, you will have a chat about what you read. This is not a test! The article stays open so you can look back at it any time. Just tell us what you think. There are no wrong answers.

The more you read, the better we get at finding articles you will love. If you like an article, we will find more like it. If you do not like one, that is fine too. Just be honest.

You are all set. Go back and pick your first article. Have fun reading!`,
    wordCount: 148,
  },
  2: {
    bodyText: `# Welcome to SigmaRead

SigmaRead finds articles based on the interests you shared with us. Every day, you will see a fresh set of articles picked just for you.

Here is how a reading session works. First, choose an article from your list. Read through it at your own pace — there is no time limit. When you finish reading, you will have a short discussion about the article.

The discussion is not a quiz or a test. The article stays open the whole time, so you can always look back at it. We just want to hear what you think and what stood out to you. There are no wrong answers.

Over time, SigmaRead learns what kinds of topics you enjoy. The more you read and share your thoughts, the better your articles will get. If something interests you, we will find more like it. If something does not, that is totally okay — just be honest about what you think.

You are ready to go! Head back and pick your first article to read.`,
    wordCount: 172,
  },
  3: {
    bodyText: `# Welcome to SigmaRead

SigmaRead is built around your interests. Based on what you told us you enjoy, we find articles on topics that match — and sometimes introduce new ones we think you might like.

Here is how reading sessions work. You will see a list of articles waiting for you. Pick one that catches your eye and read through it at your own pace. There is no timer and no rush. When you are finished reading, you will have a conversation about the article with an AI tutor.

This conversation is not a test or a quiz. The article stays visible the entire time, so you can refer back to it whenever you want. The goal is simply to think about what you read and share your perspective. There are no trick questions and no wrong answers. Sometimes the tutor will ask you to think a little deeper or consider a different angle, but that is all part of the process.

The more you use SigmaRead, the better it gets at finding articles you will enjoy. Your feedback matters — if you like an article, we will find similar ones. If something does not interest you, that is useful information too. Being honest about your reactions helps us pick better articles for you.

Ready to start? Go ahead and choose your first article from the list.`,
    wordCount: 213,
  },
  4: {
    bodyText: `# Welcome to SigmaRead

SigmaRead uses the interests you shared to curate a personalized reading feed. Each day, you will find articles selected to match your curiosity — along with occasional new topics that might spark your interest.

Here is how the experience works. Your home page shows a selection of articles. Choose one that appeals to you and read through it at your own pace. There is no time limit, so you are free to take as long as you need. Once you have finished reading, a conversation about the article will begin.

This conversation is not a test. It is a discussion. The article remains visible the entire time, so you can reference specific details whenever you like. An AI tutor will ask you questions about what you read — not to grade you, but to help you think more deeply about the material. Sometimes it might ask you to consider a different perspective or connect ideas from different parts of the article. Your honest reactions and thoughts are what matter most.

Over time, SigmaRead adapts to you. The system tracks what kinds of topics engage you and adjusts your article feed accordingly. Articles you enjoy lead to more like them. Articles that do not resonate help us recalibrate. The key is being genuine in your responses — that feedback loop is what makes the experience work.

One more thing: the reading levels adjust too. As you progress, articles will gradually become more challenging. This happens naturally based on your conversations, so you do not need to worry about it.

Pick your first article and dive in.`,
    wordCount: 245,
  },
  5: {
    bodyText: `# Welcome to SigmaRead

SigmaRead is a personalized reading platform that curates articles based on the interests you shared during setup. Rather than assigning generic material, it builds a feed tailored to what you actually care about — while periodically introducing adjacent topics you might find compelling.

Here is how reading sessions work. Your home page presents a curated selection of articles. Choose whichever one catches your attention and read through it at your own pace. There are no time constraints. Once you have finished, you will enter a discussion about the article with an AI tutor.

It is important to understand what this discussion is and what it is not. It is not a quiz, a comprehension test, or an evaluation. The article remains fully visible throughout the conversation, so you can reference any section at any time. The tutor's role is to engage you in genuine dialogue about the material — asking you to articulate your thinking, consider alternative viewpoints, or draw connections between ideas. Your honest reactions are far more valuable than trying to say the "right" thing.

The system improves through your engagement. SigmaRead tracks which topics generate genuine interest and which ones fall flat, then adjusts future article selections accordingly. This feedback loop depends on authentic responses. If an article fascinates you, say so. If it bores you, that is equally useful information. Over time, this creates an increasingly accurate profile of your intellectual interests.

There is also an adaptive difficulty component working in the background. Based on how your discussions progress, the reading level of your articles adjusts gradually. You do not need to think about this — it happens organically as you engage with the material.

The best way to get started is simply to pick an article that interests you and begin reading.`,
    wordCount: 272,
  },
  6: {
    bodyText: `# Welcome to SigmaRead

SigmaRead is a personalized reading platform that constructs an individualized article feed based on the intellectual interests you identified during onboarding. Rather than offering a standardized curriculum, it dynamically curates content aligned with your specific curiosities — while strategically introducing adjacent topics designed to broaden your engagement.

Here is how the reading experience is structured. Your home page displays a curated selection of articles drawn from current events, your stated interests, and exploratory topics. Select whichever article appeals to you and read it at whatever pace feels natural. There are no time constraints or pacing requirements. Upon completing an article, you will transition into a discussion facilitated by an AI tutor.

A critical distinction: this discussion is not an assessment. It is a genuine intellectual conversation. The article remains fully accessible throughout the dialogue, allowing you to reference specific passages, data points, or arguments at any time. The tutor's objective is to engage you in substantive thinking — prompting you to articulate your analysis, evaluate competing perspectives, identify underlying assumptions, or synthesize ideas across different sections. Attempting to produce "correct" answers is counterproductive. What matters is authentic engagement with the material.

SigmaRead's recommendation engine relies on the authenticity of your engagement. The system analyzes which topics sustain your interest, which article types generate the most thoughtful discussions, and which subjects consistently fail to resonate. This information continuously refines your feed. Genuine responses — whether enthusiastic, critical, or ambivalent — are all valuable data points. Performative engagement, by contrast, degrades the system's ability to serve you effectively.

An adaptive difficulty mechanism also operates in the background. Based on the depth and sophistication of your discussion contributions, the complexity of your articles adjusts incrementally. This calibration is designed to keep you in a productive challenge zone — material that stretches your comprehension without becoming frustrating. The process is automatic and requires no action on your part.

Select your first article from the list and begin.`,
    wordCount: 296,
  },
};

export function getWelcomeArticle(level: number): {
  title: string;
  topic: string;
  bodyText: string;
  category: string;
  estimatedReadTime: number;
  wordCount: number;
} {
  const clampedLevel = Math.max(1, Math.min(6, level));
  const article = welcomeArticles[clampedLevel];
  return {
    title: "Welcome to SigmaRead",
    topic: "tutorial",
    bodyText: article.bodyText,
    category: "tutorial",
    estimatedReadTime: Math.max(1, Math.round(article.wordCount / 200)),
    wordCount: article.wordCount,
  };
}
