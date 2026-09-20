import { cardValue, handValue } from "./cards";
import {
  actionRestriction,
  category,
  DEVIATIONS,
  legalActions,
  recommend,
} from "./strategy";
import {
  Action,
  COUNT_SOURCE,
  DEFAULT_RULES,
  Rank,
  Rules,
  Scenario,
  SOURCE_METADATA,
  STRATEGY_SOURCE,
} from "./types";

export type ExplanationAlternative = {
  action: Action;
  chosen: boolean;
  explanation: string;
};
export type DecisionExplanationData = {
  title: string;
  hand: {
    label: string;
    detail: string;
    drawSummary: string;
    safeRanks: string[];
    bustRanks: string[];
  };
  dealer: string;
  recommendation: { action: Action; explanation: string };
  alternatives: ExplanationAlternative[];
  ruleEffects: string[];
  deviation?: {
    baseline: Action;
    index: number;
    suppliedCount: number;
    thresholdAction: Action;
    explanation: string;
  };
  scopeNote?: string;
  pattern: { action: Action; dealers: string[] }[];
  takeaway: string;
  sources: { label: string; url: string }[];
};

const ACTIONS: Action[] = ["hit", "stand", "double", "split", "surrender"];
const DEALERS: Rank[] = ["2", "3", "4", "5", "6", "7", "8", "9", "10", "A"];
const titleCase = (value: string) => value[0].toUpperCase() + value.slice(1);
const signed = (value: number) => `${value >= 0 ? "+" : ""}${value}`;
const upLabel = (scenario: Scenario) =>
  scenario.dealer.rank === "A" ? "ace" : String(cardValue(scenario.dealer));
const rankLabel = (rank: Rank) => (rank === "10" ? "10/J/Q/K" : rank);

function handInterpretation(
  scenario: Scenario,
): DecisionExplanationData["hand"] {
  const value = handValue(scenario.cards);
  const aces = scenario.cards.filter((card) => card.rank === "A").length;
  const label = `${value.soft ? "Soft" : "Hard"} ${value.total}`;
  const aceDetail = value.soft
    ? `An ace is currently worth 11${aces > 1 ? `; the other ${aces === 2 ? "ace is" : `${aces - 1} aces are`} worth 1` : ""}. It can fall to 1 if a new card would take the total over 21.`
    : aces
      ? `Every ace is already worth 1. There is no remaining 11-to-1 adjustment to protect the next hit.`
      : "There is no flexible ace in this hand.";
  const pairDetail =
    category(scenario) === "pairs"
      ? ` These two cards have the same value, so check the pair decision before treating them only as ${label.toLowerCase()}.`
      : "";
  const safeRanks: string[] = [];
  const bustRanks: string[] = [];
  for (const rank of [
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
  ] as Rank[]) {
    const next = handValue([
      ...scenario.cards,
      { rank, suit: "♠", id: `hypothetical-${rank}` },
    ]);
    (next.total > 21 ? bustRanks : safeRanks).push(rankLabel(rank));
  }
  const drawSummary =
    bustRanks.length === 0
      ? `No single next card can bust this hand. ${value.soft ? "That safety comes from the ace; it does not mean every hit improves your total." : "You can still finish with a weak total after that card."}`
      : `A next card of ${safeRanks.join(", ")} keeps you at 21 or below. ${bustRanks.join(", ")} would bust. These are possible ranks, not predictions of the next card.`;
  return {
    label,
    detail: `${scenario.cards.map((card) => card.rank).join(" + ")} gives ${label.toLowerCase()}. ${aceDetail}${pairDetail}`,
    drawSummary,
    safeRanks,
    bustRanks,
  };
}

function dealerContext(scenario: Scenario, rules: Rules): string {
  const up = cardValue(scenario.dealer);
  const rule = rules.hitSoft17
    ? "The dealer hits soft 17 and stops on hard 17 or higher."
    : "The dealer stops on every 17, including a soft 17.";
  if (up === 11)
    return `The ace can support either a soft hand or a hard hand after the dealer draws. In this American-peek decision, dealer blackjack has already been ruled out; the hole card is still unknown. ${rule}`;
  if (up === 10)
    return `A ten-valued upcard is a strong starting card, but it does not prove the dealer has 20. The peek has ruled out an ace in the hole for this decision. ${rule}`;
  if (up <= 6)
    return `A ${up} is in the dealer's weaker 2–6 range. The dealer must draw below 17, so preserving your hand can let the dealer bust first. This is not automatic: in basic strategy, hard 12 still hits against 2 or 3. ${rule}`;
  return `Against a ${up}, a low or stiff player total cannot simply rely on a weak dealer upcard. Compare the full matchup before deciding to stop. The hidden card is not assumed to be a ten. ${rule}`;
}

function whyRecommended(
  scenario: Scenario,
  action: Action,
  rules: Rules,
): string {
  const value = handValue(scenario.cards);
  const up = upLabel(scenario);
  const pair =
    category(scenario) === "pairs" ? cardValue(scenario.cards[0]) : undefined;
  if (scenario.splitAces)
    return "This hand has already received its one permitted card after splitting aces. Standing is required by the rule, rather than a choice between drawing strategies.";
  if (value.total >= 21)
    return "This hand is complete, so there is no further playing decision.";
  if (action === "surrender")
    return `Continuing ${value.total} against ${up} is worse in the stated strategy than fixing the loss at half the original wager. ${pair === 8 ? "This is the H17 ace exception to the usual instruction to split eights." : "Surrender is a comparison of the available outcomes, not a statement that the hand cannot win."} It is allowed here because these are the original two cards and the dealer has no blackjack.`;
  if (action === "split") {
    if (pair === 11)
      return "Keeping both aces together starts at soft 12. Splitting creates two ace-led hands instead. Each receives only one new card in this game, and any resulting 21 is an ordinary split 21, not a 3:2 blackjack.";
    if (pair === 8)
      return `The decision is between playing one hard 16 and developing two separate hands that each start with 8. The pair strategy chooses the separate hands against ${up}, even when the dealer's upcard is strong. A split is not a claim that both new hands will win.`;
    if (pair === 9)
      return `Keeping 18 is a real option, but this matchup favors two hands starting from 9. Remember the important boundary: keep the pair against 7, 10 or ace; split against 2–6, 8 or 9 when splitting remains available.`;
    if (pair === 4)
      return "The ability to double after splitting is central here. Against 5 or 6, the chart prefers two four-led hands with that later double option to keeping hard 8.";
    return `Splitting replaces one total of ${value.total} with two hands starting at ${pair}. Against ${up}, the pair chart favors developing those hands separately, with another original-sized wager and the option to double an eligible split hand.`;
  }
  if (action === "double")
    return `${value.soft ? `The flexible ace protects this ${value.total} from a one-card bust` : `Hard ${value.total} cannot bust on one additional card`}. Doubling puts a second equal wager behind that one card, but then ends your turn. For this exact dealer upcard and ruleset, the chart favors that trade over retaining the option to hit again.${value.soft && value.total >= 18 ? " This is an exception to treating every made 18 or 19 as an automatic stand." : ""}`;
  if (action === "stand") {
    if (pair === 10)
      return "You already have 20. Splitting breaks a strong completed total into two uncertain hands and adds another wager; this basic-strategy table keeps the 20 against every upcard.";
    if (value.soft && value.total === 18)
      return `Keep the 18 against ${up}.${scenario.cards.length > 2 && cardValue(scenario.dealer) >= (rules.hitSoft17 ? 2 : 3) && cardValue(scenario.dealer) <= 6 ? " With two cards this cell would double, but after taking a hit you must use its stand fallback." : " Soft does not automatically mean hit: the choice still depends on the dealer upcard."} Against 9, 10 or ace, the soft-18 basic strategy instead calls for another card.`;
    if (value.total >= 17)
      return `Your ${value.total} is a made hand. An extra card risks replacing it with a worse result; this matchup favors preserving the current total rather than trying to get closer to 21.`;
    return `Standing keeps your ${value.total} alive for the dealer's forced drawing sequence. If you bust first, you lose even if the dealer would also bust. The chart favors letting the dealer finish against this upcard.`;
  }
  if (pair === 5)
    return `Treat the fives as a useful hard 10. This upcard is outside the basic-strategy double window for 10, so improve the hand with the option to take another card afterward. Splitting would break up the 10.`;
  if (value.soft)
    return `The ace gives room to improve without a one-card bust. ${value.total === 18 ? "Eighteen is not a stopping point against 9, 10 or ace in this soft-hand matchup." : `Soft ${value.total} is not strong enough to keep against ${up}.`} Hitting keeps the option to reassess the new total instead of committing to one card as a double would.`;
  if (value.total <= 11)
    return `Hard ${value.total} needs another card and cannot bust on that draw. This is outside the available double recommendation for the current hand and upcard, so keep the original wager and the ability to draw again.`;
  if (value.total === 12 && [2, 3].includes(cardValue(scenario.dealer)))
    return "Twelve is the low-upcard exception: the chart hits against 2 or 3, but stands against 4–6. A dealer upcard being in the weaker range is not enough, by itself, to make standing best.";
  return `A hit can bust ${value.total}, but avoiding that risk by standing is not automatically better. The matchup favors attempting to improve the hand; the comparison is against standing on this total, not against a guaranteed safe card.`;
}

function alternativeExplanation(
  action: Action,
  recommended: Action,
  scenario: Scenario,
  hasDeviation: boolean,
): string {
  const value = handValue(scenario.cards);
  if (
    hasDeviation &&
    (action === "hit" || action === "stand" || action === "double")
  )
    return `${titleCase(action)} is not the action selected on this side of the displayed count threshold. The comparison uses the count available when you chose, not the card that was dealt afterward.`;
  if (action === "surrender")
    return `Surrender fixes a loss of half the wager. The chart values ${recommended} above giving up that half in this matchup.`;
  if (action === "split") {
    const pair = cardValue(scenario.cards[0]);
    if (pair === 10)
      return "Splitting sacrifices an existing 20, adds another wager, and starts two separate hands. The basic strategy keeps the strong total.";
    if (pair === 5)
      return "Splitting turns hard 10 into two five-led hands. Keep the 10 and use its hit/double instruction instead.";
    if (recommended === "surrender")
      return "The H17 ace exception favors surrendering this pair of eights. Splitting still creates two live bets against the ace instead of fixing the original loss at half.";
    return `Splitting adds another wager and gives up the current ${value.total}. For this upcard, the pair chart prefers ${recommended}; not every pair should be split.`;
  }
  if (action === "double")
    return `Doubling commits an extra equal wager and forces a stop after exactly one card. ${recommended === "hit" ? "Hitting preserves the ability to draw again if that card leaves a weak total." : recommended === "stand" ? `Standing keeps ${value.total} without adding a wager or taking another card.` : "The recommended action offers the better comparison in this table cell."} This cell does not justify the double.`;
  if (action === "stand") {
    if (recommended === "double")
      return value.total <= 11
        ? `Standing leaves only ${value.total}; it wins only if the dealer busts. The double recommendation uses a safe additional card with an increased wager.`
        : `Standing keeps ${value.total}, but this particular soft-hand double is a chart exception where the one-card, extra-wager option is preferred.`;
    if (recommended === "split")
      return `Standing keeps the pair as ${value.soft ? "soft" : "hard"} ${value.total}. The pair chart instead prefers developing the two starting cards separately.`;
    if (recommended === "surrender")
      return `Standing keeps the full wager at risk on ${value.total}. Under these rules, surrendering half is the better comparison.`;
    return `Standing avoids an immediate player bust, but it also locks in ${value.total}. The chart favors trying to improve this hand against the dealer's upcard.`;
  }
  if (recommended === "double")
    return "Hitting takes the same next card for the original wager and keeps later choices open. The double instruction says that increasing the wager and accepting one card is preferred in this cell.";
  if (recommended === "split")
    return `Hitting keeps both pair cards in one ${value.total}-point hand. Splitting changes the starting totals instead, which the pair chart prefers here.`;
  if (recommended === "surrender")
    return "Drawing might save the hand, but that possibility does not make it preferable to surrender in this matchup. Hitting keeps the whole wager at risk and can lose before the dealer plays.";
  return value.soft
    ? `A hit cannot bust this soft hand immediately, but safety alone does not make it an improvement. The chart keeps ${value.total} against this upcard.`
    : `Hitting can bust this ${value.total} before the dealer acts. Standing preserves the total and its chance to win when the dealer finishes.`;
}

/** Derives teaching content exclusively from the recorded decision, never a shoe or outcome. */
export function explainDecision(
  scenario: Scenario,
  rules: Rules = DEFAULT_RULES,
  countMode = false,
  chosen?: Action,
): DecisionExplanationData {
  const result = recommend(scenario, rules, countMode);
  const baseline = recommend(scenario, rules, false).action;
  const legal = legalActions(scenario, rules);
  const hand = handInterpretation(scenario);
  const value = handValue(scenario.cards);
  const matchingIndex =
    result.index !== undefined
      ? DEVIATIONS.find(
          (item) =>
            item.total === value.total &&
            item.dealer === cardValue(scenario.dealer),
        )
      : undefined;
  const countMeaning =
    scenario.trueCount! > 0
      ? "A positive Hi-Lo count means more low cards than tens/aces have been exposed, leaving a relatively richer high-card mix."
      : scenario.trueCount! < 0
        ? "A negative Hi-Lo count means more tens/aces than low cards have been exposed; it does not describe a high-card-rich shoe."
        : "A floored count of zero does not prove that the unseen cards are exactly balanced; still use the stated zero threshold.";
  const deviation = matchingIndex
    ? {
        baseline,
        index: matchingIndex.index,
        suppliedCount: scenario.trueCount!,
        thresholdAction: matchingIndex.action,
        explanation: `${titleCase(matchingIndex.action)} is the indexed play at ${signed(matchingIndex.index)} or higher; below that threshold, hit. The snapshot count ${signed(scenario.trueCount!)} is ${scenario.trueCount! >= matchingIndex.index ? "at or above" : "below"} the boundary. ${countMeaning} The index captures the comparison for this specific matchup; it does not identify the next card. The visible hand alone does not reconstruct the earlier cards that produced that count.`,
      }
    : undefined;
  const ruleEffects: string[] = [];
  if (scenario.cards.length > 2)
    ruleEffects.push(
      "You have already hit. Doubling and late surrender are no longer available; use the legal fallback instead of the original two-card instruction.",
    );
  if (scenario.fromSplit)
    ruleEffects.push(
      "This is a split hand. Late surrender is unavailable, while doubling is allowed on its first two cards unless it is a split ace. A split 21 pays 1:1.",
    );
  if (scenario.handsCount >= 4)
    ruleEffects.push(
      "The round already has four hands. A new pair must be played as its total because another split is unavailable.",
    );
  if (!scenario.fromSplit && scenario.cards.length === 2 && rules.surrender)
    ruleEffects.push(
      "Late surrender is available now, after the dealer's blackjack check; it gives back half the original wager.",
    );
  if (!rules.surrender)
    ruleEffects.push(
      "Surrender is switched off. Its half-bet exit cannot be used in this decision.",
    );
  const oppositeRules = { ...rules, hitSoft17: !rules.hitSoft17 };
  const opposite = recommend(scenario, oppositeRules, false).action;
  if (opposite !== baseline)
    ruleEffects.push(
      `The soft-17 rule matters here: ${rules.hitSoft17 ? "H17" : "S17"} basic strategy says ${baseline}; the same cards under ${rules.hitSoft17 ? "S17" : "H17"} say ${opposite}.`,
    );
  if (baseline === "surrender")
    ruleEffects.push(
      `If surrender were unavailable, the fallback for these cards would be ${recommend(scenario, { ...rules, surrender: false }, false).action}.`,
    );
  if (chosen && !legal.includes(chosen))
    ruleEffects.push(
      `${titleCase(chosen)} is unavailable: ${actionRestriction(chosen, scenario, rules)}`,
    );
  if (!ruleEffects.length)
    ruleEffects.push(
      "These decisions use six decks, American dealer peek, and doubling after splitting. A different table's chart can give a different answer.",
    );

  const pattern = ACTIONS.map((action) => ({
    action,
    dealers: DEALERS.filter(
      (rank) =>
        recommend(
          { ...scenario, dealer: { ...scenario.dealer, rank } },
          rules,
          false,
        ).action === action,
    ).map((rank) => (rank === "A" ? "A" : rank)),
  })).filter((item) => item.dealers.length > 0);
  let takeaway: string;
  if (deviation)
    takeaway = `${hand.label} vs ${upLabel(scenario)}: remember ${signed(deviation.index)} as the boundary, with ${deviation.thresholdAction} at or above it and hit below.`;
  else if (value.soft && value.total === 18)
    takeaway =
      scenario.cards.length > 2
        ? "After hitting to soft 18, stand against 2–8 and hit against 9–ace."
        : `${rules.hitSoft17 ? "H17" : "S17"} soft 18: double ${rules.hitSoft17 ? "2" : "3"}–6, stand against ${rules.hitSoft17 ? "7–8" : "2, 7–8"}, and hit against 9–ace.`;
  else if (category(scenario) === "pairs" && cardValue(scenario.cards[0]) === 5)
    takeaway = "Two fives are a hard 10 to develop, not a pair to break apart.";
  else if (
    category(scenario) === "pairs" &&
    cardValue(scenario.cards[0]) === 10
  )
    takeaway =
      "Keep 20 in basic strategy; the extra wager from splitting is not automatically an advantage.";
  else if (baseline === "surrender" && category(scenario) === "pairs")
    takeaway =
      "H17 + dealer ace + late surrender is the important exception for a pair of eights.";
  else if (scenario.handsCount >= 4)
    takeaway =
      "Once the split limit is reached, look up the total and the actions that remain legal.";
  else if (!value.soft && value.total === 12 && category(scenario) !== "pairs")
    takeaway = "Hard 12: stand against 4–6; hit against 2–3 and 7–ace.";
  else
    takeaway = `Remember the whole row below, not just this result: ${hand.label.toLowerCase()} changes with the dealer's upcard and available actions.`;

  let scopeNote: string | undefined;
  if (countMode && !deviation)
    scopeNote =
      rules.hitSoft17 || rules.surrender
        ? "The advanced subset is limited to S17 with surrender off. This ruleset is graded with basic strategy."
        : !Number.isFinite(scenario.trueCount)
          ? "No usable count was supplied, so the baseline basic strategy applies."
          : "This hand and its available actions do not match the six taught deviations. The displayed recommendation is basic strategy, not a complete index strategy.";
  const sources = [{ label: "Basic strategy reference", url: STRATEGY_SOURCE }];
  if (baseline === "surrender")
    sources.push({
      label: "Late surrender reference",
      url: SOURCE_METADATA.surrender.url,
    });
  if (deviation)
    sources.push({ label: "Hi-Lo index reference", url: COUNT_SOURCE });
  return {
    title: `${hand.label} against ${upLabel(scenario)}`,
    hand,
    dealer: dealerContext(scenario, rules),
    recommendation: {
      action: result.action,
      explanation: deviation
        ? `The basic-strategy starting point is ${baseline}. The verified index, rather than a prediction about the next card, selects ${result.action} for the count captured with this decision.`
        : whyRecommended(scenario, result.action, rules),
    },
    alternatives: ACTIONS.filter(
      (action) => legal.includes(action) && action !== result.action,
    )
      .map((action) => ({
        action,
        chosen: action === chosen,
        explanation: alternativeExplanation(
          action,
          result.action,
          scenario,
          !!deviation,
        ),
      }))
      .sort((a, b) => Number(b.chosen) - Number(a.chosen)),
    ruleEffects,
    deviation,
    scopeNote,
    pattern,
    takeaway,
    sources,
  };
}
