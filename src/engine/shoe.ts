import { cardValue, createDeck, handValue, hiLo, trueCount } from "./cards";
import { legalActions } from "./strategy";
import { Action, Card, DEFAULT_RULES, Rules, Scenario } from "./types";

// Four player hands contain at most 4×30 low-valued points and the dealer 26.
// In six decks, even the 73 lowest cards total 148 (aces valued as one), above 146.
// Keeping 73 cards therefore guarantees this table cannot exhaust mid-round.
export const MIN_SHOE_RESERVE = 73;

export type PlayerHand = {
  id: string;
  cards: Card[];
  bet: number;
  status: "playing" | "stood" | "bust" | "surrendered" | "settled";
  fromSplit: boolean;
  splitAces: boolean;
  result?: "win" | "loss" | "push" | "blackjack" | "surrender";
  profit?: number;
};
export type Round = {
  id: string;
  phase: "insurance" | "playing" | "complete";
  dealer: Card[];
  dealerRevealed: boolean;
  hands: PlayerHand[];
  activeHand: number;
  insuranceBet: number;
  insuranceProfit: number;
  profit: number;
  log: string[];
};
export type ShoeSession = {
  rules: Rules;
  cards: Card[];
  nextCard: number;
  discarded: Card[];
  runningCount: number;
  seenIds: string[];
  round?: Round;
  bankroll: number;
  rounds: number;
  seed: number;
  shuffleNumber: number;
  penetration: number;
};

export function createShoe(
  seed = Date.now(),
  rules: Rules = DEFAULT_RULES,
  penetration = 0.75,
): ShoeSession {
  if (!Number.isFinite(penetration) || penetration < 0.25 || penetration > 0.85)
    throw new RangeError("Set the cut card between 25% and 85% of the shoe.");
  return {
    rules: { ...rules },
    cards: createDeck(seed, 6),
    nextCard: 0,
    discarded: [],
    runningCount: 0,
    seenIds: [],
    bankroll: 100,
    rounds: 0,
    seed,
    shuffleNumber: 1,
    penetration,
  };
}

function clone(session: ShoeSession): ShoeSession {
  return {
    ...session,
    rules: { ...session.rules },
    discarded: [...session.discarded],
    seenIds: [...session.seenIds],
    round: session.round
      ? {
          ...session.round,
          dealer: [...session.round.dealer],
          hands: session.round.hands.map((hand) => ({
            ...hand,
            cards: [...hand.cards],
          })),
          log: [...session.round.log],
        }
      : undefined,
  };
}

function expose(session: ShoeSession, card: Card) {
  if (session.seenIds.includes(card.id)) return;
  session.seenIds.push(card.id);
  session.runningCount += hiLo(card);
}

function draw(session: ShoeSession, faceUp = true): Card {
  const card = session.cards[session.nextCard];
  if (!card)
    throw new Error(
      "The shoe is exhausted; an incomplete round must never reshuffle.",
    );
  session.nextCard++;
  if (faceUp) expose(session, card);
  return card;
}

/** Physical undealt cards. A hidden hole card is excluded from the shoe size but never counted. */
export function decksRemaining(session: ShoeSession): number {
  return (session.cards.length - session.nextCard) / 52;
}

/** Public exposure order for card-by-card count correction, including earlier rounds. */
export function visibleCards(session: ShoeSession): Card[] {
  const byId = new Map(session.cards.map((card) => [card.id, card]));
  return session.seenIds.flatMap((id) => {
    const card = byId.get(id);
    return card ? [card] : [];
  });
}

export function getActiveScenario(session: ShoeSession): Scenario | null {
  const round = session.round;
  if (!round || round.phase !== "playing") return null;
  const hand = round.hands[round.activeHand];
  if (!hand || hand.status !== "playing") return null;
  return {
    id: `${round.id}-${hand.id}-${hand.cards.length}-${session.nextCard}`,
    cards: [...hand.cards],
    dealer: round.dealer[0],
    fromSplit: hand.fromSplit,
    splitAces: hand.splitAces,
    handsCount: round.hands.length,
    trueCount: trueCount(
      session.runningCount,
      Math.max(decksRemaining(session), 1 / 52),
    ),
  };
}

function revealDealer(session: ShoeSession) {
  const round = session.round!;
  round.dealerRevealed = true;
  for (const card of round.dealer) expose(session, card);
}

function settle(session: ShoeSession) {
  const round = session.round!;
  if (round.phase === "complete") return;
  revealDealer(session);
  const dealer = handValue(round.dealer);
  for (const hand of round.hands) {
    const value = handValue(hand.cards);
    const natural = !hand.fromSplit && value.blackjack;
    if (hand.status === "surrendered") {
      hand.result = "surrender";
      hand.profit = -hand.bet / 2;
    } else if (value.total > 21) {
      hand.result = "loss";
      hand.profit = -hand.bet;
    } else if (dealer.blackjack) {
      hand.result = natural ? "push" : "loss";
      hand.profit = natural ? 0 : -hand.bet;
    } else if (natural) {
      hand.result = "blackjack";
      hand.profit = hand.bet * 1.5;
    } else if (dealer.total > 21 || value.total > dealer.total) {
      hand.result = "win";
      hand.profit = hand.bet;
    } else if (value.total === dealer.total) {
      hand.result = "push";
      hand.profit = 0;
    } else {
      hand.result = "loss";
      hand.profit = -hand.bet;
    }
    hand.status = "settled";
  }
  round.profit =
    round.hands.reduce((sum, hand) => sum + (hand.profit ?? 0), 0) +
    round.insuranceProfit;
  session.bankroll += round.profit;
  session.rounds++;
  round.phase = "complete";
  session.discarded = session.cards.slice(0, session.nextCard);
  round.log.push(
    `Round complete: ${round.profit >= 0 ? "+" : ""}${round.profit} virtual units.`,
  );
}

function finishDealer(session: ShoeSession) {
  const round = session.round!;
  revealDealer(session);
  // Dealer draws only if a non-natural surviving player hand needs a comparison.
  const needsComparison = round.hands.some(
    (hand) =>
      hand.status !== "bust" &&
      hand.status !== "surrendered" &&
      !(handValue(hand.cards).blackjack && !hand.fromSplit),
  );
  if (needsComparison && !handValue(round.dealer).blackjack) {
    for (;;) {
      const dealer = handValue(round.dealer);
      if (
        dealer.total > 17 ||
        (dealer.total === 17 && !(dealer.soft && session.rules.hitSoft17))
      )
        break;
      round.dealer.push(draw(session));
    }
  }
  settle(session);
}

function advance(session: ShoeSession) {
  const round = session.round!;
  for (let index = round.activeHand; index < round.hands.length; index++) {
    const hand = round.hands[index];
    // The next split hand receives its card only when it becomes active.
    if (hand.cards.length === 1) {
      hand.cards.push(draw(session));
      if (hand.splitAces || handValue(hand.cards).total === 21)
        hand.status = "stood";
    }
    if (hand.status === "playing") {
      round.activeHand = index;
      return;
    }
  }
  finishDealer(session);
}

function afterPeek(session: ShoeSession) {
  const round = session.round!;
  if (handValue(round.dealer).blackjack) {
    round.log.push("Dealer blackjack: the round ends before player actions.");
    settle(session);
  } else if (handValue(round.hands[0].cards).blackjack) {
    round.log.push("Player blackjack pays 3:2.");
    settle(session);
  } else {
    round.phase = "playing";
    if (cardValue(round.dealer[0]) >= 10)
      round.log.push("Dealer checked: no blackjack.");
  }
}

/** Bet is chosen before any new cards are dealt. Net profits are posted on settlement. */
export function startRound(
  session: ShoeSession,
  bet = 1,
  expectedRounds?: number,
): ShoeSession {
  if (session.round && session.round.phase !== "complete") return session;
  if (expectedRounds !== undefined && expectedRounds !== session.rounds)
    return session;
  if (
    !Number.isFinite(bet) ||
    bet <= 0 ||
    bet > 100 ||
    Math.round(bet * 2) !== bet * 2
  )
    throw new RangeError("Bet 0.5–100 virtual units in half-unit steps.");
  let next = clone(session);
  if (
    next.nextCard >= Math.floor(next.cards.length * next.penetration) ||
    next.cards.length - next.nextCard < MIN_SHOE_RESERVE
  ) {
    const replacement = createShoe(
      next.seed + next.shuffleNumber * 104729,
      next.rules,
      next.penetration,
    );
    next = {
      ...replacement,
      bankroll: next.bankroll,
      rounds: next.rounds,
      shuffleNumber: next.shuffleNumber + 1,
      seed: next.seed,
    };
  }
  const id = `round-${next.shuffleNumber}-${next.rounds + 1}`;
  const first = draw(next);
  const upcard = draw(next);
  const second = draw(next);
  const hole = draw(next, false);
  next.round = {
    id,
    phase: upcard.rank === "A" ? "insurance" : "playing",
    dealer: [upcard, hole],
    dealerRevealed: false,
    hands: [
      {
        id: `${id}-hand-1`,
        cards: [first, second],
        bet,
        status: "playing",
        fromSplit: false,
        splitAces: false,
      },
    ],
    activeHand: 0,
    insuranceBet: 0,
    insuranceProfit: 0,
    profit: 0,
    log: [`Bet ${bet} virtual units before the deal.`],
  };
  if (upcard.rank !== "A") afterPeek(next);
  return next;
}

export function answerInsurance(
  session: ShoeSession,
  take: boolean,
  expectedRoundId?: string,
): ShoeSession {
  if (
    session.round?.phase !== "insurance" ||
    (expectedRoundId && session.round.id !== expectedRoundId)
  )
    return session;
  const next = clone(session);
  const round = next.round!;
  round.insuranceBet = take ? round.hands[0].bet / 2 : 0;
  round.insuranceProfit = take
    ? handValue(round.dealer).blackjack
      ? 2 * round.insuranceBet
      : -round.insuranceBet
    : 0;
  round.log.push(
    take
      ? `Insurance wager: ${round.insuranceBet} virtual units.`
      : "Insurance declined.",
  );
  afterPeek(next);
  return next;
}

/** Supply the decision's scenario ID to reject stale/double UI submissions. */
export function playAction(
  session: ShoeSession,
  action: Action,
  expectedScenarioId?: string,
): ShoeSession {
  const scenario = getActiveScenario(session);
  if (
    !scenario ||
    (expectedScenarioId && expectedScenarioId !== scenario.id) ||
    !legalActions(scenario, session.rules).includes(action)
  )
    return session;
  const next = clone(session);
  const round = next.round!;
  const hand = round.hands[round.activeHand];
  round.log.push(`Hand ${round.activeHand + 1}: ${action}.`);
  if (action === "hit") {
    hand.cards.push(draw(next));
    const total = handValue(hand.cards).total;
    if (total > 21) hand.status = "bust";
    else if (total === 21) hand.status = "stood";
  } else if (action === "stand") hand.status = "stood";
  else if (action === "surrender") hand.status = "surrendered";
  else if (action === "double") {
    hand.bet *= 2;
    hand.cards.push(draw(next));
    hand.status = handValue(hand.cards).total > 21 ? "bust" : "stood";
  } else if (action === "split") {
    const splitAces = hand.cards[0].rank === "A";
    const second = hand.cards[1];
    hand.cards = [hand.cards[0]];
    hand.fromSplit = true;
    hand.splitAces = splitAces;
    const other: PlayerHand = {
      id: `${round.id}-split-${round.hands.length + 1}`,
      cards: [second],
      bet: hand.bet,
      status: "playing",
      fromSplit: true,
      splitAces,
    };
    round.hands.splice(round.activeHand + 1, 0, other);
  }
  advance(next);
  return next;
}
