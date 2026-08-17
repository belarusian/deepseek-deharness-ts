# TICKET-052 — Program barrel + top-level re-export + ProgramMarker rename

**Modules:** `src/program/index.ts`, `src/index.ts`

## Capability
Expose the program API and resolve the `Program` name collision.

## Behavior
- `src/program/index.ts` — barrel: re-export `Program`, `main`, and the types
  (`ProgramOptions`, `ProgramResult`, `CliOptions`).
- `src/index.ts` — re-export the program API from `./program/index.js`
  (`Program`, `main`, `ProgramOptions`, `ProgramResult`, `CliOptions`).
- **Name-collision note:** the top-level barrel currently defines an inline
  `export interface Program` (a type-only marker, unused at runtime and not
  referenced by any test). Rename that inline interface to
  `export interface ProgramMarker` (type-only, zero runtime/test impact) so the
  new `Program` **class** can be re-exported under the name `Program`. Keep the
  `program` value and `name` export exactly as-is (the smoke test depends on
  them).

## Constraints
- The smoke test (`src/__tests__/smoke.test.ts`) must pass unchanged: it imports
  `name` and `program` (the value), not the `Program` type.
