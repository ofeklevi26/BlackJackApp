# Acewise

A visual, offline blackjack learning app built with Expo SDK 57, React Native, TypeScript, and Expo Router. Learn a concept, practice a decision, understand the explanation, then revisit your weak spots.

## Free iPhone installation

**Open [Acewise](https://acewise-ofeklevi28.expo.app) in Safari.** Use this production address for your installed app.

Acewise can be installed as a Home Screen web app. It needs neither Expo Go nor an Apple Developer membership. Open the published production URL in **Safari**, choose **Share → Add to Home Screen → Add**, then launch the new Acewise icon while connected. Open Settings and wait for **Ready to use offline**. Lessons, counting drills, practice, and the virtual casino then run without a computer or internet connection.

Keep using the same production URL: preview deployments, localhost, and Expo Go have separate saved progress. Browser storage is local and may be removed by clearing website data or by the operating system; export important history from Settings. Exports are backups for inspection, not an automatic import or cloud sync. Reopen online if an offline download needs repairing.

## Start the app

Requirements: Node.js 24 LTS (Expo requires at least 22.13), pnpm 11.19, and Git.

```sh
git clone https://github.com/ofeklevi26/BlackJackApp.git
cd BlackJackApp
corepack enable
corepack prepare pnpm@11.19.0 --activate
pnpm install --frozen-lockfile
pnpm start
```

Use the development server's QR code with an Expo development build. For a compatible Expo Go installation, run `pnpm start --go`. Your computer and phone must be able to reach each other on the same network. Use `pnpm web` for the web preview, `pnpm android` for an available Android emulator, or `pnpm ios` for an iOS simulator on macOS.

If your Node installation does not include Corepack, install pnpm using its official installation instructions. No API key, account, backend, or environment file is needed to run the app.

## What is included

- Four tabs: Home, Learn, Practice, and Progress, plus onboarding and table preferences.
- A navy, blue, and red visual system, tactile controls, visible lesson milestones, and brief feedback transitions. Fresh session reviews celebrate actual practice and show clearly labeled accuracy; historical reviews remain still.
- Ten interactive lessons, guided examples, mastery checks, a glossary, and a tappable strategy chart.
- Mixed, focused, adaptive, custom, and count-deviation scenarios, with balanced or realistic initial-deal sampling.
- Custom hands are one-decision exercises; similar-hand practice starts a fresh focused session.
- Coach feedback after each choice and Challenge feedback in the session review.
- Compact practice tables with pinned answers and Next controls. Open optional explanation sheets for hand math, dealer context, alternative actions, rule effects, and count-deviation boundaries.
- Six counting drills: card values, running count, pair cancellation, full-deck countdown, deck estimation, and true-count conversion.
- A finite six-deck table with persistent shoes, insurance, splitting, doubling, surrender, dealer peek, and virtual-unit accounting.
- Configurable completed-round count checkpoints, with exposed-card corrections in Coach mode.
- A separate casino mode: start with $1,000 in virtual chips, place $5–$100 wagers, and play complete rounds without quizzes, count prompts, or grading. Choose 1, 2, 4, 6, or 8 decks. Includes insurance, splits, doubles, surrender, repeat bets, saved shoes/rounds, a fresh-session reset, and optional tap-to-reveal running and true counts.
- Casino cards slide into place in actual shoe order, with a dealer hole-card flip and staggered dealer draws. New hits/split cards animate without replaying existing cards. Results appear after the reveal, and controls briefly wait for dealing to finish. Reduce Motion shows the final cards immediately; reopening a saved hand never replays its deal.
- Session restarts preserve recorded rules and training conditions, including checkpoint cadence.
- Session reviews, bookmarks, first-attempt and assistance-separated accuracy, response time, counting error, category trends, and history export.
- Local persistence, pause/resume, optional haptics/card sound, reduced motion, and accessible labeled controls.

## Rules and strategy scope

The default table uses six decks, S17, 3:2 blackjack, American dealer peek, double on any first two cards, double after splitting, late surrender, up to four hands, no resplitting aces, and one extra card per split ace. A split two-card 21 pays 1:1. H17 and surrender-off are supported variations. The cut card is at 75%; the current round completes before reshuffling.

Basic strategy is total-dependent with pair priority and legal-action fallbacks. It does not claim to be a full composition-dependent solver. The advanced trainer teaches six explicitly listed Hi-Lo deviations, pinned to six-deck S17 without surrender; it is not a complete index system. The full-shoe table grades basic strategy and separately tests your count. Count-based bet ramps and additional player seats are not included.

Hi-Lo uses +1 for 2–6, 0 for 7–9, and −1 for tens and aces. True count uses floor toward negative infinity (`-1 / 2` becomes `-1`). The shoe engine uses exact undealt decks internally. Completed-round estimation checkpoints use decks remaining rounded to the nearest half deck and ask for conversion using that estimate. Recognition and pair drills grade card values independently; running drills grade the cumulative count.

Only revealed cards contribute to the count. The table reveals the dealer hole card at every round end, including when all player hands bust or surrender, so its exposure history is always inspectable. Winnings are net virtual units and do not determine learning accuracy. The full-shoe **training** balance starts at 100 and may go negative for uninterrupted practice.

**Casino mode** has an independent $1,000 virtual wallet. All wagers, including splits, doubles, and insurance, must be covered by available chips; active wagers remain reserved until the round settles. If the balance drops below the $5 table minimum, an explicit free $1,000 refill becomes available between rounds. There are no purchases, cash prizes, or cash-out. Casino rounds do not affect training statistics. Enter from Home or Practice, and use Exit to return to your paused training. The wallet, shoe, and current hand are saved on this device.

The casino deals from a shuffled physical shoe without replacement: every deck contains exactly 52 distinct cards, and dealt cards stay out until a shuffle. Open **Table**, choose **1, 2, 4, 6, or 8 decks**, and tap **Start fresh session** between rounds. This resets the casino wallet to $1,000, round totals, and running count, and creates a freshly shuffled shoe of the chosen size. It retains the table's S17/H17 and surrender rules and leaves learning progress intact. The applied shoe size and current cards persist across reloads; automatic shuffles retain that size. A remaining-card meter supports deck estimation. Beside it, tap **Tap to reveal counts** to check the cumulative Hi-Lo running count and true count at the current point in the shoe. Only exposed cards count; true count uses exact undealt decks and floors negative values too. The values update as cards appear. Tap again to hide; each new round, shuffle, fresh session, exit, or reload conceals them automatically. Revealing is optional and does not affect training statistics.

The cut card is at 75%, with an earlier between-round safety shuffle if too few cards remain to guarantee completion of all possible split hands. This is deliberately conservative for small shoes. No cards are replaced or reshuffled during a round, and shuffle timing never inspects hidden card values. Counting therefore reflects the actual remaining composition until a shuffle resets the count. Casino deck choices do not change the six-deck strategy curriculum or its deviation indices.

References, checked September 20, 2026:

- [Wizard of Odds: 4–8 deck basic strategy](https://wizardofodds.com/games/blackjack/strategy/4-decks/)
- [Wizard of Odds: late surrender](https://wizardofodds.com/games/blackjack/surrender/)
- [Wizard of Odds: Hi-Lo and index examples](https://wizardofodds.com/games/blackjack/card-counting/high-low/)
- [Expo SDK documentation](https://docs.expo.dev/versions/latest/)

See [engine documentation](src/engine/README.md) for the API and source metadata. Explanations are original, deterministic application content. The app does not invent numerical expected-value advantages.

## Development and checks

```sh
pnpm typecheck
pnpm test
pnpm export:web
```

Tests cover independent strategy reference cases, expanded explanations, soft aces, legal actions, split aces, insurance/peek timing, payouts, stale submissions, seeded scenarios, long-run shoe invariants, counting checkpoints, pause/time accounting, learning metrics, and casino wallet/persistence invariants. GitHub Actions runs type checking, tests, and a production web export on every main-branch push and pull request.

```text
app/                  Expo Router tabs and practice orchestration
src/engine/           Pure rules, strategy, scenarios, and finite-shoe engine
src/counting/         Deterministic counting exercises and metrics
src/content/          Lessons, glossary, and interactive chart data
src/screens/          Learning, counting, and progress interfaces
src/state/            Local storage, sessions, and analytics
src/ui/               Shared accessible components and visual tokens
tests/                Domain, curriculum, counting, and state checks
assets/               Original app icon and generated card sound
```

Progress is stored under `acewise:v1` using AsyncStorage. On web, this is browser storage for the current origin. Clearing app/browser data removes local history; export it from Settings or Progress first. There is no cloud synchronization. Native export opens the share sheet with JSON; web export downloads a JSON file.

## Free web deployment and offline updates

The Expo project is linked to `@ofeklevi28/acewise`. EAS Hosting supports Expo's Free plan; this app needs no paid backend or Apple signing. Free hosting has request/storage quotas: monitor them in the Expo dashboard and do not upgrade for personal offline use unless you choose to. See [Expo Hosting setup](https://docs.expo.dev/eas/hosting/get-started/) and [current plan limits](https://expo.dev/pricing).

```sh
npx eas-cli@latest login
pnpm check
pnpm export:web
npx eas-cli@latest deploy --prod
```

`pnpm export:web` exports the app and generates `dist/service-worker.js`. Deploy the complete `dist` directory without rewriting its files. Other hosts must serve HTTPS, return `/index.html` for SPA routes such as `/practice?topic=casino`, and serve `.js`, fonts, audio, and the manifest with correct MIME types. The worker must be served at `/service-worker.js` with root scope. Do not rewrite missing asset requests to HTML.

The worker saves the app shell and all exported assets, verifies their content hashes, and enables offline deep links and Safari audio byte ranges. Settings checks the saved files before reporting offline readiness and offers repair if browser cache entries were removed. Service-worker registration is disabled in Metro development and native builds. A plain development preview is not an offline installation.

When a deployment changes, the browser downloads the new version while connected. It waits until all Acewise windows close before activating, so it does not reload an active hand. Settings announces a downloaded update. Reopen the app after closing it and its Safari tabs to use that update; saved progress is kept. GitHub pushes run checks but do **not** deploy automatically: run the deployment commands above to publish a new version.

For local offline QA, serve `dist` on a localhost origin with SPA fallback, load it and wait for Ready, then stop only that static server and reload `/practice?topic=casino`. Confirm lessons, casino actions, and saved progress still work. Do not use Metro for this check. Automated worker tests cover failed/partial installs, asset integrity, offline routes, cache versions, cache isolation, repair, and media ranges. Actual iPhone installation and airplane-mode verification still need a physical iPhone.

## Expo builds

An Expo account and platform signing credentials are required for cloud builds, but not local web development. Project linking and publishing are separate from pushing code to GitHub.

```sh
npx eas-cli@latest login
npx eas-cli@latest init
npx eas-cli@latest build --profile preview --platform android
npx eas-cli@latest build --profile development --platform ios
npx eas-cli@latest build --profile production --platform all
```

The preview Android profile produces an APK. iOS internal distribution requires a registered device and suitable Apple credentials. Production builds use app-store distribution; review your bundle identifiers, Expo project association, privacy declarations, and store assets before submission. `eas.json` includes development, preview, and production profiles. Do not commit credentials or signing material.

## Verification notes

The latest [shoe verification](docs/SHOE-VERIFICATION.md) covers 129 passing tests, selectable deck counts, persistent shoes, and fresh casino sessions. The earlier [practice and casino verification](docs/PRACTICE-CASINO-VERIFICATION.md) covers compact phone layouts, expanded explanations, virtual-wallet accounting, and saved casino rounds. The [QA report](docs/QA-REPORT.md) records the full strategy/counting audit and learner walkthroughs. [Verification notes](docs/VERIFICATION.md) retain all milestones. Native device rendering and signed EAS builds require a physical device/emulator and your Expo/Apple/Google accounts; bundle exports are not evidence of a signed native build.
