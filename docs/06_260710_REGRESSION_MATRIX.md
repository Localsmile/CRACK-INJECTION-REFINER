# 260710 Regression Matrix

## Release Gate

Every required row must pass before `260706-hotfix` is pushed. A static check is not evidence of browser behavior; browser-only rows must be recorded separately.

| Area | Scenario | Expected Result | Method |
| --- | --- | --- | --- |
| Upgrade | Load settings written by 260629/260706 | Existing keys, custom templates, active packs, and cleanup queue remain available | Source compatibility test and browser smoke |
| Prompt migration | Default template is old | Default prompt/schema refreshes | VM/settings test |
| Prompt migration | Custom template differs from known defaults | Custom prompt and schema remain byte-for-byte unchanged | VM/settings test |
| Extraction | General call succeeds; required temporal call fails | No lore, snapshot, embedding, or activation change is committed | Transaction marker test plus mocked runtime test |
| Extraction | All required calls succeed | General and temporal results commit, then embedding runs | Mocked runtime test |
| Batch extraction | Any batch remains failed after recovery | Entire pack restores to its pre-run state | Existing rollback contract and static marker test |
| JSON recovery | Provider returns invalid/truncated JSON | At most one explicit repair request is made; failure remains a failed operation | Source invariant test |
| Generation dedupe | Two concurrent identical calls | One provider task runs; both callers receive the same result | Pure helper/runtime test |
| Generation distinction | Same prompt with different provider/model/options | Requests are not coalesced | Pure helper test |
| Native fetch | Request exceeds timeout | Abort occurs and error is classified as retryable timeout | Mocked fetch test |
| OpenAI compatibility | JSON, token, and reasoning features are rejected | No more than six unique capability variants are attempted | Pure helper test |
| OpenAI compatibility | A variant succeeds | Winning variant is tried first on the next call | Runtime helper test |
| DeepSeek | JSON extraction | Object envelope and `response_format` remain enabled | Source invariant test |
| Gemini | Thinking settings | Level and budget are never sent together | Existing builder regression test |
| Reinjection | Recent messages fill roughly 10K estimated tokens | Effective remembered-turn count adapts to message length | Pure helper test |
| Reinjection | No message history | Existing `aiMemoryTurns` value is used | Pure helper test |
| Retrieval | Context budget increases | Literal scan range does not expand automatically | Source invariant test |
| Prompt schema | Weak-model minimal object | Required fields normalize without optional nested modules | Parser fixture test |
| Prompt schema | Major scene in main pass | `timeline_event` remains accepted by the merge path | Parser/schema test |
| Menu | Desktop | Eight task-level destinations, with nested lore/connection/activity screens | Menu capture test and browser smoke |
| Menu | Mobile | Nested destinations remain reachable and text does not overflow | Browser smoke at mobile viewport |
| Status | Extraction/rerank/refiner | Intentional branded badge remains visible and phase changes are understandable | Browser smoke |
| Cleanup | Pending cleanup survives reload | IndexedDB cleanup queue is replayed after reload | Existing browser workflow smoke |
| Backup restore | Old server payload contains embeddings | Restore accepts it; existing vectors remain usable or can be rebuilt | Compatibility source test |
| Backup restore | New slim server payload has no embeddings | Only restored active packs are embedded after restore | Existing backup regression test |
| Distribution | Build manifest | All modules occur exactly once in declared order | Bundle verifier |
| Distribution | Userscript output | Version, metadata, grants, matches, and ready gate are correct | Bundle verifier |

## Browser Smoke Procedure

1. Open an existing Crack story chat with the currently installed baseline.
2. Confirm the `Lore` entry control is visible and opens the modal.
3. Record the current top-level and nested menu labels.
4. Open Home, Lore, Extraction, Backup, API, Prompt, Response Review, Logs, Session, and Help screens.
5. Verify no control overlaps at desktop width.
6. Repeat menu navigation at an iPhone-sized viewport.
7. After the user installs the rebuilt script, send several harmless RP turns and verify injection, cleanup queue completion, extraction, and response review against real messages.

The final step is intentionally installation-dependent. Code and bundle work can be completed beforehand, but the new userscript must not be described as browser-verified until that build is actually installed.
