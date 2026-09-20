# Acewise

A calm, offline blackjack learning app built with Expo SDK 57, React Native, TypeScript, and Expo Router. Learn a concept, practice a decision, understand the explanation, then revisit your weak spots.

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
- Ten interactive lessons, guided examples, mastery checks, a glossary, and a tappable strategy chart.
- Mixed, focused, adaptive, custom, and count-deviation scenarios, with balanced or realistic initial-deal sampling.
- Coach feedback after each choice and Challenge feedback in the session review.
- Six counting drills: card values, running count, pair cancellation, full-deck countdown, deck estimation, and true-count conversion.
- A finite six-deck table with persistent shoes, insurance, splitting, doubling, surrender, dealer peek, and virtual-unit accounting.
- Configurable completed-round count checkpoints, with exposed-card corrections in Coach mode.
- Session reviews, bookmarks, first-attempt and assistance-separated accuracy, response time, counting error, category trends, and history export.
- Local persistence, pause/resume, optional haptics/card sound, reduced motion, and accessible labeled controls.

## Rules and strategy scope

The default table uses six decks, S17, 3:2 blackjack, American dealer peek, double on any first two cards, double after splitting, late surrender, up to four hands, no resplitting aces, and one extra card per split ace. A split two-card 21 pays 1:1. H17 and surrender-off are supported variations. The cut card is at 75%; the current round completes before reshuffling.

Basic strategy is total-dependent with pair priority and legal-action fallbacks. It does not claim to be a full composition-dependent solver. The advanced trainer teaches six explicitly listed Hi-Lo deviations, pinned to six-deck S17 without surrender; it is not a complete index system. The full-shoe table grades basic strategy and separately tests your count. Count-based bet ramps and additional player seats are not included.

Hi-Lo uses +1 for 2–6, 0 for 7–9, and −1 for tens and aces. True count uses floor toward negative infinity (`-1 / 2` becomes `-1`). The shoe engine uses exact undealt decks internally. Completed-round estimation checkpoints use decks remaining rounded to the nearest half deck and ask for conversion using that estimate. Recognition and pair drills grade card values independently; running drills grade the cumulative count.

Only revealed cards contribute to the count. This training table reveals the dealer hole card at every round end, including when all player hands bust or surrender, so its exposure history is always inspectable. Winnings are net virtual units and do not determine learning accuracy. Virtual balance starts at 100 and may go negative for uninterrupted practice.

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

Tests cover independent strategy reference cases, soft aces, legal actions, split aces, insurance/peek timing, payouts, stale submissions, seeded scenarios, long-run shoe invariants, counting checkpoints, pause/time accounting, and learning metrics. GitHub Actions runs type checking, tests, and a production web export on every main-branch push and pull request.

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

Progress is stored under `acewise:v1` using AsyncStorage. On web, this is browser storage for the current origin. Clearing app/browser data removes local history; export it from Settings or Progress first. There is no cloud synchronization. Native export opens the share sheet with JSON; web export downloads a JSON file. The web bundle can be served statically; native installed builds provide the intended offline experience. A browser service worker is not included.

## Expo builds

An Expo account and platform signing credentials are required for cloud builds, but not local web development. Project linking and publishing are separate from pushing code to GitHub.

```sh
pnpm dlx eas-cli login
pnpm dlx eas-cli init
pnpm dlx eas-cli build --profile preview --platform android
pnpm dlx eas-cli build --profile development --platform ios
pnpm dlx eas-cli build --profile production --platform all
```

The preview Android profile produces an APK. iOS internal distribution requires a registered device and suitable Apple credentials. Production builds use app-store distribution; review your bundle identifiers, Expo project association, privacy declarations, and store assets before submission. `eas.json` includes development, preview, and production profiles. Do not commit credentials or signing material.

## Verification notes

The repository records automated verification and local browser checks in [docs/VERIFICATION.md](docs/VERIFICATION.md). Native device rendering and signed EAS builds require a physical device/emulator and your Expo/Apple/Google accounts; a web export is not evidence of a signed native build.
