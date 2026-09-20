import test from "node:test";
import assert from "node:assert/strict";
import {
  SHOE_DECK_COUNTS,
  MIN_SHOE_RESERVE,
  DEFAULT_RULES,
  RANKS,
  SUITS,
  answerInsurance,
  cardValue,
  createShoe,
  decksRemaining,
  getActiveScenario,
  hiLo,
  legalActions,
  minimumShoeReserve,
  playAction,
  seededRandom,
  shoeDeckCount,
  startRound,
  visibleCards,
  type Card,
  type Rank,
  type ShoeDeckCount,
  type ShoeSession,
} from "../src/engine";

const lowValue = (card: Card) => (card.rank === "A" ? 1 : cardValue(card));
const restore = (shoe: ShoeSession): ShoeSession =>
  JSON.parse(JSON.stringify(shoe));

function withPrefix(shoe: ShoeSession, ranks: Rank[]): ShoeSession {
  const rest = [...shoe.cards];
  const prefix = ranks.map((rank) => {
    const index = rest.findIndex((card) => card.rank === rank);
    assert.ok(index >= 0, `physical card ${rank} exists`);
    return rest.splice(index, 1)[0];
  });
  return { ...shoe, cards: [...prefix, ...rest] };
}

function dealtPrefix(shoe: ShoeSession, nextCard: number): ShoeSession {
  const discarded = shoe.cards.slice(0, nextCard);
  return {
    ...shoe,
    nextCard,
    discarded,
    seenIds: discarded.map((card) => card.id),
    runningCount: discarded.reduce((sum, card) => sum + hiLo(card), 0),
  };
}

function assertVisibility(shoe: ShoeSession) {
  assert.equal(new Set(shoe.seenIds).size, shoe.seenIds.length);
  assert.equal(
    shoe.runningCount,
    visibleCards(shoe).reduce((sum, card) => sum + hiLo(card), 0),
  );
  assert.ok(shoe.nextCard <= shoe.cards.length);
  const hole = shoe.round?.dealer[1];
  if (hole && !shoe.round!.dealerRevealed)
    assert.ok(!shoe.seenIds.includes(hole.id));
  else assert.equal(shoe.seenIds.length, shoe.nextCard);
}

test("configurable shoes contain exactly the selected physical decks and retain the six-deck default", () => {
  assert.deepEqual(SHOE_DECK_COUNTS, [1, 2, 4, 6, 8]);
  assert.equal(shoeDeckCount(createShoe(42)), 6);
  for (const decks of SHOE_DECK_COUNTS) {
    const shoe = createShoe(42, DEFAULT_RULES, 0.75, decks);
    assert.equal(shoeDeckCount(shoe), decks);
    assert.equal(shoe.cards.length, decks * 52);
    assert.equal(new Set(shoe.cards.map((card) => card.id)).size, decks * 52);
    for (const rank of RANKS)
      for (const suit of SUITS)
        assert.equal(
          shoe.cards.filter((card) => card.rank === rank && card.suit === suit)
            .length,
          decks,
        );
    assert.equal(
      shoe.cards.reduce((sum, card) => sum + hiLo(card), 0),
      0,
    );
    assert.deepEqual(shoe, createShoe(42, DEFAULT_RULES, 0.75, decks));
    assert.equal(
      shoeDeckCount(restore(shoe)),
      decks,
      "serialized shoes need no extra deck-count field",
    );
  }
  for (const invalid of [0, 3, 5, 7, 9, 1.5, NaN, Infinity]) {
    assert.throws(
      () => createShoe(42, DEFAULT_RULES, 0.75, invalid as ShoeDeckCount),
      /1, 2, 4, 6, or 8/,
    );
  }
});

test("fixed reserves exceed the maximum 146 low points of a four-hand round for every shoe size", () => {
  const expected = new Map([
    [1, 33],
    [2, 45],
    [4, 61],
    [6, 73],
    [8, 81],
  ]);
  assert.equal(MIN_SHOE_RESERVE, 73);
  for (const decks of SHOE_DECK_COUNTS) {
    const reserve = minimumShoeReserve(decks);
    assert.equal(reserve, expected.get(decks));
    const sortedValues = createShoe(7, DEFAULT_RULES, 0.75, decks)
      .cards.map(lowValue)
      .sort((a, b) => a - b);
    assert.ok(
      sortedValues.slice(0, reserve).reduce((sum, value) => sum + value, 0) >
        146,
    );
    assert.ok(
      sortedValues
        .slice(0, reserve - 1)
        .reduce((sum, value) => sum + value, 0) <= 146,
    );
    assert.ok(reserve < decks * 52, "a fresh shoe always covers a round");
  }
});

test("one deck stays finite across five ordinary rounds before an explicit safety shuffle", () => {
  let shoe = withPrefix(createShoe(9, DEFAULT_RULES, 0.75, 1), [
    "10",
    "9",
    "7",
    "9",
    "J",
    "8",
    "7",
    "10",
    "Q",
    "8",
    "6",
    "K",
    "K",
    "10",
    "8",
    "8",
    "9",
    "K",
    "7",
    "7",
  ]);
  const originalIds = shoe.cards.map((card) => card.id);
  for (let round = 0; round < 5; round++) {
    shoe = startRound(restore(shoe), 1, shoe.rounds);
    assert.equal(shoe.shuffleNumber, 1);
    shoe = playAction(shoe, "stand", getActiveScenario(shoe)!.id);
    assert.equal(shoe.round!.phase, "complete");
    assert.equal(shoe.nextCard, (round + 1) * 4);
    assert.deepEqual(
      shoe.cards.map((card) => card.id),
      originalIds,
    );
    assertVisibility(shoe);
  }
  assert.equal(shoe.nextCard, 20);
  shoe = startRound(restore(shoe));
  assert.equal(shoe.shuffleNumber, 2);
  assert.equal(shoeDeckCount(shoe), 1);
  assert.match(shoe.round!.log[0], /Early safety shuffle: fewer than 33 cards/);
  assert.ok(!shoe.seenIds.some((id) => originalIds.includes(id)));
});

test("hidden cards stay out of the count while physical decks remaining uses each shoe's actual size", () => {
  for (const decks of SHOE_DECK_COUNTS) {
    let shoe = withPrefix(createShoe(11, DEFAULT_RULES, 0.75, decks), [
      "10",
      "6",
      "7",
      "9",
    ]);
    shoe = startRound(shoe);
    assert.equal(shoe.seenIds.length, 3);
    assert.equal(shoe.runningCount, 0);
    assert.equal(decksRemaining(shoe), (decks * 52 - 4) / 52);
    assertVisibility(shoe);
    const firstIds = [...shoe.seenIds];
    shoe = playAction(restore(shoe), "stand");
    assert.equal(shoe.round!.phase, "complete");
    assert.deepEqual(shoe.seenIds.slice(0, 3), firstIds);
    assertVisibility(shoe);
  }
});

test("cut-card shuffles preserve deck count, rules, net accounting and completed rounds", () => {
  for (const decks of SHOE_DECK_COUNTS) {
    const rules = { hitSoft17: true, surrender: false };
    let shoe = createShoe(17, rules, 0.75, decks);
    shoe = {
      ...dealtPrefix(shoe, Math.floor(shoe.cards.length * 0.75)),
      bankroll: 118.5,
      rounds: 9,
    };
    const before = JSON.stringify(shoe);
    const shuffled = startRound(restore(shoe), 2, 9);
    assert.equal(shoeDeckCount(shuffled), decks);
    assert.equal(shuffled.shuffleNumber, 2);
    assert.deepEqual(shuffled.rules, rules);
    assert.equal(
      shuffled.rounds,
      9 + Number(shuffled.round!.phase === "complete"),
    );
    assert.equal(
      shuffled.bankroll,
      118.5 +
        (shuffled.round!.phase === "complete" ? shuffled.round!.profit : 0),
    );
    assert.match(shuffled.round!.log[0], /Cut card reached/);
    assert.equal(JSON.stringify(shoe), before);
    assertVisibility(shuffled);
  }
});

test("reserve decisions use a fixed size boundary independent of hidden order or composition", () => {
  for (const decks of SHOE_DECK_COUNTS) {
    const original = createShoe(23, DEFAULT_RULES, 0.85, decks);
    const reserve = minimumShoeReserve(decks);
    for (const ascending of [true, false]) {
      const ordered = {
        ...original,
        cards: [...original.cards].sort((a, b) =>
          ascending ? lowValue(a) - lowValue(b) : lowValue(b) - lowValue(a),
        ),
      };
      const enough = startRound(
        dealtPrefix(ordered, ordered.cards.length - reserve),
      );
      assert.equal(enough.shuffleNumber, 1);
      const short = startRound(
        dealtPrefix(ordered, ordered.cards.length - reserve + 1),
      );
      assert.equal(short.shuffleNumber, 2);
      assert.equal(shoeDeckCount(short), decks);
      assert.match(short.round!.log[0], /Early safety shuffle/);
    }
  }
});

test("the lowest legal reserve tails survive four-hand adversarial rounds without mid-round reshuffles", () => {
  for (const decks of SHOE_DECK_COUNTS) {
    for (const hitSoft17 of [false, true]) {
      for (let seed = 0; seed < 20; seed++) {
        let shoe = createShoe(
          seed,
          { hitSoft17, surrender: true },
          0.85,
          decks,
        );
        const reserve = minimumShoeReserve(decks);
        const low = [...shoe.cards]
          .sort((a, b) => lowValue(a) - lowValue(b))
          .slice(0, reserve);
        const first = (["2", "3", "2", "3", "2", "2"] as Rank[]).map(
          (rank) =>
            low.splice(
              low.findIndex((card) => card.rank === rank),
              1,
            )[0],
        );
        const random = seededRandom(seed);
        for (let index = low.length - 1; index > 0; index--) {
          const other = Math.floor(random() * (index + 1));
          [low[index], low[other]] = [low[other], low[index]];
        }
        const tail = [...first, ...low];
        const ids = new Set(tail.map((card) => card.id));
        shoe = {
          ...shoe,
          cards: [...shoe.cards.filter((card) => !ids.has(card.id)), ...tail],
        };
        shoe = startRound(dealtPrefix(shoe, shoe.cards.length - reserve));
        assert.equal(shoe.shuffleNumber, 1);
        for (let split = 0; split < 3; split++)
          shoe = playAction(shoe, "split");
        assert.equal(shoe.round!.hands.length, 4);
        let moves = 0;
        while (getActiveScenario(shoe)) {
          shoe = playAction(restore(shoe), "hit");
          assert.ok(++moves < reserve);
          assert.equal(shoe.shuffleNumber, 1);
          assertVisibility(shoe);
        }
        assert.equal(shoe.round!.phase, "complete");
        assert.ok(
          shoe.nextCard < shoe.cards.length,
          "proof leaves at least one physical card unused",
        );
        assert.ok(shoe.round!.hands.every((hand) => hand.status === "settled"));
      }
    }
  }
});

test("4,000 randomized rounds across all sizes reconcile settlements, persisted cards and shuffle boundaries", () => {
  for (const decks of SHOE_DECK_COUNTS) {
    for (const hitSoft17 of [false, true]) {
      let shoe = createShoe(2026, { hitSoft17, surrender: true }, 0.85, decks);
      const random = seededRandom(731 + decks);
      let profit = 0;
      for (let round = 0; round < 400; round++) {
        const before = shoe;
        shoe = startRound(
          restore(shoe),
          [0.5, 1, 2, 8][round % 4],
          shoe.rounds,
        );
        const shuffle = shoe.shuffleNumber;
        assert.equal(shoeDeckCount(shoe), decks);
        if (shuffle === before.shuffleNumber)
          assert.deepEqual(
            shoe.seenIds.slice(0, before.seenIds.length),
            before.seenIds,
          );
        else {
          assert.equal(shuffle, before.shuffleNumber + 1);
          assert.ok(!shoe.seenIds.some((id) => before.seenIds.includes(id)));
        }
        if (shoe.round!.phase === "insurance")
          shoe = answerInsurance(restore(shoe), random() < 0.5, shoe.round!.id);
        let moves = 0;
        while (getActiveScenario(shoe)) {
          const scenario = getActiveScenario(shoe)!;
          const legal = legalActions(scenario, shoe.rules);
          const action = legal.includes("split")
            ? "split"
            : legal[Math.floor(random() * legal.length)];
          shoe = playAction(restore(shoe), action, scenario.id);
          assertVisibility(shoe);
          assert.equal(shoe.shuffleNumber, shuffle);
          assert.ok(++moves < 150);
        }
        assert.equal(shoe.round!.phase, "complete");
        profit += shoe.round!.profit;
        assert.equal(shoe.bankroll, 100 + profit);
        assert.equal(shoe.rounds, round + 1);
        assert.deepEqual(shoe.discarded, shoe.cards.slice(0, shoe.nextCard));
        assertVisibility(shoe);
      }
      assert.ok(shoe.shuffleNumber > 1);
    }
  }
});
