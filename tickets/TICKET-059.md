# TICKET-059 — Gate: full suite green (build + test + lint)

**Scope:** the whole repo.

## Capability
The cycle gate: `npm run build` + `npm test` + `npm run lint` all pass.

## Behavior
- `npm run build` — clean (no TS errors).
- `npm test` — all existing 165 tests pass **unchanged** plus the new
  `src/__tests__/launcher.test.ts` cases.
- `npm run lint` — clean.

## Constraints
- Keep the public API stable: `Program`, `main`, `runAgent`, `Conversation`,
  `toSessionEvent`, and all existing modules are unchanged; this cycle only
  *adds* `src/program/launcher.ts` + `src/program/bin.ts`, the `package.json`
  `bin` field, and the re-exports.
- Squash before merging (Rule 5).
