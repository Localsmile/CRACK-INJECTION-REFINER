# Send ACK race: investigation and regression contract

## Scope and evidence

- Release source: `260706-hotfix`, starting at `82e7c38` (Universal `.31`).
- Browser: signed-in Chrome, installed memory-v2 `1.4.0.260727.15`.
- The released interceptor awaits injection inside `WebSocket.send`, which returns
  to Socket.IO before the physical frame is sent. The trial interceptor has the
  same transport shape; its search deadline does not bound every preparation path.
- The inspected Crack build `main-arm64-8147dc4` starts its 30,000 ms
  `emitWithAck` timer before the physical WebSocket send. On failure, the composer
  restores its input and the optimistic user message is removed. Later server
  events can nevertheless generate and store a response.
- A controlled 32-second preparation delay reproduced that sequence in a real
  RP conversation: input returned and a retry toast appeared at 30 seconds;
  the send frame went out around 33 seconds; the server accepted it and generated
  a response. Reloading after completion recovered the saved conversation.
- The reproduced toast was `잠시 후 다시 시도해 주세요.`. The reporter's exact
  environment and error response were not available, so this demonstrates a
  confirmed cause of the symptom, not proof that every report has this cause.

## Implementation contract

1. On supported Crack composers, prepare lore before replaying the original
   click/Enter action. Leave the original input untouched while preparing.
2. Serialize the observed Tiptap document format (paragraphs, hard breaks, and
   shortcut mentions) exactly as Crack does. Unknown node types use the guarded
   transport path instead guessing a serializer.
3. Consume the prepared result once at the transport boundary. Preserve
   Socket.IO namespace and ACK ID; do not call the injection/API pipeline again.
4. Editing the draft, leaving the page/chat, or removing the composer cancels
   preparation. Stage turn, cooldown, mention, encounter, working-memory,
   injection-log and cleanup writes until an actual send attempt.
5. Normal composer preparation does not discard lore because an arbitrary
   latency limit elapsed. Existing retrieval, prompts, reranking and the
   2,000-character budget are unchanged.
6. Unrecognized/programmatic transport paths must not send a frame after the
   site's ACK deadline. Their local preparation window is bounded at 25 seconds;
   an expired prepared Socket.IO queue item is also discarded, not re-prepared.
7. Never replay an HTTP request or native WebSocket send merely because the
   transport threw. A failure can occur after the server already received it.
8. Restrict HTTP injection to Wrtn hosts. A provider's `/chat/completions` or
   `/messages` endpoint is not a Crack chat. Select only one message field from
   each HTTP body, including when injection leaves its content unchanged.

## Live verification

Changed modules were temporarily evaluated on the already installed trial
runtime; the userscript manager was not modified. This verifies the changed send
path with real server traffic, not a clean installation of the entire release
bundle. Temporary instrumentation and settings are removed/restored afterward.

| Case | Preparation | Wire-to-ACK | Result |
| --- | ---: | ---: | --- |
| Unmodified trial, ordinary RP | 1,241 ms | 103 ms | One send, 789 characters with lore |
| Unmodified trial, injected slow dependency | ~33 s | 61 ms | Input restored at 30 s, then late response |
| Patched, slow dependency plus repeated click | 33,213 ms | 79 ms | One send, no error; cooldown correctly selected no lore |
| Patched, slow dependency with lore | 33,015 ms | 87 ms | One send, 977 characters, one 699 ms query embedding |
| Patched, desktop Enter | 1,041 ms | 71 ms | One send, 840 characters with lore, one query embedding |
| Patched, 390 x 844 mobile layout | 1,024 ms | 85 ms | One send, 848 characters with lore, one query embedding |
| Draft edited while preparation was pending | Cancelled | No send | Input retained, no turn increment, no embedding request |
| Mobile Enter | No preparation | No send | Newline preserved, no embedding request |

The lore-included tests temporarily disabled cooldown to select existing real
memories, then restored the original enabled setting. Normal server responses
were visibly rendered without reload. Mobile verification is Chrome viewport
emulation, not a physical iPhone or Safari run. Chrome automation's 0.85 click
coordinate scale was measured and corrected before the successful mobile click.

## Automated coverage

`node tests/run-regressions.js` includes `tests/send-regressions.js`:

- Prepared send is synchronous at the WebSocket boundary; one injection and
  one commit; ACK identity and lore content preserved.
- Heartbeats and already-injected messages pass through.
- Native send errors and HTTP response failures never send a second request.
- Expiry, navigation, closed sockets and cancellation prevent late sends.
- A stale prepared queue item does not start another API call.
- Provider requests are excluded, and redundant HTTP body fields are processed
  once even when the text is unchanged.
- Paragraph/line-break/shortcut serialization and unknown-format rejection.
- Real injection-function bookkeeping is staged until commit, including the
  automatic-extraction trigger and cleanup journal.

## Release and remaining boundary

Release branch: `260827-hotfix` (separate from the deployed `260706-hotfix`).
Universal version: `1.4.0.260827-universal.1`.
Modular chat and router version: `1.4.0.260827.1`.
Both loaders include `injecter-composer.js`; readiness requires its loaded flag.

The bundle formatter permits ES2015 shorthand already used in the sources.
Identifier mangling and unsafe compression remain disabled. This keeps the new
module within the existing 840,000-byte distribution check without changing
prompts, stored data, or retrieval settings.

Release checks passed: source regressions, bundle metadata/readiness/size/syntax
verification (833,905 bytes), and send regressions rerun against the transport,
composer, and injection function bodies parsed from the generated bundle. The
last check exercises the minified code in the VM harness, not a browser install.

The composer selector and send-arrow identity are an explicit platform adapter.
Recheck them when Crack changes its input UI. Unknown UI/transport paths retain
the bounded fallback, not the unbounded late-send behavior. Server-side errors,
other userscripts, native mobile browsers and a clean release installation need
separate evidence; this change does not manufacture successful server ACKs or
suppress genuine server failures. Release and update URLs point to `260827-hotfix`;
the previous release branch is not changed.
