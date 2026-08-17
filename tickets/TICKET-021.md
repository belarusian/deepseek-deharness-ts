# TICKET-021 — pipeline.ts: insert the validate stage

**Cycle:** 8 (Tools — argument validation)
**File:** `src/tools/pipeline.ts`

## Capability
Extend `PipelineOptions` with `validate?: boolean` (default `true`). New order:

    pre -> guard -> validate -> execute -> post -> result

- When `validate` is enabled (default) and `validateArgs(tool.parameters, args)`
  returns `ok:false`, short-circuit to an `isError` result whose `content`
  renders the error list (stable, deterministic) **WITHOUT calling
  `tool.execute`** and **WITHOUT calling `post`**.
- When `validate` is `false`, skip the stage entirely (execute runs regardless
  of schema).
- Validation runs **AFTER `guard`** (a `false` guard still wins first) and
  **BEFORE `execute`**.

## Rules
- Keep `guard` and `validate` distinct: `guard` is a caller-supplied veto;
  `validate` is schema conformance.
- Do not change the existing guard / signal / execute / post semantics.

## Acceptance
- `PipelineOptions.validate` exists, defaults to `true`.
- `executeTool` short-circuits on schema failure before execute and post.
