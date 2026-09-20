import { Card, Rank, RANKS, Scenario, SUITS } from "./types";

let cardSequence = 0;
export function makeCard(rank: Rank, id?: string): Card {
  if (!RANKS.includes(rank)) throw new RangeError("Unknown card rank.");
  return {
    rank,
    id: id ?? `card-${++cardSequence}`,
    suit: SUITS[cardSequence % 4],
  };
}

export function cardValue(card: Card): number {
  return card.rank === "A"
    ? 11
    : ["10", "J", "Q", "K"].includes(card.rank)
      ? 10
      : Number(card.rank);
}

export function handValue(cards: readonly Card[]) {
  let total = cards.reduce((sum, card) => sum + cardValue(card), 0);
  let highAces = cards.filter((card) => card.rank === "A").length;
  while (total > 21 && highAces > 0) {
    total -= 10;
    highAces--;
  }
  return {
    total,
    soft: highAces > 0,
    blackjack: cards.length === 2 && total === 21,
  };
}

export function makeScenario(
  ranks: Rank[],
  dealer: Rank,
  opts: Partial<Scenario> = {},
): Scenario {
  const id = opts.id ?? `scenario-${++cardSequence}`;
  const cards: Card[] =
    opts.cards ??
    ranks.map((rank, i) => ({ rank, id: `${id}-p${i}`, suit: SUITS[i % 4] }));
  const fromSplit = opts.fromSplit ?? false;
  return {
    ...opts,
    id,
    cards,
    dealer: opts.dealer ?? { rank: dealer, id: `${id}-d`, suit: "♣" },
    fromSplit,
    splitAces: opts.splitAces ?? (fromSplit && cards[0]?.rank === "A"),
    handsCount: opts.handsCount ?? (fromSplit ? 2 : 1),
  };
}

export function hiLo(card: Card): number {
  const value = cardValue(card);
  return value >= 10 ? -1 : value <= 6 ? 1 : 0;
}

export function rawTrueCount(running: number, decks: number): number {
  if (!Number.isFinite(running) || !Number.isFinite(decks) || decks <= 0) {
    throw new RangeError(
      "Use a finite running count and a positive number of decks remaining.",
    );
  }
  return running / decks;
}

/** Floor toward negative infinity. -1 / 2 becomes -1, not zero. */
export function trueCount(running: number, decks: number): number {
  return Math.floor(rawTrueCount(running, decks));
}

export function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

export function createDeck(seed: number, decks = 1): Card[] {
  if (!Number.isInteger(decks) || decks < 1 || decks > 8)
    throw new RangeError("Use one to eight decks.");
  const cards: Card[] = [];
  for (let deck = 0; deck < decks; deck++) {
    for (const suit of SUITS)
      for (const rank of RANKS)
        cards.push({ id: `${seed}-${deck}-${suit}-${rank}`, rank, suit });
  }
  const random = seededRandom(seed);
  for (let i = cards.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [cards[i], cards[j]] = [cards[j], cards[i]];
  }
  return cards;
}

export function validateScenario(scenario: Scenario): string[] {
  const errors: string[] = [];
  if (scenario.cards.length < 2 || scenario.cards.length > 20)
    errors.push("Choose between two and twenty player cards.");
  const allCards = [...scenario.cards, scenario.dealer];
  if (
    !allCards.every(
      (card) => RANKS.includes(card.rank) && SUITS.includes(card.suit),
    )
  )
    errors.push("Choose valid cards.");
  const ids = allCards.map((card) => card.id);
  if (ids.some((id) => !id) || new Set(ids).size !== ids.length)
    errors.push("Each physical card must be unique.");
  const copies = new Map<string, number>();
  for (const card of allCards) {
    const face = `${card.rank}${card.suit}`;
    copies.set(face, (copies.get(face) ?? 0) + 1);
  }
  if ([...copies.values()].some((count) => count > 6))
    errors.push(
      "A six-deck shoe contains only six copies of each rank and suit.",
    );
  if (handValue(scenario.cards).total >= 21)
    errors.push("Choose a hand below 21 so there is a decision to make.");
  for (let count = 2; count < scenario.cards.length; count++) {
    if (handValue(scenario.cards.slice(0, count)).total >= 21) {
      errors.push("A completed hand cannot receive another card.");
      break;
    }
  }
  if (
    scenario.splitAces &&
    (!scenario.fromSplit ||
      scenario.cards.length !== 2 ||
      scenario.cards[0]?.rank !== "A")
  )
    errors.push("Split aces receive exactly one additional card.");
  if (scenario.fromSplit && scenario.cards[0]?.rank === "A")
    errors.push(
      "Split aces automatically stand after one additional card. Choose another hand for decision practice.",
    );
  if (
    scenario.fromSplit &&
    scenario.cards[0]?.rank === "A" &&
    !scenario.splitAces
  )
    errors.push(
      "A hand split from aces must follow the one-card split-ace rule.",
    );
  if (
    scenario.handsCount < 1 ||
    scenario.handsCount > 4 ||
    !Number.isInteger(scenario.handsCount)
  )
    errors.push("There may be one to four hands.");
  if (scenario.fromSplit && scenario.handsCount < 2)
    errors.push("A split round must have at least two hands.");
  if (!scenario.fromSplit && scenario.handsCount !== 1)
    errors.push("Every hand in a split round must be marked as after a split.");
  if (scenario.trueCount !== undefined && !Number.isFinite(scenario.trueCount))
    errors.push("Provide a finite true count.");
  return errors;
}
