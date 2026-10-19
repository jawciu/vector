import type { OrchestratorContext } from "@/lib/integrations/miniti";
import type { MinitiExtraction, OrchestratorToolCall } from "./orchestrator";

/** Remove a conflicting customer assignment only when the known recorder is the explicit actor. */
export function normaliseRecorderOwnership(calls: OrchestratorToolCall[], extraction: MinitiExtraction | null, recorder: OrchestratorContext["recorder"]) {
  if (!recorder) return calls;
  return calls.map((call) => {
    if (call.tool !== "create_task_draft" || call.input.ownerId !== recorder.id || call.input.assigneeContactId == null) return call;
    const facts = extraction?.actionItems?.filter((fact) => fact.sourceQuote === call.input.sourceQuote) ?? [];
    if (!facts.length || facts.some((fact) => fact.speaker !== "You" || fact.mentionedOwner !== "You")) return call;
    const input = { ...call.input };
    delete input.assigneeContactId;
    return { ...call, input };
  });
}
