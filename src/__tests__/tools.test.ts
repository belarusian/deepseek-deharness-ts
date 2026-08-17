import { describe, it, expect, vi } from "vitest";
import {
  ToolRegistry,
  DuplicateToolError,
  executeTool,
  toToolDefinition,
  toToolResultBlock,
} from "../index.js";
import type { Tool, ToolResult } from "../index.js";

/** Build a minimal tool whose `execute` is a caller-supplied spy. */
function makeTool(
  name: string,
  execute: Tool["execute"] = vi.fn(async (): Promise<ToolResult> => ({
    content: `ok:${name}`,
  })),
): Tool {
  return {
    name,
    description: `the ${name} tool`,
    parameters: { type: "object", properties: {}, required: [] },
    execute,
  };
}

describe("ToolRegistry", () => {
  it("adds and gets a tool", () => {
    const reg = new ToolRegistry();
    const tool = makeTool("search");
    reg.add(tool);
    expect(reg.get("search")).toBe(tool);
    expect(reg.get("missing")).toBeUndefined();
  });

  it("reports has() for present and absent names", () => {
    const reg = new ToolRegistry();
    reg.add(makeTool("search"));
    expect(reg.has("search")).toBe(true);
    expect(reg.has("missing")).toBe(false);
  });

  it("throws DuplicateToolError on a duplicate name", () => {
    const reg = new ToolRegistry();
    reg.add(makeTool("search"));
    expect(() => reg.add(makeTool("search"))).toThrow(DuplicateToolError);
    expect(() => reg.add(makeTool("search"))).toThrow(/already registered/);
    // The original registration is untouched.
    expect(reg.size).toBe(1);
  });

  it("lists names() in insertion order", () => {
    const reg = new ToolRegistry();
    reg.add(makeTool("b"));
    reg.add(makeTool("a"));
    reg.add(makeTool("c"));
    expect(reg.names()).toEqual(["b", "a", "c"]);
  });

  it("returns all() tools in insertion order", () => {
    const reg = new ToolRegistry();
    const b = makeTool("b");
    const a = makeTool("a");
    reg.add(b);
    reg.add(a);
    expect(reg.all()).toEqual([b, a]);
  });

  it("tracks size", () => {
    const reg = new ToolRegistry();
    expect(reg.size).toBe(0);
    reg.add(makeTool("a"));
    reg.add(makeTool("b"));
    expect(reg.size).toBe(2);
  });
});

describe("executeTool (guarded pipeline)", () => {
  it("happy path: pre -> execute -> post, returns the tool result", async () => {
    const order: string[] = [];
    const tool = makeTool("search", async () => {
      order.push("execute");
      return { content: "ok:search", meta: { hits: 3 } };
    });
    const result = await executeTool(tool, { q: "x" }, {
      pre: async () => {
        order.push("pre");
      },
      guard: async () => {
        order.push("guard");
        return true;
      },
      post: async () => {
        order.push("post");
      },
    });
    expect(result).toEqual({ content: "ok:search", meta: { hits: 3 } });
    expect(order).toEqual(["pre", "guard", "execute", "post"]);
  });

  it("guard returning false short-circuits: execute is NOT called", async () => {
    const execute = vi.fn(async (): Promise<ToolResult> => ({ content: "nope" }));
    const tool = makeTool("search", execute);
    const result = await executeTool(tool, { q: "x" }, {
      guard: async () => false,
    });
    expect(result.isError).toBe(true);
    expect(result.content).toMatch(/blocked by guard/);
    expect(execute).not.toHaveBeenCalled();
  });

  it("a throwing execute is contained into an isError result (never throws)", async () => {
    const tool = makeTool("search", async () => {
      throw new Error("boom");
    });
    const result = await executeTool(tool, { q: "x" });
    expect(result.isError).toBe(true);
    expect(result.content).toMatch(/failed: boom/);
  });

  it("a non-Error thrown value is rendered safely", async () => {
    const tool = makeTool("search", async () => {
      throw "raw-string-failure";
    });
    const result = await executeTool(tool, { q: "x" });
    expect(result.isError).toBe(true);
    expect(result.content).toMatch(/raw-string-failure/);
  });

  it("a caught failure returns before post (post is skipped on failure)", async () => {
    const order: string[] = [];
    const tool = makeTool("search", async () => {
      throw new Error("boom");
    });
    const result = await executeTool(tool, { q: "x" }, {
      post: async () => {
        order.push("post");
      },
    });
    expect(result.isError).toBe(true);
    expect(order).toEqual([]);
  });

  it("a pre-aborted signal returns isError without calling execute", async () => {
    const execute = vi.fn(async (): Promise<ToolResult> => ({ content: "nope" }));
    const tool = makeTool("search", execute);
    const controller = new AbortController();
    controller.abort();
    const result = await executeTool(tool, { q: "x" }, {
      signal: controller.signal,
    });
    expect(result.isError).toBe(true);
    expect(result.content).toMatch(/aborted before execution/);
    expect(execute).not.toHaveBeenCalled();
  });

  it("a non-aborted signal proceeds to execute", async () => {
    const tool = makeTool("search");
    const controller = new AbortController();
    const result = await executeTool(tool, { q: "x" }, {
      signal: controller.signal,
    });
    expect(result.isError).toBeUndefined();
    expect(result.content).toBe("ok:search");
  });

  it("toToolDefinition projects name/description/parameters", () => {
    const tool = makeTool("search");
    expect(toToolDefinition(tool)).toEqual({
      name: "search",
      description: "the search tool",
      parameters: { type: "object", properties: {}, required: [] },
    });
  });

  it("toToolResultBlock projects content and isError (drops meta)", () => {
    const block = toToolResultBlock("call_1", {
      content: "done",
      isError: true,
      meta: { secret: "not-carried" },
    });
    expect(block.type).toBe("tool_result");
    expect(block.toolCallId).toBe("call_1");
    expect(block.content).toBe("done");
    expect(block.isError).toBe(true);
  });
});
