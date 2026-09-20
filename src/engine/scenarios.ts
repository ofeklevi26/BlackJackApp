import { createDeck, handValue, makeScenario, seededRandom } from "./cards";
import { category, DEVIATIONS, recommend } from "./strategy";
import { DEFAULT_RULES, Rank, RANKS, Rules, Scenario } from "./types";

const dealers: Rank[] = ["2", "3", "4", "5", "6", "7", "8", "9", "10", "A"];
const hardHands: Rank[][] = [
  ["2", "3"],
  ["2", "4"],
  ["3", "4"],
  ["3", "5"],
  ["4", "5"],
  ["4", "6"],
  ["5", "6"],
  ["10", "2"],
  ["10", "3"],
  ["10", "4"],
  ["10", "5"],
  ["10", "6"],
  ["10", "7"],
  ["10", "8"],
  ["10", "9"],
  ["K", "Q"],
  ["2", "3", "4"],
  ["A", "5", "10"],
  ["A", "A", "4", "10"],
  ["2", "3", "6"],
  ["4", "3", "5"],
  ["2", "A", "3", "10"],
];

export function generateScenario(
  seed: number,
  topic = "mixed",
  sampling: "balanced" | "realistic" = "balanced",
  weakTopics: string[] = [],
  rules: Rules = DEFAULT_RULES,
): Scenario {
  const random = seededRandom(seed);
  const pick = <T>(items: readonly T[]): T =>
    items[Math.floor(random() * items.length)];
  let focus = topic.toLowerCase();
  const eligibleWeakTopics = weakTopics.filter(
    (item) => item !== "surrender" || rules.surrender,
  );
  if (focus === "adaptive")
    focus =
      eligibleWeakTopics.length && random() < 0.7
        ? pick(eligibleWeakTopics)
        : "mixed";
  if (focus === "surrender" && !rules.surrender)
    throw new RangeError(
      "Enable late surrender before starting a surrender drill.",
    );
  if (focus === "deviations" || focus === "deviation") {
    const selected = pick(DEVIATIONS);
    const ranks: Rank[] =
      selected.total === 16
        ? ["10", "6"]
        : selected.total === 15
          ? ["10", "5"]
          : selected.total === 12
            ? ["10", "2"]
            : selected.total === 11
              ? ["5", "6"]
              : ["4", "6"];
    return makeScenario(
      ranks,
      selected.dealer === 11 ? "A" : (String(selected.dealer) as Rank),
      {
        id: `seed-${seed}`,
        trueCount: selected.index + pick([-2, -1, 0, 1, 2]),
      },
    );
  }
  const matches = (scenario: Scenario) => {
    if (["mixed", "random", "all"].includes(focus)) return true;
    if (["hard", "soft", "pairs"].includes(focus))
      return category(scenario) === focus;
    if (focus === "pair" || focus === "splitting" || focus === "split")
      return category(scenario) === "pairs";
    if (focus === "double" || focus === "doubling")
      return recommend(scenario, rules).action === "double";
    if (focus === "surrender")
      return recommend(scenario, rules).action === "surrender";
    return true;
  };
  // Realistic samples use the physical rank/suit frequencies of a six-deck deal.
  // Focus filters condition that distribution on the requested training topic.
  if (sampling === "realistic") {
    for (let attempt = 0; attempt < 1000; attempt++) {
      const deck = createDeck(seed + attempt * 7919, 6);
      const cards = [deck[0], deck[2]];
      if (
        handValue(cards).total >= 21 ||
        handValue([deck[1], deck[3]]).blackjack
      )
        continue;
      const scenario: Scenario = {
        id: `seed-${seed}-${attempt}`,
        cards,
        dealer: deck[1],
        fromSplit: false,
        splitAces: false,
        handsCount: 1,
      };
      // Realistic means initial deal frequencies, not artificial multi-card weighting.
      if (matches(scenario)) return scenario;
    }
  }
  for (let attempt = 0; attempt < 500; attempt++) {
    const group =
      focus === "hard"
        ? "hard"
        : focus === "soft"
          ? "soft"
          : ["pairs", "pair", "split", "splitting"].includes(focus)
            ? "pairs"
            : pick(["hard", "soft", "pairs"]);
    let ranks: Rank[];
    if (group === "pairs") {
      const rank = pick(RANKS);
      ranks = [rank, rank];
    } else if (group === "soft")
      ranks =
        random() < 0.3
          ? pick<Rank[]>([
              ["A", "A", "2"],
              ["A", "A", "4"],
              ["2", "A", "3"],
              ["4", "A", "A"],
            ])
          : ["A", pick(["2", "3", "4", "5", "6", "7", "8", "9"] as Rank[])];
    else ranks = pick(hardHands);
    const fromSplit = ranks[0] !== "A" && random() < 0.18;
    const scenario = makeScenario(ranks, pick(dealers), {
      id: `seed-${seed}-${attempt}`,
      fromSplit,
      handsCount: fromSplit ? pick([2, 3, 4]) : 1,
    });
    if (handValue(scenario.cards).total < 21 && matches(scenario))
      return scenario;
  }
  // Guaranteed valid fallback for even very restrictive action filters.
  if (focus === "surrender")
    return makeScenario(["10", "6"], "10", { id: `seed-${seed}-fallback` });
  if (focus === "double" || focus === "doubling")
    return makeScenario(["5", "6"], "6", { id: `seed-${seed}-fallback` });
  return makeScenario(["10", "6"], "7", { id: `seed-${seed}-fallback` });
}
