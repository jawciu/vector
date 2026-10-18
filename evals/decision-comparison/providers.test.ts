import { afterEach, describe, expect, it, vi } from "vitest";
import { callProvider, MODELS } from "./providers";
import type { Request } from "./core";

const request = {
  state: { candidates: [], policy: "fixture" },
  questions: { task: { type: "choice", instructions: "Is this trackable?", criteria: { yes: "A commitment", no: "Discussion" } } },
} as unknown as Request;
afterEach(() => vi.unstubAllGlobals());

describe("TypeSafe HTTP contract", () => {
  it("sends only the pinned model and shared request, and preserves decision probabilities", async () => {
    const raw = { model: MODELS.jev, answers: { task: { type: "choice", choice: "yes", confidence: 0.9, probabilities: { yes: 0.95, no: 0.05 } } }, usage: { input_tokens: 100, output_tokens: 10 } };
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(raw)));
    vi.stubGlobal("fetch", fetchMock);
    const result = await callProvider("jev", request, "fixture-key");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.typesafe.ai/v1/systemone");
    expect(JSON.parse(options.body)).toEqual({ model: MODELS.jev, ...request });
    expect(result.answers.task.probabilities).toEqual(raw.answers.task.probabilities);
    expect(JSON.stringify(result)).not.toContain("fixture-key");
    expect(result.estimatedCostUsd).toBeCloseTo(0.0000042);
  });
  it("fails on HTTP errors without printing the body or retrying", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("private server detail", { status: 429 }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(callProvider("jev", request, "fixture-key")).rejects.toThrow("TypeSafe HTTP 429");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it("refuses a response from an unexpected model", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ model: "different-model" }))));
    await expect(callProvider("jev", request, "fixture-key")).rejects.toThrow("different model version");
  });
  it("uses the Gateway-compatible endpoint and records the billed cost without changing questions", async () => {
    const raw = { model: `typesafe-ai/${MODELS.jev}`, answers: { task: { type: "choice", choice: "yes", confidence: 0.9, probabilities: { yes: 0.95, no: 0.05 } } }, usage: { input_tokens: 100, output_tokens: 10 }, provider_metadata: { gateway: { cost: "0.000005" } } };
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(raw)));
    vi.stubGlobal("fetch", fetchMock);
    const result = await callProvider("jev", request, "gateway-fixture-key", "gateway");
    expect(fetchMock.mock.calls[0][0]).toBe("https://ai-gateway.vercel.sh/typesafe/v1/systemone");
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ model: `typesafe-ai/${MODELS.jev}`, ...request });
    expect(result.model).toBe(MODELS.jev);
    expect(result.transport).toBe("vercel-gateway");
    expect(result.estimatedCostUsd).toBe(0.000005);
    expect(JSON.stringify(result)).not.toContain("gateway-fixture-key");
  });
  it("reports Gateway's account-verification blocker without echoing arbitrary server content", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: { type: "customer_verification_required", message: "arbitrary private detail" } }), { status: 403 }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(callProvider("jev", request, "gateway-fixture-key", "gateway")).rejects.toThrow("valid credit card on file");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it("distinguishes paid-credit restrictions from card verification", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: { type: "no_providers_available", param: { name: "RestrictedModelsError" } } }), { status: 403 })));
    await expect(callProvider("jev", request, "gateway-fixture-key", "gateway")).rejects.toThrow("requires paid credits; free credits are not eligible");
  });
});
