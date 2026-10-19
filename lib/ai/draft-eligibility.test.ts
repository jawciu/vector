import { describe, expect, it } from "vitest";
import { excludeMeetingAdministration } from "./draft-eligibility";
import type { MinitiExtraction, OrchestratorToolCall } from "./orchestrator";

const quote = "I'll send the recap after we finish.";
const extraction: MinitiExtraction = { actionItems: [{ claim: "Send recap", sourceQuote: quote, firmness: "firm", category: "meeting_administration" }] };
const recap: OrchestratorToolCall = { id: "b1", tool: "create_task_draft", input: { draftRef: "d1", title: "Send recap", sourceQuote: quote } };

describe("meeting-administration eligibility", () => {
  it("removes a firm routine recap while retaining a substantive artifact delivery", () => {
    const delivery = { ...recap, id: "b2", input: { draftRef: "d2", title: "Send signed certificate", sourceQuote: "I'll send the certificate today." } };
    expect(excludeMeetingAdministration([recap, delivery], extraction)).toEqual([delivery]);
    expect(excludeMeetingAdministration([recap], extraction)[0].tool).toBe("flag_no_action_items");
  });

  it("retains a real follow-up even when extraction misclassifies it as meeting administration", () => {
    const followup = { ...recap, input: { ...recap.input, title: "Adjust workshop size", sourceQuote: "Let us know when you choose and we will adjust the session." } };
    const facts: MinitiExtraction = { actionItems: [{ claim: "Adjust workshop size", category: "meeting_administration", firmness: "tentative", sourceQuote: followup.input.sourceQuote }] };
    expect(excludeMeetingAdministration([followup], facts)).toEqual([followup]);
  });

  it("does not discard work already on the board or break a dependent proposal", () => {
    const update = { id: "b2", tool: "match_to_existing_task_draft", input: { taskId: 12, sourceQuote: quote, changes: { appendNotes: "Sent to the agreed recipients." } } };
    const dependent = { id: "b3", tool: "create_task_draft", input: { dependsOn: [{ draftRef: "d1" }], title: "Submit evidence package" } };
    expect(excludeMeetingAdministration([update], extraction)).toEqual([update]);
    expect(excludeMeetingAdministration([recap, dependent], extraction)).toEqual([recap, dependent]);
  });

  it("preserves cached unclassified facts and mixed commitments sharing a quotation", () => {
    expect(excludeMeetingAdministration([recap], { actionItems: [{ claim: "Send recap", sourceQuote: quote, firmness: "firm" }] })).toEqual([recap]);
    expect(excludeMeetingAdministration([recap], { actionItems: [...extraction.actionItems!, { claim: "Send evidence", sourceQuote: quote, category: "onboarding_work", firmness: "firm" }] })).toEqual([recap]);
  });
});
