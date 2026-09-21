# Blue/red redesign and casino motion

Verified September 21, 2026.

## Changes

- Shared navy surfaces, bright blue actions, red accents, new card backs, and matching app/Home Screen icons.
- Home lesson milestone bar, richer practice feedback, and completion recaps with real sample sizes and assistance labels. Brief completion accents run only for fresh summaries; historical results remain still.
- Casino animations use actual physical card IDs and shoe order. Hits and splits animate new arrivals; the dealer's hole flips before extra dealer cards arrive. Wallet, count, result, and table-net displays do not reveal the outcome before the animation ends.
- Actions retain revision checks and are temporarily disabled during a deal. Exit remains available; leaving stops the animation. Restoring a saved hand is immediate. Reduce Motion disables dealing and feedback motion.

## Validation

- Type checking and all 153 automated tests pass, including eight new behavioral tests for the casino animation schedule: initial order, hits, splits, dealer reveal/draws, automatic blackjack, restoration, fresh shoes, and reduced motion.
- Production web and iOS Hermes exports pass. An export is not a signed native build or physical-device test.
- Browser walkthrough at 390×844: new home palette, readable cards, dealer above player, pinned action dock, actual sliding cards during deal, split-hand transitions, dealer settlement, and controls unlocking afterward.
- At 360×640, basic-strategy feedback and Next remain visible without scrolling; the Next button's bottom was 554px within the 640px viewport. Casino Deal remains pinned, including after a split with a four-card dealer hand. Additional split-hand detail can scroll independently.
- Completed a strategy decision and session; recap showed the actual one correct answer, 100% from n=1, and Unassisted label.
- Reduced Motion was enabled in Settings during the browser walkthrough; the following hand completed immediately with no deal lock or animation.
- The offline download reaches Ready, and saved casino cards and wallet survive a reload with the temporary static server stopped.

Physical iPhone animation smoothness, Safari-specific card flips, safe areas, and Home Screen icon refresh still need user device confirmation. Installed web apps download a published update while connected and activate it after all old Acewise windows close.
