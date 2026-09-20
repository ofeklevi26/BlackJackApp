import assert from "node:assert/strict";
import test from "node:test";
import { CHART_DEALERS, CHART_ROWS } from "../src/content/chart";
import {
  getDueLessons,
  LESSON_REVIEW_MS,
  LESSONS,
} from "../src/content/lessons";
import { buildHeatmap, progressCohortKey } from "../src/content/progress";
import {
  DEVIATION_RULES,
  handValue,
  hiLo,
  legalActions,
  makeScenario,
  recommend,
  validateScenario,
} from "../src/engine";
import type { Decision, Session } from "../src/state/types";

test("every lesson exercise is answerable under each supported table rule set", () => {
  for (const lesson of LESSONS)
    for (const exercise of [lesson.guided, lesson.quiz]) {
      if (exercise.kind === "choice") {
        assert.equal(
          exercise.choices.filter((choice) => choice.id === exercise.correctId)
            .length,
          1,
          `${lesson.id}: exactly one correct option`,
        );
      } else if (exercise.kind === "count") {
        const scenario = makeScenario(exercise.ranks, "6");
        const total = scenario.cards.reduce((sum, card) => sum + hiLo(card), 0);
        assert.equal(
          exercise.choices.filter((value) => value === total).length,
          1,
          `${lesson.id}: the correct running count must be offered`,
        );
      } else {
        const scenario = makeScenario(exercise.ranks, exercise.dealer, {
          trueCount: exercise.trueCount,
        });
        assert.deepEqual(
          validateScenario(scenario),
          [],
          `${lesson.id}: valid initial decision`,
        );
        for (const hitSoft17 of [true, false])
          for (const surrender of [true, false]) {
            const rules = exercise.useDeviationRules
              ? DEVIATION_RULES
              : { hitSoft17, surrender };
            const answer = recommend(scenario, rules, exercise.countMode);
            assert.ok(
              legalActions(scenario, rules).includes(answer.action),
              `${lesson.id}: ${answer.action} must be selectable`,
            );
          }
      }
    }
});

test("chart row labels describe their actual two-card hands", () => {
  for (const group of ["hard", "soft", "pairs"] as const)
    for (const row of CHART_ROWS[group]) {
      const scenario = makeScenario(row.ranks, "6");
      const hand = handValue(scenario.cards);
      assert.equal(scenario.cards.length, 2);
      assert.ok(hand.total < 21);
      if (group === "hard") {
        assert.equal(hand.soft, false);
        assert.equal(String(hand.total), row.label);
      }
      if (group === "soft") {
        assert.equal(hand.soft, true);
        assert.equal(scenario.cards[0].rank, "A");
      }
      if (group === "pairs")
        assert.equal(scenario.cards[0].rank, scenario.cards[1].rank);
      for (const dealer of CHART_DEALERS)
        for (const hitSoft17 of [true, false])
          for (const surrender of [true, false]) {
            const cell = makeScenario(row.ranks, dealer);
            const rules = { hitSoft17, surrender };
            assert.ok(
              legalActions(cell, rules).includes(recommend(cell, rules).action),
            );
          }
    }
});

function decision(
  id: string,
  correct: boolean,
  dealer: "J" | "Q" | "10",
  replay = false,
): Decision {
  return {
    id,
    scenario: makeScenario(["10", "6"], dealer),
    chosen: correct ? "hit" : "stand",
    recommended: "hit",
    explanation: "Test decision",
    correct,
    responseMs: 1000,
    assisted: false,
    replay,
    category: "hard",
  };
}

test("heatmap combines equivalent dealer ten values and excludes review attempts", () => {
  const rows = buildHeatmap([
    decision("one", true, "J"),
    decision("two", false, "Q"),
    decision("review", true, "10", true),
  ]);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].label, "H 16");
  assert.deepEqual(Object.keys(rows[0].cells), ["10"]);
  assert.equal(rows[0].cells["10"].count, 2);
  assert.equal(rows[0].cells["10"].correct, 1);
  assert.equal(
    rows[0].cells["9"],
    undefined,
    "Unobserved cells must not be presented as zero accuracy",
  );
});

test("progress comparisons separate counting paces", () => {
  const base: Session = {
    id: "count",
    startedAt: 1,
    endedAt: 2,
    kind: "counting",
    topic: "running",
    rules: { hitSoft17: false, surrender: true },
    feedback: "coach",
    assisted: false,
    decisions: [],
    durationMs: 1000,
    rounds: 0,
    profit: 0,
    countResult: {
      id: "count",
      startedAt: 1,
      endedAt: 2,
      mode: "running",
      answers: [],
      assisted: false,
      speedMs: 1200,
      durationMs: 1000,
      exactAccuracy: 0,
      meanAbsoluteError: 0,
      medianResponseMs: 0,
      categoryMetrics: {},
    },
  };
  const faster = {
    ...base,
    countResult: { ...base.countResult!, speedMs: 600 },
  };
  assert.notEqual(progressCohortKey(base), progressCohortKey(faster));
  assert.notEqual(
    progressCohortKey({
      ...base,
      countResult: { ...base.countResult!, automatic: false },
    }),
    progressCohortKey({
      ...base,
      countResult: { ...base.countResult!, automatic: true },
    }),
  );
  assert.notEqual(
    progressCohortKey({ ...base, sampling: "balanced" }),
    progressCohortKey({ ...base, sampling: "realistic" }),
  );
  assert.equal(
    progressCohortKey(base),
    progressCohortKey({ ...base, id: "later", startedAt: 3 }),
  );
});

test("seven-day lesson review uses real completion timestamps and resets after review", () => {
  const now = LESSON_REVIEW_MS * 4;
  const timestamps = {
    [LESSONS[0].id]: now - LESSON_REVIEW_MS,
    [LESSONS[1].id]: now - LESSON_REVIEW_MS * 2,
    [LESSONS[2].id]: now - LESSON_REVIEW_MS + 1,
    [LESSONS[3].id]: now + 1000,
  };
  assert.deepEqual(
    getDueLessons(timestamps, now).map((lesson) => lesson.id),
    [LESSONS[1].id, LESSONS[0].id],
  );
  assert.deepEqual(
    getDueLessons({ ...timestamps, [LESSONS[1].id]: now }, now).map(
      (lesson) => lesson.id,
    ),
    [LESSONS[0].id],
  );
  assert.deepEqual(getDueLessons({}, now), []);
});
