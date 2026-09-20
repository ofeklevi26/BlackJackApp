export const RANKS = [
  "A",
  "2",
  "3",
  "4",
  "5",
  "6",
  "7",
  "8",
  "9",
  "10",
  "J",
  "Q",
  "K",
] as const;
export const SUITS = ["♠", "♥", "♦", "♣"] as const;
export type Rank = (typeof RANKS)[number];
export type Suit = (typeof SUITS)[number];
export type Card = { id: string; rank: Rank; suit: Suit };
export type Action = "hit" | "stand" | "double" | "split" | "surrender";
export type Category = "hard" | "soft" | "pairs";
export type Rules = { hitSoft17: boolean; surrender: boolean };
export const DEFAULT_RULES: Rules = { hitSoft17: false, surrender: true };
export const DEVIATION_RULES: Rules = { hitSoft17: false, surrender: false };
export type Scenario = {
  id: string;
  cards: Card[];
  dealer: Card;
  fromSplit: boolean;
  splitAces: boolean;
  handsCount: number;
  trueCount?: number;
};
export type Recommendation = {
  action: Action;
  explanation: string;
  reason?: string;
  baseline?: Action;
  source: string;
  index?: number;
};
export const STRATEGY_SOURCE =
  "https://wizardofodds.com/games/blackjack/strategy/4-decks/";
export const COUNT_SOURCE =
  "https://wizardofodds.com/games/blackjack/card-counting/high-low/";
export const SOURCE_METADATA = {
  basic: {
    url: STRATEGY_SOURCE,
    checked: "2026-09-20",
    scope:
      "Six decks, American peek, 3:2, DAS, up to four hands, one card per split ace, no ace resplit; S17/H17 with late surrender on/off. Total-dependent basic strategy, with pair priority.",
  },
  surrender: {
    url: "https://wizardofodds.com/games/blackjack/surrender/",
    checked: "2026-09-20",
    scope: "Six-deck late surrender, including H17 8+8 versus ace.",
  },
  deviations: {
    url: COUNT_SOURCE,
    checked: "2026-09-20",
    scope:
      "Six introductory Hi-Lo I18 decisions, six decks S17 without surrender. Not a complete index strategy. Floor the running-count/decks quotient; integral threshold comparisons are equivalent to comparing the unrounded quotient.",
  },
} as const;
