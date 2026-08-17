# TICKET-054 — Gate: full suite green (build + test + lint)

**Scope:** the whole repo.

## Capability
The cycle gate: `npm run build` + `npm test` + `npm run lint` all pass.

## Behavior
- `npm run build` — clean (no TS errors).
- `npm test` — all existing 159 tests pass **unchanged** plus the new
  `src/__tests__/program.test.ts` cases.
- `npm run lint` — clean.

## Constraints
- Keep the public API stable: `runAgent`, `Conversation`, `toSessionEvent`, and
  all existing modules are unchanged; this cycle only *adds* the `src/program/`
  module (and the type-only `Program` → `ProgramMarker` rename in the top-level
  barrel).
- Squash before merging (Rule 5).
