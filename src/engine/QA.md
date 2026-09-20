# Engine QA evidence

Checked September 20, 2026. Engine checks are separate from browser/native interaction checks.

## External references

- [Michael Shackleford: 4–8 deck basic strategy](https://wizardofodds.com/games/blackjack/strategy/4-decks/) — hard/soft/pair decisions, DAS, S17, and the six H17 changes.
- [Michael Shackleford: surrender](https://wizardofodds.com/games/blackjack/surrender/) — six-deck late surrender, including H17 8+8 against an ace.
- [Wizard of Odds: Hi-Lo](https://wizardofodds.com/games/blackjack/card-counting/high-low/) — card tags and the selected six playing indices plus insurance.
- [Norman Wattenberger/QFIT: true-count calculation](https://www.qfit.com/CalculatingTrueCounts.htm) — flooring positive and negative quotients and the distinction from rounding/truncation. Acewise uses floor consistently; the Wizard's introductory numerical example uses nearest rounding instead.

The strategy test oracle is a fixed 34-row, 10-column source matrix. It does not generate expected answers by calling the implementation. Across H17/S17 and surrender on/off, all 1,360 cells pass. This verifies the declared total-dependent training chart, not a composition-dependent expected-value solver.

## Reproducible checks

Run the two engine suites from the project root:

```sh
pnpm exec tsx --test tests/engine.test.ts tests/engine-qa.test.ts
```

The combined suites contain 32 passing tests. The broader project type check also passed after the additions.

The additional QA suite covers:

- 1,360 fixed strategy cells across the four supported rulesets.
- 5,500 hand valuations against independently enumerated ace assignments.
- Fractional wagers combining insurance with surrender or doubling; split 21 versus dealer 21; and multi-ace dealer soft 17 under both rules.
- 3,200 seeded rounds choosing arbitrary legal actions rather than always following strategy. All five actions, insurance choices, half-unit bets, multiple penetrations, and shuffle boundaries are exercised. Independent card-tag and ace-value calculations check count/accounting; JSON round trips reproduce the same next transition.
- A split-visibility fixture defining the UI's public-card rendering contract.

Existing regressions additionally cover source decision examples, scenario generation and custom validation, hidden-card independence, dealer peek, naturals, all payouts, capped splits, split aces, duplicate-action IDs, and the low-card exhaustion case below.

## Confirmed regressions and integration contract

The earlier audit corrected rule-independent focused sampling, impossible custom split-ace decisions, and the safety reserve for unusually long split rounds. The exhaustion regression uses seed 4 and a physical 52-card tail rich in aces/twos at 85% requested penetration. Three splits followed by legal hits formerly exhausted that tail during the round. The 73-card reserve now forces a shuffle before such a round starts. At the default 75% penetration, the cut-card policy already leaves a sufficient reserve.

For live-table rendering, all exposed split hands must remain visible. Reproduction: deal `8,6,8,10,3,K,2` in engine order (player, dealer, player, hole, subsequent draws), split, then double the first hand. The king completes that hand, and the next two begins the sibling. Both cards have been exposed, although `getActiveScenario()` contains only the sibling `8+2`. The complete `round.hands` payload retains the king. A second fixture, `K,6,Q,10,A,2`, automatically completes the first split 21 while the sibling remains active. Rendering only the current scenario omits that ace during the next decision. The UI should render every player hand, reveal dealer cards only when `dealerRevealed` is true, and distinguish review snapshots from newly dealt cards. Engine grading still uses the pre-action visible scenario.

## Deliberate scope

The engine supports one player seat, up to four split hands, fixed six-deck American-peek rules, H17/S17, and late surrender on/off. The count-based playing trainer teaches six explicitly scoped S17/no-surrender indices. It does not implement a complete index set or a finite-deck EV oracle. True-count checkpoints use the displayed deck-estimation convention; exact physical decks are a separate helper. The simulator reveals its hole card at every round end, including all-bust/surrender rounds, for a consistent training correction sequence. Virtual bankroll can become negative, allowing practice to continue.
