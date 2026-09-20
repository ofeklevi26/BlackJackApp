# Blackjack domain

All exports are available from `src/engine/index.ts`. This directory has no UI or runtime dependencies. Strategy decisions never inspect hidden shoe cards.

## Supported table

Six decks, blackjack 3:2, American hole card and dealer peek, double on any initial two cards, double after split, maximum four hands, no ace resplitting, and one additional card on each split ace. S17/H17 and late surrender on/off are the only configurable rule variations. Late surrender is available only on the original two-card hand after a negative dealer peek. Split 21 pays 1:1. Any two equal-value cards, including different ten-valued ranks, may be split.

The evaluator implements the total-dependent strategy in the [Wizard of Odds 4–8 deck reference](https://wizardofodds.com/games/blackjack/strategy/4-decks/), including its H17 changes and [six-deck surrender treatment](https://wizardofodds.com/games/blackjack/surrender/). It is not a composition-dependent finite-deck expected-value solver. Rules and source scope are stored in `SOURCE_METADATA` (checked September 20, 2026).

## Counting convention

`rawTrueCount(running, decks)` returns the quotient. `trueCount(running, decks)` floors it toward negative infinity: +7 / 4 becomes +1 and −1 / 2 becomes −1. Both reject nonpositive decks. Flooring makes comparisons against integer index thresholds equivalent to using the unrounded quotient; do not silently switch this to rounding or truncation. Deck estimates are caller-supplied; `decksRemaining(session)` returns physical undealt cards divided by 52.

Count-based playing practice is deliberately limited to six introductory [Hi-Lo I18 entries](https://wizardofodds.com/games/blackjack/card-counting/high-low/), listed in `DEVIATIONS`: hard 16 vs 10, 15 vs 10, 12 vs 3, 12 vs 2, 10 vs 10, and 11 vs ace. This subset is pinned to S17 without surrender and non-pair hands. Doubles require two cards. Unmatched situations return the baseline with a reason stating that no supported deviation applies. Insurance has its own +3 index helper. This is not a complete index strategy or a profit forecast.

## Shoe lifecycle

```ts
let session = createShoe(42, DEFAULT_RULES, 0.75);
session = startRound(session, 1, session.rounds);
if (session.round?.phase === "insurance") {
  session = answerInsurance(session, false, session.round.id);
}
const situation = getActiveScenario(session);
if (situation) {
  session = playAction(session, "hit", situation.id);
}
```

Transitions return new state and preserve the input. Supply expected scenario/round IDs to reject delayed or duplicate UI submissions. Passing the same completed action has no effect; repeated hits require a fresh scenario ID. Illegal actions do nothing. State can be serialized directly to JSON for persistence.

The physical shoe is seeded and finite. An active round never shuffles. At the next round boundary, reaching the penetration threshold (or fewer than 73 cards remaining) replaces the shoe and resets the running count. The reserve guarantees the one-seat table can finish even an unusually long four-hand round; penetration settings above roughly 76% can therefore shuffle early. This does not affect the default 75% cut card. Player cards and the dealer upcard are exposed as dealt. The hole card contributes nothing until it is revealed. To give a consistent correction sequence, this simulator reveals the hole card at every round end, including all-bust or surrendered rounds; a casino may instead discard it unseen. Dealer drawing stops when no surviving non-natural hand requires comparison. `visibleCards` returns the exposure sequence for the entire current shoe; `seenIds` prevents any card from being counted twice.

Splitting deals the next card to the active hand first. The second split hand receives its next card when it becomes active, so future split cards cannot affect an earlier decision's count. Split aces finish automatically after one additional card.

`bet` and `bankroll` are virtual units. Bankroll starts at 100 and may go negative for uninterrupted training. Bet commitments are not subtracted at deal time: each hand records its final **net** profit, insurance records its separate net profit, and the round posts their sum to bankroll exactly once on completion. A normal win is +bet, loss −bet, push 0, natural +1.5×bet, and surrender −0.5×bet. Doubled bets are stored at twice the initial value. Insurance risks half the original bet and wins twice its own stake on dealer blackjack.

## Scenario sampling

Balanced sampling spreads practice across hard, soft, and pair situations, including reachable multi-card and split-hand decisions. Realistic sampling deals physical cards from shuffled six-deck shoes and conditions out completed natural rounds; focused topics additionally condition on their matching category/action. It models initial-deal frequency, not the frequency of every later decision in a played shoe. Adaptive mode uses supplied weak categories 70% of the time, retaining mixed review. Explicit-count puzzles provide a count context rather than a fictional exposed-card history.

Pass the active rules as the fifth argument to `generateScenario(seed, topic, sampling, weakTopics, rules)` so action-focused drills reflect the session's table. A surrender drill with surrender disabled throws an informative `RangeError`; the UI should offer that topic only when enabled. Adaptive generation excludes this impossible focus automatically. `makeScenario` infers split-ace restrictions from the first card of a split hand. `validateScenario` is specifically for decision puzzles, and therefore rejects automatically completed split-ace hands as well as busts, naturals, impossible earlier draw histories, conflicting hand counts, and more copies of a card than exist in six decks.

## Verification

`tests/engine.test.ts` uses independent fixed chart answers, H17/surrender regressions, count boundaries, seeded generation, physical card invariants, controlled deals for payouts and splitting, delayed-submission checks, and hundreds of fully played rounds for cumulative accounting and visibility.
