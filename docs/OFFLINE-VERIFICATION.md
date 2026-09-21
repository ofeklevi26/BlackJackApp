# Offline iPhone web app

Verified September 21, 2026. Production: https://acewise-ofeklevi28.expo.app. Expo account `ofeklevi28` was confirmed on its Free ($0/month) plan. No paid membership, billing change, or Apple signing was used.

## Implementation

- Standalone manifest, branded icons, iOS Home Screen metadata, and safe-area viewport.
- Production-only service worker with content-verified assets, offline SPA routes, cached fonts/images, and audio range responses.
- Visible readiness checks inspect the saved cache. Retry repairs missing files without deleting valid files or saved progress.
- Updates wait for open clients to close. They never interrupt a hand with a forced reload.
- Export pipeline includes service-worker generation, so the existing GitHub Actions web-export job also exercises this step.

## Checks

- TypeScript check passes.
- Automated tests include worker installation failure/rollback, mismatched asset hashes, package asset paths, offline navigation, byte ranges, version and scope isolation, cache eviction/repair, and client message/timeout behavior.
- Production web export and iOS Hermes bundle export pass. The latter checks compatibility only; it is not a signed iOS build.
- Browser test loaded the production export from a temporary localhost server, waited for Settings → Ready to use offline, stopped that server, and confirmed a full reload still worked.
- With that server stopped, opened the casino deep link, dealt and played multiple rounds, and reloaded `/practice?topic=casino`. The virtual balance, cards, and shoe persisted. The lesson list and a complete lesson also opened offline.
- Published HTTPS app is verified separately from localhost, including every precached file against its expected content hash. Expo Hosting requires the package asset URLs to preserve literal `@` and `+` characters; this is covered in the generator.

## Physical-device follow-up

The user must finish Safari → Share → Add to Home Screen on their iPhone. Launch the icon once online, wait for Settings → Ready to use offline, then enable airplane mode and reopen it. Desktop browser testing does not prove iPhone installation, iOS audio playback, or device-specific safe-area rendering.

Progress is separate from Expo Go and each browser origin. Browser data clearing or OS storage eviction can remove offline files and history; no cloud synchronization or automatic history import is implemented.
