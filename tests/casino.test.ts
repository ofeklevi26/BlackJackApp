import test from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_RULES, type Rank } from "../src/engine";
import {
  CASINO_MIN_BET,
  casinoAct,
  casinoAddChip,
  casinoAvailable,
  casinoCanDeal,
  casinoCanInsure,
  casinoCanRefill,
  casinoCommitted,
  casinoDeal,
  casinoInsurance,
  casinoLegalActions,
  casinoNet,
  casinoRefill,
  casinoRepeatBet,
  casinoRoundActive,
  casinoRoundLabel,
  casinoSetBet,
  createCasino,
  type CasinoState,
} from "../src/state/casino";
import { decodeSavedData } from "../src/state/persistence";
import type { AppData } from "../src/state/types";

function fixture(ranks: Rank[], bankroll = 1000): CasinoState {
  const table = createCasino(DEFAULT_RULES, 1027, 1000);
  const deck = [...table.shoe.cards];
  const prefix = ranks.map((rank) => {
    const index = deck.findIndex((card) => card.rank === rank);
    assert.ok(index >= 0);
    return deck.splice(index, 1)[0];
  });
  return {
    ...table,
    shoe: { ...table.shoe, cards: [...prefix, ...deck], bankroll },
  };
}
function appData(): AppData {
  return {
    version: 1,
    onboarding: true,
    experience: "New to blackjack",
    goal: "Basic strategy",
    completedLessons: {},
    settings: {
      rules: DEFAULT_RULES,
      feedback: "coach",
      assistance: false,
      haptics: false,
      reducedMotion: true,
      sound: false,
    },
    sessions: [],
    bookmarks: [],
    active: null,
    counting: null,
    casino: null,
  };
}

test("casino starts with an independent $1000 wallet and reserves a dealt wager only once", () => {
  const original = fixture(["10", "6", "7", "10"]);
  assert.equal(casinoAvailable(original), 1000);
  const dealt = casinoDeal(original, original.revision);
  assert.equal(dealt.shoe.bankroll, 1000);
  assert.equal(casinoCommitted(dealt), 10);
  assert.equal(casinoAvailable(dealt), 990);
  assert.equal(casinoSetBet(dealt, 25), dealt);
  assert.equal(casinoDeal(dealt, dealt.revision), dealt);
  assert.equal(original.shoe.nextCard, 0);
});

test("chip selection, clear, repeat, table limits, and affordable wagers are enforced", () => {
  let table = createCasino(DEFAULT_RULES, 1, 1000);
  table = casinoSetBet(table, 0);
  assert.equal(casinoCanDeal(table), false);
  table = casinoAddChip(table, 25);
  table = casinoAddChip(table, 50);
  assert.equal(table.selectedBet, 75);
  assert.equal(casinoAddChip(table, 100), table);
  assert.equal(casinoAddChip(table, -5), table);
  assert.equal(casinoSetBet(table, 7), table);
  assert.equal(casinoSetBet(table, Number.NaN), table);
  table = casinoRepeatBet(table);
  assert.equal(table.selectedBet, 10);
  const poor = { ...table, shoe: { ...table.shoe, bankroll: 7.5 } };
  assert.equal(casinoCanDeal(poor), false);
  assert.equal(casinoSetBet(poor, 10), poor);
  assert.equal(casinoCanDeal(casinoSetBet(poor, 5)), true);
});

test("natural blackjack pays 3:2 and stale Deal taps cannot immediately start another round", () => {
  const table = fixture(["A", "9", "K", "7"]);
  const dealt = casinoDeal(table, table.revision);
  assert.equal(dealt.shoe.round?.phase, "complete");
  assert.equal(dealt.shoe.round?.hands[0].result, "blackjack");
  assert.equal(dealt.shoe.bankroll, 1015);
  assert.equal(casinoAvailable(dealt), 1015);
  assert.equal(casinoCommitted(dealt), 0);
  assert.equal(casinoRoundLabel(dealt), "Blackjack!");
  assert.equal(casinoDeal(dealt, table.revision), dealt);
});

test("doubling reserves an equal extra bet and wins post net profit without subtracting the stake twice", () => {
  let table = casinoDeal(fixture(["5", "6", "6", "10", "10", "K"]));
  assert.ok(casinoLegalActions(table).includes("double"));
  const revision = table.revision;
  table = casinoAct(table, "double", revision);
  assert.equal(table.shoe.round?.hands[0].bet, 20);
  assert.equal(table.shoe.round?.hands[0].result, "win");
  assert.equal(table.shoe.round?.profit, 20);
  assert.equal(table.shoe.bankroll, 1020);
  assert.equal(casinoAct(table, "double", revision), table);
});

test("insufficient available funds reject double and split without changing cards or bets", () => {
  const double = casinoDeal(fixture(["5", "6", "6", "10"], 15));
  assert.equal(casinoAvailable(double), 5);
  assert.equal(casinoLegalActions(double).includes("double"), false);
  assert.equal(casinoAct(double, "double", double.revision), double);
  const split = casinoDeal(fixture(["8", "6", "8", "10"], 15));
  assert.equal(casinoLegalActions(split).includes("split"), false);
  assert.equal(casinoAct(split, "split", split.revision), split);
  assert.ok(casinoLegalActions(split).includes("hit"));
  assert.ok(casinoLegalActions(split).includes("stand"));
});

test("split hands reserve all bets while moving directly between hands and allow affordable doubles", () => {
  let table = casinoDeal(
    fixture(["8", "6", "8", "10", "3", "2", "10", "K"], 30),
  );
  table = casinoAct(table, "split", table.revision);
  assert.equal(table.shoe.round?.hands.length, 2);
  assert.equal(casinoCommitted(table), 20);
  assert.equal(casinoAvailable(table), 10);
  table = casinoAct(table, "stand", table.revision);
  assert.equal(table.shoe.round?.activeHand, 1);
  assert.equal(casinoCommitted(table), 20);
  table = casinoAct(table, "double", table.revision);
  assert.equal(table.shoe.round?.phase, "complete");
  assert.deepEqual(
    table.shoe.round?.hands.map((hand) => hand.bet),
    [10, 20],
  );
  assert.equal(table.shoe.round?.profit, 30);
  assert.equal(table.shoe.bankroll, 60);
  assert.equal(casinoCommitted(table), 0);
});

test("split-ace ordinary 21 pays 1:1 and both hands automatically complete", () => {
  let table = casinoDeal(fixture(["A", "6", "A", "10", "10", "9", "K"]));
  table = casinoAct(table, "split", table.revision);
  assert.equal(table.shoe.round?.phase, "complete");
  assert.equal(table.shoe.round?.profit, 20);
  assert.equal(table.shoe.bankroll, 1020);
  assert.ok(table.shoe.round!.hands.every((hand) => hand.result === "win"));
});

test("insurance requires free chips beyond the main bet and dealer blackjack settles all stakes", () => {
  const poor = casinoDeal(fixture(["10", "A", "9", "K"], 10));
  assert.equal(poor.shoe.round?.phase, "insurance");
  assert.equal(casinoCanInsure(poor), false);
  assert.equal(casinoInsurance(poor, true, poor.revision), poor);
  const declined = casinoInsurance(poor, false, poor.revision);
  assert.equal(declined.shoe.bankroll, 0);
  let insured = casinoDeal(fixture(["10", "A", "9", "K"], 15));
  assert.equal(casinoCanInsure(insured), true);
  const revision = insured.revision;
  insured = casinoInsurance(insured, true, revision);
  assert.equal(insured.shoe.round?.insuranceBet, 5);
  assert.equal(insured.shoe.round?.insuranceProfit, 10);
  assert.equal(insured.shoe.round?.profit, 0);
  assert.equal(insured.shoe.bankroll, 15);
  assert.equal(casinoRoundLabel(insured), "Round even");
  assert.equal(casinoInsurance(insured, true, revision), insured);
});

test("a lost insurance stake remains reserved until settlement and cannot finance a double", () => {
  let table = casinoDeal(fixture(["5", "A", "6", "9", "K"], 20));
  table = casinoInsurance(table, true, table.revision);
  assert.equal(table.shoe.round?.phase, "playing");
  assert.equal(table.shoe.round?.insuranceProfit, -5);
  assert.equal(casinoCommitted(table), 15);
  assert.equal(casinoAvailable(table), 5);
  assert.equal(casinoLegalActions(table).includes("double"), false);
});

test("surrender returns half the original bet and push returns the stake with no net change", () => {
  let surrendered = casinoDeal(fixture(["10", "10", "6", "7"], 10));
  surrendered = casinoAct(surrendered, "surrender", surrendered.revision);
  assert.equal(surrendered.shoe.bankroll, 5);
  assert.equal(casinoAvailable(surrendered), 5);
  let push = casinoDeal(fixture(["10", "10", "8", "8"]));
  push = casinoAct(push, "stand", push.revision);
  assert.equal(push.shoe.round?.hands[0].result, "push");
  assert.equal(push.shoe.bankroll, 1000);
  assert.equal(casinoRoundLabel(push), "Push · bets returned");
});

test("refills are explicit, between rounds, and available only below the minimum wager", () => {
  const funded = createCasino(DEFAULT_RULES, 1, 1000);
  assert.equal(casinoRefill(funded, funded.revision), funded);
  const active = casinoDeal(fixture(["10", "6", "6", "10"], 10));
  assert.equal(casinoAvailable(active), 0);
  assert.equal(casinoCanRefill(active), false);
  assert.equal(casinoRefill(active, active.revision), active);
  let empty = casinoDeal(fixture(["10", "A", "9", "K"], 10));
  empty = casinoInsurance(empty, false, empty.revision);
  assert.equal(casinoCanRefill(empty), true);
  const refilled = casinoRefill(empty, empty.revision);
  assert.equal(refilled.shoe.bankroll, 1000);
  assert.equal(refilled.deposits, 2000);
  assert.equal(refilled.refillCount, 1);
  assert.equal(casinoRefill(refilled, empty.revision), refilled);
});

test("active casino state hydrates exactly while old saves and training analytics remain separate", () => {
  const defaults = appData();
  let table = casinoDeal(fixture(["8", "6", "8", "10", "3", "2"]));
  table = casinoAct(table, "split", table.revision);
  const data = { ...defaults, casino: table };
  const hydrated = decodeSavedData(JSON.stringify(data), defaults);
  assert.deepEqual(hydrated.casino, table);
  assert.deepEqual(hydrated.sessions, []);
  assert.equal(hydrated.active, null);
  assert.equal(hydrated.counting, null);
  const { casino: unused, ...older } = defaults;
  assert.equal(decodeSavedData(JSON.stringify(older), defaults).casino, null);
  const bad = {
    ...data,
    casino: { ...table, shoe: { ...table.shoe, bankroll: 1 } },
  };
  assert.throws(
    () => decodeSavedData(JSON.stringify(bad), defaults),
    /wagers exceeding its balance/,
  );
});

test("hundreds of casino rounds reconcile every settlement and never overcommit or go negative", () => {
  let table = createCasino(DEFAULT_RULES, 9183, 1000);
  let profits = 0;
  for (let i = 0; i < 400; i++) {
    if (casinoCanRefill(table)) table = casinoRefill(table, table.revision);
    table = casinoSetBet(
      table,
      Math.min(
        100,
        Math.floor(casinoAvailable(table) / CASINO_MIN_BET) * CASINO_MIN_BET,
      ),
    );
    table = casinoDeal(table, table.revision);
    let moves = 0;
    while (casinoRoundActive(table)) {
      assert.ok(casinoAvailable(table) >= 0);
      assert.ok(casinoCommitted(table) <= table.shoe.bankroll);
      if (table.shoe.round?.phase === "insurance")
        table = casinoInsurance(
          table,
          i % 2 === 0 && casinoCanInsure(table),
          table.revision,
        );
      else {
        const legal = casinoLegalActions(table);
        const action = legal.includes("split")
          ? "split"
          : legal.includes("double")
            ? "double"
            : legal[(i + moves) % legal.length];
        table = casinoAct(table, action, table.revision);
      }
      assert.ok(++moves < 100, "every round completes");
    }
    profits += table.shoe.round!.profit;
    assert.equal(table.shoe.bankroll, table.deposits + profits);
    assert.equal(casinoNet(table), profits);
    assert.equal(casinoCommitted(table), 0);
    assert.ok(table.shoe.bankroll >= 0);
  }
  assert.equal(table.shoe.rounds, 400);
  assert.ok(table.shoe.shuffleNumber > 1);
});
