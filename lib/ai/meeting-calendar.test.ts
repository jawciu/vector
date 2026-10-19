import { describe, expect, it } from "vitest";
import { buildMeetingCalendar, buildRelativeDateHints, normaliseRelativeDraftDates, resolveRelativeDate } from "./meeting-calendar";

describe("meeting calendar reference", () => {
  it("anchors both weeks to the meeting, including dates across months", () => {
    const calendar = buildMeetingCalendar("2026-06-24T11:00:00Z")!;
    expect(calendar.meetingDate).toBe("2026-06-24");
    expect(calendar.thisWeek).toEqual({
      Monday: "2026-06-22", Tuesday: "2026-06-23", Wednesday: "2026-06-24",
      Thursday: "2026-06-25", Friday: "2026-06-26", Saturday: "2026-06-27", Sunday: "2026-06-28",
    });
    expect(calendar.nextWeek.Monday).toBe("2026-06-29");
    expect(calendar.nextWeek.Friday).toBe("2026-07-03");
  });

  it("handles leap days and year boundaries using UTC", () => {
    expect(buildMeetingCalendar("2028-02-29T23:30:00Z")!.thisWeek.Wednesday).toBe("2028-03-01");
    expect(buildMeetingCalendar("2026-12-31")!.nextWeek.Monday).toBe("2027-01-04");
  });

  it("does not invent a calendar for missing or invalid dates", () => {
    expect(buildMeetingCalendar(null)).toBeNull();
    expect(buildMeetingCalendar("invalid")).toBeNull();
  });
});

describe("relative deadlines at the draft boundary", () => {
  it("resolves the working-week policy without accepting explicit or event-based dates", () => {
    expect(resolveRelativeDate("this week", "2026-06-24")).toBe("2026-06-26");
    expect(resolveRelativeDate("by Friday", "2026-06-24")).toBe("2026-06-26");
    expect(resolveRelativeDate("end of next week", "2026-12-31")).toBe("2027-01-08");
    expect(resolveRelativeDate("by tomorrow", "2028-02-29")).toBe("2028-03-01");
    for (const phrase of ["Friday June 26", "once both land", "within a day of approval", "before the review on Friday", "next week"]) {
      expect(resolveRelativeDate(phrase, "2026-06-24")).toBeNull();
    }
  });

  it("corrects a proposed date and its final reasoning paragraph while preserving scope and links", () => {
    const quote = "I'll configure the app this week.";
    const hints = buildRelativeDateHints([{ sourceQuote: quote, mentionedDueDate: "this week" }], "2026-06-24");
    const input = { taskId: 1, sourceQuote: quote, changes: {
      dueDate: "2026-06-28", dependsOn: [{ draftRef: "d1" }],
      appendNotes: "Pilot group only.\n\nDue date: Friday 2026-06-28.",
    } };
    const [call] = normaliseRelativeDraftDates([{ tool: "match_to_existing_task_draft", id: "b1", input }], hints, "2026-06-24");
    expect(call.input.changes).toEqual({
      dueDate: "2026-06-26", dependsOn: [{ draftRef: "d1" }],
      appendNotes: "Pilot group only.\n\nDue date: 'this week' from 2026-06-24 = 2026-06-26.",
    });
    expect(input.changes.dueDate).toBe("2026-06-28");
  });

  it("does not add a deadline, reverse removal, or transfer timing to a different quotation", () => {
    const hints = [{ sourceQuote: "q", phrase: "today", date: "2026-06-24" }];
    const calls = [
      { tool: "create_task_draft", id: "1", input: { sourceQuote: "q", title: "Wait for approval" } },
      { tool: "match_to_existing_task_draft", id: "2", input: { sourceQuote: "q", changes: { dueDate: null } } },
      { tool: "create_task_draft", id: "3", input: { sourceQuote: "different", dueDate: "2026-07-01" } },
    ];
    expect(normaliseRelativeDraftDates(calls, hints, "2026-06-24")).toEqual(calls);
    expect(buildRelativeDateHints([{ sourceQuote: "q", mentionedDueDate: "today" }, { sourceQuote: "q", mentionedDueDate: "tomorrow" }], "2026-06-24")).toEqual([]);
  });
});
