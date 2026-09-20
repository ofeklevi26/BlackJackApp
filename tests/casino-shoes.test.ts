import test from "node:test";
import assert from "node:assert/strict";
import {
  createDeck,
  DEFAULT_RULES,
  RANKS,
  SHOE_DECK_COUNTS,
  SUITS,
  shoeDeckCount,
  type Rank,
  type ShoeDeckCount,
} from "../src/engine";
import { createCountingSetup } from "../src/counting";
import {
  casinoAct,
  casinoAvailable,
  casinoCommitted,
  casinoDeal,
  casinoInsurance,
  casinoNet,
  casinoNewSession,
  casinoRefill,
  casinoSetBet,
  createCasino,
  type CasinoState,
} from "../src/state/casino";
import { decodeSavedData } from "../src/state/persistence";
import { newTraining } from "../src/state/training";
import type { AppData } from "../src/state/types";

function defaults(): AppData {
  return {
    version: 1,
    onboarding: true,
    experience: "New to blackjack",
    goal: "Basic strategy",
    completedLessons: {},
    settings: {
      rules: { ...DEFAULT_RULES },
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

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

/** Move existing physical cards; fixtures never add impossible duplicate cards. */
function fixture(
  decks: ShoeDeckCount,
  ranks: Rank[],
  bankroll = 1000,
): CasinoState {
  const table = createCasino(DEFAULT_RULES, 1234, 1000, decks);
  const remaining = [...table.shoe.cards];
  const prefix = ranks.map((rank) => {
    const index = remaining.findIndex((card) => card.rank === rank);
    assert.ok(index >= 0, `fixture has a physical ${rank}`);
    return remaining.splice(index, 1)[0];
  });
  return {
    ...table,
    shoe: { ...table.shoe, cards: [...prefix, ...remaining], bankroll },
  };
}

for (const decks of SHOE_DECK_COUNTS) {
  test(`${decks}-deck casino uses complete physical decks and restores exact active wagers`, () => {
    const original = createCasino(DEFAULT_RULES, 501, 1000, decks);
    assert.equal(original.shoe.cards.length, 52 * decks);
    assert.equal(shoeDeckCount(original.shoe), decks);
    assert.equal(
      new Set(original.shoe.cards.map((card) => card.id)).size,
      52 * decks,
    );
    for (const rank of RANKS)
      for (const suit of SUITS)
        assert.equal(
          original.shoe.cards.filter(
            (card) => card.rank === rank && card.suit === suit,
          ).length,
          decks,
          `${rank}${suit} occurs once per physical deck`,
        );

    let split = casinoDeal(fixture(decks, ["8", "6", "8", "10", "3", "2"]));
    split = casinoAct(split, "split", split.revision);
    assert.equal(split.shoe.round?.phase, "playing");
    assert.equal(split.shoe.round?.hands.length, 2);
    assert.equal(casinoCommitted(split), 20);
    const insurance = casinoDeal(fixture(decks, ["5", "A", "6", "9", "10"]));
    assert.equal(insurance.shoe.round?.phase, "insurance");
    const insured = casinoInsurance(insurance, true, insurance.revision);
    assert.equal(insured.shoe.round?.phase, "playing");
    assert.equal(casinoCommitted(insured), 15);

    for (const table of [split, insurance, insured]) {
      const before = clone(table);
      const loaded = decodeSavedData(
        JSON.stringify({ ...defaults(), casino: table }),
        defaults(),
      );
      assert.deepEqual(
        loaded.casino,
        before,
        "hydration does not redeal, shuffle, reveal, or repay wagers",
      );
      assert.deepEqual(table, before, "decoding does not mutate live state");
      assert.equal(
        loaded.casino!.shoe.shuffleNumber,
        1,
        "first deal retains the original shoe even with one deck",
      );
      assert.equal(casinoAvailable(loaded.casino!), casinoAvailable(table));
      assert.equal(casinoCommitted(loaded.casino!), casinoCommitted(table));
      assert.equal(loaded.casino!.shoe.round!.dealerRevealed, false);
    }
  });
}

test("casino decoding rejects impossible physical composition and unsupported shoe sizes", () => {
  for (const decks of SHOE_DECK_COUNTS) {
    const table = createCasino(DEFAULT_RULES, 15, 1000, decks);
    const corrupt = clone(table);
    const [first] = corrupt.shoe.cards;
    const other = corrupt.shoe.cards.find((card) => card.rank !== first.rank)!;
    corrupt.shoe.cards[0] = { ...first, rank: other.rank, suit: other.suit };
    assert.throws(
      () =>
        decodeSavedData(
          JSON.stringify({ ...defaults(), casino: corrupt }),
          defaults(),
        ),
      /casino\.shoe\.cards.*physical card composition/,
    );
  }
  for (const decks of [3, 5, 7]) {
    const table = createCasino(DEFAULT_RULES, 15, 1000);
    table.shoe.cards = createDeck(15, decks);
    assert.throws(
      () =>
        decodeSavedData(
          JSON.stringify({ ...defaults(), casino: table }),
          defaults(),
        ),
      /casino\.shoe\.cards has an unsupported shoe size/,
    );
  }
});

test("a valid single-deck casino cannot masquerade as the six-deck training simulator", () => {
  const data = defaults();
  data.active = newTraining(data, { kind: "simulator", topic: "simulator" });
  data.active.shoe = casinoDeal(fixture(1, ["10", "6", "7", "10"])).shoe;
  data.casino = createCasino(DEFAULT_RULES, 21, 1000, 8);
  assert.throws(
    () => decodeSavedData(JSON.stringify(data), defaults()),
    /active\.shoe\.cards/,
  );
  data.active.shoe = createCasino(DEFAULT_RULES, 21, 1000, 6).shoe;
  const loaded = decodeSavedData(JSON.stringify(data), defaults());
  assert.equal(loaded.active?.shoe?.cards.length, 312);
  assert.equal(loaded.casino?.shoe.cards.length, 416);
});

test("fresh casino sessions are rejected during insurance and play without any mutation", () => {
  const pending = [
    casinoDeal(fixture(1, ["10", "A", "7", "9"])),
    casinoDeal(fixture(6, ["10", "6", "7", "10"])),
  ];
  assert.deepEqual(
    pending.map((table) => table.shoe.round?.phase),
    ["insurance", "playing"],
  );
  for (const table of pending) {
    const before = clone(table);
    for (const decks of SHOE_DECK_COUNTS) {
      assert.equal(
        casinoNewSession(table, decks, table.revision, 400, 3000),
        table,
      );
      assert.deepEqual(table, before);
    }
  }
});

test("fresh casino sessions reset virtual funds, completed rounds, cards, bets, and deposits together", () => {
  let old = casinoDeal(
    fixture(6, ["10", "A", "9", "K", "A", "9", "K", "7"], 10),
  );
  old = casinoInsurance(old, false, old.revision);
  assert.equal(old.shoe.bankroll, 0);
  old = casinoRefill(old, old.revision);
  old = casinoSetBet(old, 25);
  old = casinoDeal(old, old.revision);
  assert.equal(old.shoe.round?.phase, "complete");
  assert.equal(old.shoe.bankroll, 1037.5);
  assert.equal(old.deposits, 2000);
  assert.equal(old.refillCount, 1);
  const before = clone(old);

  for (const decks of SHOE_DECK_COUNTS) {
    const fresh = casinoNewSession(old, decks, old.revision, 991, 3000);
    assert.notEqual(fresh.id, old.id);
    assert.equal(fresh.revision, old.revision + 1);
    assert.equal(fresh.createdAt, 3000);
    assert.equal(fresh.shoe.cards.length, 52 * decks);
    assert.equal(fresh.shoe.bankroll, 1000);
    assert.equal(fresh.deposits, 1000);
    assert.equal(fresh.refillCount, 0);
    assert.equal(fresh.selectedBet, 10);
    assert.equal(fresh.lastBet, 10);
    assert.equal(casinoAvailable(fresh), 1000);
    assert.equal(casinoCommitted(fresh), 0);
    assert.equal(casinoNet(fresh), 0);
    assert.equal(fresh.shoe.round, undefined);
    assert.equal(fresh.shoe.rounds, 0);
    assert.equal(fresh.shoe.nextCard, 0);
    assert.equal(fresh.shoe.shuffleNumber, 1);
    assert.equal(fresh.shoe.runningCount, 0);
    assert.deepEqual(fresh.shoe.discarded, []);
    assert.deepEqual(fresh.shoe.seenIds, []);
    assert.deepEqual(fresh.shoe.rules, old.shoe.rules);
    assert.deepEqual(old, before);
    assert.deepEqual(
      decodeSavedData(
        JSON.stringify({ ...defaults(), casino: fresh }),
        defaults(),
      ).casino,
      clone(fresh),
    );
  }
});

test("fresh-session revisions prevent repeated reset and pre-reset taps from touching a new table", () => {
  const old = casinoSetBet(createCasino(DEFAULT_RULES, 51, 1000, 1), 25);
  const fresh = casinoNewSession(old, 1, old.revision, 51, 1000);
  assert.notDeepEqual(
    fresh.shoe.cards,
    old.shoe.cards,
    "reusing a timestamp seed must still shuffle fresh cards",
  );
  assert.notEqual(fresh.id, old.id);
  assert.equal(casinoDeal(fresh, old.revision), fresh);
  assert.equal(casinoAct(fresh, "hit", old.revision), fresh);
  assert.equal(casinoInsurance(fresh, true, old.revision), fresh);
  assert.equal(casinoRefill(fresh, old.revision), fresh);
  assert.equal(casinoNewSession(fresh, 8, old.revision, 51, 1000), fresh);
  assert.equal(
    casinoNewSession(fresh, 3 as ShoeDeckCount, fresh.revision),
    fresh,
  );
  const second = casinoNewSession(fresh, 2, fresh.revision, 51, 1000);
  assert.notEqual(second.id, fresh.id);
  assert.equal(second.revision, fresh.revision + 1);
  assert.equal(second.shoe.cards.length, 104);
  assert.equal(casinoDeal(second, fresh.revision), second);
});

test("saving a fresh casino session preserves training, count drills, history, and completed lessons", () => {
  const data = defaults();
  data.active = { ...newTraining(data), paused: true, elapsedMs: 1234 };
  data.counting = { ...createCountingSetup(false), paused: true };
  data.sessions = [
    {
      ...data.active.session,
      endedAt: data.active.session.startedAt + 2000,
      durationMs: 2000,
    },
  ];
  data.completedLessons = { "count-basics": 1000 };
  data.bookmarks = [
    {
      scenario: data.active.scenario!,
      rules: { ...DEFAULT_RULES },
      countMode: false,
    },
  ];
  data.casino = createCasino(DEFAULT_RULES, 12, 1000, 6);
  const before = clone(data);
  const updated = {
    ...data,
    casino: casinoNewSession(data.casino, 1, data.casino.revision, 56, 4000),
  };
  const loaded = decodeSavedData(JSON.stringify(updated), defaults());
  const { casino: oldCasino, ...learningBefore } = before;
  const { casino: newCasino, ...learningAfter } = loaded;
  assert.deepEqual(learningAfter, learningBefore);
  assert.notEqual(newCasino?.id, oldCasino?.id);
  assert.equal(newCasino?.shoe.bankroll, 1000);
  assert.equal(newCasino?.shoe.cards.length, 52);
  assert.deepEqual(
    clone(data),
    before,
    "resetting the table never mutates the prior saved app data",
  );
});
