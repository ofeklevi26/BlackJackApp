import test from "node:test";
import assert from "node:assert/strict";
import {
  DEVIATION_RULES,
  DEFAULT_RULES,
  explainDecision,
  generateScenario,
  legalActions,
  makeScenario,
  recommend,
} from "../src/engine";

test("expanded hard-hand explanation supplies draw facts and compares the chosen legal alternative", () => {
  const scenario = makeScenario(["10", "6"], "10");
  const detail = explainDecision(scenario, DEFAULT_RULES, false, "hit");
  assert.equal(detail.recommendation.action, "surrender");
  assert.deepEqual(detail.hand.safeRanks, ["A", "2", "3", "4", "5"]);
  assert.deepEqual(detail.hand.bustRanks, ["6", "7", "8", "9", "10/J/Q/K"]);
  assert.equal(detail.alternatives[0].action, "hit");
  assert.equal(detail.alternatives[0].chosen, true);
  assert.ok(detail.alternatives[0].explanation.includes("whole wager"));
  assert.ok(
    detail.ruleEffects.some(
      (effect) => effect.includes("fallback") && effect.includes("hit"),
    ),
  );
  assert.notEqual(
    detail.recommendation.explanation,
    recommend(scenario).explanation,
  );
  assert.ok(
    detail.sources.some((source) => source.url.endsWith("/surrender/")),
  );
});

test("multiple aces and after-hit restrictions are interpreted rather than merely restating the action", () => {
  const detail = explainDecision(
    makeScenario(["4", "A", "A"], "6", { fromSplit: true }),
    DEFAULT_RULES,
    false,
    "double",
  );
  assert.equal(detail.hand.label, "Soft 16");
  assert.match(detail.hand.detail, /other ace is worth 1/);
  assert.deepEqual(detail.hand.bustRanks, []);
  assert.equal(detail.hand.safeRanks.length, 10);
  assert.ok(
    detail.ruleEffects.some((effect) => effect.includes("already hit")),
  );
  assert.ok(
    detail.ruleEffects.some((effect) =>
      effect.includes("Double is unavailable"),
    ),
  );
  assert.ok(detail.ruleEffects.some((effect) => effect.includes("split hand")));
  assert.ok(!detail.alternatives.some((option) => option.action === "double"));
});

test("soft 18 explains the stand fallback and gives the correct adjacent-upcard memory rule", () => {
  const detail = explainDecision(makeScenario(["A", "2", "5"], "3"));
  assert.equal(detail.recommendation.action, "stand");
  assert.match(
    detail.recommendation.explanation,
    /With two cards this cell would double/,
  );
  assert.match(detail.takeaway, /stand against 2–8 and hit against 9–ace/);
  assert.deepEqual(
    detail.pattern.find((item) => item.action === "stand")?.dealers,
    ["2", "3", "4", "5", "6", "7", "8"],
  );
  const againstTwo = explainDecision(makeScenario(["A", "2", "5"], "2"));
  assert.doesNotMatch(
    againstTwo.recommendation.explanation,
    /this cell would double/,
  );
});

test("H17 surrender on eights explains the rule exception and its actual fallback", () => {
  const detail = explainDecision(
    makeScenario(["8", "8"], "A"),
    { hitSoft17: true, surrender: true },
    false,
    "split",
  );
  assert.equal(detail.recommendation.action, "surrender");
  assert.match(detail.recommendation.explanation, /H17 ace exception/);
  assert.equal(detail.alternatives[0].action, "split");
  assert.match(detail.alternatives[0].explanation, /two live bets/);
  assert.ok(
    detail.ruleEffects.some(
      (effect) => effect.includes("S17") && effect.includes("split"),
    ),
  );
  assert.ok(
    detail.ruleEffects.some(
      (effect) => effect.includes("fallback") && effect.includes("split"),
    ),
  );
});

test("pair explanations distinguish fives, tens, aces and DAS-dependent fours", () => {
  const fours = explainDecision(makeScenario(["4", "4"], "6"));
  assert.match(fours.recommendation.explanation, /double after splitting/);
  const aces = explainDecision(makeScenario(["A", "A"], "6"));
  assert.match(aces.recommendation.explanation, /only one new card/);
  assert.match(aces.recommendation.explanation, /not a 3:2 blackjack/);
  const fives = explainDecision(
    makeScenario(["5", "5"], "10"),
    DEFAULT_RULES,
    false,
    "split",
  );
  assert.match(fives.alternatives[0].explanation, /hard 10/);
  assert.match(fives.takeaway, /not a pair to break apart/);
  const tens = explainDecision(
    makeScenario(["K", "Q"], "6"),
    DEFAULT_RULES,
    false,
    "split",
  );
  assert.match(tens.recommendation.explanation, /existing|already have 20/i);
  assert.match(tens.alternatives[0].explanation, /existing 20/);
});

test("zero and positive deviation indices include baseline, threshold, and honest count context", () => {
  const zero = explainDecision(
    makeScenario(["10", "6"], "10", { trueCount: 0 }),
    DEVIATION_RULES,
    true,
    "hit",
  );
  assert.equal(zero.recommendation.action, "stand");
  assert.equal(zero.deviation?.index, 0);
  assert.equal(zero.deviation?.baseline, "hit");
  assert.match(zero.deviation!.explanation, /does not prove/);
  assert.match(zero.alternatives[0].explanation, /count threshold/);
  const below = explainDecision(
    makeScenario(["10", "2"], "3", { trueCount: 1 }),
    DEVIATION_RULES,
    true,
  );
  const at = explainDecision(
    makeScenario(["10", "2"], "3", { trueCount: 2 }),
    DEVIATION_RULES,
    true,
  );
  assert.equal(below.recommendation.action, "hit");
  assert.equal(at.recommendation.action, "stand");
  assert.match(at.deviation!.explanation, /relatively richer high-card mix/);
  assert.match(at.dealer, /in basic strategy, hard 12 still hits/);
  const againstTwo = explainDecision(
    makeScenario(["10", "2"], "2", { trueCount: 3 }),
    DEVIATION_RULES,
    true,
  );
  assert.equal(againstTwo.recommendation.action, "stand");
  assert.match(againstTwo.dealer, /in basic strategy, hard 12 still hits/);
  assert.equal(
    at.pattern.find((item) => item.dealers.includes("3"))?.action,
    "hit",
    "the memory row remains explicitly labeled basic strategy",
  );
  assert.ok(at.sources.some((source) => source.url.includes("high-low")));
});

test("basic explanations ignore counts and never accept a future shoe as an input", () => {
  const original = makeScenario(["10", "2"], "3", { trueCount: 5 });
  const altered = {
    ...original,
    trueCount: -5,
    hiddenCard: "A",
    futureCards: ["K", "Q"],
  };
  assert.deepEqual(explainDecision(original), explainDecision(altered));
  const unsupported = explainDecision(original, DEFAULT_RULES, true);
  assert.equal(unsupported.deviation, undefined);
  assert.match(unsupported.scopeNote!, /S17 with surrender off/);
  assert.equal(unsupported.recommendation.action, "hit");
});

test("a full adjacent-upcard row adds a concrete double window without probabilities", () => {
  const detail = explainDecision(makeScenario(["4", "5"], "6"));
  assert.deepEqual(
    detail.pattern.find((item) => item.action === "double")?.dealers,
    ["3", "4", "5", "6"],
  );
  assert.deepEqual(
    detail.pattern.find((item) => item.action === "hit")?.dealers,
    ["2", "7", "8", "9", "10", "A"],
  );
  assert.doesNotMatch(JSON.stringify(detail), /\d+%|expected value.*\d/i);
});

test("generated decision explanations preserve inputs and compare only legal alternatives", () => {
  for (const rules of [
    DEFAULT_RULES,
    DEVIATION_RULES,
    { hitSoft17: true, surrender: true },
  ]) {
    for (let seed = 0; seed < 150; seed++) {
      const scenario = generateScenario(seed, "mixed", "balanced", [], rules);
      const snapshot = JSON.stringify(scenario);
      const detail = explainDecision(scenario, rules);
      assert.equal(
        detail.recommendation.action,
        recommend(scenario, rules).action,
      );
      const legal = legalActions(scenario, rules);
      for (const option of detail.alternatives) {
        assert.ok(legal.includes(option.action));
        assert.notEqual(option.action, detail.recommendation.action);
        assert.ok(option.explanation.length > 50);
      }
      assert.equal(JSON.stringify(scenario), snapshot);
      assert.doesNotMatch(JSON.stringify(detail), /undefined|NaN/);
      assert.equal(detail.pattern.flatMap((group) => group.dealers).length, 10);
    }
  }
});
