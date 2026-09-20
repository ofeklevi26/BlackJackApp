# Practice and casino verification

September 20, 2026. Follow-up to the [initial functional QA](QA-REPORT.md).

## Changes

- Strategy practice uses compact cards and a fixed action/Next area. Short screens arrange the dealer and player side by side. Optional details open in a sheet with a fixed Close control.
- Expanded explanations interpret the specific hand, describe possible draws, compare legal alternatives, explain relevant table rules and supported count thresholds, and give an adjacent-upcard strategy row. They use the original decision snapshot and contain no invented numerical EV claims.
- Counting drills use pinned phase controls, compact cards, a custom keypad without a duplicate native keyboard, and optional help/walkthrough sheets.
- Casino mode maintains a separate saved virtual wallet and shoe. It supports wagers, insurance, all legal player actions, dealer resolution, and one-tap next rounds without training questions. Outstanding wagers are reserved and cannot exceed the wallet.
- Opening the casino pauses existing practice. Exiting restores the saved practice session. The casino URL also restores the current table after browser reload.

## Automated checks

TypeScript checking and all **110 tests passed**. Expo production exports succeeded for web, iOS, and Android; native exports included Hermes bytecode.

The expanded suite includes 13 casino tests and nine explanation tests, in addition to the previous 88 tests. Casino fixtures verify 3:2 naturals, split-ace payouts, doubles, insurance, surrender, pushes, affordability, stale submissions, refills, and old/new save compatibility. A 400-round run independently reconciles every settlement and checks that available chips never go negative. Explanation fixtures cover aces, legal fallbacks, S17/H17 changes, adjacent-upcard patterns, and supported count boundaries.

## Browser checks

Test data was isolated on `127.0.0.3:8081`, separate from the user's `localhost` preview.

- At 390×844, a strategy choice, feedback, and Next control fit on screen. At 360×640, Next was at y=505–554, above the tab bar, and advanced without scrolling.
- Explain more opened substantive hand-specific analysis, including hard-10 draw facts, dealer context, alternative actions, rules, and the adjacent-upcard row. Closing restored the same decision.
- Casino chip clearing, adding, repeating, dealing, hitting, standing, doubling, and exiting were exercised. A $25 loss changed $1,000 to $975; a subsequent doubled $25 loss changed $975 to $925. Reserved wagers disappeared at settlement and the next-deal control remained visible.
- Reload restored identical casino cards and the $975 available/$25 reserved/$1,000 total wallet before an action. Returning to practice preserved its two recorded decisions and paused state; casino rounds did not appear in the training session review.
- Final 360×640 casino checks showed both active and settled single hands, totals, results, and all controls without scrolling. Short-screen card fans prevent a third card from needlessly wrapping onto another row.
- Card-value and true-count drills were answered at 360×640. Questions, custom keypad, feedback, and Next remained visible. Optional explanation/help sheets opened and closed, and help paused the next exercise until Resume.
- Casino → Home → Card counting restored the paused counting session, rather than reopening the casino. A completed drill no longer recreates an empty counting setup when navigating away.
- Full-shoe training completed a Stand decision and continued to a checkpoint. The five exposed cards independently summed to +1; a six-deck estimate and floored true count of 0 were accepted. Continue, checkpoint submission, and next-deal controls stayed pinned.
- A subsequent full-shoe Double decision verified the final side-by-side table and complete feedback at 360×640. The checkpoint retained revealed dealer cards, player ranks/suits, and all three labeled inputs above the fixed submit button. A Done control explicitly dismisses the native keyboard; its device positioning remains unverified.
- The final casino table also fit at 390×844 with vertically arranged hands, the wallet, and all actions visible.

## Limits

Browser viewport checks are not physical iPhone or Android validation. Native safe areas, large system text, soft-keyboard behavior, haptics, audio, and lifecycle behavior still need device checks. Extreme text scaling and many split hands may require scrolling in the table area; action controls remain separate from that area. No signed EAS build was produced in this change.
