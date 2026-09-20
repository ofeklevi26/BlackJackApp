import test from "node:test";
import assert from "node:assert/strict";
import {
  createShoe,
  getActiveScenario,
  hiLo,
  playAction,
  recommend,
  startRound,
  answerInsurance,
} from "../src/engine";
import {
  advanceCountingTime,
  createCountingSetup,
  finishCountingSession,
  revealNextCountingCard,
  startCountingSession,
  submitCountAnswer,
} from "../src/counting";
import {
  createSaveQueue,
  decodeSavedData,
  pauseSavedActivities,
  serializeHistoryExport,
} from "../src/state/persistence";
import { newTraining } from "../src/state/training";
import type { AppData, Session } from "../src/state/types";

function defaults(): AppData {
  return {
    version: 1,
    onboarding: false,
    experience: "New to blackjack",
    goal: "Basic strategy",
    completedLessons: {},
    settings: {
      rules: { hitSoft17: false, surrender: true },
      feedback: "coach",
      assistance: false,
      haptics: true,
      reducedMotion: false,
      sound: false,
    },
    sessions: [],
    bookmarks: [],
    active: null,
    counting: null,
  };
}
function decode(value: unknown) {
  return decodeSavedData(JSON.stringify(value), defaults());
}
function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

test("a valid empty save hydrates without changing defaults or fabricating progress", () => {
  const input = defaults();
  const fallback = defaults();
  assert.deepEqual(decodeSavedData(JSON.stringify(input), fallback), input);
  assert.deepEqual(fallback, defaults());
});

test("decoding rejects broken JSON, null roots, future versions, and malformed required structures", () => {
  assert.throws(() => decodeSavedData("{oops", defaults()), /not valid JSON/);
  assert.throws(() => decode(null), /save must be an object/);
  assert.throws(
    () => decode({ ...defaults(), version: 2 }),
    /version is unsupported/,
  );
  assert.throws(
    () => decode({ ...defaults(), sessions: {} }),
    /sessions must be a list/,
  );
  assert.throws(
    () => decode({ ...defaults(), settings: null }),
    /settings must be an object/,
  );
});

test("omitted optional preferences use defaults while malformed preferences are rejected", () => {
  const saved = {
    version: 1,
    sessions: [],
    settings: { rules: { surrender: false } },
  };
  const result = decode(saved);
  assert.deepEqual(result.settings, {
    ...defaults().settings,
    rules: { hitSoft17: false, surrender: false },
  });
  assert.equal(result.active, null);
  assert.equal(result.counting, null);
  assert.throws(
    () =>
      decode({
        ...saved,
        settings: { ...saved.settings, assistance: "false" },
      }),
    /settings.assistance/,
  );
  assert.throws(
    () =>
      decode({
        ...saved,
        settings: { ...saved.settings, feedback: "instant" },
      }),
    /settings.feedback/,
  );
  assert.throws(
    () => decode({ ...saved, settings: { rules: { hitSoft17: "yes" } } }),
    /settings.rules.hitSoft17/,
  );
});

test("strategy hydration pauses the session and preserves the exact hand and accumulated timing", () => {
  const data = defaults();
  data.active = {
    ...newTraining(data),
    elapsedMs: 17341,
    thinkingMs: 2192,
    paused: false,
  };
  const original = clone(data);
  const result = decode(data);
  assert.equal(result.active?.paused, true);
  assert.deepEqual(result.active, { ...original.active, paused: true });
  assert.deepEqual(clone(data), original);
});

test("continuous shoes hydrate without shuffling, exposing cards, or changing checkpoints", () => {
  const data = defaults();
  const liveShoe = startRound(createShoe(482), 4);
  data.active = {
    ...newTraining(data, { kind: "simulator", topic: "simulator" }),
    shoe: liveShoe,
    checkpointEvery: 3,
    checkpointRound: 0,
    elapsedMs: 3900,
  };
  const before = clone(liveShoe);
  const result = decode(data);
  assert.equal(result.active?.paused, true);
  assert.deepEqual(result.active?.shoe, before);
  assert.equal(result.active?.checkpointEvery, 3);
  assert.equal(result.active?.elapsedMs, 3900);
});

test("counting hydration pauses both activities and preserves reveal position, answer, and timing", () => {
  const data = defaults();
  data.active = newTraining(data);
  let counting = startCountingSession(
    { ...createCountingSetup(false), mode: "running", automatic: true },
    1000,
    9801,
  );
  counting = revealNextCountingCard(counting);
  counting = advanceCountingTime(counting, 1388);
  data.counting = counting;
  const original = clone(counting);
  const result = decode(data);
  assert.equal(result.active?.paused, true);
  assert.equal(result.counting?.paused, true);
  assert.deepEqual(result.counting, { ...original, paused: true });
  assert.deepEqual(data.counting, original);
});

test("counting setup and completed feedback hydrate safely with their existing records", () => {
  const data = defaults();
  data.counting = createCountingSetup();
  assert.equal(decode(data).counting?.phase, "setup");
  let counting = startCountingSession(createCountingSetup(false), 1000, 998);
  counting = submitCountAnswer(
    advanceCountingTime(counting, 2017),
    counting.exercise!.expected,
  );
  data.counting = counting;
  const result = decode(data);
  assert.equal(result.counting?.phase, "feedback");
  assert.deepEqual(result.counting?.answers, counting.answers);
  assert.equal(result.counting?.exercise?.responseMs, 2017);
});

test("shoe validation catches impossible indices, duplicated cards, and corrupt visible counts", () => {
  const data = defaults();
  data.active = {
    ...newTraining(data, { kind: "simulator" }),
    shoe: startRound(createShoe(1), 1),
  };
  const badIndex = clone(data);
  badIndex.active!.shoe!.nextCard = 400;
  assert.throws(() => decode(badIndex), /shoe.nextCard/);
  const duplicate = clone(data);
  duplicate.active!.shoe!.cards[2] = duplicate.active!.shoe!.cards[1];
  assert.throws(() => decode(duplicate), /shoe.cards contains duplicate/);
  const incorrect = clone(data);
  incorrect.active!.shoe!.runningCount += 1;
  assert.throws(
    () => decode(incorrect),
    /runningCount does not match exposed cards/,
  );
  const unseen = clone(data);
  unseen.active!.shoe!.seenIds.push(unseen.active!.shoe!.cards[300].id);
  assert.throws(() => decode(unseen), /seenIds includes an undealt card/);
});

test("a hidden dealer card cannot silently enter a resumed running count", () => {
  const data = defaults();
  let shoe = startRound(createShoe(1), 1);
  for (let seed = 2; shoe.round?.dealerRevealed && seed < 100; seed++)
    shoe = startRound(createShoe(seed), 1);
  assert.equal(shoe.round?.dealerRevealed, false);
  const hole = shoe.round!.dealer[1];
  shoe.seenIds.push(hole.id);
  shoe.runningCount += hiLo(hole);
  data.active = { ...newTraining(data, { kind: "simulator" }), shoe };
  assert.throws(() => decode(data), /counts the hidden hole card/);
});

test("counting validation rejects missing feedback answers, stale positions, and invalid decks", () => {
  const data = defaults();
  data.counting = startCountingSession(createCountingSetup(false), 1000, 17);
  const feedback = clone(data);
  feedback.counting!.phase = "feedback";
  assert.throws(
    () => decode(feedback),
    /feedback is missing its recorded answer/,
  );
  const position = clone(data);
  position.counting!.index = 53;
  assert.throws(() => decode(position), /counting.index/);
  const missing = clone(data);
  missing.counting!.deck.pop();
  assert.throws(
    () => decode(missing),
    /counting.deck has an invalid card count/,
  );
  const expected = clone(data);
  expected.counting!.exercise!.expected += 1;
  assert.throws(
    () => decode(expected),
    /exercise.expected does not match its cards/,
  );
  const mismatch = clone(data);
  mismatch.counting!.exercise!.kind = "true-count";
  assert.throws(
    () => decode(mismatch),
    /exercise.kind does not match its training mode/,
  );
  const mode = clone(data) as unknown as { counting: { mode: string } };
  mode.counting.mode = "mystery";
  assert.throws(() => decode(mode), /counting.mode/);
});

test("recorded counting sessions preserve their metrics and reject corrupt answer records", () => {
  const data = defaults();
  let count = startCountingSession(createCountingSetup(false), 1000, 11);
  count = submitCountAnswer(
    advanceCountingTime(count, 900),
    count.exercise!.expected + 1,
  );
  const countResult = finishCountingSession(count, 3000);
  const session: Session = {
    id: countResult.id,
    startedAt: 1000,
    endedAt: 3000,
    kind: "counting",
    topic: countResult.mode,
    rules: data.settings.rules,
    feedback: "coach",
    assisted: false,
    decisions: [],
    durationMs: 900,
    rounds: 0,
    profit: 0,
    countResult,
  };
  data.sessions = [session];
  assert.deepEqual(decode(data).sessions, data.sessions);
  const broken = clone(data);
  broken.sessions[0].countResult!.answers[0].absoluteError = 42;
  assert.throws(() => decode(broken), /inconsistent answer errors/);
  const noResult = clone(data);
  delete noResult.sessions[0].countResult;
  assert.throws(() => decode(noResult), /countResult must be an object/);
});

test("real engine transitions remain decodable through insurance, multiple hands, settlement, and shuffles", () => {
  const data = defaults();
  data.active = newTraining(data, { kind: "simulator" });
  let shoe = createShoe(1287, data.settings.rules, 0.25);
  let roundCount = 0;
  while (roundCount < 50) {
    if (!shoe.round || shoe.round.phase === "complete") {
      shoe = startRound(shoe, 1);
      roundCount++;
    }
    data.active.shoe = shoe;
    assert.deepEqual(decode(data).active?.shoe, shoe);
    if (shoe.round?.phase === "insurance") shoe = answerInsurance(shoe, false);
    const scenario = getActiveScenario(shoe);
    if (scenario)
      shoe = playAction(shoe, recommend(scenario, data.settings.rules).action);
  }
  assert.ok(shoe.shuffleNumber > 1);
});

test("invalid lesson maps and session entries fail with an actionable field path", () => {
  assert.throws(
    () => decode({ ...defaults(), completedLessons: { basics: "yesterday" } }),
    /completedLessons.basics/,
  );
  assert.throws(
    () => decode({ ...defaults(), sessions: [null] }),
    /sessions\[0\] must be an object/,
  );
  assert.throws(
    () => decode({ ...defaults(), bookmarks: {} }),
    /bookmarks must be a list/,
  );
});

test("a storage failure stops later queued writes and preserves the last stored copy", async () => {
  let stored = "previous valid save";
  const attempted: string[] = [];
  const failures: unknown[] = [];
  const queue = createSaveQueue(
    async (value) => {
      attempted.push(value);
      if (value === "fails") throw new Error("storage quota");
      stored = value;
    },
    (error) => failures.push(error),
  );
  void queue.enqueue("fails");
  await queue.enqueue("queued after failure");
  assert.deepEqual(attempted, ["fails"]);
  assert.equal(stored, "previous valid save");
  assert.equal(failures.length, 1);
  assert.equal(queue.blocked, true);
  queue.reset();
  await queue.enqueue("explicit reset");
  assert.equal(stored, "explicit reset");
  assert.equal(queue.blocked, false);
});

test("reset invalidates stale queued writes and ignores an old in-flight failure", async () => {
  const writes: string[] = [];
  const failures: unknown[] = [];
  let release!: () => void;
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  const queue = createSaveQueue(
    async (value) => {
      writes.push(value);
      if (value === "in flight") {
        await pending;
        throw new Error("old failure");
      }
    },
    (error) => failures.push(error),
  );
  void queue.enqueue("in flight");
  await Promise.resolve();
  void queue.enqueue("stale queued save");
  queue.reset();
  const reset = queue.enqueue("reset state");
  release();
  await reset;
  assert.deepEqual(writes, ["in flight", "reset state"]);
  assert.deepEqual(failures, []);
  assert.equal(queue.blocked, false);
});

test("history export includes a byte-exact malformed recovery copy without replacing in-memory progress", () => {
  const data = defaults();
  data.completedLessons = { basics: 1234 };
  const rawSavedData = '{"sessions":[{"recoverable":"hand history"}], BROKEN';
  const exported = JSON.parse(
    serializeHistoryExport(
      data,
      { rawSavedData, reason: "Invalid JSON" },
      "2026-09-20T00:00:00Z",
    ),
  );
  assert.equal(exported.recovery.rawSavedData, rawSavedData);
  assert.deepEqual(exported.completedLessons, { basics: 1234 });
  assert.equal(exported.exportedAt, "2026-09-20T00:00:00Z");
  assert.equal(JSON.parse(serializeHistoryExport(data)).recovery, undefined);
});

test("global background pause covers both activity kinds without changing cards or time", () => {
  const data = defaults();
  data.active = newTraining(data);
  data.counting = startCountingSession(createCountingSetup(false), 1000, 51);
  const paused = pauseSavedActivities(data);
  assert.equal(paused.active?.paused, true);
  assert.equal(paused.counting?.paused, true);
  assert.deepEqual(paused.counting?.deck, data.counting.deck);
  assert.equal(paused.counting?.activeMs, data.counting.activeMs);
  assert.equal(pauseSavedActivities(paused), paused);
  assert.equal(pauseSavedActivities(defaults()).active, null);
});

test("malformed counting phases and physical deck composition cannot create unrecoverable sessions", () => {
  const data = defaults();
  data.counting = startCountingSession(createCountingSetup(false), 1000, 51);
  const completed = clone(data);
  completed.counting!.phase = "complete";
  assert.throws(
    () => decode(completed),
    /marked complete before all checkpoints/,
  );
  const length = clone(data);
  length.counting!.totalExercises = 100;
  assert.throws(() => decode(length), /totalExercises does not match its mode/);
  const physical = clone(data);
  const high = physical.counting!.deck.findIndex(
    (card, i) => i > 1 && card.rank === "K",
  );
  physical.counting!.deck[high].rank = "Q";
  assert.throws(() => decode(physical), /invalid physical card composition/);
  const tray = clone(data);
  tray.counting = startCountingSession(
    { ...createCountingSetup(false), mode: "decks" },
    1000,
    51,
  );
  tray.counting.exercise!.discardedCards = 0;
  assert.throws(() => decode(tray), /discard tray does not match/);
});
