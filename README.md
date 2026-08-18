# deepseek-deharness-ts

The **inversion** of `deepseek-harness` + `cordis`, rebuilt as plain, composable
TypeScript modules.

In the reference, a "session" is a Cordis `Service` reached through a `Context`
(`ctx.sessions.create(...)`, a `SessionStore` that owns publication hooks, a
plugin tree, a DI container, profiles, bundles, and patches). Here the same
durable semantics are **plain ESM modules with clean APIs that compose
directly** — no plugin tree, no DI container, no profiles/bundles/patches.
Everything is a **Program**: the agent loop, the tool registry, the session log,
and the LLM adapter are on-disk modules you import and wire together by hand.

The system is organized by the **four algebra**:

- the **inner spoke** is *work + trajectory* — the agent loop drives model
  steps, dispatches tools, and emits an `AgentEvent` stream;
- the **outer spoke** is the *append-only log* — a durable `SessionLog` that
  folds the trajectory into `SessionEvent`s and persists them to disk.

## Install

```sh
npm install   # install dev dependencies (typescript, vitest, eslint)
npm run build # compile src/ -> dist/
npm link      # put the `deepseek` bin on your PATH
```

`npm link` exposes the `deepseek` command (the on-PATH bin shim in
`dist/program/bin.js`).

## Quick start

A text turn (the default adapter is a scripted fake, so this runs offline):

```sh
deepseek "hello" --session ./session.jsonl
# completed turns=1 steps=1 log=./session.jsonl
```

A tool round-trip (the model calls a built-in tool, the loop dispatches it,
then completes):

```sh
deepseek "add 2 and 3" --session ./session.jsonl
# completed turns=1 steps=2 log=./session.jsonl
```

Print the turn summary as JSON:

```sh
deepseek "hello" --session ./session.jsonl --json
# {"end":"completed","turns":1,"steps":1,"logPath":"./session.jsonl"}
```

List the registered tools and exit (no turn, no log):

```sh
deepseek --list
# echo — Echo back the given arguments as a JSON string.
# add — Add two numbers and return the sum as a string.
# fail — Always fail; used to exercise the pipeline's failure path.
```

Drive model steps via the streaming seam:

```sh
deepseek "hello" --session ./session.jsonl --stream
```

Cap the per-turn step budget:

```sh
deepseek "add 2 and 3" --session ./session.jsonl --max-steps 1
# max_steps turns=1 steps=1 log=./session.jsonl
```

Thread the model name and max-tokens cap to the adapter call:

```sh
deepseek "hello" --session ./session.jsonl --model deepseek-chat --max-tokens 256
```

Resume an existing on-disk log (seed a fresh log from the prior events so the
model sees the earlier turns):

```sh
deepseek "and now subtract 1" --session ./session.jsonl --resume
```

## CLI flags

| Flag | Meaning | Default |
|---|---|---|
| `--session <path>` | path of the durable session log | `.deepseek/session.jsonl` |
| `--id <id>` | session id stamped in the log header | `session` |
| `--resume` | resume the existing log at `--session` | `false` |
| `--stream` | drive model steps via the streaming seam | `false` |
| `--max-steps <n>` | cap the per-turn step budget | `10` |
| `--model <name>` | the model name threaded to the adapter call | *(none)* |
| `--max-tokens <n>` | the max-tokens cap threaded to the adapter call | *(none)* |
| `--temperature <n>` | the sampling temperature threaded to the adapter call | *(none)* |
| `--api-key <key>` | the provider key threaded to the adapter seam | `DEEPSEEK_API_KEY` env |
| `--base-url <url>` | the provider endpoint base threaded to the adapter seam | *(adapter default)* |
| `--system <text>` | an optional system prompt | *(none)* |
| `--json` | print the turn summary as JSON | `false` |
| `--list` | list the registered tools and exit | `false` |
| `--help`, `-h` | show the help block | — |
| `--version`, `-v` | show the version | — |

The first non-flag token is the user text.

A real `DeepSeekLlmAdapter` is selected when an API key is present (`--api-key` or `DEEPSEEK_API_KEY`); the deterministic fake is used otherwise.

## Output formats

**Text** (default): a single line of the form

```
<end> turns=<n> steps=<n> log=<path>
```

e.g. `completed turns=1 steps=2 log=./session.jsonl`.

**`--json`**: a single JSON object with a fixed key order:

```json
{ "end": "completed", "turns": 1, "steps": 2, "logPath": "./session.jsonl" }
```

**Exit codes** are driven by the turn's `end` reason, not by a throw:

| `end` | exit code |
|---|---|
| `completed` | `0` |
| `max_steps` | `0` |
| `error` | `1` |
| `aborted` | `1` |

`--help`/`--version`/`--list` always exit `0` without running a turn.

## Programmatic seam

You do not have to go through the CLI. The public API (re-exported from
`src/index.ts`) exposes three entrypoints at increasing levels of control:

- `launch(opts?)` — the process-level launcher: parse `argv`, print, return an
  exit code. The only place that reads `process.argv`.
- `main(argv, opts?)` — the pure CLI: parse `argv`, compose a `Program`, run one
  turn, return a `ProgramResult`. No printing, no exit code.
- `new Program(opts)` — the on-disk Program: owns one session (adapter, tools,
  durable log), runs turns, persists the log, and can `resume()`. Its identity
  and location are directly readable: `sessionId` and `logPath` are public
  readonly fields, and `log` is a public getter. It is also a true in-memory
  multi-turn driver: consecutive `run()` calls accumulate the transcript in
  place (so turn N+1 sees turn N's messages), `turns` is cumulative and exposed
  as a public getter, and `history()` returns a copy of the accumulated
  transcript.

All three accept an additive **`onEvent`** trajectory sink:

```ts
import { launch, type AgentEvent } from "deepseek-deharness-ts";

const events: AgentEvent[] = [];
await launch({
  argv: ["add 2 and 3", "--session", "./session.jsonl"],
  onEvent: (e) => events.push(e),
});
```

`onEvent` receives the inner-spoke `AgentEvent` stream (`turn_start`,
`step_start`, `assistant`, `tool_call`, `tool_result`, `turn_end`) as the loop
emits it. It is purely additive — the durable log is written independently.

## Architecture

See the docs for the full picture:

- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — the four-algebra composition
  end to end (inner spoke, outer spoke, `Program`, CLI, launcher, bin shim) and
  the durable-event semantics preserved from the reference.
- [`docs/CLI.md`](docs/CLI.md) — the detailed CLI reference: every flag, the
  precedence rule, short-circuits, exit-code semantics, output formats, the
  `onEvent` sink, and worked examples.

## Testing

```sh
npm test        # 192 tests (vitest)
npm run build   # tsc -p tsconfig.json
npm run lint    # eslint src/
```

## License

MIT
