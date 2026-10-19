import type { OrchestratorToolCall, OrchestratorToolInput } from "./orchestrator";

/** Calendar facts for relative-date decisions; this does not infer deadlines. */
export function buildMeetingCalendar(value: string | null | undefined) {
  if (!value) return null;
  const meeting = new Date(value);
  if (Number.isNaN(meeting.getTime())) return null;
  meeting.setUTCHours(0, 0, 0, 0);
  const monday = new Date(meeting);
  monday.setUTCDate(monday.getUTCDate() - (monday.getUTCDay() + 6) % 7);
  const names = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
  const week = (offset: number) => Object.fromEntries(names.map((name, i) => {
    const day = new Date(monday);
    day.setUTCDate(day.getUTCDate() + offset + i);
    return [name, day.toISOString().slice(0, 10)];
  }));
  return { meetingDate: meeting.toISOString().slice(0, 10), thisWeek: week(0), nextWeek: week(7) };
}

/** Resolve only whole phrases with an explicit policy. Unknown/event timing stays with the model. */
export function resolveRelativeDate(phrase: string, meetingDate: string) {
  const calendar = buildMeetingCalendar(meetingDate);
  if (!calendar) return null;
  const text = phrase.toLowerCase().trim().replace(/[.!]$/, "");
  if (/^(?:by )?(?:today|later today|right after this call|straight after we hang up)$/.test(text)) return calendar.meetingDate;
  if (/^(?:by )?tomorrow$/.test(text)) {
    const day = new Date(`${calendar.meetingDate}T00:00:00Z`);
    day.setUTCDate(day.getUTCDate() + 1);
    return day.toISOString().slice(0, 10);
  }
  if (/^(?:by )?(?:this week|(?:the )?end of (?:the |this )?week)$/.test(text)) return calendar.thisWeek.Friday;
  if (/^(?:by )?early next week$/.test(text)) return calendar.nextWeek.Tuesday;
  if (/^(?:by )?(?:the )?end of next week$/.test(text)) return calendar.nextWeek.Friday;
  const weekday = text.match(/^(?:(?:by|on) )?(?:end of day )?(monday|tuesday|wednesday|thursday|friday|saturday|sunday)$/)?.[1];
  if (!weekday) return null;
  const name = weekday[0].toUpperCase() + weekday.slice(1);
  return calendar.thisWeek[name] > calendar.meetingDate ? calendar.thisWeek[name] : calendar.nextWeek[name];
}

export type RelativeDateHint = { sourceQuote: string; phrase: string; date: string };

/** Do not choose between distinct deadlines sharing a quotation. */
export function buildRelativeDateHints(items: { sourceQuote: string; mentionedDueDate?: string }[], meetingDate: string) {
  const candidates = items.flatMap((item) => {
    const date = resolveRelativeDate(item.mentionedDueDate ?? "", meetingDate);
    return date ? [{ sourceQuote: item.sourceQuote, phrase: item.mentionedDueDate!, date }] : [];
  });
  return candidates.filter((hint) => !candidates.some((other) => other.sourceQuote === hint.sourceQuote && other.date !== hint.date));
}

/** Correct arithmetic only on an already proposed deadline, never invent one or remove null. */
export function normaliseRelativeDraftDates(calls: OrchestratorToolCall[], hints: RelativeDateHint[], meetingDate: string): OrchestratorToolCall[] {
  return calls.map((call) => {
    const hint = hints.find((entry) => entry.sourceQuote === call.input.sourceQuote);
    if (!hint) return call;
    const changes = call.tool === "match_to_existing_task_draft" ? call.input.changes : null;
    const fields = call.tool === "create_task_draft" ? call.input
      : changes && typeof changes === "object" && !Array.isArray(changes) ? changes : null;
    if (!fields || typeof fields.dueDate !== "string") return call;
    const noteKey = call.tool === "create_task_draft" ? "notes" : "appendNotes";
    const note = typeof fields[noteKey] === "string" ? fields[noteKey] as string : "";
    const scope = note.replace(/(?:^|\n)\s*Due date:[^\n]*(?=\n|$)/g, "").trim();
    const notes = `${scope ? `${scope}\n\n` : ""}Due date: '${hint.phrase}' from ${meetingDate} = ${hint.date}.`;
    const patched = { ...fields, dueDate: hint.date, [noteKey]: notes };
    const input: OrchestratorToolInput = { ...call.input };
    if (call.tool === "create_task_draft") Object.assign(input, { dueDate: hint.date, notes });
    else input.changes = patched;
    return { ...call, input };
  });
}
