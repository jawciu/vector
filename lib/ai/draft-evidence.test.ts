import { describe, expect, it } from "vitest";
import { normaliseDraftQuotes } from "./draft-evidence";
import type { OrchestratorContext } from "@/lib/integrations/miniti";
import type { MinitiExtraction, OrchestratorToolCall } from "./orchestrator";
const quote = "I'll send the export today.";
const context: OrchestratorContext = {
  today: "2026-06-05", recorder: null,
  meeting: { id: "m", title: "Review", date: "2026-06-05", summary: null, actionItems: [], keyDecisions: [], notes: null, transcript: `You: ${quote}\nRobin: That unblocks my review.` },
  openTasks: [], customerContacts: [{ id: 12, name: "Robin", email: null }], phases: [], vendorUsers: [],
};
const fact = { claim: "Send export", sourceQuote: quote, speaker: "You", firmness: "firm" as const };
const extraction: MinitiExtraction = { actionItems: [fact] };
const call = (sourceQuote: string): OrchestratorToolCall => ({ id: "b1", tool: "create_task_draft", input: { sourceQuote, title: "Send export", dependsOn: [{ text: "Permission" }] } });

describe("verbatim draft evidence", () => {
  it("removes a copied known speaker prefix and leaves the source response untouched", () => {
    const original = call(`You: ${quote}`);
    expect(normaliseDraftQuotes([original], extraction, context)[0].input).toEqual({ ...original.input, sourceQuote: quote });
    expect(original.input.sourceQuote).toBe(`You: ${quote}`);
  });
  it("reduces an actually cited two-speaker passage to its one unambiguous extracted commitment", () => {
    const original = call(`${quote}\nRobin: That unblocks my review.`);
    expect(normaliseDraftQuotes([original], extraction, context)[0].input.sourceQuote).toBe(quote);
  });
  it("does not fabricate evidence, change valid quotations or choose between actions", () => {
    const calls = [call(quote), call("I'll send it tomorrow."), call(`${quote}\nRobin: Invented reply.`)];
    expect(normaliseDraftQuotes(calls, extraction, context)).toEqual(calls);
    const mixed = call(`${quote}\nRobin: That unblocks my review.`);
    expect(normaliseDraftQuotes([mixed], { actionItems: [fact, { ...fact, sourceQuote: "That unblocks my review.", speaker: "Robin" }] }, context)).toEqual([mixed]);
  });
});
