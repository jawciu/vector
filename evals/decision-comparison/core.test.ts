import { describe, expect, it } from "vitest";
import { auditExtraction, evaluate, makeRequest, project, requestHash, validateAnswers, type Answers } from "./core";
import type { GoldenCase } from "../harness/types";

const golden: GoldenCase = {
  payload: { event: "meeting.saved", meeting: { id: "fixture", title: "Review", date: "2026-06-01", transcript: [
    { speaker: "You", text: "I'll send the guide." },
    { speaker: "Customer", text: "Once I have the guide I'll forward it to IT." },
  ] } },
  board: {
    companyPrefix: "TEST", companyName: "Test company", vendorUsers: [{ name: "Recorder" }], contacts: [{ name: "Customer" }],
    tasks: [{ ref: "guide", title: "Send the guide", status: "Not started", owner: "vendor", ownerName: "Recorder", dueDate: null, priority: null, notes: "", blockedBy: null }],
  },
  expected: { match: { companyPrefix: "TEST" }, toolCalls: [
    { action: "match_existing", existingTaskRef: "guide", sourceQuoteContains: "I'll send the guide." },
    { action: "create_task", titleLike: "Forward the guide to IT", assignee: "Customer", owner: "customer", sourceQuoteContains: "I'll forward it to IT", dependsOn: { existingTaskRef: "guide" } },
  ] },
};
const extraction = { actionItems: [
  { claim: "Send the guide", sourceQuote: "I'll send the guide.", speaker: "You" },
  { claim: "Forward the guide to IT", sourceQuote: "Once I have the guide I'll forward it to IT.", speaker: "Customer" },
] };
const request = () => makeRequest(golden, extraction, "Recorder");
const answers = (): Answers => Object.fromEntries(Object.entries(request().questions).map(([key]) => [key, {
  choice: key.endsWith("_action") ? "create_task" : key.endsWith("_task") ? "none" : key.endsWith("_owner") ? "unknown" : "no",
}]));

describe("offline decision experiment", () => {
  it("keeps the answer key and old decisions out of provider inputs", () => {
    const modified = structuredClone(golden);
    modified.expected.toolCalls[0].existingTaskRef = "secret-label";
    modified.expected.notes = "private reviewer interpretation";
    expect(makeRequest(modified, extraction, "Recorder")).toEqual(request());
    expect(JSON.stringify(request())).not.toContain("secret-label");
    // Jev ignores map keys: the candidate has to be named in every question itself.
    for (const [key, q] of Object.entries(request().questions)) expect(q.instructions).toContain(`id ${key.split("_")[0]}`);
  });
  it("rejects missing, extra, out-of-set and invalid-confidence responses", () => {
    expect(() => validateAnswers(request(), {})).toThrow();
    const bad = answers();
    bad.a1_action.choice = "invented-action";
    expect(() => validateAnswers(request(), bad)).toThrow("Invalid answer");
    const confidence = answers(); confidence.a1_action.confidence = NaN;
    expect(() => validateAnswers(request(), confidence)).toThrow("Invalid confidence");
    const extra = answers(); extra.leak = { choice: "no" };
    expect(() => validateAnswers(request(), extra)).toThrow();
  });
  it("resolves a prerequisite on a candidate updating an existing task to that task", () => {
    const a = answers();
    a.a1_action.choice = "match_existing"; a.a1_task.choice = "guide"; a.a1_owner.choice = "vendor1";
    a.a2_owner.choice = "customer1"; a.a2_needs_a1.choice = "yes";
    const result = evaluate(golden, request(), a);
    expect(result.proposals[1].dependsOn).toEqual([{ taskRef: "guide" }]);
    expect(result.metrics.correctAction).toEqual({ count: 2, total: 2 });
    expect(result.metrics.correctOwner).toEqual({ count: 1, total: 1 });
    expect(result.metrics.correctDependencies).toEqual({ count: 1, total: 1 });
  });
  it("counts omitted actions and owners as failures, rather than improving accuracy by abstaining", () => {
    const a = answers(); a.a2_action.choice = "review";
    const result = evaluate(golden, request(), a);
    expect(result.metrics.correctAction).toEqual({ count: 0, total: 2 });
    expect(result.metrics.correctOwner).toEqual({ count: 0, total: 1 });
    expect(result.metrics.correctDependencies).toEqual({ count: 0, total: 1 });
    expect(result.unresolved).toContain("a2: action needs review");
  });
  it("exposes a missing extraction and a changed request fingerprint", () => {
    const missing = makeRequest(golden, { actionItems: [extraction.actionItems[0]] }, "Recorder");
    expect(auditExtraction(golden, missing).possiblyMissing[0].titleLike).toContain("Forward");
    expect(requestHash(missing)).not.toEqual(requestHash(request()));
  });
  it("keeps unknown recorder identity explicit", () => {
    expect(makeRequest(golden, extraction, null).state.recorder).toBeNull();
    expect(project(makeRequest(golden, extraction, null), answers()).proposals[0].ownerName).toBeNull();
  });
  it("does not silently turn an unresolved existing-task decision into new work", () => {
    const a = answers(); a.a1_action.choice = "match_existing";
    const result = project(request(), a);
    expect(result.unresolved).toContain("a1: match_existing has no unambiguous existing task");
    expect(result.proposals.map(p => p.title)).not.toContain("Send the guide");
  });
  it("surfaces dependency cycles for review", () => {
    const a = answers(); a.a1_needs_a2.choice = "yes"; a.a2_needs_a1.choice = "yes";
    expect(project(request(), a).unresolved.some(x => x.includes("dependency cycle"))).toBe(true);
  });
  it("penalizes a wrong prerequisite even when the same task has a wanted prerequisite", () => {
    const a = answers();
    a.a1_owner.choice = "vendor1"; a.a2_owner.choice = "customer1";
    a.a2_needs_a1.choice = "yes"; // a1 wrongly creates a duplicate instead of updating the board task.
    const result = evaluate(golden, request(), a);
    expect(result.metrics.correctDependencies).toEqual({ count: 0, total: 1 });
    expect(result.metrics.dependencyPrecision).toEqual({ count: 0, total: 1 });
    expect(result.metrics.unwantedDependencies).toHaveLength(1);
  });
});
