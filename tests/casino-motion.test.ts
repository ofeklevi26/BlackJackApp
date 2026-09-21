import test from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_RULES, type Rank } from "../src/engine";
import {
  casinoAct,
  casinoDeal,
  casinoInsurance,
  casinoNewSession,
  casinoSetBet,
  createCasino,
  type CasinoState,
} from "../src/state/casino";
import { cardMotionPlan, DEAL_MS, FLIP_MS } from "../src/ui/casinoMotion";

function fixture(ranks: Rank[]): CasinoState {
  const table = createCasino(DEFAULT_RULES, 8128, 1000);
  const deck = [...table.shoe.cards];
  const prefix = ranks.map((rank) => {
    const index = deck.findIndex((card) => card.rank === rank);
    assert.ok(index >= 0);
    return deck.splice(index, 1)[0];
  });
  return { ...table, shoe: { ...table.shoe, cards: [...prefix, ...deck] } };
}

test("fresh deal staggers only the actual four physical cards in shoe order", () => {
  const before = fixture(["10", "6", "7", "10"]);
  const after = casinoDeal(before, before.revision);
  const snapshot = JSON.stringify([before, after]);
  const plan = cardMotionPlan(before, after, false);
  assert.deepEqual(
    [...plan.cards.keys()],
    after.shoe.cards.slice(0, 4).map((card) => card.id),
  );
  const starts = [...plan.cards.values()].map((motion) => motion.dealAt!);
  assert.equal(starts[0], 0);
  assert.ok(
    starts.every((time, index) => index === 0 || time > starts[index - 1]),
  );
  assert.equal(plan.duration, starts[3] + DEAL_MS);
  assert.ok(
    [...plan.cards.values()].every((motion) => motion.revealAt === undefined),
  );
  assert.equal(after.shoe.round?.dealerRevealed, false);
  assert.equal(JSON.stringify([before, after]), snapshot);
});

test("hit animates only the new hit card and leaves the hole face down", () => {
  const before = casinoDeal(fixture(["2", "6", "3", "10", "4"]));
  const after = casinoAct(before, "hit", before.revision);
  const plan = cardMotionPlan(before, after, false);
  const hit = after.shoe.round!.hands[0].cards.at(-1)!;
  assert.deepEqual([...plan.cards], [[hit.id, { dealAt: 0 }]]);
  assert.equal(plan.duration, DEAL_MS);
  assert.equal(after.shoe.round!.dealerRevealed, false);
});

test("stand flips the existing hole before dealing the dealer's next card", () => {
  const before = casinoDeal(fixture(["10", "6", "7", "10", "2"]));
  const after = casinoAct(before, "stand", before.revision);
  const dealer = after.shoe.round!.dealer;
  const plan = cardMotionPlan(before, after, false);
  assert.equal(before.shoe.round!.dealerRevealed, false);
  assert.equal(after.shoe.round!.dealerRevealed, true);
  assert.deepEqual(
    [...plan.cards],
    [
      [dealer[1].id, { revealAt: 0 }],
      [dealer[2].id, { dealAt: FLIP_MS }],
    ],
  );
  assert.equal(plan.duration, FLIP_MS + DEAL_MS);
  assert.equal(cardMotionPlan(after, after, false).cards.size, 0);
});

test("natural settlement first deals all four cards, then reveals the hole", () => {
  const before = fixture(["A", "9", "K", "7"]);
  const after = casinoDeal(before);
  assert.equal(after.shoe.round!.phase, "complete");
  const plan = cardMotionPlan(before, after, false);
  assert.equal(plan.cards.size, 4);
  const hole = plan.cards.get(after.shoe.round!.dealer[1].id)!;
  const finalDealEnd =
    Math.max(...[...plan.cards.values()].map((motion) => motion.dealAt!)) +
    DEAL_MS;
  assert.equal(hole.revealAt, finalDealEnd);
  assert.equal(plan.duration, finalDealEnd + FLIP_MS);
});

test("double sequences its player draw, hole flip, then dealer draw", () => {
  const before = casinoDeal(fixture(["5", "6", "6", "10", "10", "2"]));
  const after = casinoAct(before, "double", before.revision);
  const round = after.shoe.round!;
  const plan = cardMotionPlan(before, after, false);
  assert.deepEqual(
    [...plan.cards],
    [
      [round.hands[0].cards[2].id, { dealAt: 0 }],
      [round.dealer[1].id, { revealAt: DEAL_MS }],
      [round.dealer[2].id, { dealAt: DEAL_MS + FLIP_MS }],
    ],
  );
});

test("split reparenting keeps existing cards still and animates a sibling draw only when dealt", () => {
  const before = casinoDeal(fixture(["8", "6", "8", "10", "3", "2"]));
  const split = casinoAct(before, "split", before.revision);
  assert.equal(split.shoe.round!.hands[1].cards.length, 1);
  const plan = cardMotionPlan(before, split, false);
  assert.deepEqual(
    [...plan.cards],
    [[split.shoe.round!.hands[0].cards[1].id, { dealAt: 0 }]],
  );
  for (const card of before.shoe.round!.hands[0].cards)
    assert.equal(plan.cards.has(card.id), false);
  const sibling = casinoAct(split, "stand", split.revision);
  assert.equal(sibling.shoe.round!.activeHand, 1);
  assert.deepEqual(
    [...cardMotionPlan(split, sibling, false).cards],
    [[sibling.shoe.round!.hands[1].cards[1].id, { dealAt: 0 }]],
  );
});

test("insurance declining does not flip a non-blackjack hole; confirmed blackjack does", () => {
  const pending = casinoDeal(fixture(["10", "A", "7", "9"]));
  const playing = casinoInsurance(pending, false, pending.revision);
  assert.equal(cardMotionPlan(pending, playing, false).duration, 0);
  const natural = casinoDeal(fixture(["10", "A", "7", "K"]));
  const settled = casinoInsurance(natural, false, natural.revision);
  assert.deepEqual(
    [...cardMotionPlan(natural, settled, false).cards],
    [[settled.shoe.round!.dealer[1].id, { revealAt: 0 }]],
  );
});

test("restores, reduced motion, bet changes, stale actions, and fresh empty sessions stay static", () => {
  const before = fixture(["10", "6", "7", "10"]);
  const dealt = casinoDeal(before);
  const restored = JSON.parse(JSON.stringify(dealt)) as CasinoState;
  const settled = casinoAct(dealt, "stand", dealt.revision);
  const transitions: [CasinoState | null, CasinoState | null, boolean][] = [
    [null, restored, false],
    [before, dealt, true],
    [before, casinoSetBet(before, 25), false],
    [dealt, casinoDeal(dealt, before.revision), false],
    [settled, casinoNewSession(settled, 1, settled.revision, 77, 2000), false],
    [dealt, null, false],
  ];
  for (const args of transitions) {
    const plan = cardMotionPlan(...args);
    assert.equal(plan.duration, 0);
    assert.equal(plan.cards.size, 0);
  }
});
