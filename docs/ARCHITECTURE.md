# Architecture — outer spoke: the append-only session log

This repo is the **inversion** of `deepseek-harness` + `cordis`. In the
reference, the session log is a Cordis `Service` reached through a `Context`
(`ctx.sessions.create(...)`, `session/event` / `session/flush` events, a
`SessionStore` that owns publication hooks). Here the same durable semantics
are **plain TypeScript modules with clean APIs that compose directly** — no
Cordis plugin tree, no DI container, no profiles/bundles/patches.

## The four algebra, and where this cycle lands

The system is organized by the four algebra. The **inner spoke** is work +
trajectory (agent loop, tools). The **outer spoke** is the append-only log.
This cycle (Cycle 2 synthesis) builds the outer spoke as four plain modules:

1. **`SessionEvent` vocabulary** — a discriminated union of durable facts
   (user message, assistant message, tool call, tool result, turn/step
   markers) with stable `seq` ids and `time` timestamps.
2. **`SessionLog`** — an append-only log over an in-memory store:
   `append` / `readAll` / `since` / `last`.
3. **JSONL persistence seam** — serialize/deserialize the log to disk.
4. **Public re-export surface** — `src/index.ts` re-exports the above.

## The DI inversion (the load-bearing contract)

| Reference (Cordis) | This repo (plain module) |
|---|---|
| `ctx.sessions.create(id, { seed, meta })` | `new SessionLog(id, { seed, header })` |
| `session.append(type, data, surfaceIntent)` | `log.append(type, data, surfaceIntent)` |
| `session.events` (frozen snapshot) | `log.readAll()` |
| `session.seq` (= log.length) | `log.seq` / `log.last()` |
| `session/event` firehose (DI dispatch) | **none** — no observer bus; the log is the source of truth |
| `session/flush` (DI parallel checkpoint) | **none** — persistence is an explicit `serialize`/`scanLog` call |
| `SessionStore extends Service` | **none** — no store; one log per session, composed by the caller |

The inversion is deliberate: the durable **semantics** (event vocabulary,
`seq = log.length` contiguity, lossless-JSON validation, header line, torn-tail
recovery) are preserved verbatim; only the **wiring** (DI, event bus, store
service) is removed. A consumer composes by importing modules, not by
registering plugins.

## Durable-event semantics (preserved from the reference)

- **Proper discriminated union.** `SessionEvent<T>` is a mapped type over
  `SessionEventType`, so `switch (event.type)` narrows `event.data` without
  casts. (Reference: `types.ts:404`.)
- **Stable ids + timestamps.** Every event carries `seq` (monotonic,
  `seq = log.length` — the contiguity contract the whole system relies on) and
  `time` (Unix epoch ms). (Reference: `index.ts:604` `append`.)
- **Lossless-JSON boundary.** Every event `data` must round-trip through JSON
  byte-identically. `append` validates and **detaches** (snapshots) the data so
  reading `event.data` back sees the logged value, never the caller's
  still-mutable input. (Reference: `json.ts:177` `snapshotJsonValue`.)
- **Conditional surface metadata.** `surfaceOp` / `sourceEventSeqs` exist only
  on surface-eligible event types; the compiler enforces this at `append` call
  sites. (Reference: `types.ts:404`.)
- **`ignorable` guard.** Absent means *required*: a reader meeting an
  unrecognized type without the marker MUST refuse to reconstruct rather than
  silently drop the event. (Reference: `types.ts:404`.)

## JSONL persistence semantics (preserved from the reference)

- **Header line first.** The first JSONL record is the immutable
  `SessionHeader` tagged `type: 'session'`, so a reader distinguishes it from
  an event line. (Reference: `session-persistence-jsonl/format.ts`
  `toHeaderLine` / `isHeaderLine`.)
- **One event per line.** Each subsequent line is one `SessionEvent` verbatim
  (or a packed chunk row in the reference; this cycle stores events verbatim —
  see TICKET-005).
- **Torn-tail recovery.** A final record without a trailing newline is a torn
  write and is ignored; the contiguous committed prefix is preserved.
  (Reference: `format.ts` `SessionLogScanner` / `scanLog`.)
- **Version gate.** The header stamps `SESSION_FORMAT_VERSION`; a backend
  rejects any other version on load (no migration while unreleased).
  (Reference: `types.ts:56`.)

## Module layout (target)

## The full composition (cycles 14-20)

The outer-spoke content above (the append-only session log) is one half of the
system. Cycles 14-20 completed the picture: the **inner spoke** (work +
trajectory), the **`Program`** that composes both spokes, and the **on-PATH
entrypoint** (pure CLI + process-level launcher + bin shim). This section
describes the four-algebra composition end to end.

### The inner spoke: work + trajectory

The inner spoke is the agent loop (`src/agent/*`):

- **`runTurn`** — the shared step/turn core. It drives model steps against the
  `LlmAdapter`, dispatches tool calls against the `ToolRegistry`, and enforces
  the step budget / abort / completed / error ends. It is the exact core both
  `runAgent` and the on-disk `Program` use (the loop is not forked).
- **`runAgent`** — a stateless driver over `runTurn` for a single turn.
- **`Conversation`** — the multi-turn driver that keeps the transcript across
  turns.
- **`AgentEvent`** — the trajectory vocabulary: `turn_start`, `step_start`,
  `assistant`, `tool_call`, `tool_result`, `turn_end`. Each carries the turn and
  (where applicable) step it belongs to.

### The outer spoke: the append-only log

The outer spoke is the durable session log (`src/session/*`), documented above:
the `SessionEvent` vocabulary, the append-only `SessionLog`, and the JSONL
persistence seam. The inner spoke folds its trajectory into the outer spoke via
**`toSessionEvent`**: each emitted `AgentEvent` is mapped to a `SessionEvent`
and appended to the log, so the durable record is the folded trajectory.

### The `Program`: composing both spokes

The **`Program`** (`src/program/program.ts`) is the four-algebra composition.
It owns one session — an `LlmAdapter`, a `ToolRegistry`, and a durable
`SessionLog` — and composes the two spokes:

- it **builds the `AgentOptions`** (adapter, tools, the durable `log`, the
  optional `onEvent` sink, `callOptions`, `maxSteps`, `stream`);
- it **runs a turn** by delegating to the shared `runTurn` core (the loop is
  not forked);
- it **owns the durable log**: it persists the log to disk after every turn
  (`writeLog`) and can **resume** an existing on-disk log (seed, not replay).

### The pure CLI: `main`

**`main`** (`src/program/cli.ts`) is a thin, testable CLI — a plain module, not
a process. It parses `argv` (the first non-flag token is the user text; the
flags set the options), resolves each option as `argv` flag > `opts` > default,
composes a `Program`, optionally `resume()`s it, runs one turn, and returns the
`ProgramResult`. No `process.exit`, no `console.log`.

### The launcher: `launch`

**`launch`** (`src/program/launcher.ts`) is the **process-level launcher** —
the ONLY place that reads `process.argv`, prints, and returns an exit code. It
wraps the pure `main`: it intercepts the short-circuits (`--help`/`-h`,
`--version`/`-v`, `--list`) before `main`, otherwise runs `main`, prints the
`formatResult` (or `formatResultJson`) summary, and returns the exit code
(`0` for `completed`/`max_steps`, `1` for `error`/`aborted`). It never calls
`process.exit` — it *returns* the code.

### The bin shim

**`bin.ts`** is the file `package.json` `bin` points to. It is the ONLY place
`process.exitCode` is set: `process.exitCode = await launch()`. No logic, no
output of its own.

### The additive `onEvent` seam

The inner-spoke `AgentEvent` trajectory is observable through the on-PATH
program via an **additive** `onEvent` sink, threaded `AgentOptions` →
`ProgramOptions` → `CliOptions` → `LauncherOptions`. It is purely optional:
when absent, the path is byte-for-byte unchanged.

### The two-spokes-one-turn invariant

For one turn, the two spokes agree: the `onEvent` sink sees the inner-spoke
`AgentEvent`s (work + trajectory); the durable log sees the outer-spoke folded
`SessionEvent`s. The E2E tests assert **both** for the same turn — the strongest,
most deterministic way to pin the trajectory and to prove the `toSessionEvent`
fold and the raw stream stay in lockstep.
