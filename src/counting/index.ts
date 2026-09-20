import { Card, createDeck, hiLo, trueCount } from "../engine";

export type CountingMode =
  "recognition" | "running" | "pairs" | "countdown" | "decks" | "true-count";
export type CountKind =
  | "card-value"
  | "running-count"
  | "pair-value"
  | "deck-estimate"
  | "true-count";
export interface CountAnswer {
  id: string;
  kind: CountKind;
  expected: number;
  submitted: number;
  error: number;
  absoluteError: number;
  responseMs: number;
  cards: Card[];
  assisted: boolean;
  runningCount?: number;
  decksRemaining?: number;
  startingCount?: number;
}
export interface CountMetrics {
  count: number;
  exactAccuracy: number;
  meanAbsoluteError: number;
}
export interface CountResult {
  id: string;
  startedAt: number;
  endedAt: number;
  mode: CountingMode;
  answers: CountAnswer[];
  assisted: boolean;
  speedMs: number;
  automatic?: boolean;
  durationMs: number;
  exactAccuracy: number;
  meanAbsoluteError: number;
  medianResponseMs: number;
  categoryMetrics: Record<string, CountMetrics>;
}
export interface CountExercise {
  id: string;
  kind: CountKind;
  cards: Card[];
  expected: number;
  startingCount: number;
  startIndex: number;
  targetIndex: number;
  responseMs: number;
  runningCount?: number;
  decksRemaining?: number;
  discardedCards?: number;
}
export interface CountingState {
  version: 1;
  id: string;
  mode: CountingMode;
  phase: "setup" | "reveal" | "answer" | "feedback" | "complete";
  deck: Card[];
  index: number;
  runningCount: number;
  exercise: CountExercise | null;
  answers: CountAnswer[];
  startedAt: number;
  activeMs: number;
  speedMs: number;
  assistance: boolean;
  automatic: boolean;
  paused: boolean;
  seed: number;
  totalExercises: number;
}
export const COUNTING_MODES: {
  id: CountingMode;
  title: string;
  subtitle: string;
  detail: string;
}[] = [
  {
    id: "recognition",
    title: "Card values",
    subtitle: "Learn the three Hi-Lo groups",
    detail: "20 cards · answer −1, 0, or +1",
  },
  {
    id: "running",
    title: "Running count",
    subtitle: "Keep the total as cards appear",
    detail: "10 checkpoints · 4 new cards each",
  },
  {
    id: "pairs",
    title: "Pair cancellation",
    subtitle: "Recognize pairs that cancel",
    detail: "20 pairs · give the combined Hi-Lo value",
  },
  {
    id: "countdown",
    title: "Deck countdown",
    subtitle: "Hold your count across a full deck",
    detail: "52 cards · a checkpoint every 13 cards",
  },
  {
    id: "decks",
    title: "Deck estimation",
    subtitle: "Read a six-deck discard tray",
    detail: "10 estimates · answer in half decks",
  },
  {
    id: "true-count",
    title: "True count",
    subtitle: "Convert a supplied running count",
    detail: "10 conversions · round down toward −∞",
  },
];
export const describeMode = (mode: CountingMode) =>
  COUNTING_MODES.find((item) => item.id === mode)!;
export const signed = (value: number) => (value > 0 ? `+${value}` : `${value}`);

/** Accept a pasted mathematical minus without silently changing its sign or digits. */
export function normalizeCountInput(value: string): string {
  return value.trim().replace(/[−–]/g, "-").replace(/^\+/, "").slice(0, 8);
}
export const validCountInput = (value: string) => /^-?\d+$/.test(value);

/** A stable integer mixer keeps resumed and replayed exercises identical. */
function randomAt(seed: number, index: number): number {
  let value = (seed ^ Math.imul(index + 1, 0x9e3779b9)) >>> 0;
  value = Math.imul(value ^ (value >>> 16), 0x21f0aaad);
  value = Math.imul(value ^ (value >>> 15), 0x735a2d97);
  return ((value ^ (value >>> 15)) >>> 0) / 4294967296;
}

export function createCountingSetup(assistance = true): CountingState {
  return {
    version: 1,
    id: "",
    mode: "recognition",
    phase: "setup",
    deck: [],
    index: 0,
    runningCount: 0,
    exercise: null,
    answers: [],
    startedAt: 0,
    activeMs: 0,
    speedMs: 1200,
    assistance,
    automatic: false,
    paused: false,
    seed: 1,
    totalExercises: 20,
  };
}

export function startCountingSession(
  config: CountingState,
  now = Date.now(),
  seed = now,
): CountingState {
  const totalExercises =
    config.mode === "recognition" || config.mode === "pairs"
      ? 20
      : config.mode === "countdown"
        ? 4
        : 10;
  const next: CountingState = {
    ...config,
    id: `count-${now}-${seed >>> 0}`,
    phase: "reveal",
    deck: createDeck(seed, 1),
    index: 0,
    runningCount: 0,
    exercise: null,
    answers: [],
    startedAt: now,
    activeMs: 0,
    paused: false,
    seed,
    totalExercises,
  };
  return nextCountingExercise(next);
}

export function nextCountingExercise(state: CountingState): CountingState {
  // Repeated Next taps may be queued before React updates the visible controls.
  // Once the new exercise exists, only its recorded feedback can advance it.
  if (state.paused || (state.exercise !== null && state.phase !== "feedback"))
    return state;
  if (state.answers.length >= state.totalExercises)
    return { ...state, phase: "complete" };
  const ordinal = state.answers.length;
  const id = `${state.id}-${ordinal}`;
  if (state.mode === "decks" || state.mode === "true-count") {
    // Half-deck estimates, with at least half a deck available for division.
    const decksRemaining =
      (1 + Math.floor(randomAt(state.seed, ordinal * 2) * 11)) / 2;
    const discardedCards = (6 - decksRemaining) * 52;
    const suppliedCount =
      Math.floor(randomAt(state.seed, ordinal * 2 + 1) * 31) - 12;
    return {
      ...state,
      phase: "answer",
      exercise: {
        id,
        kind: state.mode === "decks" ? "deck-estimate" : "true-count",
        cards: [],
        expected:
          state.mode === "decks"
            ? decksRemaining
            : trueCount(suppliedCount, decksRemaining),
        startingCount: 0,
        startIndex: 0,
        targetIndex: 0,
        responseMs: 0,
        decksRemaining,
        discardedCards,
        ...(state.mode === "true-count" ? { runningCount: suppliedCount } : {}),
      },
    };
  }
  const amount =
    state.mode === "recognition"
      ? 1
      : state.mode === "pairs"
        ? 2
        : state.mode === "countdown"
          ? 13
          : 4;
  const targetIndex = Math.min(state.index + amount, state.deck.length);
  const kind: CountKind =
    state.mode === "recognition"
      ? "card-value"
      : state.mode === "pairs"
        ? "pair-value"
        : "running-count";
  const cards = state.deck.slice(state.index, targetIndex);
  const change = cards.reduce((count, card) => count + hiLo(card), 0);
  const exercise: CountExercise = {
    id,
    kind,
    cards: [],
    expected: kind === "running-count" ? state.runningCount + change : change,
    startingCount: state.runningCount,
    startIndex: state.index,
    targetIndex,
    responseMs: 0,
  };
  return revealNextCountingCard({ ...state, phase: "reveal", exercise });
}

export function revealNextCountingCard(state: CountingState): CountingState {
  if (state.paused || state.phase !== "reveal" || !state.exercise) return state;
  if (state.index >= state.exercise.targetIndex)
    return { ...state, phase: "answer" };
  const card = state.deck[state.index];
  if (!card) return state;
  const index = state.index + 1;
  return {
    ...state,
    index,
    runningCount: state.runningCount + hiLo(card),
    phase: index >= state.exercise.targetIndex ? "answer" : "reveal",
    exercise: { ...state.exercise, cards: [...state.exercise.cards, card] },
  };
}

export function advanceCountingTime(
  state: CountingState,
  elapsedMs: number,
): CountingState {
  if (
    state.paused ||
    state.phase === "setup" ||
    state.phase === "complete" ||
    elapsedMs <= 0 ||
    !Number.isFinite(elapsedMs)
  )
    return state;
  return {
    ...state,
    activeMs: state.activeMs + elapsedMs,
    exercise:
      state.exercise && state.phase === "answer"
        ? {
            ...state.exercise,
            responseMs: state.exercise.responseMs + elapsedMs,
          }
        : state.exercise,
  };
}

export function submitCountAnswer(
  state: CountingState,
  submitted: number,
): CountingState {
  if (
    state.paused ||
    state.phase !== "answer" ||
    !state.exercise ||
    !Number.isFinite(submitted)
  )
    return state;
  if (
    state.exercise.kind === "deck-estimate" &&
    (submitted < 0 || submitted > 6 || !Number.isInteger(submitted * 2))
  )
    return state;
  if (state.exercise.kind !== "deck-estimate" && !Number.isInteger(submitted))
    return state;
  const exercise = state.exercise;
  const error = submitted - exercise.expected;
  const answer: CountAnswer = {
    id: exercise.id,
    kind: exercise.kind,
    expected: exercise.expected,
    submitted,
    error,
    absoluteError: Math.abs(error),
    responseMs: exercise.responseMs,
    cards: exercise.cards,
    assisted: state.assistance,
    startingCount: exercise.startingCount,
    ...(exercise.runningCount !== undefined
      ? { runningCount: exercise.runningCount }
      : {}),
    ...(exercise.decksRemaining !== undefined
      ? { decksRemaining: exercise.decksRemaining }
      : {}),
  };
  return { ...state, phase: "feedback", answers: [...state.answers, answer] };
}

export function countMetrics(answers: CountAnswer[]): CountMetrics {
  return {
    count: answers.length,
    exactAccuracy: answers.length
      ? answers.filter((answer) => answer.absoluteError === 0).length /
        answers.length
      : 0,
    meanAbsoluteError: answers.length
      ? answers.reduce((sum, answer) => sum + answer.absoluteError, 0) /
        answers.length
      : 0,
  };
}

export function finishCountingSession(
  state: CountingState,
  now = Date.now(),
): CountResult {
  const categoryMetrics: Record<string, CountMetrics> = {};
  for (const kind of new Set(state.answers.map((answer) => answer.kind)))
    categoryMetrics[kind] = countMetrics(
      state.answers.filter((answer) => answer.kind === kind),
    );
  const sortedTimes = state.answers
    .map((answer) => answer.responseMs)
    .sort((a, b) => a - b);
  const mid = Math.floor(sortedTimes.length / 2);
  const medianResponseMs = sortedTimes.length
    ? sortedTimes.length % 2
      ? sortedTimes[mid]
      : (sortedTimes[mid - 1] + sortedTimes[mid]) / 2
    : 0;
  const metrics = countMetrics(state.answers);
  return {
    id: state.id,
    startedAt: state.startedAt,
    endedAt: now,
    mode: state.mode,
    answers: state.answers,
    assisted: state.answers.some((answer) => answer.assisted),
    speedMs: state.speedMs,
    automatic: state.automatic,
    durationMs: state.activeMs,
    exactAccuracy: metrics.exactAccuracy,
    meanAbsoluteError: metrics.meanAbsoluteError,
    medianResponseMs,
    categoryMetrics,
  };
}

export function countExplanation(answer: CountAnswer): string {
  if (answer.kind === "true-count") {
    const ratio = answer.runningCount! / answer.decksRemaining!;
    return `${signed(answer.runningCount!)} ÷ ${answer.decksRemaining} decks = ${Number.isInteger(ratio) ? ratio : ratio.toFixed(2)}. Round down toward negative infinity: ${signed(answer.expected)}. A negative fraction rounds to the next lower integer, not toward zero.`;
  }
  if (answer.kind === "deck-estimate")
    return `About ${(6 - answer.expected).toFixed(1)} decks have been discarded from the six-deck shoe. 6 − ${(6 - answer.expected).toFixed(1)} = ${answer.expected.toFixed(1)} decks remaining.`;
  if (answer.kind === "card-value")
    return "In Hi-Lo, 2–6 add +1; 7–9 add 0; tens, face cards, and aces add −1.";
  const change = answer.cards.reduce((sum, card) => sum + hiLo(card), 0);
  if (answer.kind === "pair-value")
    return `Add the two Hi-Lo values: ${answer.cards.map((card) => signed(hiLo(card))).join(" + ")} = ${signed(change)}. A low card (+1) and a high card (−1) cancel to zero.`;
  return `The count was ${signed(answer.startingCount ?? 0)} before these ${answer.cards.length} cards. Their combined change is ${signed(change)}, so the running count is ${signed(answer.expected)}. Continue from this corrected count.`;
}
