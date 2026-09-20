import { hiLo, RANKS, SUITS, type Card } from "../engine";
import type { AppData } from "./types";
import {
  CASINO_MAX_BET,
  CASINO_MIN_BET,
  CASINO_REFILL,
  casinoCommitted,
  type CasinoState,
} from "./casino";

type ObjectValue = Record<string, unknown>;

/** Serial writes stop after failure; an explicit reset invalidates stale queued writes. */
export function createSaveQueue(
  write: (serialized: string) => Promise<void>,
  onFailure: (error: unknown) => void,
) {
  let tail = Promise.resolve();
  let blocked = false;
  let generation = 0;
  return {
    enqueue(serialized: string): Promise<void> {
      const revision = generation;
      tail = tail.then(async () => {
        if (blocked || revision !== generation) return;
        try {
          await write(serialized);
        } catch (error) {
          if (revision === generation) {
            blocked = true;
            onFailure(error);
          }
        }
      });
      return tail;
    },
    reset() {
      generation++;
      blocked = false;
    },
    get blocked() {
      return blocked;
    },
  };
}

/** Pause both kinds without advancing their clocks or altering a saved shoe. */
export function pauseSavedActivities(data: AppData): AppData {
  if (
    (!data.active || data.active.paused) &&
    (!data.counting || data.counting.paused)
  )
    return data;
  return {
    ...data,
    active: data.active ? { ...data.active, paused: true } : null,
    counting: data.counting ? { ...data.counting, paused: true } : null,
  };
}

export function serializeHistoryExport(
  data: AppData,
  recovery: { rawSavedData: string; reason: string } | null = null,
  exportedAt = new Date().toISOString(),
) {
  return JSON.stringify(
    { exportedAt, ...data, ...(recovery ? { recovery } : {}) },
    null,
    2,
  );
}
const MODES = [
  "recognition",
  "running",
  "pairs",
  "countdown",
  "decks",
  "true-count",
];
const KINDS = [
  "card-value",
  "running-count",
  "pair-value",
  "deck-estimate",
  "true-count",
];
const ACTIONS = ["hit", "stand", "double", "split", "surrender"];

function check(condition: unknown, detail: string): asserts condition {
  if (!condition) throw new Error(`Saved progress is invalid: ${detail}.`);
}
function object(value: unknown, path: string): ObjectValue {
  check(
    value !== null && typeof value === "object" && !Array.isArray(value),
    `${path} must be an object`,
  );
  return value as ObjectValue;
}
function list(value: unknown, path: string): unknown[] {
  check(Array.isArray(value), `${path} must be a list`);
  return value;
}
function text(value: unknown, path: string, allowEmpty = false) {
  check(
    typeof value === "string" && (allowEmpty || value.length > 0),
    `${path} must be text`,
  );
}
function bool(value: unknown, path: string) {
  check(typeof value === "boolean", `${path} must be true or false`);
}
function number(
  value: unknown,
  path: string,
  min = -Infinity,
  max = Infinity,
  integer = false,
): number {
  check(
    typeof value === "number" &&
      Number.isFinite(value) &&
      value >= min &&
      value <= max &&
      (!integer || Number.isInteger(value)),
    `${path} is outside its supported numeric range`,
  );
  return value;
}
function oneOf(value: unknown, values: readonly string[], path: string) {
  check(
    typeof value === "string" && values.includes(value),
    `${path} has an unsupported value`,
  );
}
function optionalNumber(value: unknown, path: string, min = -Infinity) {
  if (value !== undefined) number(value, path, min);
}
function unique(values: unknown[], path: string) {
  check(
    new Set(values).size === values.length,
    `${path} contains duplicate identifiers`,
  );
}
function rules(value: unknown, path: string) {
  const data = object(value, path);
  bool(data.hitSoft17, `${path}.hitSoft17`);
  bool(data.surrender, `${path}.surrender`);
}
function card(value: unknown, path: string): Card {
  const data = object(value, path);
  text(data.id, `${path}.id`);
  oneOf(data.rank, RANKS, `${path}.rank`);
  oneOf(data.suit, SUITS, `${path}.suit`);
  return data as Card;
}
function cards(value: unknown, path: string, min = 0, max = 312): Card[] {
  const result = list(value, path).map((item, i) =>
    card(item, `${path}[${i}]`),
  );
  check(
    result.length >= min && result.length <= max,
    `${path} has an invalid card count`,
  );
  unique(
    result.map((item) => item.id),
    path,
  );
  return result;
}
function completeDeck(deck: Card[], copies: number, path: string) {
  const frequencies = new Map<string, number>();
  for (const item of deck) {
    const key = `${item.rank}${item.suit}`;
    frequencies.set(key, (frequencies.get(key) ?? 0) + 1);
  }
  check(
    frequencies.size === 52 &&
      [...frequencies.values()].every((count) => count === copies),
    `${path} has an invalid physical card composition`,
  );
}
function sameCard(a: Card, b: Card | undefined) {
  return !!b && a.id === b.id && a.rank === b.rank && a.suit === b.suit;
}
function scenario(value: unknown, path: string) {
  const data = object(value, path);
  text(data.id, `${path}.id`);
  const hand = cards(data.cards, `${path}.cards`, 2, 20);
  const dealer = card(data.dealer, `${path}.dealer`);
  unique([...hand.map((item) => item.id), dealer.id], path);
  bool(data.fromSplit, `${path}.fromSplit`);
  bool(data.splitAces, `${path}.splitAces`);
  number(data.handsCount, `${path}.handsCount`, 1, 4, true);
  optionalNumber(data.trueCount, `${path}.trueCount`);
}
function decision(value: unknown, path: string) {
  const data = object(value, path);
  text(data.id, `${path}.id`);
  scenario(data.scenario, `${path}.scenario`);
  oneOf(data.chosen, ACTIONS, `${path}.chosen`);
  oneOf(data.recommended, ACTIONS, `${path}.recommended`);
  text(data.explanation, `${path}.explanation`, true);
  oneOf(data.category, ["hard", "soft", "pairs"], `${path}.category`);
  for (const key of ["correct", "assisted", "replay"])
    bool(data[key], `${path}.${key}`);
  number(data.responseMs, `${path}.responseMs`, 0);
}
function countAnswer(value: unknown, path: string) {
  const data = object(value, path);
  text(data.id, `${path}.id`);
  oneOf(data.kind, KINDS, `${path}.kind`);
  cards(data.cards, `${path}.cards`, 0, 52);
  bool(data.assisted, `${path}.assisted`);
  for (const key of ["expected", "submitted", "error"])
    number(data[key], `${path}.${key}`);
  for (const key of ["absoluteError", "responseMs"])
    number(data[key], `${path}.${key}`, 0);
  optionalNumber(data.runningCount, `${path}.runningCount`);
  optionalNumber(data.startingCount, `${path}.startingCount`);
  if (data.decksRemaining !== undefined)
    number(data.decksRemaining, `${path}.decksRemaining`, 0.5, 6);
  if (data.kind === "true-count") {
    number(data.runningCount, `${path}.runningCount`);
    number(data.decksRemaining, `${path}.decksRemaining`, 0.5, 6);
  }
  check(
    data.error === (data.submitted as number) - (data.expected as number) &&
      data.absoluteError === Math.abs(data.error as number),
    `${path} has inconsistent answer errors`,
  );
}
function countResult(value: unknown, path: string) {
  const data = object(value, path);
  text(data.id, `${path}.id`);
  oneOf(data.mode, MODES, `${path}.mode`);
  bool(data.assisted, `${path}.assisted`);
  for (const key of [
    "startedAt",
    "endedAt",
    "durationMs",
    "meanAbsoluteError",
    "medianResponseMs",
  ])
    number(data[key], `${path}.${key}`, 0);
  number(data.speedMs, `${path}.speedMs`, 100, 60000);
  if (data.automatic !== undefined) bool(data.automatic, `${path}.automatic`);
  number(data.exactAccuracy, `${path}.exactAccuracy`, 0, 1);
  list(data.answers, `${path}.answers`).forEach((answer, i) =>
    countAnswer(answer, `${path}.answers[${i}]`),
  );
  for (const [key, value] of Object.entries(
    object(data.categoryMetrics, `${path}.categoryMetrics`),
  )) {
    const metrics = object(value, `${path}.categoryMetrics.${key}`);
    number(
      metrics.count,
      `${path}.categoryMetrics.${key}.count`,
      0,
      Infinity,
      true,
    );
    number(
      metrics.exactAccuracy,
      `${path}.categoryMetrics.${key}.exactAccuracy`,
      0,
      1,
    );
    number(
      metrics.meanAbsoluteError,
      `${path}.categoryMetrics.${key}.meanAbsoluteError`,
      0,
    );
  }
}
function session(value: unknown, path: string) {
  const data = object(value, path);
  text(data.id, `${path}.id`);
  text(data.topic, `${path}.topic`);
  oneOf(data.kind, ["strategy", "simulator", "counting"], `${path}.kind`);
  rules(data.rules, `${path}.rules`);
  oneOf(data.feedback, ["coach", "challenge"], `${path}.feedback`);
  if (data.sampling !== undefined)
    oneOf(data.sampling, ["balanced", "realistic"], `${path}.sampling`);
  if (data.checkpointEvery !== undefined)
    check(
      [0, 1, 3].includes(data.checkpointEvery as number),
      `${path}.checkpointEvery is invalid`,
    );
  bool(data.assisted, `${path}.assisted`);
  number(data.startedAt, `${path}.startedAt`, 0);
  optionalNumber(data.endedAt, `${path}.endedAt`, 0);
  number(data.durationMs, `${path}.durationMs`, 0);
  number(data.rounds, `${path}.rounds`, 0, Infinity, true);
  number(data.profit, `${path}.profit`);
  const decisions = list(data.decisions, `${path}.decisions`);
  decisions.forEach((item, i) => decision(item, `${path}.decisions[${i}]`));
  unique(
    decisions.map((item) => (item as ObjectValue).id),
    `${path}.decisions`,
  );
  if (data.kind === "counting" || data.countResult !== undefined)
    countResult(data.countResult, `${path}.countResult`);
  if (data.checkpoints !== undefined)
    list(data.checkpoints, `${path}.checkpoints`).forEach((item, i) => {
      const checkpoint = object(item, `${path}.checkpoints[${i}]`);
      for (const key of [
        "runningExpected",
        "runningSubmitted",
        "trueExpected",
        "trueSubmitted",
      ])
        number(
          checkpoint[key],
          `${path}.checkpoints[${i}].${key}`,
          -Infinity,
          Infinity,
          true,
        );
      for (const key of ["decksExpected", "decksSubmitted"])
        number(
          checkpoint[key],
          `${path}.checkpoints[${i}].${key}`,
          Number.MIN_VALUE,
          6,
        );
    });
  if (data.insurance !== undefined)
    list(data.insurance, `${path}.insurance`).forEach((item, i) => {
      const entry = object(item, `${path}.insurance[${i}]`);
      number(entry.round, `${path}.insurance[${i}].round`, 1, Infinity, true);
      for (const key of ["taken", "recommended", "correct"])
        bool(entry[key], `${path}.insurance[${i}].${key}`);
    });
}
function shoe(value: unknown, path: string) {
  const data = object(value, path);
  rules(data.rules, `${path}.rules`);
  const deck = cards(data.cards, `${path}.cards`, 312, 312);
  completeDeck(deck, 6, `${path}.cards`);
  const nextCard = number(
    data.nextCard,
    `${path}.nextCard`,
    0,
    deck.length,
    true,
  );
  const discarded = cards(data.discarded, `${path}.discarded`, 0, nextCard);
  check(
    discarded.every((item, i) => sameCard(item, deck[i])),
    `${path}.discarded is not the dealt deck prefix`,
  );
  const seen = list(data.seenIds, `${path}.seenIds`);
  seen.forEach((id, i) => text(id, `${path}.seenIds[${i}]`));
  unique(seen, `${path}.seenIds`);
  const dealt = new Map(deck.slice(0, nextCard).map((item) => [item.id, item]));
  check(
    seen.every((id) => dealt.has(id as string)),
    `${path}.seenIds includes an undealt card`,
  );
  const running = number(
    data.runningCount,
    `${path}.runningCount`,
    -Infinity,
    Infinity,
    true,
  );
  check(
    running ===
      seen.reduce<number>((sum, id) => sum + hiLo(dealt.get(id as string)!), 0),
    `${path}.runningCount does not match exposed cards`,
  );
  number(data.bankroll, `${path}.bankroll`);
  number(data.rounds, `${path}.rounds`, 0, Infinity, true);
  number(data.seed, `${path}.seed`);
  number(data.shuffleNumber, `${path}.shuffleNumber`, 1, Infinity, true);
  number(data.penetration, `${path}.penetration`, 0.25, 0.85);
  if (data.round !== undefined) {
    const round = object(data.round, `${path}.round`);
    text(round.id, `${path}.round.id`);
    oneOf(
      round.phase,
      ["insurance", "playing", "complete"],
      `${path}.round.phase`,
    );
    const dealer = cards(round.dealer, `${path}.round.dealer`, 2, 22);
    bool(round.dealerRevealed, `${path}.round.dealerRevealed`);
    const hands = list(round.hands, `${path}.round.hands`);
    check(
      hands.length >= 1 && hands.length <= 4,
      `${path}.round.hands must contain one to four hands`,
    );
    number(
      round.activeHand,
      `${path}.round.activeHand`,
      0,
      hands.length - 1,
      true,
    );
    const roundCards = [...dealer];
    hands.forEach((item, i) => {
      const hand = object(item, `${path}.round.hands[${i}]`);
      text(hand.id, `${path}.round.hands[${i}].id`);
      roundCards.push(
        ...cards(hand.cards, `${path}.round.hands[${i}].cards`, 1, 22),
      );
      number(hand.bet, `${path}.round.hands[${i}].bet`, Number.MIN_VALUE);
      oneOf(
        hand.status,
        ["playing", "stood", "bust", "surrendered", "settled"],
        `${path}.round.hands[${i}].status`,
      );
      bool(hand.fromSplit, `${path}.round.hands[${i}].fromSplit`);
      bool(hand.splitAces, `${path}.round.hands[${i}].splitAces`);
      if (hand.result !== undefined)
        oneOf(
          hand.result,
          ["win", "loss", "push", "blackjack", "surrender"],
          `${path}.round.hands[${i}].result`,
        );
      optionalNumber(hand.profit, `${path}.round.hands[${i}].profit`);
    });
    unique(
      roundCards.map((item) => item.id),
      `${path}.round`,
    );
    check(
      roundCards.every((item) => sameCard(item, dealt.get(item.id))),
      `${path}.round refers to an undealt or changed card`,
    );
    const exposedInRound = round.dealerRevealed
      ? roundCards
      : roundCards.filter((item) => item.id !== dealer[1].id);
    check(
      exposedInRound.every((item) => seen.includes(item.id)),
      `${path}.round has visible cards missing from its count`,
    );
    check(
      round.dealerRevealed || !seen.includes(dealer[1].id),
      `${path}.round counts the hidden hole card`,
    );
    for (const key of ["insuranceBet", "insuranceProfit", "profit"])
      number(
        round[key],
        `${path}.round.${key}`,
        key === "insuranceBet" ? 0 : -Infinity,
      );
    list(round.log, `${path}.round.log`).forEach((line, i) =>
      text(line, `${path}.round.log[${i}]`, true),
    );
  }
}
function training(value: unknown, path: string) {
  const data = object(value, path);
  session(data.session, `${path}.session`);
  const savedSession = data.session as ObjectValue;
  check(
    savedSession.kind !== "counting",
    `${path} must be a strategy or simulator session`,
  );
  for (const key of ["paused", "countMode", "reviewOnly"])
    bool(data[key], `${path}.${key}`);
  number(data.seed, `${path}.seed`);
  number(data.target, `${path}.target`, 1, Infinity, true);
  for (const key of ["timeLimitMs", "elapsedMs"])
    number(data[key], `${path}.${key}`, 0);
  optionalNumber(data.thinkingMs, `${path}.thinkingMs`, 0);
  oneOf(data.sampling, ["balanced", "realistic"], `${path}.sampling`);
  if (data.feedback !== undefined) decision(data.feedback, `${path}.feedback`);
  if (savedSession.kind === "simulator") {
    shoe(data.shoe, `${path}.shoe`);
    const shoeRules = (data.shoe as ObjectValue).rules as ObjectValue;
    const sessionRules = savedSession.rules as ObjectValue;
    check(
      shoeRules.hitSoft17 === sessionRules.hitSoft17 &&
        shoeRules.surrender === sessionRules.surrender,
      `${path} has conflicting shoe and session rules`,
    );
  } else scenario(data.scenario, `${path}.scenario`);
  optionalNumber(data.checkpointEvery, `${path}.checkpointEvery`, 0);
  optionalNumber(data.checkpointRound, `${path}.checkpointRound`, 0);
  if (data.finishAfterRound !== undefined)
    bool(data.finishAfterRound, `${path}.finishAfterRound`);
}
function counting(value: unknown, path: string) {
  const data = object(value, path);
  check(data.version === 1, `${path}.version is unsupported`);
  oneOf(data.mode, MODES, `${path}.mode`);
  oneOf(
    data.phase,
    ["setup", "reveal", "answer", "feedback", "complete"],
    `${path}.phase`,
  );
  text(data.id, `${path}.id`, data.phase === "setup");
  const deck = cards(
    data.deck,
    `${path}.deck`,
    data.phase === "setup" ? 0 : 52,
    data.phase === "setup" ? 0 : 52,
  );
  const index = number(data.index, `${path}.index`, 0, deck.length, true);
  check(
    number(data.runningCount, `${path}.runningCount`) ===
      deck.slice(0, index).reduce((sum, item) => sum + hiLo(item), 0),
    `${path}.runningCount does not match the exposed deck`,
  );
  for (const key of ["startedAt", "activeMs"])
    number(data[key], `${path}.${key}`, 0);
  number(data.speedMs, `${path}.speedMs`, 100, 60000);
  number(data.seed, `${path}.seed`);
  for (const key of ["assistance", "automatic", "paused"])
    bool(data[key], `${path}.${key}`);
  const total = number(
    data.totalExercises,
    `${path}.totalExercises`,
    1,
    1000,
    true,
  );
  const answers = list(data.answers, `${path}.answers`);
  check(answers.length <= total, `${path} has too many answers`);
  answers.forEach((item, i) => countAnswer(item, `${path}.answers[${i}]`));
  unique(
    answers.map((item) => (item as ObjectValue).id),
    `${path}.answers`,
  );
  if (data.phase === "setup") {
    check(
      data.exercise === null && answers.length === 0,
      `${path} setup cannot have an active exercise`,
    );
    return;
  }
  completeDeck(deck, 1, `${path}.deck`);
  const expectedTotal =
    data.mode === "recognition" || data.mode === "pairs"
      ? 20
      : data.mode === "countdown"
        ? 4
        : 10;
  check(
    total === expectedTotal,
    `${path}.totalExercises does not match its mode`,
  );
  check(
    data.phase !== "complete" || answers.length === total,
    `${path} is marked complete before all checkpoints`,
  );
  check(
    !["answer", "reveal"].includes(data.phase as string) ||
      answers.length < total,
    `${path} has an extra active checkpoint`,
  );
  const exercise = object(data.exercise, `${path}.exercise`);
  text(exercise.id, `${path}.exercise.id`);
  oneOf(exercise.kind, KINDS, `${path}.exercise.kind`);
  const expectedKind: Record<string, string> = {
    recognition: "card-value",
    running: "running-count",
    pairs: "pair-value",
    countdown: "running-count",
    decks: "deck-estimate",
    "true-count": "true-count",
  };
  check(
    exercise.kind === expectedKind[data.mode as string],
    `${path}.exercise.kind does not match its training mode`,
  );
  const exposed = cards(exercise.cards, `${path}.exercise.cards`, 0, 52);
  for (const key of ["expected", "startingCount"])
    number(exercise[key], `${path}.exercise.${key}`);
  number(exercise.responseMs, `${path}.exercise.responseMs`, 0);
  const startIndex = number(
    exercise.startIndex,
    `${path}.exercise.startIndex`,
    0,
    index,
    true,
  );
  const targetIndex = number(
    exercise.targetIndex,
    `${path}.exercise.targetIndex`,
    index,
    deck.length,
    true,
  );
  if (data.mode === "decks" || data.mode === "true-count") {
    number(exercise.decksRemaining, `${path}.exercise.decksRemaining`, 0.5, 6);
    number(exercise.discardedCards, `${path}.exercise.discardedCards`, 0, 312);
    check(
      Number.isInteger((exercise.decksRemaining as number) * 2) &&
        exercise.discardedCards ===
          (6 - (exercise.decksRemaining as number)) * 52,
      `${path}.exercise discard tray does not match its half-deck estimate`,
    );
    if (data.mode === "true-count")
      number(
        exercise.runningCount,
        `${path}.exercise.runningCount`,
        -Infinity,
        Infinity,
        true,
      );
    const expected =
      data.mode === "decks"
        ? exercise.decksRemaining
        : Math.floor(
            (exercise.runningCount as number) /
              (exercise.decksRemaining as number),
          );
    check(
      exercise.expected === expected,
      `${path}.exercise.expected does not match its supplied context`,
    );
  } else {
    check(
      exposed.length === index - startIndex &&
        exposed.every((item, i) => sameCard(item, deck[startIndex + i])),
      `${path}.exercise.cards does not match the exposed deck`,
    );
    check(
      data.phase !== "reveal" || index < targetIndex,
      `${path} has no next card to reveal`,
    );
    check(
      data.phase === "reveal" || index === targetIndex,
      `${path} is missing cards for its checkpoint`,
    );
    const startingCount = deck
      .slice(0, startIndex)
      .reduce((sum, item) => sum + hiLo(item), 0);
    const change = deck
      .slice(startIndex, targetIndex)
      .reduce((sum, item) => sum + hiLo(item), 0);
    check(
      exercise.startingCount === startingCount &&
        exercise.expected ===
          (exercise.kind === "running-count" ? startingCount + change : change),
      `${path}.exercise.expected does not match its cards`,
    );
  }
  if (data.phase === "feedback")
    check(
      answers.length > 0 &&
        (answers[answers.length - 1] as ObjectValue).id === exercise.id,
      `${path} feedback is missing its recorded answer`,
    );
}

function casino(value: unknown, path: string) {
  const data = object(value, path);
  check(data.version === 1, `${path}.version is unsupported`);
  text(data.id, `${path}.id`);
  number(data.createdAt, `${path}.createdAt`, 0);
  number(data.revision, `${path}.revision`, 0, Infinity, true);
  number(data.selectedBet, `${path}.selectedBet`, 0, CASINO_MAX_BET);
  number(data.lastBet, `${path}.lastBet`, CASINO_MIN_BET, CASINO_MAX_BET);
  check(
    (data.selectedBet as number) % CASINO_MIN_BET === 0 &&
      (data.lastBet as number) % CASINO_MIN_BET === 0,
    `${path} wagers must use table chip increments`,
  );
  const refills = number(
    data.refillCount,
    `${path}.refillCount`,
    0,
    Infinity,
    true,
  );
  check(
    data.deposits === (refills + 1) * CASINO_REFILL,
    `${path}.deposits does not match virtual refills`,
  );
  shoe(data.shoe, `${path}.shoe`);
  const bankroll = number(
    (data.shoe as ObjectValue).bankroll,
    `${path}.shoe.bankroll`,
    0,
  );
  check(
    bankroll >= casinoCommitted(data as CasinoState),
    `${path} has wagers exceeding its balance`,
  );
}

/** Decode versioned local data without dealing cards, recomputing history, or counting time away. */
export function decodeSavedData(raw: string, defaults: AppData): AppData {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(
      "Saved progress is invalid: the saved text is not valid JSON.",
    );
  }
  const data = object(parsed, "save");
  check(
    data.version === 1,
    "save.version is unsupported; this app supports version 1",
  );
  const savedSettings = object(data.settings, "settings");
  const settings = {
    ...defaults.settings,
    ...savedSettings,
    rules: {
      ...defaults.settings.rules,
      ...object(savedSettings.rules, "settings.rules"),
    },
  };
  rules(settings.rules, "settings.rules");
  oneOf(settings.feedback, ["coach", "challenge"], "settings.feedback");
  for (const key of ["assistance", "haptics", "reducedMotion", "sound"])
    bool(settings[key as keyof typeof settings], `settings.${key}`);
  const sessions = list(data.sessions, "sessions");
  sessions.forEach((item, i) => session(item, `sessions[${i}]`));
  unique(
    sessions.map((item) => (item as ObjectValue).id),
    "sessions",
  );
  const result = { ...defaults, ...data, settings } as AppData;
  bool(result.onboarding, "onboarding");
  text(result.experience, "experience", true);
  text(result.goal, "goal", true);
  for (const [id, date] of Object.entries(
    object(result.completedLessons, "completedLessons"),
  ))
    number(date, `completedLessons.${id}`, 0);
  list(result.bookmarks, "bookmarks").forEach((item, i) => {
    const bookmark = object(item, `bookmarks[${i}]`);
    scenario(bookmark.scenario, `bookmarks[${i}].scenario`);
    rules(bookmark.rules, `bookmarks[${i}].rules`);
    bool(bookmark.countMode, `bookmarks[${i}].countMode`);
  });
  if (result.active !== null) {
    training(result.active, "active");
    result.active = { ...result.active, paused: true };
  }
  if (result.counting !== null) {
    counting(result.counting, "counting");
    result.counting = { ...result.counting, paused: true };
  }
  if (result.casino !== undefined && result.casino !== null)
    casino(result.casino, "casino");
  return result;
}
