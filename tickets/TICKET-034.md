# TICKET-034 — src/__tests__/agent.test.ts: vitest coverage

**Cycle:** 10 (Agent loop — plain Program)
**File:** `src/__tests__/agent.test.ts` (new)

## Capability
Deterministic, dependency-free vitest coverage of `runAgent` using
`FakeLlmAdapter` (scripted queue) + the built-in `addTool`. No network, no
filesystem, no `Date.now()`.

## Cases
- (a) **text-only turn** — fake adapter returns a text `AssistantMessage` (no tool
  calls): `end === "completed"`, `steps === 1`, transcript `[user, assistant]`.
- (b) **tool round-trip** — fake adapter first returns a `tool_call` for `addTool`
  (`{a:2,b:3}`), then a text reply: the driver runs `addTool` through the pipeline,
  appends the `tool_result` (content `"5"`), and ends `"completed"` with transcript
  `[user, assistant, tool, assistant]`.
- (c) **maxSteps** — fake adapter always returns a `tool_call`; with `maxSteps: 3`
  the driver stops at `end === "max_steps"`, `steps === 3`.
- (d) **unknown tool** — a `tool_call` for a name not in the registry is contained
  (no crash) and yields an `isError` `tool_result`; the turn still ends `"completed"`
  after a following text reply.
- (e) **abort** — a pre-aborted `AbortSignal` yields `end === "aborted"`.
- (f) **trajectory** — `onEvent` is called once per boundary in order
  (`turn_start`, `step_start`, `assistant`, …, `turn_end`).

## Acceptance
- All cases pass with `FakeLlmAdapter` alone (deterministic, dependency-free).
- `npm test` green; `npm run lint` clean.
