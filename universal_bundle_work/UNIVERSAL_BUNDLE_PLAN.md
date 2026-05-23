# Universal Bundle Work Plan

Date: 2026-05-23
Workspace: `universal_bundle_work`

## Goal

Create a universal userscript build that works for Chrome, Android, Firefox, and iPhone userscript environments while preserving the exact same feature behavior as the current split `260523` script.

The only intended behavioral change is the load path:

- Current: many `@require` files loaded by the userscript manager.
- Target: one universal bundled userscript containing all local project modules in the same order.

User data must not be reset or migrated destructively.

## Non-Negotiable Compatibility Rules

1. Keep existing storage keys.

   The bundle must keep using:

   - `lore-injector-v5`
   - `lore-turn-counters`
   - `lore-last-mention`
   - `lore-recent-injections:*`
   - existing IndexedDB database and tables

2. Do not force users to re-extract lore.

   Existing lore packs, entries, embeddings, extraction logs, injection logs, cooldown maps, and active pack mappings must remain usable.

3. Keep feature behavior identical after load.

   The following must keep the same runtime behavior:

   - lore insertion
   - auto extraction
   - manual extraction
   - batch extraction
   - timeline extraction
   - low-output patch mode
   - embedding generation
   - active lore pack mapping
   - cooldown handling
   - periodic old-lore recall option
   - refiner / response correction
   - API cost tracking
   - prompt management
   - import/export and merge tools
   - logs and session state

4. Keep the existing chat-only load policy.

   The heavy bundle should still run only on chat/episode paths:

   - `/stories/{storyId}/episodes/{episodeId}`
   - `/characters/{characterId}/chats/{chatId}`
   - `/u/{id}/c/{id}`

5. Do not make browser cache clearing part of the fix.

   Cache clearing can risk confusing users and does not solve root cause. The universal bundle should reduce the number of external load points instead.

## Why Bundling Is Needed

The current chat userscript relies on many `@require` entries. This makes the UI vulnerable to partial or failed module availability:

- one delayed or failed module can hide an entire menu group
- browser/userscript-manager cache can differ by Chrome, Firefox, Android, and iPhone
- SPA navigation can amplify timing issues
- reloading can fix the symptom, which points to timing/load fragility

The bundle build reduces the critical external local module count to one script body.

## External Dependencies Strategy

Preferred universal target:

- Bundle all project-owned files into one userscript.
- Keep Dexie as `@require` initially because bundling third-party minified code is not required for the local menu-missing bug.

If Firefox/iPhone still reports dependency failure:

- Create a fully self-contained variant that includes a pinned Dexie payload.
- This should be a second-stage fallback, because it increases file size and review cost.

## Source Module Order

The bundled file must preserve the current `@require` order from `embedding_pre/erie_crack_inject_chat.user.js`.

Project-owned module order:

1. `embedding/vendor/toastify-injection.js`
2. `embedding/vendor/crack-shared-core.js`
3. `embedding/vendor/chasm-shared-core.js`
4. `embedding/vendor/decentralized-modal.js`
5. `embedding/core-ui.js`
6. `embedding/core-kernel.js`
7. `embedding/core-platform.js`
8. `embedding/core-memory.js`
9. `embedding/core-format.js`
10. `embedding/core-search.js`
11. `embedding/core-embedding.js`
12. `embedding/core-pricing.js`
13. `embedding/core-importer.js`
14. `embedding/refiner-prompts.js`
15. `embedding/refiner-dom.js`
16. `embedding/refiner-core.js`
17. `embedding/refiner-queue.js`
18. `embedding/refiner-observer.js`
19. `embedding/refiner.js`
20. `embedding/injecter-1.js`
21. `embedding/injecter-2.js`
22. `embedding/injecter-3.js`
23. `embedding/injecter-4.js`
24. `embedding/injecter-5.js`
25. `embedding/injecter-6.js`
26. `embedding/injecter-6-sub-main.js`
27. `embedding/injecter-6-sub-lore.js`
28. `embedding/injecter-6-sub-merge.js`
29. `embedding/injecter-6-sub-snapshot.js`
30. `embedding/injecter-6-sub-file.js`
31. `embedding/injecter-6-sub-extract.js`
32. `embedding/injecter-6-sub-refiner.js`
33. `embedding/injecter-6-sub-log.js`
34. `embedding/injecter-6-sub-session.js`
35. `embedding/injecter-6-sub-api.js`
36. `embedding/injecter-6-sub-help.js`
37. `embedding/injecter-6-ui.js`

## Output Files

Planned files in this folder:

- `UNIVERSAL_BUNDLE_PLAN.md`
  - this plan and verification contract
- `bundle-manifest.json`
  - explicit module list and metadata
- `build-universal-bundle.ps1`
  - deterministic bundle builder
- `dist/erie_crack_inject_universal.user.js`
  - generated universal userscript
- `VERIFY_UNIVERSAL_BUNDLE.md`
  - manual and automated verification log

The generated userscript should later be copied or published under a branch path only after verification passes.

## Verification Contract

Automated checks:

1. Metadata check

   Verify the bundle contains:

   - same `@match` chat routes
   - same `@grant` permissions
   - same `@connect` permissions
   - no project-owned `@require` lines
   - Dexie `@require` retained unless full self-contained mode is selected

2. Syntax check

   Run:

   ```powershell
   node --check universal_bundle_work\dist\erie_crack_inject_universal.user.js
   ```

3. Module marker check

   Confirm the bundled script contains all expected loaded flags:

   - `__uiLoaded`
   - `__kernelLoaded`
   - `__platformLoaded`
   - `__memoryLoaded`
   - `__formatLoaded`
   - `__searchLoaded`
   - `__embeddingLoaded`
   - `__pricingLoaded`
   - `__importerLoaded`
   - `__interceptorLoaded`
   - `__constLoaded`
   - `__settingsLoaded`
   - `__extractLoaded`
   - `__injectLoaded`
   - `__inject6Loaded`
   - all `__sub*Loaded` menu markers

4. Menu parity check

   Confirm the expected menu keys are registered:

   - `main`
   - `lore`
   - `file`
   - `extract`
   - `merge`
   - `snapshot`
   - `refiner`
   - `log`
   - `session`
   - `api`
   - `help`

Manual checks:

1. Chrome desktop

   - install universal script
   - open chat route directly
   - open main route, then navigate to chat route
   - verify all menus appear
   - verify active lore pack survives reload
   - verify insertion still works
   - verify extraction still works
   - verify response correction still works

2. Firefox desktop

   - install universal script
   - verify no missing menu groups after first load
   - reload several times
   - navigate main to chat
   - verify diagnostics do not appear during normal load

3. Android userscript browser/Tampermonkey-compatible environment

   - install universal script
   - verify chat-only load
   - verify UI button/menu
   - verify no main page crash

4. iPhone Safari userscript environment

   - install universal script if supported
   - verify UI button/menu
   - verify extraction can create pack
   - verify insertion changes outgoing prompt
   - verify refresh/navigation preserves active pack display

## Acceptance Criteria

The universal bundle is acceptable only if:

- all automated checks pass
- no storage key is changed
- menu list matches current script
- install metadata is valid
- Chrome behavior remains unchanged
- Firefox no longer shows partial or missing menus under normal reload
- mobile users do not lose existing lore data

## Known Risks

1. Bundle size

   One large userscript can be slower to install or edit. This is acceptable if runtime load reliability improves.

2. Dexie dependency

   Keeping Dexie as external `@require` still leaves one external dependency. If reports continue, build a full self-contained variant.

3. Page-context restrictions

   Bundling does not solve every iPhone/Safari page-context hook issue. It mainly removes multi-file load fragility.

4. Hidden order assumptions

   The bundle must preserve the current module order exactly. Reordering is not allowed in the first universal build.

