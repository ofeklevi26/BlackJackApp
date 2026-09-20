import { cardValue, handValue, trueCount } from "./cards";
import {
  Action,
  Category,
  COUNT_SOURCE,
  DEFAULT_RULES,
  Recommendation,
  Rules,
  Scenario,
  STRATEGY_SOURCE,
} from "./types";

export function category(scenario: Scenario): Category {
  if (
    scenario.cards.length === 2 &&
    cardValue(scenario.cards[0]) === cardValue(scenario.cards[1])
  )
    return "pairs";
  return handValue(scenario.cards).soft ? "soft" : "hard";
}

/** Scenario decisions occur after the dealer has checked for blackjack. */
export function legalActions(
  scenario: Scenario,
  rules: Rules = DEFAULT_RULES,
): Action[] {
  if (scenario.splitAces || handValue(scenario.cards).total >= 21)
    return ["stand"];
  const actions: Action[] = ["hit", "stand"];
  if (scenario.cards.length === 2) {
    actions.push("double");
    if (category(scenario) === "pairs" && scenario.handsCount < 4)
      actions.push("split");
    if (rules.surrender && !scenario.fromSplit) actions.push("surrender");
  }
  return actions;
}

export function actionRestriction(
  action: Action,
  scenario: Scenario,
  rules: Rules = DEFAULT_RULES,
): string | null {
  if (legalActions(scenario, rules).includes(action)) return null;
  if (scenario.splitAces)
    return "Each split ace gets one additional card, then stands.";
  if (handValue(scenario.cards).total >= 21)
    return "This hand is already complete.";
  if (action === "double")
    return "Double is available on the first two cards only, including after a split.";
  if (action === "surrender")
    return !rules.surrender
      ? "Late surrender is turned off for these rules."
      : "Late surrender is only available on the original two-card hand after the dealer checks.";
  if (action === "split")
    return scenario.handsCount >= 4
      ? "This round has reached the limit of four hands."
      : "Split requires two cards of the same value.";
  return "This action is unavailable.";
}

function basicAction(scenario: Scenario, rules: Rules): Action {
  const { total, soft } = handValue(scenario.cards);
  const up = cardValue(scenario.dealer);
  const legal = legalActions(scenario, rules);
  if (scenario.splitAces || total >= 21) return "stand";
  const pair =
    category(scenario) === "pairs" ? cardValue(scenario.cards[0]) : null;

  // Late surrender precedes splitting, including H17 8,8 versus an ace.
  if (legal.includes("surrender") && !soft) {
    if (total === 16 && pair !== 8 && up >= 9) return "surrender";
    if (total === 15 && up === 10) return "surrender";
    if (rules.hitSoft17 && up === 11 && [15, 16, 17].includes(total))
      return "surrender";
  }
  if (pair !== null && legal.includes("split")) {
    if (pair === 11 || pair === 8) return "split";
    if ((pair === 2 || pair === 3 || pair === 7) && up <= 7) return "split";
    if (pair === 4 && (up === 5 || up === 6)) return "split";
    if (pair === 6 && up <= 6) return "split";
    if (pair === 9 && (up <= 6 || up === 8 || up === 9)) return "split";
  }
  const canDouble = legal.includes("double");
  if (soft) {
    let double = false;
    if (total === 13 || total === 14) double = up >= 5 && up <= 6;
    if (total === 15 || total === 16) double = up >= 4 && up <= 6;
    if (total === 17) double = up >= 3 && up <= 6;
    if (total === 18) double = up >= (rules.hitSoft17 ? 2 : 3) && up <= 6;
    if (total === 19) double = rules.hitSoft17 && up === 6;
    if (double && canDouble) return "double";
    if (total >= 19 || (total === 18 && up <= 8)) return "stand";
    return "hit";
  }
  if (canDouble) {
    if (total === 9 && up >= 3 && up <= 6) return "double";
    if (total === 10 && up <= 9) return "double";
    if (total === 11 && (up !== 11 || rules.hitSoft17)) return "double";
  }
  if (total >= 17) return "stand";
  if (total >= 13 && up <= 6) return "stand";
  if (total === 12 && up >= 4 && up <= 6) return "stand";
  return "hit";
}

export const DEVIATIONS: readonly {
  total: number;
  dealer: number;
  index: number;
  action: Action;
  label: string;
}[] = [
  { total: 16, dealer: 10, index: 0, action: "stand", label: "Hard 16 vs 10" },
  { total: 15, dealer: 10, index: 4, action: "stand", label: "Hard 15 vs 10" },
  { total: 12, dealer: 3, index: 2, action: "stand", label: "Hard 12 vs 3" },
  { total: 12, dealer: 2, index: 3, action: "stand", label: "Hard 12 vs 2" },
  { total: 10, dealer: 10, index: 4, action: "double", label: "Hard 10 vs 10" },
  {
    total: 11,
    dealer: 11,
    index: 1,
    action: "double",
    label: "Hard 11 vs ace",
  },
];

const capital = (value: string) =>
  value.charAt(0).toUpperCase() + value.slice(1);
function explain(action: Action, scenario: Scenario, rules: Rules): string {
  const { total, soft } = handValue(scenario.cards);
  const dealer =
    scenario.dealer.rank === "A"
      ? "an ace"
      : String(cardValue(scenario.dealer));
  const hand = `${soft ? "soft" : "hard"} ${total}`;
  const rulesName = `six-deck ${rules.hitSoft17 ? "H17" : "S17"}`;
  if (scenario.splitAces)
    return "The split-ace rule gives this hand one additional card. It must now stand; a split 21 pays 1:1.";
  if (total >= 21)
    return "This hand is complete. No further playing decision is needed.";
  if (action === "surrender")
    return `Surrender ${hand} against ${dealer} under ${rulesName} rules. Giving up half the original bet has a better long-run expectation than continuing this hand. Late surrender happens after the dealer checks for blackjack.`;
  if (action === "split") {
    const rank = scenario.cards[0].rank;
    return `Split the ${rank === "A" ? "aces" : `${rank}s`} against ${dealer}. Playing two separate starting hands is stronger on average than keeping ${hand} together. Each hand has its own bet; doubling after splitting is allowed${rank === "A" ? ", but each ace receives only one extra card" : ""}.`;
  }
  if (action === "double")
    return `Double ${hand} against ${dealer} under ${rulesName} rules. This is a favorable spot to increase the bet for exactly one additional card${soft ? "; the flexible ace reduces the risk of busting on that card" : ""}. The recommendation is based on long-run results, not the next hidden card.`;
  if (action === "stand") {
    if (
      soft &&
      total === 18 &&
      scenario.cards.length > 2 &&
      cardValue(scenario.dealer) >= (rules.hitSoft17 ? 2 : 3) &&
      cardValue(scenario.dealer) <= 6
    )
      return `Stand on soft 18 against ${dealer}. Doubling would be preferred with two cards, but this hand has already hit. Preserve 18 when double is unavailable.`;
    if (total >= 17)
      return `Stand on ${hand} against ${dealer}. Keeping this made hand has a better long-run expectation than taking another card under ${rulesName} rules.`;
    return `Stand on ${hand} against ${dealer}. The dealer's weak upcard makes preserving your hand better on average than taking the risk of busting first.`;
  }
  if (soft)
    return `Hit ${hand} against ${dealer}. The ace can fall from 11 to 1, so this soft hand cannot bust on one hit. Improve the total${scenario.cards.length > 2 ? "; doubling is unavailable after hitting" : ""}.`;
  return `Hit ${hand} against ${dealer}. ${total <= 11 ? "Another card cannot bust this hand, and the total needs improvement." : "Standing is weaker on average in this matchup, even though another card can bust."}${scenario.cards.length > 2 ? " This hand has already hit, so doubling and surrender are unavailable." : !rules.surrender && total >= 15 && cardValue(scenario.dealer) >= 9 ? " Surrender is unavailable in this ruleset." : ""}`;
}

export function recommend(
  scenario: Scenario,
  rules: Rules = DEFAULT_RULES,
  countMode = false,
): Recommendation {
  const baseline = basicAction(scenario, rules);
  if (
    countMode &&
    !rules.hitSoft17 &&
    !rules.surrender &&
    Number.isFinite(scenario.trueCount)
  ) {
    const value = handValue(scenario.cards);
    const deviation =
      !value.soft &&
      category(scenario) !== "pairs" &&
      DEVIATIONS.find(
        (item) =>
          item.total === value.total &&
          item.dealer === cardValue(scenario.dealer),
      );
    if (deviation && legalActions(scenario, rules).includes(deviation.action)) {
      const action =
        scenario.trueCount! >= deviation.index ? deviation.action : "hit";
      const boundary = `${deviation.index >= 0 ? "+" : ""}${deviation.index}`;
      return {
        action,
        baseline,
        index: deviation.index,
        source: COUNT_SOURCE,
        explanation: `${deviation.label}: ${deviation.action} at true count ${boundary} or higher; hit below it. The supplied true count is ${scenario.trueCount}. Basic strategy recommends ${baseline}. This is one of the six verified S17, no-surrender deviations taught here.`,
        reason: `${capital(action)} because the count is ${scenario.trueCount! >= deviation.index ? "at or above" : "below"} the ${boundary} index.`,
      };
    }
  }
  return {
    action: baseline,
    baseline: countMode ? baseline : undefined,
    source: STRATEGY_SOURCE,
    explanation: explain(baseline, scenario, rules),
    reason: countMode
      ? "Basic strategy applies: no supported deviation matches this hand and ruleset."
      : undefined,
  };
}

export type InsuranceRecommendation = {
  take: boolean;
  explanation: string;
  source: string;
  index?: number;
  trueCount?: number;
};

/** Call before the dealer peek using only exposed cards, never the hole card. */
export function insuranceRecommendation(
  running: number,
  remainingDecks: number,
  countMode = false,
): InsuranceRecommendation {
  if (!countMode)
    return {
      take: false,
      source: STRATEGY_SOURCE,
      explanation:
        "Decline insurance in basic strategy. It is a separate wager on dealer blackjack; the strength of your own hand does not change this recommendation. A winning result would not make taking insurance the correct basic-strategy decision.",
    };
  const count = trueCount(running, remainingDecks);
  return {
    take: count >= 3,
    source: COUNT_SOURCE,
    index: 3,
    trueCount: count,
    explanation: `The introductory Hi-Lo insurance index is +3: take insurance at +3 or above and decline below it. Current true count: ${count}, using only cards exposed before the dealer peek. Insurance pays 2:1 on its separate half-bet wager.`,
  };
}
