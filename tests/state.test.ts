import test from "node:test";
import assert from "node:assert/strict";
import { makeScenario } from "../src/engine";
import {
  comparisonKey,
  median,
  summarize,
  weakTopics,
} from "../src/state/analytics";
import type { Decision, Session } from "../src/state/types";

let sequence = 0;
function decision(overrides: Partial<Decision> = {}): Decision {
  return {
    id: `d-${sequence++}`,
    scenario: makeScenario(["10", "6"], "10"),
    chosen: "hit",
    recommended: "surrender",
    explanation: "Surrender after the dealer peek.",
    correct: false,
    responseMs: 3000,
    assisted: false,
    replay: false,
    category: "hard",
    ...overrides,
  };
}
function session(
  decisions: Decision[] = [],
  overrides: Partial<Session> = {},
): Session {
  return {
    id: `s-${sequence++}`,
    startedAt: 1000,
    endedAt: 9000,
    kind: "strategy",
    topic: "mixed",
    rules: { hitSoft17: false, surrender: true },
    feedback: "coach",
    assisted: false,
    decisions,
    durationMs: 8000,
    rounds: decisions.length,
    profit: 0,
    ...overrides,
  };
}

test("first-attempt statistics exclude replays from accuracy, response time, and all groups", () => {
  const actual = summarize([
    decision({ correct: true, recommended: "stand", responseMs: 1000 }),
    decision({ correct: false, recommended: "surrender", responseMs: 3000 }),
    decision({
      correct: true,
      replay: true,
      recommended: "surrender",
      responseMs: 100000,
    }),
  ]);
  assert.equal(actual.count, 2);
  assert.equal(actual.accuracy, 0.5);
  assert.equal(actual.medianMs, 2000);
  assert.deepEqual(actual.groups.hard, { count: 2, accuracy: 0.5 });
  assert.deepEqual(actual.groups.surrender, { count: 1, accuracy: 0 });
  assert.deepEqual(actual.groups.stand, { count: 1, accuracy: 1 });
});

test("assisted and unassisted first attempts retain separate denominators and outcomes", () => {
  const actual = summarize([
    decision({ correct: true, assisted: true }),
    decision({ correct: false, assisted: true }),
    decision({ correct: true, assisted: false }),
    decision({ correct: false, assisted: false, replay: true }),
  ]);
  assert.deepEqual(actual.assisted, { count: 2, accuracy: 0.5 });
  assert.deepEqual(actual.unassisted, { count: 1, accuracy: 1 });
  assert.equal(actual.count, 3);
  assert.equal(actual.accuracy, 2 / 3);
});

test("action groups follow the recommended action rather than the incorrect chosen action", () => {
  const actual = summarize([
    decision({
      category: "soft",
      chosen: "hit",
      recommended: "double",
      correct: false,
    }),
    decision({
      category: "pairs",
      chosen: "stand",
      recommended: "split",
      correct: false,
    }),
    decision({
      category: "hard",
      chosen: "hit",
      recommended: "hit",
      correct: true,
    }),
  ]);
  assert.deepEqual(actual.groups.double, { count: 1, accuracy: 0 });
  assert.deepEqual(actual.groups.split, { count: 1, accuracy: 0 });
  assert.deepEqual(actual.groups.hit, { count: 1, accuracy: 1 });
  assert.deepEqual(actual.groups.soft, { count: 1, accuracy: 0 });
  assert.deepEqual(actual.groups.pairs, { count: 1, accuracy: 0 });
});

test("median handles empty, odd, and even samples without mutating saved decision order", () => {
  const original = [900, 100, 700, 300];
  assert.equal(median([]), 0);
  assert.equal(median([800]), 800);
  assert.equal(median([300, 100, 900]), 300);
  assert.equal(median(original), 500);
  assert.deepEqual(original, [900, 100, 700, 300]);
});

test("empty and replay-only sessions do not produce NaN or false mastery observations", () => {
  for (const decisions of [[], [decision({ replay: true, correct: true })]]) {
    const actual = summarize(decisions);
    assert.equal(actual.count, 0);
    assert.equal(actual.accuracy, 0);
    assert.equal(actual.medianMs, 0);
    assert.equal(actual.assisted.count, 0);
    assert.equal(actual.unassisted.count, 0);
    assert.ok(
      Object.values(actual.groups).every(
        (group) => group.count === 0 && group.accuracy === 0,
      ),
    );
  }
});

test("weak topic recommendations prioritize observed errors and ignore replay-only categories", () => {
  const actual = weakTopics([
    session([
      decision({ category: "soft", correct: true }),
      decision({ category: "soft", correct: false }),
    ]),
    session([
      decision({ category: "hard", correct: false }),
      decision({ category: "pairs", correct: true, replay: true }),
    ]),
  ]);
  assert.deepEqual(actual, ["hard", "soft"]);
  assert.deepEqual(weakTopics([]), []);
});

test("comparison groups separate rules, feedback, assistance, training mode, and topic", () => {
  const base = session();
  const changed = [
    session([], { rules: { hitSoft17: true, surrender: true } }),
    session([], { rules: { hitSoft17: false, surrender: false } }),
    session([], { feedback: "challenge" }),
    session([], { assisted: true }),
    session([], { kind: "simulator" }),
    session([], { topic: "soft" }),
    session([], { kind: "counting", topic: "running" }),
  ];
  const keys = [base, ...changed].map(comparisonKey);
  assert.equal(new Set(keys).size, keys.length);
});

test("comparable sessions remain grouped despite their dates, length, outcomes, and balance", () => {
  const short = session([decision({ correct: true })]);
  const long = session([decision(), decision(), decision()], {
    id: "later-session",
    startedAt: 900000,
    endedAt: 920000,
    durationMs: 20000,
    rounds: 3,
    profit: -10,
  });
  assert.equal(comparisonKey(short), comparisonKey(long));
});
