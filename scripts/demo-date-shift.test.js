/**
 * Date maths for the demo date shift. A fixed clock throughout. The whole
 * point of the script is that "today" decides everything.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  compile,
  daysBetweenUTC,
  isoDate,
  resolveAnchor,
  shiftDueString,
  shiftIso,
  shiftSnapshot,
  statements,
  utcMidnight,
} from "./demo-date-shift.mjs";

const TODAY = "2026-09-13T11:47:00.000Z";

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(TODAY));
});
afterEach(() => vi.useRealTimers());

describe("delta", () => {
  it("counts whole UTC days between the anchor and today", () => {
    expect(daysBetweenUTC("2026-07-12", isoDate(new Date()))).toBe(63);
  });

  it("ignores time of day on both ends", () => {
    expect(daysBetweenUTC("2026-07-12T23:59:59.999Z", "2026-07-13T00:00:00.001Z")).toBe(1);
    expect(daysBetweenUTC("2026-07-12T00:00:00Z", "2026-07-12T23:59:59Z")).toBe(0);
  });

  it("crosses months and years", () => {
    expect(daysBetweenUTC("2026-12-30", "2027-01-02")).toBe(3);
    expect(daysBetweenUTC("2028-02-28", "2028-03-01")).toBe(2); // 2028 is a leap year
  });

  it("is negative when the anchor is in the future", () => {
    expect(daysBetweenUTC("2026-09-20", "2026-09-13")).toBe(-7);
  });

  it("takes midnight UTC regardless of the machine's timezone", () => {
    expect(utcMidnight("2026-07-12T23:30:00.000Z")).toBe(Date.UTC(2026, 6, 12));
  });
});

describe("due strings", () => {
  it("reformats YYYY-MM-DD and keeps the format", () => {
    expect(shiftDueString("2026-07-01", 63)).toBe("2026-09-02");
    expect(shiftDueString("2026-12-30", 3)).toBe("2027-01-02");
    expect(shiftDueString("2028-02-28", 2)).toBe("2028-03-01");
  });

  it("leaves anything it cannot parse alone", () => {
    // The live demo carries 14 empty due strings.
    expect(shiftDueString("", 63)).toBe("");
    expect(shiftDueString("next Tuesday", 63)).toBe("next Tuesday");
    expect(shiftDueString(null, 63)).toBe(null);
    expect(shiftDueString(undefined, 63)).toBe(undefined);
  });

  it("never drifts a day when the shift crosses a DST change", () => {
    // Europe/London leaves BST on 2026-10-25. Pure UTC maths must not care.
    expect(shiftDueString("2026-10-20", 10)).toBe("2026-10-30");
  });
});

describe("timestamps", () => {
  it("preserves time of day", () => {
    expect(shiftIso("2026-07-10T09:37:35.041Z", 63)).toBe("2026-09-11T09:37:35.041Z");
  });

  it("passes null and undefined through", () => {
    expect(shiftIso(null, 63)).toBe(null);
    expect(shiftIso(undefined, 63)).toBe(undefined);
  });
});

describe("the anchor", () => {
  it("prefers dateAnchor", () => {
    expect(resolveAnchor({ dateAnchor: "2026-08-01", capturedAt: "2026-07-12T16:10:42.394Z" }))
      .toBe("2026-08-01");
  });

  it("falls back to the day the snapshot was captured", () => {
    expect(resolveAnchor({ capturedAt: "2026-07-12T16:10:42.394Z" })).toBe("2026-07-12");
  });

  it("throws when there is nothing to anchor on", () => {
    expect(() => resolveAnchor({})).toThrow(/dateAnchor/);
  });
});

describe("snapshot rewrite", () => {
  const snapshot = {
    capturedAt: "2026-07-12T16:10:42.394Z",
    companies: [
      {
        prefix: "RAY",
        onboardings: [
          {
            key: "RAY|2026-07-03T09:37:35.042Z",
            createdAt: "2026-07-03T09:37:35.042Z",
            targetGoLive: "2026-09-18T09:37:35.042Z",
            phases: [{ name: "Kickoff", targetDate: "2026-07-10T09:37:35.042Z" }],
            tasks: [
              { key: "RAY-1", number: 1, due: "2026-07-01" },
              { key: "RAY-2", number: 2, due: "" },
            ],
          },
        ],
      },
    ],
  };

  it("shifts every date it holds and recomputes the onboarding key", () => {
    const out = shiftSnapshot(snapshot, 63, "2026-09-13");
    const ob = out.companies[0].onboardings[0];
    expect(ob.createdAt).toBe("2026-09-04T09:37:35.042Z");
    expect(ob.key).toBe("RAY|2026-09-04T09:37:35.042Z");
    expect(ob.targetGoLive).toBe("2026-11-20T09:37:35.042Z");
    expect(ob.phases[0].targetDate).toBe("2026-09-11T09:37:35.042Z");
    expect(ob.tasks[0].due).toBe("2026-09-02");
    expect(ob.tasks[1].due).toBe("");
  });

  it("re-anchors to today, so a second run the same day is a no-op", () => {
    const once = shiftSnapshot(snapshot, 63, "2026-09-13");
    expect(resolveAnchor(once)).toBe("2026-09-13");
    expect(daysBetweenUTC(resolveAnchor(once), isoDate(new Date()))).toBe(0);
  });

  it("composes: two shifts equal one shift of the sum", () => {
    const twice = shiftSnapshot(shiftSnapshot(snapshot, 30, "2026-08-11"), 33, "2026-09-13");
    const once = shiftSnapshot(snapshot, 63, "2026-09-13");
    expect(twice).toEqual(once);
  });

  it("shifts the collections a newer capture adds", () => {
    const rich = {
      capturedAt: "2026-09-13T00:00:00.000Z",
      companies: [{
        prefix: "RAY",
        onboardings: [{
          key: "RAY|2026-09-04T09:00:00.000Z",
          createdAt: "2026-09-04T09:00:00.000Z",
          updatedAt: "2026-09-11T09:00:00.000Z",
          targetGoLive: null,
          phases: [],
          tasks: [],
          contacts: [{ email: "a@b.c", lastSeenPortalAt: "2026-09-10T09:00:00.000Z", bouncedAt: null }],
          comments: [{ key: "k", createdAt: "2026-09-01T09:00:00.000Z" }],
          files: [{ key: "f", createdAt: "2026-09-02T09:00:00.000Z" }],
          magicLinks: [{ token: "t", createdAt: "2026-09-03T09:00:00.000Z", expiresAt: "2026-10-03T09:00:00.000Z", revokedAt: null, lastUsedAt: null, sentAt: null }],
          activity: [{ key: "a", createdAt: "2026-09-05T09:00:00.000Z" }],
          notifications: [{ key: "n", createdAt: "2026-09-06T09:00:00.000Z", readAt: null, archivedAt: null }],
          drafts: [{ key: "d", createdAt: "2026-09-07T09:00:00.000Z", resolvedAt: "2026-09-08T09:00:00.000Z" }],
        }],
      }],
    };
    const o = shiftSnapshot(rich, 10, "2026-09-23").companies[0].onboardings[0];
    expect(o.updatedAt).toBe("2026-09-21T09:00:00.000Z");
    expect(o.contacts[0].lastSeenPortalAt).toBe("2026-09-20T09:00:00.000Z");
    expect(o.comments[0].createdAt).toBe("2026-09-11T09:00:00.000Z");
    expect(o.files[0].createdAt).toBe("2026-09-12T09:00:00.000Z");
    expect(o.magicLinks[0].expiresAt).toBe("2026-10-13T09:00:00.000Z");
    expect(o.activity[0].createdAt).toBe("2026-09-15T09:00:00.000Z");
    expect(o.notifications[0].createdAt).toBe("2026-09-16T09:00:00.000Z");
    expect(o.drafts[0].resolvedAt).toBe("2026-09-18T09:00:00.000Z");
    // The magic-link token is identity, not a date.
    expect(o.magicLinks[0].token).toBe("t");
  });

  it("leaves the original untouched", () => {
    shiftSnapshot(snapshot, 63, "2026-09-13");
    expect(snapshot.companies[0].onboardings[0].createdAt).toBe("2026-07-03T09:37:35.042Z");
  });
});

describe("placeholder compilation", () => {
  // Each statement touches a different subset of the parameters, and Postgres
  // rejects a bind whose count does not match the statement. Named
  // placeholders are what stop that being a runtime-only surprise.
  const ctx = { delta: 63, anchor: "A", obIds: [1, 2], companyIds: [3], fixtureIds: ["x"] };

  it("numbers placeholders in order of first use and returns only those", () => {
    const { sql, params } = compile(
      `SELECT {{obIds}}::int[], {{delta}}::int, {{obIds}}::int[]`,
      ctx
    );
    expect(sql).toBe("SELECT $1::int[], $2::int, $1::int[]");
    expect(params).toEqual([[1, 2], 63]);
  });

  it("leaves casts and to_char masks alone", () => {
    const { sql, params } = compile(
      `to_char(x, 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AND y = {{anchor}}::timestamptz`,
      ctx
    );
    expect(sql).toBe(`to_char(x, 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AND y = $1::timestamptz`);
    expect(params).toEqual(["A"]);
  });

  it("throws on a placeholder the context does not define", () => {
    expect(() => compile("SELECT {{nope}}", ctx)).toThrow(/nope/);
  });
});

describe("shiftSnapshot keeps child keys in step with their dates", () => {
  // demo-snapshot.js matches comments, activity, notifications, drafts and
  // files on a key that embeds iso(createdAt). If the key is not rewritten
  // with the date, restore-state deletes every seeded child row.
  const snapshot = {
    capturedAt: "2026-09-13T12:57:52.898Z",
    companies: [{
      prefix: "RAY",
      onboardings: [{
        key: "RAY|2026-09-04T09:37:35.042Z",
        createdAt: "2026-09-04T09:37:35.042Z",
        phases: [], tasks: [],
        comments: [{ key: "RAY-1|2026-09-05T09:37:35.041Z|Maya Lindqvist", createdAt: "2026-09-05T09:37:35.041Z" }],
        activity: [{ key: "created|task|1206|2026-09-04T14:25:35.041Z", createdAt: "2026-09-04T14:25:35.041Z" }],
        notifications: [{ key: "63:c122:2972817|vendor|2026-09-11T13:34:49.924Z", groupKey: "63:c122:2972817", createdAt: "2026-09-11T13:34:49.924Z" }],
        drafts: [{ key: "draft_followup|2026-08-03T08:38:47.125Z|overdue by 10 days#2", createdAt: "2026-08-03T08:38:47.125Z" }],
        files: [{ key: "spec.pdf|2026-09-06T10:00:00.000Z", createdAt: "2026-09-06T10:00:00.000Z" }],
      }],
    }],
  };
  const out = shiftSnapshot(snapshot, 1, "2026-09-14");
  const ob = out.companies[0].onboardings[0];

  it("rewrites the comment, activity, draft and file keys", () => {
    expect(ob.comments[0].key).toBe("RAY-1|2026-09-06T09:37:35.041Z|Maya Lindqvist");
    expect(ob.activity[0].key).toBe("created|task|1206|2026-09-05T14:25:35.041Z");
    expect(ob.drafts[0].key).toBe("draft_followup|2026-08-04T08:38:47.125Z|overdue by 10 days#2");
    expect(ob.files[0].key).toBe("spec.pdf|2026-09-07T10:00:00.000Z");
  });

  it("rewrites only the date part of a notification key, the groupKey bucket is not shifted in the database", () => {
    expect(ob.notifications[0].key).toBe("63:c122:2972817|vendor|2026-09-12T13:34:49.924Z");
    expect(ob.notifications[0].groupKey).toBe("63:c122:2972817");
  });

  it("still shifts the dates themselves", () => {
    expect(ob.comments[0].createdAt).toBe("2026-09-06T09:37:35.041Z");
    expect(ob.createdAt).toBe("2026-09-05T09:37:35.042Z");
    expect(ob.key).toBe("RAY|2026-09-05T09:37:35.042Z");
  });
});

describe("shift SQL never clamps a NULL timestamp to now()", () => {
  // Postgres LEAST() ignores NULLs, so LEAST(NULL + iv, now()) is now(). On the
  // nullable columns that meant: every live magic link revoked, every unread
  // notification read + archived, every unprocessed event processed.
  const sql = statements().map((s) => s.sql).join("\n");
  const nullable = ['"readAt"', '"archivedAt"', '"lastUsedAt"', '"revokedAt"', '"processedAt"', '"resolvedAt"'];
  const esc = (c) => c.replace(/"/g, '\\"');
  for (const col of nullable) {
    it(`guards every LEAST on ${col} with an IS NULL branch`, () => {
      const least = (sql.match(new RegExp(`LEAST\\((?:n\\.)?${esc(col)}\\s*\\+`, "g")) ?? []).length;
      const guarded = (sql.match(new RegExp(`CASE WHEN (?:n\\.)?${esc(col)} IS NULL THEN NULL ELSE LEAST\\((?:n\\.)?${esc(col)}\\s*\\+`, "g")) ?? []).length;
      expect(least).toBeGreaterThan(0);
      expect(guarded).toBe(least);
    });
  }
});
