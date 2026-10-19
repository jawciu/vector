import { describe, expect, it } from "vitest";
import { normaliseRecorderOwnership } from "./draft-ownership";
import type { MinitiExtraction, OrchestratorToolCall } from "./orchestrator";

const recorder = { id: 4, name: "Jules Park" };
const quote = "I'll send the guide today.";
const fact = { claim: "Send guide", sourceQuote: quote, speaker: "You", mentionedOwner: "You", firmness: "firm" as const };
const extraction: MinitiExtraction = { actionItems: [fact] };
const call: OrchestratorToolCall = { tool: "create_task_draft", id: "b1", input: { ownerId: 4, assigneeContactId: 12, sourceQuote: quote } };

describe("conflicting recorder ownership", () => {
  it("removes the recipient assignment without mutating the raw proposal", () => {
    const result = normaliseRecorderOwnership([call], extraction, recorder);
    expect(result[0].input).toEqual({ ownerId: 4, sourceQuote: quote });
    expect(call.input.assigneeContactId).toBe(12);
  });

  it("does not guess with unknown, conflicting or missing actor evidence", () => {
    expect(normaliseRecorderOwnership([call], extraction, null)).toEqual([call]);
    expect(normaliseRecorderOwnership([call], null, recorder)).toEqual([call]);
    expect(normaliseRecorderOwnership([call], { actionItems: [fact, { ...fact, mentionedOwner: "Customer" }] }, recorder)).toEqual([call]);
    const different = { ...call, input: { ...call.input, sourceQuote: "Different quote" } };
    expect(normaliseRecorderOwnership([different], extraction, recorder)).toEqual([different]);
  });

  it("does not overwrite another vendor, single-party assignment or an existing-task change", () => {
    const inputs = [
      { ...call, input: { ...call.input, ownerId: 9 } },
      { ...call, input: { ownerId: 4, sourceQuote: quote } },
      { ...call, tool: "match_to_existing_task_draft", input: { sourceQuote: quote, changes: { ownerId: 4, assigneeContactId: 12 } } },
    ];
    expect(normaliseRecorderOwnership(inputs, extraction, recorder)).toEqual(inputs);
  });
});
