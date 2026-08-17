# TICKET-016 — Tool registry (src/tools/registry.ts)

**Phase:** Tools (cycle 7)
**Target file:** `src/tools/registry.ts`

## Capability
`ToolRegistry` — a plain class over a `Map<string, Tool>`. No registration
side effects, no observers, no event bus, no global registry.

## Required API (exact)
- `add(tool: Tool): void` — insert; **throws on duplicate name** (a dedicated
  error class, e.g. `DuplicateToolError`, is fine).
- `get(name: string): Tool | undefined`
- `has(name: string): boolean`
- `names(): readonly string[]` — insertion order.
- `all(): readonly Tool[]` — insertion order.
- `size: number` (getter).

## Notes
- `names()` and `all()` return **readonly** arrays (defensive copies), not
  mutable references to internal state.
- No import-time registration; the caller constructs the registry and adds
  tools explicitly.
