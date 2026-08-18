# CLI reference — `deepseek`

The on-PATH `deepseek` command is the **process-level launcher** (`launch`)
behind the bin shim (`dist/program/bin.js`). It parses `argv`, composes a
`Program`, runs one turn, prints a one-line summary, and returns an exit code.
It is the ONLY place that reads `process.argv`, prints, and returns a code.

## Usage

    deepseek <text> [flags]

The first non-flag token is the user text. Flags may appear in any order.

## Flags

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

## Precedence

Each option resolves as **`argv` flag > `opts` > default**. When the command is
driven programmatically (via `main(argv, opts)` or `launch(opts)`), a value
present in `argv` wins over the same value in `opts`, which wins over the
built-in default. For example, `--session` in `argv` overrides `opts.logPath`,
which overrides `.deepseek/session.jsonl`.

## Adapter selection

The turn is driven by the adapter {@link selectAdapter} picks, in this order:

1. An explicitly injected `adapter` (via `main(argv, { adapter })` or
   `launch({ adapter })`) always wins — this is the deterministic test path.
2. Otherwise, when a key resolves (`--api-key` > `opts.apiKey` > `DEEPSEEK_API_KEY`),
   a real `DeepSeekLlmAdapter` is composed, defaulting the model to
   `deepseek-chat` and the base URL to the adapter's own default when `--base-url`
   is absent.
3. Otherwise the deterministic `FakeLlmAdapter` is used — the no-network default.

Precedence for the key: `--api-key` > `DEEPSEEK_API_KEY`. Precedence for the
endpoint: `--base-url` > adapter default base URL.

## Short-circuits

Three flags are intercepted **before** `main` runs a turn — they print and
return `0` without writing a log:

- `--help` / `-h` — print the help block.
- `--version` / `-v` — print `deepseek-deharness-ts 0.1.0`.
- `--list` — print the registered tools (one line each, `<name> — <description>`)
  and exit.

## Exit codes

The exit code is driven by the turn's `end` reason, **not** by a throw:

| `end` | exit code |
|---|---|
| `completed` | `0` |
| `max_steps` | `0` |
| `error` | `1` |
| `aborted` | `1` |

A step budget (`--max-steps`) is a **clean** end (`max_steps`, exit `0`), not an
error. An adapter failure is `error` (exit `1`); the launcher also writes
`turn ended: <end>` to stderr on a non-zero exit.

## Output

**Text** (default): one line of the form

    <end> turns=<n> steps=<n> log=<path>

e.g. `completed turns=1 steps=2 log=./session.jsonl`.

**`--json`**: one JSON object with a fixed key order (`end`, `turns`, `steps`,
`logPath`):

    { "end": "completed", "turns": 1, "steps": 2, "logPath": "./session.jsonl" }

## The `onEvent` trajectory sink

`launch`/`main`/`Program` accept an optional `onEvent` sink that receives the
**inner-spoke** `AgentEvent` stream as the loop emits it: `turn_start`,
`step_start`, `assistant`, `tool_call`, `tool_result`, `turn_end`. It is purely
additive — the durable (outer-spoke) log is written independently, and the two
spokes agree for the same turn.

    import { launch } from "deepseek-deharness-ts";

    const events = [];
    await launch({
      argv: ["add them", "--session", "./session.jsonl"],
      onEvent: (e) => events.push(e),
    });
    // events: turn_start, step_start, assistant, tool_call, tool_result,
    //         step_start, assistant, turn_end

## Worked examples

**A tool round-trip** (the model calls `add`, then answers):

    deepseek "add them" --session ./session.jsonl
    # completed turns=1 steps=2 log=./session.jsonl

**A streaming turn** (drives the adapter's `stream` seam, not `complete`):

    deepseek "hi" --session ./session.jsonl --stream
    # completed turns=1 steps=1 log=./session.jsonl

**A step-budget turn** (a 2-step round-trip capped at 1 step → `max_steps`):

    deepseek "add them" --session ./session.jsonl --max-steps 1
    # max_steps turns=1 steps=1 log=./session.jsonl

**An error turn** (the adapter fails → `error`, exit 1):

    deepseek "boom" --session ./session.jsonl
    # error turns=1 steps=1 log=./session.jsonl   (exit 1)

**A resume** (a second turn continues the same session, contiguous `seq`):

    deepseek "hi" --session ./session.jsonl --id abc
    # completed turns=1 steps=1 log=./session.jsonl
    deepseek "hi again" --session ./session.jsonl --id abc --resume
    # completed turns=1 steps=1 log=./session.jsonl
