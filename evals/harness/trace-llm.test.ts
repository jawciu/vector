import { describe, expect, it, vi } from "vitest";
import { traceLlm } from "./trace-llm";

describe("golden-set model traces", () => {
  it("forwards request options once but never saves them, and resets between cases", async () => {
    const response = { content: [{ type: "text", text: "output" }] };
    const create = vi.fn(async () => response);
    const client = { messages: { create } };
    const takeTrace = traceLlm(client);
    const request = { messages: [{ content: "synthetic meeting" }] };
    const options = { headers: { authorization: "must-not-be-recorded" } };
    const result = await (client.messages.create as (...args: unknown[]) => Promise<unknown>)(request, options);
    expect(result).toBe(response);
    expect(create).toHaveBeenCalledExactlyOnceWith(request, options);
    request.messages[0].content = "mutated later";
    expect(takeTrace()).toEqual([{ request: { messages: [{ content: "synthetic meeting" }] }, response }]);
    expect(takeTrace()).toEqual([]);
  });

  it("preserves failures without retrying or recording secret-bearing messages", async () => {
    const error = new Error("secret header value");
    const create = vi.fn(async () => { throw error; });
    const client = { messages: { create } };
    const takeTrace = traceLlm(client);
    await expect(client.messages.create()).rejects.toBe(error);
    expect(create).toHaveBeenCalledTimes(1);
    expect(takeTrace()).toEqual([{ request: undefined, error: "Error" }]);
  });
});
