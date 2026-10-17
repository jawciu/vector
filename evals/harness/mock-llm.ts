/**
 * `--mock-llm`: replace the Anthropic client's `messages.create` with a
 * deterministic stub so the whole harness runs with zero spend.
 *
 * The pipeline imports one shared client (`anthropic` from lib/ai/client), so
 * patching that instance's `messages.create` reaches both passes.
 *
 *   Pass 1 (has `output_config`): an empty extraction.
 *   Pass 2 (has `tools`): "echo" mode. One create_task_draft per Miniti
 *     action_item (title = the item text, first phase, low confidence), or a
 *     single flag_no_action_items when the meeting has none. This exercises
 *     draft persistence and the id → name/ref mapping end to end; the scores
 *     it produces mean nothing.
 *
 * Usage is reported as zero tokens, so AICall rows cost $0.
 */

type CreateParams = {
  output_config?: unknown;
  tools?: unknown[];
  messages?: { role: string; content: unknown }[];
};

type MockContext = {
  meeting?: { actionItems?: unknown[] };
  phases?: { id: number; isComplete?: boolean }[];
};

let counter = 0;

function response(content: unknown[]) {
  counter += 1;
  return {
    id: `msg_mock_${counter}`,
    type: "message",
    role: "assistant",
    model: "claude-sonnet-4-6",
    content,
    stop_reason: content.some((c) => (c as { type: string }).type === "tool_use") ? "tool_use" : "end_turn",
    stop_sequence: null,
    usage: { input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 },
  };
}

export function mockCreate(params: CreateParams) {
  if (params.output_config) {
    return response([
      {
        type: "text",
        text: JSON.stringify({ actionItems: [], reportedCompletions: [], externalBlockers: [], meetingTone: "other" }),
      },
    ]);
  }
  let ctx: MockContext = {};
  try {
    const raw = params.messages?.[0]?.content;
    ctx = typeof raw === "string" ? JSON.parse(raw) : {};
  } catch {
    ctx = {};
  }
  const items = (ctx.meeting?.actionItems ?? []).map((i) => (typeof i === "string" ? i : JSON.stringify(i)));
  const phaseId = (ctx.phases ?? []).find((p) => !p.isComplete)?.id ?? ctx.phases?.[0]?.id ?? null;
  if (items.length === 0) {
    return response([
      { type: "tool_use", id: `toolu_mock_${counter}_0`, name: "flag_no_action_items", input: { reason: "mock: no action items" } },
    ]);
  }
  return response(
    items.map((title, i) => ({
      type: "tool_use",
      id: `toolu_mock_${counter}_${i}`,
      name: "create_task_draft",
      input: { title: title.slice(0, 80), phaseId, priority: "medium", sourceQuote: title, confidence: "low" },
    }))
  );
}

/** Patch the shared client in place. Call after importing lib/ai/client. */
export function installMockLlm(client: { messages: unknown }) {
  (client.messages as { create: (p: CreateParams) => Promise<unknown> }).create = async (p: CreateParams) => mockCreate(p);
}
