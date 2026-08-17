import { describe, it, expect, vi } from "vitest";
import {
  defineTool,
  echoTool,
  addTool,
  failTool,
  ToolRegistry,
  executeTool,
  toToolResultBlock,
} from "../index.js";
import type { Tool, ToolResult } from "../index.js";

/** A tool is well-formed when it carries the four members and a callable execute. */
function expectWellFormed(tool: Tool, name: string): void {
  expect(tool.name).toBe(name);
  expect(typeof tool.description).toBe("string");
  expect(tool.description.length).toBeGreaterThan(0);
  expect(tool.parameters).toBeDefined();
  expect(typeof tool.execute).toBe("function");
}

describe("defineTool (TICKET-025)", () => {
  it("returns a well-formed Tool (name/description/parameters present, execute callable)", () => {
    const execute = vi.fn(async (): Promise<ToolResult> => ({ content: "ok" }));
    const tool = defineTool({
      name: "demo",
      description: "a demo tool",
      parameters: { type: "object" },
      execute,
    });
    expectWellFormed(tool, "demo");
    expect(tool.execute).toBe(execute);
    expect(tool.parameters).toEqual({ type: "object" });
  });

  it("is a factory, not a registry: it does not register or mutate any global", () => {
    const tool = defineTool({
      name: "isolated",
      description: "d",
      parameters: { type: "object" },
      execute: async () => ({ content: "x" }),
    });
    // A fresh registry is empty: defineTool did not register the tool anywhere.
    const reg = new ToolRegistry();
    expect(reg.has("isolated")).toBe(false);
    expect(reg.size).toBe(0);
    // Calling defineTool again yields a fresh, independent object.
    const again = defineTool({
      name: "isolated",
      description: "d",
      parameters: { type: "object" },
      execute: async () => ({ content: "x" }),
    });
    expect(again).not.toBe(tool);
  });
});

describe("builtins (TICKET-026)", () => {
  it("echoTool, addTool, failTool are each well-formed Tools", () => {
    expectWellFormed(echoTool, "echo");
    expectWellFormed(addTool, "add");
    expectWellFormed(failTool, "fail");
  });

  it("echoTool.execute returns its args as JSON in content", async () => {
    const result = await echoTool.execute({ msg: "hi", n: 1 });
    expect(result).toEqual({ content: '{"msg":"hi","n":1}' });
    expect(result.isError).toBeUndefined();
  });

  it("addTool.execute returns the exact sum as a string", async () => {
    expect((await addTool.execute({ a: 2, b: 3 })).content).toBe("5");
    expect((await addTool.execute({ a: -1, b: 1 })).content).toBe("0");
    expect((await addTool.execute({ a: 0.1, b: 0.2 })).content).toBe("0.30000000000000004");
  });

  it("failTool.execute always throws (the pipeline turns it into isError)", async () => {
    await expect(failTool.execute({})).rejects.toThrow(/failTool always fails/);
  });
});

describe("end-to-end composition (TICKET-028c)", () => {
  it("register addTool -> executeTool with valid args -> result -> toToolResultBlock", async () => {
    const reg = new ToolRegistry();
    reg.add(addTool);
    expect(reg.has("add")).toBe(true);

    const result = await executeTool(reg.get("add")!, { a: 2, b: 3 });
    expect(result.isError).toBeUndefined();
    expect(result.content).toBe("5");

    const block = toToolResultBlock("call_add", result);
    expect(block).toEqual({ type: "tool_result", toolCallId: "call_add", content: "5" });
    expect(block.isError).toBeUndefined();
  });

  it("invalid args short-circuit to isError WITHOUT calling execute", async () => {
    const execute = vi.fn(addTool.execute);
    const tool: Tool = { ...addTool, execute };
    const reg = new ToolRegistry();
    reg.add(tool);

    // Missing required `b` -> schema failure.
    const result = await executeTool(reg.get("add")!, { a: 2 });
    expect(result.isError).toBe(true);
    expect(result.content).toMatch(/invalid arguments/);
    expect(execute).not.toHaveBeenCalled();

    const block = toToolResultBlock("call_bad", result);
    expect(block.type).toBe("tool_result");
    expect(block.isError).toBe(true);
  });
});

describe("failTool through the pipeline (TICKET-028d)", () => {
  it("yields isError and post is skipped", async () => {
    const order: string[] = [];
    const reg = new ToolRegistry();
    reg.add(failTool);

    const result = await executeTool(reg.get("fail")!, {}, {
      post: async () => {
        order.push("post");
      },
    });
    expect(result.isError).toBe(true);
    expect(result.content).toMatch(/failTool always fails/);
    // The throw is caught before post, so post never runs.
    expect(order).toEqual([]);
  });
});
