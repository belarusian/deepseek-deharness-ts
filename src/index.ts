/**
 * deepseek-deharness-ts
 *
 * The inversion of deepseek-harness + cordis. Everything is a Program, not a
 * plugin: the agent loop, tools, session log, and llm-adapter are on-disk
 * TypeScript modules with clean APIs that compose directly. No Cordis plugin
 * tree, no DI container, no profiles/bundles/patches — program composition
 * (disk + PATH + clean APIs) instead of meta-composition.
 *
 * Organized by the four algebra: the inner spoke is work + trajectory, the
 * outer spoke is the append-only log.
 */

export const name = "deepseek-deharness-ts";

/**
 * A minimal, dependency-free marker of the program-composition contract.
 * Real modules (agent loop, tools, session, llm-adapter) will be added by
 * later cycles and composed here directly — imported, not registered.
 */
export interface Program {
  readonly name: string;
}

export const program: Program = { name };
