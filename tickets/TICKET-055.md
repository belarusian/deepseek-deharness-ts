# TICKET-055 — The process-level launcher (the inversion of the seed's dsh launcher)

**Module:** `src/program/launcher.ts`

## Capability
The **process-level launcher** — the inversion of the seed's Cordis `dsh`
launcher: no plugin tree, no DI, no profiles/bundles/patches, no `commander`,
no `ctx` — just a plain ESM module that composes the spokes by direct import,
prints one line, and returns a code. It wraps the pure `main` (cycle 14); it is
the ONLY place that reads `process.argv`, prints, and returns an exit code.

## Signatures
```ts
export interface LauncherOptions {
  readonly argv?: readonly string[];
  readonly adapter?: LlmAdapter;
  readonly tools?: ToolRegistry;
  readonly stdout?: { readonly write(chunk: string): unknown };
  readonly stderr?: { readonly write(chunk: string): unknown };
}

export function helpText(): string;
export function versionText(): string;
export function formatResult(result: ProgramResult): string;
export async function launch(opts?: LauncherOptions): Promise<number>;
```

## Behavior
- `helpText()` — a short, stable `--help` block: a usage line + the flag list
  (`--session <path>`, `--id <id>`, `--resume`, `--stream`, `--max-steps <n>`,
  `--system <text>`, `--help`, `--version`).
- `versionText()` — a stable `--version` line (e.g. `deepseek-deharness-ts 0.1.0`).
- `formatResult(result)` — a **pure, deterministic** one-line summary of a
  settled turn: the `end` reason, `turns`, `steps`, and `logPath` (e.g.
  `completed turns=1 steps=1 log=<logPath>`).
- `launch(opts?)` — the process entrypoint:
  1. `argv = opts?.argv ?? process.argv.slice(2)`;
  2. if `argv` contains `--help` or `-h` → write `helpText()` to `stdout`
     (default `process.stdout`) and **return 0** (no turn, no log);
  3. if `argv` contains `--version` or `-v` → write `versionText()` to `stdout`
     and **return 0**;
  4. otherwise `const result = await main(argv, { adapter: opts?.adapter,
     tools: opts?.tools })`, write `formatResult(result)` to `stdout`, and
     **return the exit code**: `0` when `result.result.end` is `"completed"` or
     `"max_steps"`, `1` when it is `"error"` or `"aborted"`.
- **No `process.exit`** — `launch` *returns* the code; the `bin` shim assigns it
  to `process.exitCode`.
- Use the injectable `stdout`/`stderr` (default `process.stdout`/`process.stderr`)
  for all output so tests never touch the real process streams.

## Constraints
- The launcher wraps the pure `main`; it does not re-parse or re-compose.
- `--help` / `--version` are intercepted BEFORE `main`.
- The exit code is driven by `result.end`, not by a throw (no `try/catch` needed).
- Deterministic and dependency-free (no `commander`).
