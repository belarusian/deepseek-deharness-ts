# TICKET-032 — agent/index.ts: barrel re-export

**Cycle:** 10 (Agent loop — plain Program)
**File:** `src/agent/index.ts` (new)

## Capability
The public API of the agent module, mirroring `src/llm/index.ts` and
`src/tools/index.ts`: a thin re-export barrel so downstream consumers compose the
agent loop by direct import from one path.

## Exports
From `./types.js`: `type AgentOptions`, `type AgentEvent`, `type TurnEndReason`,
`type AgentResult`.
From `./loop.js`: `runAgent`.

## Acceptance
- `src/agent/index.ts` exists and re-exports exactly the public surface above.
- No new symbols are defined here (types only + the `runAgent` function).
- `import { runAgent } from "../agent/index.js"` type-checks and resolves.
