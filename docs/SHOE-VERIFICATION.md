# Configurable casino shoes

Verified September 20, 2026.

## Behavior

The casino already used a persistent six-deck shoe. It now supports 1, 2, 4, 6, and 8 standard 52-card decks. Cards are shuffled once and drawn without replacement until a between-round shuffle. The selected size survives automatic shuffles and saved-game restoration. Hidden hole cards stay out of the exposed-card count until revealed.

Table → select deck count → Start fresh session starts a new casino session with $1,000 virtual chips, a freshly shuffled shoe, no active round, zero count/discards, and zero casino round/net totals. This action is unavailable during insurance or player decisions. Training history, bookmarks, lessons, and paused drills are preserved. Fresh-session revisions remain monotonic so queued actions from the previous session cannot affect the new one.

The shoe meter shows the number of decks, shoe number, and approximate decks remaining. Table details give the exact physical remaining-card total. A notice identifies automatic shuffles and fresh sessions. No count quiz or strategy grading was added to casino play.

The cut card remains at 75%. A conservative fixed reserve of 33/45/61/73/81 cards for 1/2/4/6/8 decks may trigger an earlier shuffle. This prevents even unusually long four-hand split rounds from exhausting the deck; it never uses hidden composition to choose the shuffle point. An active round never reshuffles. The six-deck strategy curriculum and index scope remain unchanged.

## Automated verification

- Strict TypeScript checking and all **129 tests passed**.
- Physical composition and unique IDs for every supported size; five uninterrupted single-deck rounds in a fixture before a safety shuffle.
- 4,000 randomized rounds across all sizes and H17/S17, including serialization between transitions, exact accounting, count visibility, and shuffle boundaries.
- 200 adversarial four-hand low-card-tail rounds without exhaustion or a mid-round shuffle.
- Fifteen exact active-save checks spanning insurance, insured play, and split hands across all five sizes.
- Eight-deck saves accept 416 cards; malformed compositions and unsupported sizes are rejected. Training saves still require six decks.
- Fresh-session reset, repeated/stale actions, same-seed replacement, and preservation of non-casino learning data.
- Production web, iOS, and Android bundle exports passed. These are not signed native builds.

## Browser walkthrough

Used the isolated test origin `127.0.0.3:8081` at 360×640. Personal preview data on `localhost` was not changed.

- An existing six-deck active hand retained its cards and reserved wager; Start fresh session was disabled with an explanation.
- Settling the hand enabled a switch to one deck. The new session showed $1,000, zero rounds, and 52/52 cards remaining.
- The first single-deck round and next deal stayed on shoe #1. After eight cards were dealt, Table displayed 44/52 remaining.
- Reload restored the same A♠/4♣ versus J♦ hand, $980 available, $10 reserved, and $990 balance.
- Further rounds depleted the same shoe, then the next deal displayed shoe #2 and a Fresh shuffle notice while preserving the wallet.
- An eight-deck fresh session showed 416/416 cards, eight decks remaining, zero rounds/net, and $1,000. The empty table, meter, notice, and Deal control fit without scrolling.

Physical iOS/Android rendering and accessibility text scaling remain device checks. Generated exports and dependencies stay outside version control.
