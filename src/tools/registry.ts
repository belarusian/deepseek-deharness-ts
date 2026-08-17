/**
 * The **tool registry**: a plain class over a `Map<string, Tool>`.
 *
 * No DI, no registration side effects, no Cordis event seams, no global
 * registry. Adding a tool is an explicit, synchronous, in-memory mutation the
 * caller performs; there is no import-time registration and no observer
 * notified on change. `add` throws on a duplicate name so a silent overwrite
 * is impossible.
 */

import type { Tool } from "./types.js";

/** Thrown when {@link ToolRegistry.add} is called with an existing name. */
export class DuplicateToolError extends Error {
  constructor(name: string) {
    super(`tool "${name}" is already registered`);
    this.name = "DuplicateToolError";
  }
}

/** A plain, in-memory, name-keyed collection of tools. */
export class ToolRegistry {
  private readonly tools = new Map<string, Tool>();

  /**
   * Register a tool.
   * @throws {DuplicateToolError} if a tool with the same name already exists.
   */
  add(tool: Tool): void {
    if (this.tools.has(tool.name)) {
      throw new DuplicateToolError(tool.name);
    }
    this.tools.set(tool.name, tool);
  }

  /** Look up a tool by name, or `undefined` if absent. */
  get(name: string): Tool | undefined {
    return this.tools.get(name);
  }

  /** Whether a tool with this name is registered. */
  has(name: string): boolean {
    return this.tools.has(name);
  }

  /** The registered tool names, in insertion order (defensive copy). */
  names(): readonly string[] {
    return [...this.tools.keys()];
  }

  /** All registered tools, in insertion order (defensive copy). */
  all(): readonly Tool[] {
    return [...this.tools.values()];
  }

  /** The number of registered tools. */
  get size(): number {
    return this.tools.size;
  }
}
