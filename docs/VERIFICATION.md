# Verification

Latest verification: September 20, 2026. See the [full QA report](QA-REPORT.md) for the completed functional audit, fixes, and precise coverage limits.

## After QA fixes

- Strict TypeScript checking and all **88 automated tests** passed.
- Production exports for web, iOS, and Android passed; the native exports generated Hermes bytecode.
- Actual browser walkthroughs completed all ten lessons, all six counting modes, diagnostic/review practice, full-table sessions, settings, and recovery on a separate origin.
- Independent checks cover 1,360 strategy cells, 5,500 hand valuations, 3,200 seeded table rounds, and 36 complete counting configurations.
- Physical-device testing and signed builds remain unperformed. See the QA report for other untested interactions and recommended release checks.

## Original build baseline

The following records the initial build verification, before the later QA fixes and expanded 88-test suite.

### Automated

- TypeScript strict type checking: passed.
- 63 automated tests: passed. Includes independent strategy cases; S17/H17 and surrender variations; peek, insurance, naturals, splits, doubles and payouts; a 320-round seeded simulation; finite-shoe accounting and visibility; impossible custom histories; stale/duplicate submissions; counting/pause timing; persistence recovery and corrupt-save validation; chart/lesson consistency; and comparable, first-attempt analytics.
- Expo dependency compatibility check: passed against the installed SDK 57 package map.
- Production web export: passed.
- Android and iOS JavaScript/Hermes bytecode exports: passed.

### Browser walkthroughs

Test sessions were generated on a separate local origin from the delivered preview.

- Onboarding → five-hand diagnostic → deferred Challenge feedback → session review and actual statistics.
- Running-count drill → expose four cards → answer checkpoint → correction → next checkpoint → save and exit → reload → resume at checkpoint two with existing answers intact.
- Finish a shorter counting session → review exact accuracy, error, and response time.
- Full-shoe table → pre-deal virtual wager → insurance offer → player action → finish-after-current-round → dealer reveal and settlement → running/deck/true-count checkpoint → results.
- First lesson → guided answer → independent quiz → persisted completion.
- Progress dashboard → actual comparable sessions, separate outcomes, history, and hand/upcard heatmap.
- Narrow and wider layout spot checks. Corrected a narrow-header overflow and an empty-string child warning found during the walkthrough.

## Remaining platform validation

Exports validate bundling, not signed application builds or actual device rendering. Physical iOS/Android checks are still needed for native safe areas, large system font settings, background/cold-start behavior, haptics, audio playback, and the native share sheet. EAS project linking and signed builds require the owner's Expo and platform credentials and were not performed.

## Deliberate scope

The trainer uses documented total-dependent strategy and a six-index introductory deviation subset. It does not include a composition-dependent EV solver, a full professional index set, cloud sync, extra simulated seats, count-based wager ramps, or a web service worker. Installed native builds are the intended offline platform. These constraints are also documented in the README and engine guide.
