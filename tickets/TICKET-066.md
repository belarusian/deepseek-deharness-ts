# TICKET-066 — `ProgramOptions.callOptions` threaded through `Program`

**Module:** `src/program/program.ts`

## Capability
Thread `callOptions` through the on-disk `Program` so a `Program` constructed
with provider options drives the adapter with them.

## Behavior
- Add `readonly callOptions?: CallOptions` to `ProgramOptions` (import the
  `CallOptions` type from `../llm/index.js`).
- Store it as a `readonly #callOptions` field.
- In `#buildOpts()`, pass `callOptions: this.#callOptions` into the returned
  `AgentOptions`.

## Constraints
- Additive only: `callOptions` is optional; a `Program` with no `callOptions`
  drives the adapter with `{ tools }` only (unchanged).
- `Program` is a dumb owner: it only threads the field into `#buildOpts` →
  `AgentOptions.callOptions` → the `runTurn` adapter call. No resolution logic
  lives here.
