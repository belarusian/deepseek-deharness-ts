# TICKET-020 — schema.ts: validateArgs over the minimal JSON-Schema subset

**Cycle:** 8 (Tools — argument validation)
**File:** `src/tools/schema.ts` (new)

## Capability
`validateArgs(schema: JsonSchema, args: unknown): ValidationResult` where
`ValidationResult = { ok: true } | { ok: false; errors: readonly string[] }`.

Enforce a **minimal, dependency-free JSON-Schema subset**:
- scalar `type`: `string` / `number` / `integer` / `boolean` / `null` / `object` / `array`
- object: `properties` / `required` / `additionalProperties`
- array: `items`
- scalar: `enum` / `const`

## Rules
- `integer` is stricter than `number`: `type:'integer'` accepts only
  `Number.isInteger` values; `type:'number'` accepts any finite number.
  `NaN` / `Infinity` are not valid JSON and must fail `number` / `integer`.
- `additionalProperties` default is open: absent or `true` accepts undeclared
  keys; `false` rejects any key not in `properties`.
- A keyword **misplaced** for the node's `type` (e.g. `properties` on a
  non-object, `items` on a non-array, `enum`/`const` on object/array) is a
  validation error (reject-not-ignore stance, mirroring the seed).
- `errors` are human-readable, **path-qualified** strings, e.g.
  `$.a.b: expected object, got string`.
- An absent/empty schema (no `type`, no keywords) accepts any JSON value.

## Acceptance
- `validateArgs` is exported from `src/tools/schema.ts`.
- A vitest file `src/__tests__/schema.test.ts` covers every rule above.
