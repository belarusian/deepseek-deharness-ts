# TICKET-033 — src/index.ts: re-export the agent public API

**Cycle:** 10 (Agent loop — plain Program)
**File:** `src/index.ts` (edit)

## Capability
Re-export the agent public API from `./agent/index.js` so the whole program is
reachable from the top-level barrel, mirroring the session / llm / deepseek /
tools re-exports already present.

## Exports
`runAgent`, `type AgentOptions`, `type AgentEvent`, `type TurnEndReason`,
`type AgentResult` — from `./agent/index.js`.

## Acceptance
- `src/index.ts` re-exports the agent surface from `./agent/index.js`.
- No name collision: the agent's `AgentEvent` / `AgentResult` / `AgentOptions` /
  `TurnEndReason` are new names (the session/llm `AssistantMessage` collision is
  already handled by not re-exporting the llm one at the top level).
- `npm run build` and `npm run lint` stay clean.
