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

import { readOrchestratorCalls, runMinitiExtraction, runMinitiOrchestrator } from "./orchestrator";
import { buildOrchestratorContext } from "@/lib/integrations/miniti";
import { logAICall } from "@/lib/db";

type Schema = { description?: string; const?: string; properties?: Record<string, Schema>; items?: Schema; oneOf?: Schema[] };
type Sent = {
  system: { text: string }[];
  messages: { content: string }[];
  tools?: { name: string; input_schema: Schema }[];
  tool_choice?: { type: string; name?: string };
  thinking?: { type: string; budget_tokens?: number };
  output_config?: { effort?: string };
  temperature?: number;
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
  vi.mocked(logAICall).mockClear();
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

  it("records paid usage even when extraction exhausts its budget without usable JSON", async () => {
    create.mockResolvedValue({ id: "limited", model: "m", usage: { ...usage, output_tokens: 8000 }, stop_reason: "max_tokens", content: [] });
    await expect(runMinitiExtraction({ context: context(null) })).rejects.toThrow(/exceeded max_tokens/);
    expect(logAICall).toHaveBeenCalledWith(expect.objectContaining({ kind: "miniti_extraction", outputTokens: 8000, requestId: "limited" }));
  });
});

describe("Pass 2 (decision) and the recorder", () => {
  beforeEach(() => {
    create.mockResolvedValue({ id: "r2", model: "m", usage, stop_reason: "tool_use", content: [
      { type: "tool_use", id: "b", name: "propose_meeting_drafts", input: { calls: [{ tool: "flag_no_action_items", input: { reason: "No commitments" } }] } },
    ] });
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
    expect(sent().tool_choice).toEqual({ type: "auto" });
    expect(sent().thinking).toEqual({ type: "enabled", budget_tokens: 1024 });
    expect(sent().temperature).toBeUndefined();
    const variants = sent().tools![0].input_schema.properties!.calls.items!.oneOf!;
    const create_ = variants.find((v) => v.properties!.tool.const === "create_task_draft")!.properties!.input;
    expect(create_.properties!.ownerFromRecorder).toMatchObject({ type: "boolean" });
    expect(create_.properties!.ownerId.description).toMatch(/recorder\.id/);
  });

  it("passes recorder: null through when nobody is set", async () => {
    await runMinitiOrchestrator({ context: context(null), extraction: null });
    expect(JSON.parse(sent().messages[0].content).recorder).toBe(null);
  });

  it("provides calendar facts anchored to the meeting rather than processing day", async () => {
    const input = context(null);
    input.meeting.date = "2026-06-24T11:00:00Z";
    await runMinitiOrchestrator({ context: input, extraction: null });
    const payload = JSON.parse(sent().messages[0].content);
    expect(payload.today).toBe("2026-07-08");
    expect(payload.meetingCalendar.meetingDate).toBe("2026-06-24");
    expect(payload.meetingCalendar.thisWeek.Friday).toBe("2026-06-26");
  });

  it("corrects date arithmetic at the real decision-call boundary", async () => {
    const input = context(null);
    input.meeting.date = "2026-06-24T11:00:00Z";
    const quote = "I'll configure the app this week.";
    create.mockResolvedValue({ id: "dates", model: "m", usage, stop_reason: "tool_use", content: [
      { type: "thinking", thinking: "Provider summary", signature: "test" },
      { type: "tool_use", id: "b", name: "propose_meeting_drafts", input: { calls: [
        { tool: "match_to_existing_task_draft", input: { taskId: 1, sourceQuote: quote, changes: { dueDate: "2026-06-28" } } },
      ] } },
    ] });
    const result = await runMinitiOrchestrator({ context: input, extraction: { actionItems: [{ claim: "Configure app", sourceQuote: quote, mentionedDueDate: "this week", firmness: "firm" }] } });
    expect(result.calls[0].input.changes).toMatchObject({ dueDate: "2026-06-26" });
    expect(JSON.parse(sent().messages[0].content).relativeDateHints).toEqual([{ sourceQuote: quote, phrase: "this week", date: "2026-06-26" }]);
  });

  it("keeps the explicit vendor actor rather than also assigning its customer recipient", async () => {
    const input = context({ id: 4, name: "Jules Park" });
    input.customerContacts.push({ id: 12, name: "Robin Vale", email: null });
    const quote = "I'll send the export today.";
    create.mockResolvedValue({ id: "owners", model: "m", usage, stop_reason: "tool_use", content: [
      { type: "tool_use", id: "b", name: "propose_meeting_drafts", input: { calls: [
        { tool: "create_task_draft", input: { draftRef: "d1", title: "Send export", sourceQuote: quote, ownerId: 4, assigneeContactId: 12 } },
      ] } },
    ] });
    const result = await runMinitiOrchestrator({ context: input, extraction: { actionItems: [
      { claim: "Send export", sourceQuote: quote, speaker: "You", mentionedOwner: "You", firmness: "firm" },
    ] } });
    expect(result.calls[0].input.ownerId).toBe(4);
    expect(result.calls[0].input.assigneeContactId).toBeUndefined();
  });

  it("preserves a proposed vendor follow-up despite an incorrect administration label", async () => {
    const input = context({ id: 4, name: "Jules Park" });
    const quote = "Let me know when they choose and we will adjust the session.";
    create.mockResolvedValue({ id: "followup", model: "m", usage, stop_reason: "tool_use", content: [
      { type: "tool_use", id: "b", name: "propose_meeting_drafts", input: { calls: [
        { tool: "create_task_draft", input: { draftRef: "d1", title: "Adjust session capacity", sourceQuote: quote, ownerId: 4, dependsOn: [{ text: "Customer confirms numbers" }] } },
      ] } },
    ] });
    const result = await runMinitiOrchestrator({ context: input, extraction: { actionItems: [
      { claim: "Adjust session", sourceQuote: quote, speaker: "You", mentionedOwner: "You", firmness: "tentative", category: "meeting_administration" },
    ] } });
    expect(result.calls[0]).toMatchObject({ tool: "create_task_draft", input: { ownerId: 4, dependsOn: [{ text: "Customer confirms numbers" }] } });
  });

  it("removes a copied speaker label only when the remaining quote is verbatim evidence", async () => {
    const input = context(null);
    create.mockResolvedValue({ id: "quote", model: "m", usage, stop_reason: "tool_use", content: [
      { type: "tool_use", id: "b", name: "propose_meeting_drafts", input: { calls: [
        { tool: "create_task_draft", input: { draftRef: "d1", title: "Send export", sourceQuote: "You: I'll send the export today." } },
      ] } },
    ] });
    const result = await runMinitiOrchestrator({ context: input });
    expect(result.calls[0].input.sourceQuote).toBe("I'll send the export today.");
  });

  it("refuses a token-limited response instead of persisting a partial batch", async () => {
    create.mockResolvedValue({ id: "limited", model: "m", usage, stop_reason: "max_tokens", content: [] });
    await expect(runMinitiOrchestrator({ context: context(null) })).rejects.toThrow(/refusing a partial review batch/);
  });
});

describe("complete draft batch decoding", () => {
  it("keeps prerequisite and dependent proposals together, including forward refs", () => {
    const calls = [
      { tool: "create_task_draft", input: { draftRef: "d1", title: "Publish report", dependsOn: [{ draftRef: "d2" }] } },
      { tool: "create_task_draft", input: { draftRef: "d2", title: "Prepare export" } },
      { tool: "match_to_existing_task_draft", input: { taskId: 12, changes: { dependsOn: [{ draftRef: "d1" }], appendNotes: "Internal audience only." } } },
    ];
    const decoded = readOrchestratorCalls([{ type: "tool_use", id: "batch1", name: "propose_meeting_drafts", input: { calls } }]);
    expect(decoded.map(({ tool, input }) => ({ tool, input }))).toEqual(calls);
    expect(new Set(decoded.map((c) => c.id)).size).toBe(3);
  });

  it("refuses malformed, empty, mixed no-action or missing batches instead of silently losing drafts", () => {
    const block = (calls: unknown) => [{ type: "tool_use", id: "b", name: "propose_meeting_drafts", input: { calls } }];
    expect(() => readOrchestratorCalls([])).toThrow();
    expect(() => readOrchestratorCalls(block([]))).toThrow();
    expect(() => readOrchestratorCalls(block([{ tool: "invented", input: {} }]))).toThrow();
    expect(() => readOrchestratorCalls(block([{ tool: "create_task_draft", input: null }]))).toThrow();
    expect(() => readOrchestratorCalls(block([{ tool: "flag_no_action_items", input: {} }, { tool: "create_task_draft", input: {} }]))).toThrow();
  });
});
