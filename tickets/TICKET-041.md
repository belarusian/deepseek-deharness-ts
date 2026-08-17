# TICKET-041 — AgentOptions.stream? option (additive)

**Module:** `src/agent/types.ts`

## Capability
Add a streaming option to the agent options so the driver can consume
`adapter.stream` instead of `adapter.complete`.

## Change
Add to `AgentOptions`:
    readonly stream?: boolean;
Default `false` = use `adapter.complete` (the existing path). `true` drives each
model step via `adapter.stream` + `assembleAssistant`.

## Constraints
- Additive only — no existing field changes.
- Document the semantics in the interface docstring.
- `runAgent` and `Conversation` signatures are unchanged (they pass `opts`
  through; `stream` is just another option).
