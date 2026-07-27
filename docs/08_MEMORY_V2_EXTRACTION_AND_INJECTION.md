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
the input budget permits it.

### Compact

Serializes bound facts deterministically:

```text
[Seoyun] current.hair color=blonde [Ria] current.hair color=brown
```

Conditions and knowledge scope stay attached to the same fact. Compact output
does not shorten text by deleting arbitrary substrings.

### Micro

Keeps one stable entity-state or subject-relation-value handle. It is a
last-resort representation, not the default extraction format.

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

The default path adds no reranker API call. The change improves what is stored
and how selected memories share the character budget. Retrieval ranking can be
reworked separately with dedicated relevance and continuity evaluation because
changing it has a larger behavioral risk.

## Encounter Ordering Fix

First-encounter and reunion checks must read encounter history before the
current turn is recorded. Recording first made both checks observe the current
pair as already seen and could suppress their output.

## Invariants

- Full summaries remain complete.
- Compact output preserves subject-value ownership.
- Current state replacement retains the previous value as history.
- No injected lore line is partially truncated.
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
- final character-budget compliance
- facts-based extraction schemas
- prompt migration boundaries
- fact and open-loop patch merging
- first-encounter and reunion read-before-write ordering
- generated userscript metadata, syntax, required modules, and update URL
