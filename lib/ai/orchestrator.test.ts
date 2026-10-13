import { describe, it, expect, beforeEach, vi } from "vitest";

// Both passes as plain functions: the Anthropic client is a stub that records
// what it was sent, so the tests read the real prompts, tools and user
// message without a key or a network call.
const create = vi.fn();
vi.mock("@/lib/ai/client", () => ({
  anthropic: { messages: { create: (p: unknown) => create(p) } },
  computeCost: () => 0,
}));
vi.mock("@/lib/db", () => ({ logAICall: vi.fn(async () => undefined) }));

import { runMinitiExtraction, runMinitiOrchestrator } from "./orchestrator";
import { buildOrchestratorContext } from "@/lib/integrations/miniti";

type Sent = {
  system: { text: string }[];
  messages: { content: string }[];
  tools?: { name: string; input_schema: { properties: Record<string, { description?: string }> } }[];
};
const sent = (i = 0) => create.mock.calls[i][0] as Sent;
const usage = { input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 };

const context = (recorder: { id: number; name: string } | null) =>
  buildOrchestratorContext({
    meeting: {
      id: "m1",
      title: "Check-in",
      date: "2026-07-08",
      transcript: [
        { speaker: "Speaker 1", text: "Can you send the export?" },
        { speaker: "You", text: "I'll send the export today." },
      ],
    },
    tasks: [],
    contacts: [],
    phases: [{ id: 6, name: "Setup", isComplete: false, sortOrder: 1 }],
    vendorUsers: [{ id: 4, name: "Jules Park", email: "jules@vendor.test" }],
    recorder,
    today: new Date("2026-07-08T12:00:00Z"),
  });

beforeEach(() => {
  create.mockReset();
});

describe("Pass 1 (extraction) and the recorder", () => {
  beforeEach(() => {
    create.mockResolvedValue({ id: "r1", model: "m", usage, content: [{ type: "text", text: '{"actionItems":[]}' }] });
  });

  it("explains that \"You\" is the person who recorded the meeting, on the vendor side", async () => {
    await runMinitiExtraction({ context: context(null) });
    const system = sent().system[0].text;
    expect(system).toMatch(/labels whoever recorded the meeting as "You"/);
    expect(system).toMatch(/vendor side/);
    expect(system).toMatch(/one turn per line as "<speaker>: <words>"/);
  });

  it("sends the recorder and the speaker-labelled transcript in the user message", async () => {
    await runMinitiExtraction({ context: context({ id: 4, name: "Jules Park" }) });
    const user = JSON.parse(sent().messages[0].content);
    expect(user.recorder).toEqual({ id: 4, name: "Jules Park" });
    expect(user.meeting.transcript).toBe("Speaker 1: Can you send the export?\nYou: I'll send the export today.");
  });
});

describe("Pass 2 (decision) and the recorder", () => {
  beforeEach(() => {
    create.mockResolvedValue({ id: "r2", model: "m", usage, stop_reason: "end_turn", content: [] });
  });

  it("maps the recorder's commitments to recorder.id, and flags them when nobody is set", async () => {
    await runMinitiOrchestrator({ context: context(null), extraction: { actionItems: [] } });
    const system = sent().system[0].text;
    expect(system).toMatch(/ownerId = recorder\.id/);
    expect(system).toMatch(/If recorder is null[^.]*: leave ownerId empty and set ownerFromRecorder: true/);
    expect(system).toMatch(/Never guess the recorder from vendorUsers/);
  });

  it("offers ownerFromRecorder on create_task_draft", async () => {
    await runMinitiOrchestrator({ context: context(null), extraction: null });
    const create_ = sent().tools!.find((t) => t.name === "create_task_draft")!;
    expect(create_.input_schema.properties.ownerFromRecorder).toMatchObject({ type: "boolean" });
    expect(create_.input_schema.properties.ownerId.description).toMatch(/recorder\.id/);
  });

  it("passes recorder: null through when nobody is set", async () => {
    await runMinitiOrchestrator({ context: context(null), extraction: null });
    expect(JSON.parse(sent().messages[0].content).recorder).toBe(null);
  });
});
