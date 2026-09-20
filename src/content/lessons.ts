import type { Rank } from "../engine/types";

export type ChoiceExercise = {
  kind: "choice";
  prompt: string;
  choices: { id: string; label: string }[];
  correctId: string;
  explanation: string;
};

export type StrategyExercise = {
  kind: "strategy";
  prompt: string;
  ranks: Rank[];
  dealer: Rank;
  trueCount?: number;
  countMode?: boolean;
  useDeviationRules?: boolean;
};

export type CountExercise = {
  kind: "count";
  prompt: string;
  ranks: Rank[];
  choices: number[];
};

export type LessonExercise = ChoiceExercise | StrategyExercise | CountExercise;

export type Lesson = {
  id: string;
  title: string;
  description: string;
  minutes: number;
  topic: string;
  keyIdea: string;
  paragraphs: string[];
  example: { title: string; text: string };
  guided: LessonExercise;
  quiz: LessonExercise;
};

export const LESSONS: Lesson[] = [
  {
    id: "table-basics",
    title: "Meet the table",
    description: "The goal, the dealer, and what makes a blackjack.",
    minutes: 2,
    topic: "mixed",
    keyIdea: "Beat the dealer without going over 21.",
    paragraphs: [
      "Number cards count as their number. Jacks, queens, and kings count as 10. An ace counts as 1 or 11, whichever gives the best total without busting.",
      "You choose your actions first. The dealer then follows fixed drawing rules. Tied totals usually push, returning the stake. Going over 21 loses immediately, even if the dealer later busts.",
    ],
    example: {
      title: "A total is not a result yet",
      text: "Your 19 beats a dealer 18. It loses to a dealer 20. If you both finish on 19, the hand pushes.",
    },
    guided: {
      kind: "choice",
      prompt: "You stand on 19. The dealer finishes on 18. What happens?",
      choices: [
        { id: "win", label: "You win" },
        { id: "push", label: "Push" },
        { id: "lose", label: "You lose" },
      ],
      correctId: "win",
      explanation:
        "Both totals are below 22, and 19 is higher than 18. Your hand wins.",
    },
    quiz: {
      kind: "choice",
      prompt: "Which hand is a natural blackjack?",
      choices: [
        { id: "natural", label: "An ace and a king, dealt first" },
        { id: "three", label: "Three sevens" },
        { id: "both", label: "Both hands" },
      ],
      correctId: "natural",
      explanation:
        "A natural blackjack is an ace plus a 10-value card in the first two cards of an unsplit hand. Three sevens make 21, but are not a natural blackjack.",
    },
  },
  {
    id: "hard-and-soft",
    title: "Read any hand",
    description: "Make aces, hard totals, and soft totals feel natural.",
    minutes: 3,
    topic: "soft",
    keyIdea: "A soft hand contains an ace currently counted as 11.",
    paragraphs: [
      "A soft hand has a cushion: its ace can fall from 11 to 1 if a new card would otherwise cause a bust. A hard hand has no ace that can currently count as 11.",
      "Recalculate after every card. An ace does not make a hand permanently soft, and multiple aces cannot all count as 11.",
    ],
    example: {
      title: "Watch the ace change jobs",
      text: "A + 6 is soft 17. Add a 9: counting the ace as 11 would give 26, so it becomes 1. The hand is now hard 16.",
    },
    guided: {
      kind: "choice",
      prompt: "A + 6 receives a 9. What is the new hand?",
      choices: [
        { id: "hard16", label: "Hard 16" },
        { id: "soft16", label: "Soft 16" },
        { id: "bust", label: "Bust: 26" },
      ],
      correctId: "hard16",
      explanation:
        "The ace becomes 1, so the total is 1 + 6 + 9 = 16. No ace can count as 11 without busting.",
    },
    quiz: {
      kind: "choice",
      prompt: "How do you read A + A + 8?",
      choices: [
        { id: "soft20", label: "Soft 20" },
        { id: "hard10", label: "Hard 10" },
        { id: "bust", label: "Bust: 30" },
      ],
      correctId: "soft20",
      explanation:
        "One ace counts as 11 and the other as 1. That gives 11 + 1 + 8 = 20, with an ace still valued at 11: soft 20.",
    },
  },
  {
    id: "hard-hands",
    title: "Build your strategy foundation",
    description: "Use your total and the dealer’s upcard together.",
    minutes: 3,
    topic: "hard",
    keyIdea:
      "Basic strategy chooses the strongest average decision for the active rules.",
    paragraphs: [
      "Start with your hand type, then find the dealer’s visible card. A dealer upcard changes the decision because it changes the dealer’s possible final outcomes.",
      "Learning strategy means judging the choice before the next card arrives. A good choice can lose one hand. A poor choice can win one hand.",
    ],
    example: {
      title: "Use the same question every time",
      text: "“What hand do I have, what is the dealer showing, and what do these rules allow?” Use the chart below to inspect the answer for any dealer upcard.",
    },
    guided: {
      kind: "strategy",
      prompt: "Try a hard 12 against a dealer 6.",
      ranks: ["10", "2"],
      dealer: "6",
    },
    quiz: {
      kind: "strategy",
      prompt: "Now decide with hard 16 against a dealer 10.",
      ranks: ["10", "6"],
      dealer: "10",
    },
  },
  {
    id: "soft-hands",
    title: "Use the flexibility of an ace",
    description: "Soft hands deserve their own strategy.",
    minutes: 3,
    topic: "soft",
    keyIdea: "A soft total and the same hard total can need different actions.",
    paragraphs: [
      "A soft hand cannot bust on its next single hit: the ace can drop to 1. That flexibility can make a hit or a double attractive where a hard hand would stand.",
      "Do not stop thinking at “I have 18.” Soft 18 is not played identically against every dealer upcard. Dealer soft-17 rules can also change some recommendations.",
    ],
    example: {
      title: "Soft 17 is a starting point",
      text: "A + 6 gives you 17 and room to improve. Compare the recommendation against different dealer upcards instead of treating it like 10 + 7.",
    },
    guided: {
      kind: "strategy",
      prompt: "Choose for A + 6 against a dealer 5.",
      ranks: ["A", "6"],
      dealer: "5",
    },
    quiz: {
      kind: "strategy",
      prompt: "Choose for soft 18 against a dealer 9.",
      ranks: ["A", "7"],
      dealer: "9",
    },
  },
  {
    id: "pairs",
    title: "Know when to split",
    description: "See two cards as two possible starting hands.",
    minutes: 3,
    topic: "pairs",
    keyIdea:
      "Check the pair decision before treating a pair as an ordinary total.",
    paragraphs: [
      "Splitting separates an eligible pair into two hands and adds another equal stake. Each hand then receives another card and is resolved separately.",
      "Splitting is not automatically better just because it creates more hands. The dealer upcard and rules matter. Split aces have special restrictions, and a 21 after a split is not a natural blackjack.",
    ],
    example: {
      title: "A pair has two identities",
      text: "8 + 8 is both a total of 16 and a pair of eights. The pair section tells you whether separating those cards is preferable.",
    },
    guided: {
      kind: "strategy",
      prompt: "Choose for a pair of eights against a dealer 6.",
      ranks: ["8", "8"],
      dealer: "6",
    },
    quiz: {
      kind: "strategy",
      prompt: "Choose for a pair of tens against a dealer 6.",
      ranks: ["10", "10"],
      dealer: "6",
    },
  },
  {
    id: "double-and-surrender",
    title: "Double and surrender with purpose",
    description: "Understand the commitment behind each action.",
    minutes: 3,
    topic: "hard",
    keyIdea:
      "A double buys exactly one more card. Surrender gives up half the original stake.",
    paragraphs: [
      "Doubling adds a stake equal to the original bet and commits you to one additional card. It belongs in favorable situations, not as a way to recover a previous loss.",
      "When late surrender is allowed, an eligible initial hand may be ended for a half-stake loss after dealer blackjack has been ruled out. Turning surrender off changes the best action in some difficult hands.",
    ],
    example: {
      title: "Use the actual options at the table",
      text: "The examples below use your current table rules. A surrender recommendation should never appear as an available action when that rule is disabled.",
    },
    guided: {
      kind: "strategy",
      prompt: "Choose for 11 against a dealer 6.",
      ranks: ["5", "6"],
      dealer: "6",
    },
    quiz: {
      kind: "strategy",
      prompt: "Choose for 16 against a dealer 10 under your current rules.",
      ranks: ["10", "6"],
      dealer: "10",
    },
  },
  {
    id: "hi-lo-tags",
    title: "Learn the Hi-Lo values",
    description: "Three groups turn exposed cards into information.",
    minutes: 3,
    topic: "count",
    keyIdea: "2–6: +1. 7–9: 0. Tens, face cards, and aces: −1.",
    paragraphs: [
      "Hi-Lo tracks the balance of low and high cards that have already appeared. Start at zero after a shuffle, then add each newly exposed card’s value exactly once.",
      "Use exposed cards from every seat and the dealer. A face-down card contributes nothing until you can see it. You are tracking a changing mix, not predicting the next card.",
    ],
    example: {
      title: "Two cards can cancel",
      text: "A 5 contributes +1 and a king contributes −1. Together they change the running count by zero. An 8 also changes it by zero.",
    },
    guided: {
      kind: "count",
      prompt: "Reveal each card and watch the Hi-Lo values add up.",
      ranks: ["2", "5", "9", "K", "A"],
      choices: [-2, 0, 2],
    },
    quiz: {
      kind: "choice",
      prompt: "A queen is exposed. What do you add to the running count?",
      choices: [
        { id: "minus", label: "−1" },
        { id: "zero", label: "0" },
        { id: "plus", label: "+1" },
      ],
      correctId: "minus",
      explanation:
        "A queen is a 10-value card. Hi-Lo assigns −1 to tens, jacks, queens, kings, and aces.",
    },
  },
  {
    id: "running-count",
    title: "Keep a running count",
    description: "Carry one number through a stream of cards.",
    minutes: 4,
    topic: "count",
    keyIdea:
      "Carry the count across hands. Reset it when the shoe is shuffled.",
    paragraphs: [
      "Update your running count as cards become visible. When a hand ends, keep the current count for the next hand in the same shoe.",
      "Go slowly enough to stay accurate. Speed follows repetition. If you lose your place during practice, review the exposed sequence and rebuild the count.",
    ],
    example: {
      title: "One number, many hands",
      text: "Starting at zero, a 3 makes the count +1. A 7 leaves it at +1. An ace brings it back to zero. The running count continues from there.",
    },
    guided: {
      kind: "count",
      prompt: "Start at zero and follow this six-card sequence.",
      ranks: ["5", "K", "3", "8", "A", "6"],
      choices: [-1, 0, 1, 2],
    },
    quiz: {
      kind: "count",
      prompt: "Count this new sequence from zero. Keep the total yourself.",
      ranks: ["2", "4", "9", "J", "A", "6"],
      choices: [-1, 0, 1, 2],
    },
  },
  {
    id: "true-count",
    title: "Adjust for the remaining shoe",
    description: "Turn a running count into a true count.",
    minutes: 3,
    topic: "true-count",
    keyIdea: "True count = running count ÷ estimated decks remaining.",
    paragraphs: [
      "The same running count means more when fewer cards remain. Divide by decks remaining in the shoe, not the original number of decks and not the decks already dealt.",
      "Estimate the remaining shoe consistently. This trainer floors the quotient toward negative infinity: +1.5 becomes +1, while −0.5 becomes −1. Use that same convention when comparing the count to a deviation index.",
    ],
    example: {
      title: "The denominator matters",
      text: "A running count of +6 with 3 decks remaining gives a true count of +2. With only 2 decks remaining, the same running count gives +3.",
    },
    guided: {
      kind: "choice",
      prompt: "Running count +6. Three decks remain. What is the true count?",
      choices: [
        { id: "one", label: "+1" },
        { id: "two", label: "+2" },
        { id: "three", label: "+3" },
      ],
      correctId: "two",
      explanation: "+6 ÷ 3 = +2. The divisor is the number of decks remaining.",
    },
    quiz: {
      kind: "choice",
      prompt:
        "Running count −1. Two decks remain. What integer true count does this trainer use?",
      choices: [
        { id: "minus1", label: "−1" },
        { id: "zero", label: "0" },
        { id: "minus2", label: "−2" },
      ],
      correctId: "minus1",
      explanation:
        "−1 ÷ 2 = −0.5. Floor toward negative infinity to get −1, not 0. This trainer keeps that convention consistent in drills and count-based decisions.",
    },
  },
  {
    id: "count-aware-play",
    title: "Put the skills together",
    description: "Use a repeatable routine and review your decisions.",
    minutes: 3,
    topic: "deviations",
    keyIdea:
      "Learn basic strategy first, then use supported count-based deviations.",
    paragraphs: [
      "A deviation changes a specific basic-strategy action once a specified count threshold is reached. It depends on the counting system, table rules, and index convention. A positive count is not a general instruction to stand or double.",
      "Your routine is: identify the hand, read the dealer upcard, check the available actions, then apply a supported deviation if the count calls for it. Review decision quality separately from whether the hand won.",
    ],
    example: {
      title: "Keep the feedback honest",
      text: "If you follow the recommended action and lose, the decision is still correct. Your session accuracy measures choices; simulated winnings measure outcomes, which can swing in a short session.",
    },
    guided: {
      kind: "strategy",
      prompt:
        "Try hard 12 against a dealer 3 at true count +2. This example uses the supported S17, surrender-off deviation preset.",
      ranks: ["10", "2"],
      dealer: "3",
      trueCount: 2,
      countMode: true,
      useDeviationRules: true,
    },
    quiz: {
      kind: "choice",
      prompt:
        "You made the recommended decision, then lost the hand. How should the trainer score the decision?",
      choices: [
        { id: "wrong", label: "Incorrect, because the hand lost" },
        { id: "correct", label: "Correct, regardless of the result" },
        { id: "ignore", label: "Remove it from the statistics" },
      ],
      correctId: "correct",
      explanation:
        "The next card does not change the quality of the earlier decision. Count it as correct and keep the hand’s result in the separate outcome statistics.",
    },
  },
];

export const LESSON_REVIEW_MS = 7 * 24 * 60 * 60 * 1000;
export function getDueLessons(
  completed: Record<string, number>,
  now = Date.now(),
): Lesson[] {
  return LESSONS.filter(
    (lesson) =>
      completed[lesson.id] > 0 &&
      now - completed[lesson.id] >= LESSON_REVIEW_MS,
  ).sort((a, b) => completed[a.id] - completed[b.id]);
}

export const GLOSSARY = [
  {
    term: "Upcard",
    definition:
      "The dealer’s visible card. Use it with your hand type to choose an action.",
  },
  {
    term: "Hole card",
    definition:
      "A dealer card dealt face down. Do not count it until it is exposed.",
  },
  {
    term: "Hard hand",
    definition: "A hand with no ace currently valued at 11.",
  },
  {
    term: "Soft hand",
    definition: "A hand with an ace currently valued at 11.",
  },
  {
    term: "Natural blackjack",
    definition:
      "An ace and a 10-value card in the first two cards of an unsplit hand.",
  },
  {
    term: "Push",
    definition:
      "A tie that returns the stake, subject to the table’s blackjack rules.",
  },
  {
    term: "Double after split",
    definition:
      "A rule allowing eligible split hands to be doubled. Often shortened to DAS.",
  },
  {
    term: "Late surrender",
    definition:
      "Giving up an eligible original hand for a half-stake loss after dealer blackjack has been ruled out.",
  },
  {
    term: "Shoe",
    definition:
      "The collection of shuffled decks being dealt. The running count persists until the next shuffle.",
  },
  {
    term: "Running count",
    definition:
      "The cumulative sum of the Hi-Lo values of exposed cards since the shuffle.",
  },
  {
    term: "True count",
    definition:
      "Running count divided by the estimated number of decks remaining.",
  },
  {
    term: "Penetration",
    definition: "How much of the shoe is dealt before the next shuffle.",
  },
  {
    term: "Index / deviation",
    definition:
      "A count threshold used to change a particular basic-strategy action under specified rules.",
  },
  {
    term: "Expected value",
    definition:
      "An action’s average result over many repetitions. It is not a promise about the current hand.",
  },
];
