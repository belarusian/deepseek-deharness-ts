# TICKET-103: Program has no public `turns` getter (observable-surface parity gap with Conversation)

**Cycle:** 27
**Module:** `src/program/program.ts`
**Type:** additive (single getter, no behavior change)

## Problem
`Program` tracks a private `#turnCount` (cumulative across `run()` calls) but
exposes it only **indirectly**, via `result.turns` on the `ProgramResult`
returned by the most recent `run()`. The inner-spoke `Conversation`
(`src/agent/conversation.ts` line 54) exposes the count directly through a
public `get turns(): number` getter, so a caller can ask "how many turns has
this conversation completed?" at any time without holding onto the last result.
`Program` has no such accessor: `#turnCount` is private and there is no `turns`
getter.

## Fix
Add, next to the existing `get log()` accessor:

```ts
/** The number of turns completed (cumulative across `run()` calls). */
get turns(): number {
  return this.#turnCount;
}
```

That is the entire code change. Do not change `#turnCount`'s initialization, the
`run`/`resume`/`history` logic, the `log` getter, the `ProgramOptions`/
`ProgramResult` shapes, or the `writeLog`-on-every-`run` behavior.

## Why it's safe
A getter is a pure read of existing private state. It cannot alter any
`run`/`resume`/`history` behavior, so all 229 existing tests pass unchanged.
The getter's value is already exercised indirectly by the cycle-26 tests
(which assert `result.turns`); this just makes it directly observable.
