# TICKET-023 — vitest coverage: schema.test.ts + pipeline validation cases

**Cycle:** 8 (Tools — argument validation)
**Files:** `src/__tests__/schema.test.ts` (new), `src/__tests__/tools.test.ts` (extend)

## Capability
(a) `validateArgs` — each scalar type, `integer` vs `number`, object
`properties`/`required`/`additionalProperties:false`, nested objects, array
`items`, scalar `enum`/`const`, misplaced keyword → error, empty schema accepts
anything, error strings are path-qualified.

(b) pipeline — valid args pass through to execute; invalid args short-circuit to
`isError` WITHOUT calling execute (and without post); `validate:false` skips
validation (execute runs even on invalid args); guard-false still precedes
validation.

## Acceptance
- Every module touched has a vitest test before merge (Rule 4).
