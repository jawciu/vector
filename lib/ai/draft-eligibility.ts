import type { MinitiExtraction, OrchestratorToolCall } from "./orchestrator";

/** Exclude explicit recap proposals, preserving substantive work even if its activity label is wrong. */
export function excludeMeetingAdministration(calls: OrchestratorToolCall[], extraction: MinitiExtraction | null) {
  const facts = extraction?.actionItems ?? [];
  const administration = new Set(facts.filter((fact) => fact.category === "meeting_administration"
    && facts.every((other) => other.sourceQuote !== fact.sourceQuote || other.category === "meeting_administration"))
    .map((fact) => fact.sourceQuote));
  const referenced = new Set<string>();
  for (const { input } of calls) {
    const changes = input.changes;
    const dependencies = input.dependsOn ?? (changes && typeof changes === "object" && !Array.isArray(changes) ? changes.dependsOn : null);
    if (Array.isArray(dependencies)) for (const dependency of dependencies) {
      if (dependency && typeof dependency === "object" && !Array.isArray(dependency) && typeof dependency.draftRef === "string") referenced.add(dependency.draftRef);
    }
  }
  const eligible = calls.filter(({ tool, input }) => tool !== "create_task_draft"
    || !administration.has(input.sourceQuote ?? "")
    || !/\brecap\b/i.test(input.sourceQuote ?? "") || !/\brecap\b/i.test(input.title ?? "")
    || referenced.has(input.draftRef ?? ""));
  if (eligible.length || !calls.length) return eligible;
  return [{ tool: "flag_no_action_items", id: `${calls[0].id}_no_work`, input: { reason: "Only routine meeting recap work was proposed." } }];
}
