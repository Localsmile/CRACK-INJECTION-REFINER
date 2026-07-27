# Memory V2: Extraction and Injection Design

## Purpose

This change improves continuity memory without adding a default reranking API call.
The extractor records explicit facts, while the injector chooses a lossless or
reduced rendering according to the remaining character budget.

The design must preserve existing lore packs and user-edited prompts. It must
also keep extraction output understandable to both inexpensive models and
frontier models.

## Main Problems

1. Free-form summaries can lose ownership bindings. A list such as "blonde hair,
   brown hair" does not reliably identify which character owns each attribute.
2. Model-generated compact summaries can silently change meaning.
3. Per-entry formatting can consume the budget before later high-value memories
   are considered.
4. Updating a current state can erase the previous state needed for callbacks.
5. Requiring an extra reranker call increases response latency.

## Storage Contract

Newly extracted entries may use `memorySchemaVersion: 2` and a `facts` array.

```json
{
  "subject": "Seoyun",
  "relation": "hair color",
  "value": "blonde",
  "time": "current",
  "polarity": "affirmed",
  "condition": "",
  "knownBy": ["Seoyun"],
  "hiddenFrom": ["Ria"]
}
```

Required fields:

- `subject`: exact owner or source of the fact
- `relation`: attribute, state, action, or directed relation
- `value`: value bound to the subject and relation

Optional semantic fields:

- `time`: `current`, `past`, `future`, or `timeless`
- `polarity`: `affirmed`, `negated`, or `uncertain`
- `condition`: condition under which the fact applies
- `knownBy`: characters who know the fact
- `hiddenFrom`: characters who do not know the fact

`openLoops` stores unresolved goals, promises, questions, threats, and conflicts.
`summary.full` remains a complete readable continuity record. It is not a compact
transport format and is not truncated by the normalizer.

## Extraction Contract

The default extractor requests:

- entry identity and triggers
- one complete `summary.full`
- explicit `facts`
- optional `openLoops`, timeline, call state, entities, and details
- importance, surprise, and emotional relevance scores

The model does not generate `summary.compact`, `summary.micro`, `inject`, or
`embed_text` for Memory V2 entries. Those fields are derived locally so the same
fact bindings survive across providers and model quality levels.

The prompt requires each attribute to remain attached to its owner. It also
requires direction, quantity, negation, uncertainty, conditions, time, and
knowledge scope to be preserved when present.

## State Updates

Facts are merged by subject, relation, value, and time role.

- `set.facts` replaces the current value set for the same subject and relation.
- `append.facts` and imported chunks add independently coexisting values.
- The replaced value is retained once as a past fact.
- Multiple values supplied together in `set.facts` remain current together.
- An incomplete, non-overlapping replacement cannot erase an existing
  multi-value set. The incoming fact is added and the conflict is reported for
  diagnostics.
- Re-observing the same value preserves an existing condition and knowledge
  scope. Newly informed characters are removed from `hiddenFrom`.
- A polarity change retains the prior polarity as a past fact.
- Historical facts with distinct values remain separate.
- Exact duplicate facts are removed.
- Open loops are merged without duplicate text.

The latest complete `summary.full` replaces the prior full summary during an
entity update. Structured facts carry forward state history and unresolved
continuity.

## Rendering Levels

The stored memory and the injected text are separate concerns.

### Full

Uses the complete readable summary. This is the preferred representation when
the input budget permits it. The renderer does not shorten Full text; the
global planner downgrades or removes a candidate when it cannot fit.

### Compact

Serializes bound facts deterministically:

```text
[Seoyun] current.hair color=blonde [Ria] current.hair color=brown
```

Conditions and knowledge scope stay attached to the same fact. Compact output
does not shorten text by deleting arbitrary substrings.

### Micro

Keeps up to two complete semantic units. A unit is an entity state, a
subject-relation-value fact, or an unresolved loop. Subject ownership and
knowledge scope remain attached, and a unit is never cut to meet the budget.
Micro is a last-resort representation, not the default extraction format.

Compact and Micro escape structural delimiters (`\`, `|`, `=`, `[`, and `]`)
inside fact values. This keeps the serialized bindings unambiguous without
requiring a model-specific abbreviation dictionary.

## Global Budget Planning

The planner evaluates every selected lore candidate before producing the final
block.

1. Start all candidates at `full` in automatic mode.
2. If the block exceeds the lore budget, downgrade lower-priority candidates to
   `compact`.
3. If it still exceeds the budget, downgrade lower-priority candidates to
   `micro`.
4. If it still exceeds the budget, drop the lowest-priority candidates.
5. Never truncate a lore line in the middle.

Scene, timeline, encounter, reunion, honorific, and temporal-hint sections use
the same whole-item rule. If a complete auxiliary item cannot fit, it is
omitted instead of leaving a partial sentence or an orphan section header.

The planner records the selected representation for each included entry. This
allows injection logs to explain which memories were rendered as full, compact,
or micro text.

Explicit Full, Compact, and Micro settings start at the selected level. They do
not silently switch to another level; entries are removed only when the chosen
representation cannot fit.

## Compatibility

- Existing entries without facts remain valid and use their existing summaries
  and injection variants.
- Existing lore packs are not bulk-converted.
- Exact previous bundled default prompts and schemas migrate to the Memory V2
  defaults. Normalized signatures are used so legacy prompt bodies do not need
  to ship in the userscript.
- User-edited prompts and schemas are preserved.
- Imported legacy JSON remains accepted.
- New facts fields are additive and ignored by older data readers.

## Retrieval and Reranking Boundary

This release does not replace the existing trigger, embedding, temporal, entity,
or unresolved-context scoring. It also keeps the optional reranker.

The default path adds no reranker API call. The previous three-turn working
memory contributes its scene and active-character names to the existing trigger
scan and embedding query. This reuses the one existing embedding request.

After cooldown, delta, and timeline handling, the generic lore candidates use a
deterministic relevance-and-novelty pass over a small top pool. Relevance keeps
most of the weight; novelty prevents near-duplicate entries for the same entity
or topic from occupying every available slot. This pass makes no API request
and does not alter timeline recall selection.

The selected retrieval score is forwarded to the final budget planner. Static
importance, promises, anchors, and continuity signals still contribute, but a
candidate cannot lose its query relevance merely because formatting begins.
Scene working memory and temporal hints are independent from the first
encounter/reunion switch.

## Derived Fields

`inject.full`, deterministic compact/micro text, and `embed_text` may be
application-derived. Small signatures distinguish the last derived value from
a later user edit.

- A derived Full value follows a changed `summary.full`.
- Derived embedding text follows changed facts, entities, triggers, state, and
  summary text before embeddings are rebuilt.
- An explicit user edit stops automatic replacement of that field.
- Previous Memory V2 entries without signatures are recognized only when their
  stored value exactly matches the earlier derived form.

## Prompt Migration

Only exact signatures of prior bundled defaults are migrated. This includes
general extraction, DeepSeek extraction, important-scene extraction, conversion
prompts, and their default schemas. User-edited text with a different signature
is preserved.

Important-scene patch application supports the same `set.facts`,
`append.facts`, `set.openLoops`, and `append.openLoops` contract as general lore
patches.

## Encounter Ordering Fix

First-encounter and reunion checks must read encounter history before the
current turn is recorded. Recording first made both checks observe the current
pair as already seen and could suppress their output.

## Invariants

- Full summaries remain complete.
- Compact output preserves subject-value ownership.
- Micro output preserves complete fact bindings for up to two units.
- Current state replacement retains the previous value as history.
- Ambiguous partial updates do not erase existing multi-value state.
- Conditions, polarity history, and knowledge scope survive fact refreshes.
- Derived Full and embedding text cannot remain stale after a patch.
- No injected lore line is partially truncated.
- Auxiliary sections are packed as whole lines.
- The final injection stays within the configured character budget.
- Legacy entries remain renderable.
- User-edited extraction prompts are not overwritten.
- Default insertion does not add an extra model call.

## Validation

Regression coverage must verify:

- fact ownership in compact output
- complete full summaries
- current-to-past state transitions
- compact and micro downgrade before candidate removal
- whole-item auxiliary section packing
- final character-budget compliance
- facts-based extraction schemas
- prompt migration boundaries
- fact and open-loop patch merging
- conservative multi-value conflict handling
- fact-scope and polarity-history preservation
- derived Full and embedding-text synchronization
- important-scene fact/open-loop patch application
- working-memory query enrichment and deterministic candidate diversity
- retrieval-score propagation into final budget priority
- first-encounter and reunion read-before-write ordering
- generated userscript metadata, syntax, required modules, and update URL
