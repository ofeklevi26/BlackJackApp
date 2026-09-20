import {
  answerInsurance,
  createShoe,
  getActiveScenario,
  legalActions,
  playAction,
  startRound,
  SHOE_DECK_COUNTS,
  type Action,
  type Rules,
  type ShoeSession,
  type ShoeDeckCount,
} from "../engine";

export const CASINO_MIN_BET = 5;
export const CASINO_MAX_BET = 100;
export const CASINO_REFILL = 1000;
export const CASINO_CHIPS = [5, 10, 25, 50, 100] as const;
export type CasinoState = {
  version: 1;
  id: string;
  createdAt: number;
  revision: number;
  shoe: ShoeSession;
  selectedBet: number;
  lastBet: number;
  deposits: number;
  refillCount: number;
};

const cents = (value: number) => Math.round(value * 100) / 100;
export const casinoRoundActive = (table: CasinoState) =>
  !!table.shoe.round && table.shoe.round.phase !== "complete";
/** The engine posts net settlement only; ongoing wagers are reserved here, never deducted twice. */
export function casinoCommitted(table: CasinoState): number {
  if (!casinoRoundActive(table)) return 0;
  const round = table.shoe.round!;
  return cents(
    round.hands.reduce((sum, hand) => sum + hand.bet, 0) + round.insuranceBet,
  );
}
export const casinoAvailable = (table: CasinoState) =>
  cents(table.shoe.bankroll - casinoCommitted(table));
export const casinoNet = (table: CasinoState) =>
  cents(table.shoe.bankroll - table.deposits);

export function createCasino(
  rules: Rules,
  seed = Date.now(),
  now = Date.now(),
  decks: ShoeDeckCount = 6,
): CasinoState {
  return {
    version: 1,
    id: `casino-${now}-${seed}`,
    createdAt: now,
    revision: 0,
    shoe: { ...createShoe(seed, rules, 0.75, decks), bankroll: CASINO_REFILL },
    selectedBet: 10,
    lastBet: 10,
    deposits: CASINO_REFILL,
    refillCount: 0,
  };
}

function current(table: CasinoState, expectedRevision?: number) {
  return expectedRevision === undefined || table.revision === expectedRevision;
}

/** Start a separate, fully funded casino session only after outstanding wagers settle. */
export function casinoNewSession(
  table: CasinoState,
  decks: ShoeDeckCount,
  expectedRevision?: number,
  seed = Date.now(),
  now = Date.now(),
): CasinoState {
  if (
    !current(table, expectedRevision) ||
    casinoRoundActive(table) ||
    !(SHOE_DECK_COUNTS as readonly number[]).includes(decks)
  )
    return table;
  const previousShuffleSeed =
    table.shoe.seed + (table.shoe.shuffleNumber - 1) * 104729;
  const fresh = createCasino(
    table.shoe.rules,
    seed === previousShuffleSeed ? seed + 1 : seed,
    now,
    decks,
  );
  return {
    ...fresh,
    id: `${fresh.id}-${table.revision + 1}`,
    // Keep revisions monotonic so taps queued before reset cannot affect the fresh shoe.
    revision: table.revision + 1,
  };
}
function updated(table: CasinoState, shoe: ShoeSession): CasinoState {
  return shoe === table.shoe
    ? table
    : { ...table, shoe, revision: table.revision + 1 };
}
export function casinoSetBet(table: CasinoState, amount: number): CasinoState {
  if (
    casinoRoundActive(table) ||
    !Number.isFinite(amount) ||
    amount < 0 ||
    amount > CASINO_MAX_BET ||
    amount % CASINO_MIN_BET !== 0 ||
    amount > casinoAvailable(table) ||
    amount === table.selectedBet
  )
    return table;
  return { ...table, selectedBet: amount, revision: table.revision + 1 };
}
export function casinoAddChip(table: CasinoState, chip: number): CasinoState {
  if (!(CASINO_CHIPS as readonly number[]).includes(chip)) return table;
  return casinoSetBet(table, table.selectedBet + chip);
}
export const casinoRepeatBet = (table: CasinoState) =>
  casinoSetBet(table, table.lastBet);
export function casinoCanDeal(table: CasinoState): boolean {
  return (
    !casinoRoundActive(table) &&
    table.selectedBet >= CASINO_MIN_BET &&
    table.selectedBet <= CASINO_MAX_BET &&
    table.selectedBet % CASINO_MIN_BET === 0 &&
    table.selectedBet <= casinoAvailable(table)
  );
}
export function casinoDeal(
  table: CasinoState,
  expectedRevision?: number,
): CasinoState {
  if (!current(table, expectedRevision) || !casinoCanDeal(table)) return table;
  const shoe = startRound(table.shoe, table.selectedBet, table.shoe.rounds);
  return { ...updated(table, shoe), lastBet: table.selectedBet };
}
export function casinoLegalActions(table: CasinoState): Action[] {
  const scenario = getActiveScenario(table.shoe);
  if (!scenario) return [];
  const extraBet = table.shoe.round!.hands[table.shoe.round!.activeHand].bet;
  return legalActions(scenario, table.shoe.rules).filter(
    (action) =>
      !["split", "double"].includes(action) ||
      casinoAvailable(table) >= extraBet,
  );
}
export function casinoAct(
  table: CasinoState,
  action: Action,
  expectedRevision?: number,
): CasinoState {
  const scenario = getActiveScenario(table.shoe);
  if (
    !current(table, expectedRevision) ||
    !scenario ||
    !casinoLegalActions(table).includes(action)
  )
    return table;
  return updated(table, playAction(table.shoe, action, scenario.id));
}
export function casinoCanInsure(table: CasinoState): boolean {
  return (
    table.shoe.round?.phase === "insurance" &&
    casinoAvailable(table) >= table.shoe.round.hands[0].bet / 2
  );
}
export function casinoInsurance(
  table: CasinoState,
  take: boolean,
  expectedRevision?: number,
): CasinoState {
  if (
    !current(table, expectedRevision) ||
    table.shoe.round?.phase !== "insurance" ||
    (take && !casinoCanInsure(table))
  )
    return table;
  return updated(table, answerInsurance(table.shoe, take, table.shoe.round.id));
}
export const casinoCanRefill = (table: CasinoState) =>
  !casinoRoundActive(table) && casinoAvailable(table) < CASINO_MIN_BET;
export function casinoRefill(
  table: CasinoState,
  expectedRevision?: number,
): CasinoState {
  if (!current(table, expectedRevision) || !casinoCanRefill(table))
    return table;
  return {
    ...table,
    shoe: {
      ...table.shoe,
      bankroll: cents(table.shoe.bankroll + CASINO_REFILL),
    },
    deposits: table.deposits + CASINO_REFILL,
    refillCount: table.refillCount + 1,
    revision: table.revision + 1,
    selectedBet: 10,
  };
}
export function casinoRoundLabel(table: CasinoState): string {
  const round = table.shoe.round;
  if (!round) return "Place your chips. Take your seat.";
  if (round.phase === "insurance") return "Dealer shows an ace";
  if (round.phase === "playing")
    return round.hands.length > 1
      ? `Your turn · hand ${round.activeHand + 1} of ${round.hands.length}`
      : "Your turn";
  if (round.hands.length === 1 && round.hands[0].result === "blackjack")
    return "Blackjack!";
  if (round.profit > 0) return "You win";
  if (round.profit < 0)
    return round.hands.every((hand) => hand.result === "surrender")
      ? "Hand surrendered"
      : "Dealer wins";
  return round.hands.every((hand) => hand.result === "push") &&
    round.insuranceProfit === 0
    ? "Push · bets returned"
    : "Round even";
}

export const casinoMoney = (value: number) =>
  `$${value.toLocaleString("en-US", { minimumFractionDigits: value % 1 === 0 ? 0 : 2, maximumFractionDigits: 2 })}`;
