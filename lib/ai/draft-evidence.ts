import type { OrchestratorContext } from "@/lib/integrations/miniti";
import type { MinitiExtraction, OrchestratorToolCall } from "./orchestrator";

/** Narrow quotation repair using only the exact cited passage, never replacement evidence. */
export function normaliseDraftQuotes(calls: OrchestratorToolCall[], extraction: MinitiExtraction | null, context: OrchestratorContext) {
  const facts = [...extraction?.actionItems ?? [], ...extraction?.reportedCompletions ?? []];
  const speakers = new Set([
    "You", ...context.vendorUsers.map((person) => person.name), ...context.customerContacts.map((person) => person.name),
    ...facts.map((fact) => fact.speaker).filter((name): name is string => !!name),
  ]);
  const transcript = context.meeting.transcript;
  const turns: string[] = [];
  for (const line of transcript.split("\n")) {
    const speaker = [...speakers].find((name) => line.startsWith(`${name}: `));
    if (speaker) turns.push(line.slice(speaker.length + 2));
    else if (turns.length) turns[turns.length - 1] += `\n${line}`;
  }
  const appearsInOneTurn = (quote: string) => !!quote && turns.some((turn) => turn.includes(quote));
  return calls.map((call) => {
    const quote = call.input.sourceQuote;
    if (!quote || appearsInOneTurn(quote) || !transcript.includes(quote)) return call;
    const speaker = [...speakers].find((name) => quote.startsWith(`${name}: `));
    const withoutLabel = speaker ? quote.slice(speaker.length + 2) : "";
    if (appearsInOneTurn(withoutLabel)) return { ...call, input: { ...call.input, sourceQuote: withoutLabel } };
    // A joined passage may contain one unambiguous extracted commitment.
    // Do not choose between multiple actions or repair invented/paraphrased text.
    const candidates = [...new Set(facts.map((fact) => fact.sourceQuote)
      .filter((candidate) => quote.includes(candidate) && appearsInOneTurn(candidate)))];
    return candidates.length === 1 ? { ...call, input: { ...call.input, sourceQuote: candidates[0] } } : call;
  });
}
