# TICKET-061 — `formatToolList`: a pure, deterministic tool listing

**Module:** `src/program/launcher.ts`

## Capability
A **pure, deterministic** multi-line listing of the registered tools, for the
`--list` flag.

## Behavior
- `export function formatToolList(tools: ToolRegistry): string` returns one
  line per registered tool, in `tools.names()` **insertion order**:
  `<name> — <description>` (a stable separator, e.g. ` — `), joined by `\n`.
- Uses each tool's `name` + `description` (the `Tool` shape).
- Pure: no I/O, no side effects; identical for an identical registry.

## Constraints
- Reads only `tools.names()` / `tools.get(name)` (or `tools.all()`); does not
  mutate the registry.
- No new npm deps.
