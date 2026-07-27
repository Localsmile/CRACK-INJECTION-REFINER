# 260727 Reliability Audit

This note records the reliability boundaries introduced after the Memory V2
extraction and injection work. It is an implementation reference, not
user-facing help text.

## Goals

- Preserve RP continuity when the site exposes the same send through adjacent
  WebSocket and fetch paths.
- Never mark a response correction complete before both generation and the
  required handling step succeed.
- Keep automatic extraction coverage continuous when an API request lasts
  beyond the next extraction interval.
- Keep chat-local memory state isolated between RP rooms.
- Make full backup replacement atomic at the IndexedDB boundary.
- Reject stale or incompatible embedding vectors instead of scoring them.

## Injection And Extraction

- Injection work is coalesced by chat path and original message. A successful
  result remains reusable for 1.5 seconds so adjacent transport hooks do not
  increment the turn counter or perform retrieval twice. Failed work is removed
  immediately and can be retried.
- An automatic extraction request that arrives during an existing pass records
  the full configured extraction interval. The queued pass expands its scan by
  that many turns, preventing an unscanned gap.
- An existing automatic-extraction pack remains disabled when the user disabled
  it. Only a newly created extraction pack is enabled automatically.
- Platform logs are normalized from either data fields or CrackUtil role
  methods. Extraction and cleanup therefore do not depend on a single client
  object shape.

## Correction Queue

- A fingerprint enters persistent processed state only after `refineMessage`
  reports a handled result.
- Parse, shape, network, lock, and automatic-apply failures remain retryable.
- Retry cooldown prevents rapid repeated API calls.
- The watchdog reports a long request but does not release its execution lock.
  Provider timeout and retry code owns request termination; unlocking without
  cancellation could overlap two generation calls.
- Plain-text PASS detection is exact and cannot accept a larger word containing
  the configured pass token.

## Storage And Restore

- Database schema v11 scopes encounter pairs by `chatKey`.
- Full replacement clears the transient cleanup queue so tasks from the
  replaced dataset cannot edit unrelated messages later.
- Database restore runs in one Dexie transaction. Settings and localStorage are
  applied only after the database commit.
- Entry IDs are remapped for embeddings and version history. History with no
  valid mapped entry is skipped.
- Snapshot pack references follow the selected merge/rename plan.
- Packs that were kept unchanged during conflict resolution are not scheduled
  for pack-wide embedding regeneration.
- A table read failure aborts backup export instead of silently exporting an
  empty table.

## Embedding Compatibility

- Gemini REST requests use `outputDimensionality`.
- Search ignores vectors whose model, dimension, document task, pack, or source
  hash does not match the current query space.
- Cosine similarity returns zero for empty, invalid, or dimension-mismatched
  vectors.
- Existing embeddings are not rewritten at startup. They are reused only when
  compatible and regenerated through the normal search-preparation workflow.

## Verification Boundary

`tests/run-regressions.js` covers syntax, prompt contracts, helper runtime
behavior, menu registration, and source-level invariants for the browser-only
paths. The universal build verifier checks manifest order and bundled metadata.
Real site transport, IndexedDB upgrade behavior, and message editing still
require an installed-browser smoke test whenever the userscript version changes.
