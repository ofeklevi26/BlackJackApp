import test from "node:test";
import assert from "node:assert/strict";
import {
  startRound,
  playAction,
  answerInsurance,
  getActiveScenario,
  makeScenario,
  recommend,
  createShoe,
} from "../src/engine";
import {
  newTraining,
  trainingFromSession,
  decisionClockRunning,
  completedSession,
  advanceTrainingTime,
} from "../src/state/training";
import type { AppData } from "../src/state/types";

const data: AppData = {
  version: 1,
  onboarding: true,
  experience: "New to blackjack",
  goal: "Basic strategy",
  completedLessons: {},
  sessions: [],
  bookmarks: [],
  active: null,
  counting: null,
  settings: {
    rules: { hitSoft17: false, surrender: true },
    feedback: "coach",
    assistance: false,
    haptics: false,
    reducedMotion: true,
    sound: false,
  },
};

test("a custom hand ends after its one chosen decision instead of silently switching to mixed hands", () => {
  const custom = newTraining(data, {
    topic: "custom",
    scenario: makeScenario(["10", "6"], "10"),
    target: 50,
    minutes: 3,
  });
  assert.equal(custom.target, 1);
  assert.equal(custom.timeLimitMs, 0);
});

test("review follow-ups preserve rules, feedback, assistance and sampling despite changed preferences", () => {
  const original = newTraining(data, {
    topic: "pairs",
    sampling: "realistic",
  }).session;
  const changed = {
    ...data,
    settings: {
      ...data.settings,
      rules: { hitSoft17: true, surrender: false },
      feedback: "challenge" as const,
      assistance: true,
    },
  };
  const fresh = trainingFromSession(changed, original, { topic: "soft" });
  assert.deepEqual(fresh.session.rules, original.rules);
  assert.equal(fresh.session.feedback, "coach");
  assert.equal(fresh.session.assisted, false);
  assert.equal(fresh.sampling, "realistic");
  assert.equal(fresh.session.topic, "soft");
  assert.equal(original.topic, "pairs");
  assert.equal(fresh.reviewOnly, false);
  const replay = trainingFromSession(changed, original, {
    scenario: makeScenario(["5", "5"], "8"),
    reviewOnly: true,
  });
  assert.equal(replay.target, 1);
  assert.equal(replay.reviewOnly, true);
});

test("table restart remains a simulator while a single-hand replay becomes strategy practice", () => {
  const session = newTraining(data, {
    kind: "simulator",
    topic: "simulator",
    checkpointEvery: 3,
  }).session;
  assert.ok(trainingFromSession(data, session).shoe);
  assert.equal(trainingFromSession(data, session).checkpointEvery, 3);
  const replay = trainingFromSession(data, session, {
    scenario: makeScenario(["10", "6"], "10"),
    reviewOnly: true,
  });
  assert.equal(replay.shoe, undefined);
  assert.equal(replay.session.kind, "strategy");
});

test("decision clock excludes wager selection, insurance, settlement, feedback and pauses", () => {
  let training = newTraining(data, { kind: "simulator", topic: "simulator" });
  training.shoe = createShoe(2026, training.session.rules);
  assert.equal(decisionClockRunning(training), false);
  let sawInsurance = false;
  for (let round = 0; round < 150; round++) {
    training = { ...training, shoe: startRound(training.shoe!, 1) };
    if (training.shoe!.round!.phase === "insurance") {
      sawInsurance = true;
      assert.equal(decisionClockRunning(training), false);
      training.shoe = answerInsurance(training.shoe!, false);
    }
    while (getActiveScenario(training.shoe!)) {
      const scenario = getActiveScenario(training.shoe!)!;
      assert.equal(decisionClockRunning(training), true);
      assert.equal(decisionClockRunning({ ...training, paused: true }), false);
      const action = recommend(scenario, training.session.rules).action;
      training.shoe = playAction(training.shoe!, action);
    }
    assert.equal(decisionClockRunning(training), false);
  }
  assert.ok(sawInsurance);
  const strategy = newTraining(data);
  assert.equal(decisionClockRunning(strategy), true);
  strategy.feedback = {
    id: "answer",
    scenario: strategy.scenario!,
    chosen: "hit",
    recommended: "hit",
    explanation: "Recorded",
    correct: true,
    responseMs: 100,
    assisted: false,
    replay: false,
    category: "hard",
  };
  assert.equal(decisionClockRunning(strategy), false);
});

test("fractional time at answer and finish boundaries is included while paused time is excluded", () => {
  let training = newTraining(data);
  training = advanceTrainingTime(training, 2000);
  training = advanceTrainingTime(training, 975);
  assert.equal(training.elapsedMs, 2975);
  assert.equal(training.thinkingMs, 2975);
  const paused = { ...training, paused: true };
  assert.equal(advanceTrainingTime(paused, 60000), paused);
});

test("finishing preserves the original session metadata and net virtual accounting", () => {
  const training = newTraining(data, { kind: "simulator", topic: "simulator" });
  training.shoe = { ...training.shoe!, bankroll: 97.5, rounds: 3 };
  training.elapsedMs = 1200;
  const result = completedSession(training, 5000);
  assert.equal(result.profit, -2.5);
  assert.equal(result.rounds, 3);
  assert.equal(result.durationMs, 1200);
  assert.equal(result.endedAt, 5000);
  assert.equal(training.session.endedAt, undefined);
});
