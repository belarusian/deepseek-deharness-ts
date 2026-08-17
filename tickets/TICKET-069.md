# TICKET-069 — tests: `callOptions` passthrough (Program + CLI)

**Module:** `src/__tests__/program.test.ts`

## Capability
Extend the existing `Program` and `main`/`parseArgv` coverage to assert the
`callOptions` (`model`/`maxTokens`) passthrough end to end.

## Behavior
- `"on-disk Program"` block: a `Program` constructed with
  `callOptions: { model, maxTokens }` drives the adapter with those options
  (assert via the fake's recorded `CallOptions`); a `Program` with no
  `callOptions` drives the adapter with `{ tools }` only (unchanged).
- `"on-PATH program CLI"` block:
  (a) `--model <name>` + `--max-tokens <n>` are parsed and reach the adapter —
  `main(["hi", "--model", "m1", "--max-tokens", "42", "--session", p],
  { adapter: <fake>, tools, stdout? })` → the fake's recorded `CallOptions` has
  `model === "m1"` and `maxTokens === 42`;
  (b) no flags → no `callOptions` — `main(["hi", "--session", p],
  { adapter: <fake>, ... })` → the recorded `CallOptions` is `undefined` (or
  has no `model`/`maxTokens`), proving the default path is unchanged;
  (c) `opts.model`/`opts.maxTokens` (no argv flags) also reach the adapter.
- Keep all existing cases (a-f) unchanged.

## Constraints
- Deterministic and dependency-free: `FakeLlmAdapter` + built-in tools + a temp
  dir + the CLI's default `() => 0` clock. Clean up the temp dir in
  `afterEach`.
- Every module has a vitest test before merge (Rule 4).
