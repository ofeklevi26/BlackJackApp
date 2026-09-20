import test from "node:test";
import assert from "node:assert/strict";
import { hiLo, trueCount } from "../src/engine";
import {
  advanceCountingTime,
  countExplanation,
  createCountingSetup,
  finishCountingSession,
  nextCountingExercise,
  revealNextCountingCard,
  startCountingSession,
  submitCountAnswer,
  type CountingState,
} from "../src/counting";

function revealToCheckpoint(state: CountingState) {
  let current = state;
  while (current.phase === "reveal") current = revealNextCountingCard(current);
  return current;
}

test("a countdown exposes 52 unique cards once, preserves checkpoint counts, and ends at zero", () => {
  let state = startCountingSession(
    { ...createCountingSetup(false), mode: "countdown" },
    1000,
    12345,
  );
  const seen: string[] = [];
  for (let checkpoint = 0; checkpoint < 4; checkpoint++) {
    state = revealToCheckpoint(state);
    assert.equal(state.index, (checkpoint + 1) * 13);
    const actualCount = state.deck
      .slice(0, state.index)
      .reduce((sum, card) => sum + hiLo(card), 0);
    assert.equal(state.runningCount, actualCount);
    assert.equal(state.exercise?.expected, actualCount);
    seen.push(...state.exercise!.cards.map((card) => card.id));
    state = submitCountAnswer(state, actualCount);
    state = nextCountingExercise(state);
  }
  assert.equal(new Set(seen).size, 52);
  assert.equal(state.index, 52);
  assert.equal(state.runningCount, 0);
  assert.equal(state.phase, "complete");
  assert.equal(state.answers.length, 4);
});

test("unseen cards do not affect the running count, and feedback cannot expose another card", () => {
  let state = startCountingSession(
    { ...createCountingSetup(false), mode: "running" },
    1000,
    2,
  );
  assert.equal(state.index, 1);
  assert.equal(state.runningCount, hiLo(state.deck[0]));
  state = revealToCheckpoint(state);
  const checkpoint = state.index;
  state = submitCountAnswer(state, 0);
  const unchanged = revealNextCountingCard(state);
  assert.equal(unchanged.index, checkpoint);
  assert.equal(unchanged, state);
});

test("pair exercises grade the pair delta independently of the previous running count", () => {
  let state = startCountingSession(
    { ...createCountingSetup(false), mode: "pairs" },
    1000,
    9302,
  );
  for (let pair = 0; pair < 20; pair++) {
    state = revealToCheckpoint(state);
    const expected = state.exercise!.cards.reduce(
      (sum, card) => sum + hiLo(card),
      0,
    );
    assert.equal(state.exercise!.expected, expected);
    state = nextCountingExercise(submitCountAnswer(state, expected));
  }
  assert.equal(state.index, 40);
  assert.equal(finishCountingSession(state).exactAccuracy, 1);
});

test("persisted state resumes an identical shoe and checkpoint without revealing extra cards", () => {
  let original = startCountingSession(
    { ...createCountingSetup(false), mode: "countdown" },
    1000,
    8123,
  );
  original = revealNextCountingCard(original);
  original = revealNextCountingCard(original);
  const restored = JSON.parse(JSON.stringify(original)) as CountingState;
  assert.deepEqual(revealToCheckpoint(restored), revealToCheckpoint(original));
  const nextOriginal = nextCountingExercise(
    submitCountAnswer(revealToCheckpoint(original), 3),
  );
  const nextRestored = nextCountingExercise(
    submitCountAnswer(revealToCheckpoint(restored), 3),
  );
  assert.deepEqual(nextRestored, nextOriginal);
});

test("paused sessions do not deal cards or accumulate active or answer time", () => {
  const state = revealToCheckpoint(
    startCountingSession(
      { ...createCountingSetup(false), mode: "running" },
      1000,
      2,
    ),
  );
  const timed = advanceCountingTime(state, 1500);
  assert.equal(timed.activeMs, 1500);
  assert.equal(timed.exercise?.responseMs, 1500);
  const paused = { ...timed, paused: true };
  assert.equal(advanceCountingTime(paused, 60000), paused);
  assert.equal(revealNextCountingCard(paused), paused);
  assert.equal(submitCountAnswer(paused, 1), paused);
});

test("dealing and explanations do not inflate response time", () => {
  let state = startCountingSession(
    { ...createCountingSetup(false), mode: "running" },
    1000,
    2,
  );
  state = advanceCountingTime(state, 3000);
  assert.equal(state.exercise?.responseMs, 0);
  state = advanceCountingTime(revealToCheckpoint(state), 1100);
  state = submitCountAnswer(state, state.exercise!.expected);
  state = advanceCountingTime(state, 8000);
  assert.equal(state.answers[0].responseMs, 1100);
  assert.equal(state.activeMs, 12100);
});

test("duplicate submissions preserve the first answer and do not change statistics", () => {
  const state = startCountingSession(createCountingSetup(false), 1000, 17);
  const answered = submitCountAnswer(state, state.exercise!.expected + 2);
  assert.equal(submitCountAnswer(answered, state.exercise!.expected), answered);
  const result = finishCountingSession(answered, 2000);
  assert.equal(result.answers.length, 1);
  assert.equal(result.exactAccuracy, 0);
  assert.equal(result.meanAbsoluteError, 2);
  assert.equal(result.categoryMetrics["card-value"].count, 1);
});

test("guided answers remain labeled, and median times handle even samples", () => {
  let state = startCountingSession(createCountingSetup(true), 1000, 17);
  state = submitCountAnswer(
    advanceCountingTime(state, 2000),
    state.exercise!.expected,
  );
  state = nextCountingExercise(state);
  state = submitCountAnswer(
    advanceCountingTime(state, 4000),
    state.exercise!.expected + 1,
  );
  const result = finishCountingSession(state, 7000);
  assert.equal(result.assisted, true);
  assert.ok(result.answers.every((answer) => answer.assisted));
  assert.equal(result.exactAccuracy, 0.5);
  assert.equal(result.meanAbsoluteError, 0.5);
  assert.equal(result.medianResponseMs, 3000);
});

test("true count contexts use floor for negative fractions and deterministic half-deck denominators", () => {
  let state = startCountingSession(
    { ...createCountingSetup(false), mode: "true-count" },
    1000,
    71829,
  );
  let negativeFractionSeen = false;
  for (let i = 0; i < 10; i++) {
    const exercise = state.exercise!;
    assert.ok(exercise.decksRemaining! >= 0.5);
    assert.ok(exercise.decksRemaining! <= 5.5);
    assert.equal((exercise.decksRemaining! * 2) % 1, 0);
    const quotient = exercise.runningCount! / exercise.decksRemaining!;
    assert.equal(exercise.expected, Math.floor(quotient));
    if (quotient < 0 && !Number.isInteger(quotient))
      negativeFractionSeen = true;
    state = nextCountingExercise(submitCountAnswer(state, exercise.expected));
  }
  assert.equal(trueCount(-1, 2), -1);
  assert.equal(negativeFractionSeen, true);
  assert.equal(state.phase, "complete");
  assert.match(
    countExplanation(state.answers.find((answer) => answer.runningCount! < 0)!),
    /negative infinity/,
  );
});

test("discard tray estimates reconcile with the original six-deck shoe", () => {
  let state = startCountingSession(
    { ...createCountingSetup(false), mode: "decks" },
    1000,
    1023,
  );
  for (let i = 0; i < 10; i++) {
    const exercise = state.exercise!;
    assert.equal(exercise.expected + exercise.discardedCards! / 52, 6);
    assert.equal(submitCountAnswer(state, 2.25), state);
    assert.equal(submitCountAnswer(state, 7), state);
    state = nextCountingExercise(submitCountAnswer(state, exercise.expected));
  }
  assert.equal(state.phase, "complete");
});

test("invalid input is never recorded as an answer", () => {
  const state = startCountingSession(createCountingSetup(false), 1000, 32);
  assert.equal(submitCountAnswer(state, Number.NaN), state);
  assert.equal(submitCountAnswer(state, Number.POSITIVE_INFINITY), state);
  assert.equal(submitCountAnswer(state, 0.5), state);
});
