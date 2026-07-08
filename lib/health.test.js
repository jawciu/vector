import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { computeHealth } from "./health.js";

// computeHealth reads the real clock, so every test runs against a frozen
// "now" — otherwise overdue/velocity results would drift day by day.
const NOW = new Date("2026-07-08T12:00:00");

const task = (overrides = {}) => ({ status: "Todo", due: null, ...overrides });

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("computeHealth", () => {
  it("returns On track with no reasons for an empty task list", () => {
    expect(computeHealth([])).toEqual({ status: "On track", reasons: [] });
  });

  it("returns On track when no tasks are blocked or overdue", () => {
    const result = computeHealth([task(), task({ status: "Done" })]);
    expect(result).toEqual({ status: "On track", reasons: [] });
  });

  describe("blocked tasks", () => {
    it("is At risk when under 30% of tasks are blocked", () => {
      const tasks = [task({ status: "Blocked" }), task(), task(), task()];
      const result = computeHealth(tasks);
      expect(result.status).toBe("At risk");
      expect(result.reasons).toContain("1 task blocked");
    });

    it("pluralises the blocked reason for multiple blocked tasks", () => {
      const tasks = [
        task({ status: "Blocked" }),
        task({ status: "Blocked" }),
        ...Array.from({ length: 5 }, () => task()),
      ];
      const result = computeHealth(tasks);
      expect(result.status).toBe("At risk");
      expect(result.reasons).toContain("2 tasks blocked");
    });

    it("is Blocked at exactly the 30% threshold", () => {
      const tasks = [
        task({ status: "Blocked" }),
        task({ status: "Blocked" }),
        task({ status: "Blocked" }),
        ...Array.from({ length: 7 }, () => task()),
      ];
      const result = computeHealth(tasks);
      expect(result.status).toBe("Blocked");
      expect(result.reasons).toContain("3 of 10 tasks blocked");
    });

    it("is Blocked when every task is blocked", () => {
      const result = computeHealth([task({ status: "Blocked" })]);
      expect(result.status).toBe("Blocked");
    });
  });

  describe("overdue tasks", () => {
    it("ignores a single task overdue by less than 7 days", () => {
      const result = computeHealth([task({ due: "2026-07-05" })]);
      expect(result).toEqual({ status: "On track", reasons: [] });
    });

    it("is At risk when a task is overdue by 7+ days", () => {
      const result = computeHealth([task({ due: "2026-06-30" })]);
      expect(result.status).toBe("At risk");
      expect(result.reasons).toContain("1 task overdue by 7d");
    });

    it("is At risk when 3+ tasks are overdue, however recently", () => {
      const tasks = [
        task({ due: "2026-07-07" }),
        task({ due: "2026-07-07" }),
        task({ due: "2026-07-07" }),
      ];
      const result = computeHealth(tasks);
      expect(result.status).toBe("At risk");
      expect(result.reasons).toContain("3 tasks overdue");
    });

    it("does not treat Done tasks as overdue", () => {
      const result = computeHealth([
        task({ status: "Done", due: "2026-06-01" }),
      ]);
      expect(result).toEqual({ status: "On track", reasons: [] });
    });

    it("does not treat a task due today as overdue", () => {
      const result = computeHealth([task({ due: "2026-07-08" })]);
      expect(result).toEqual({ status: "On track", reasons: [] });
    });

    it("keeps Blocked status but still reports the overdue reason", () => {
      const tasks = [
        task({ status: "Blocked" }),
        task({ due: "2026-06-01" }),
      ];
      const result = computeHealth(tasks);
      expect(result.status).toBe("Blocked");
      expect(result.reasons).toContain("1 of 2 tasks blocked");
      expect(result.reasons).toContain("1 task overdue by 36d");
    });
  });

  describe("velocity (targetGoLive + createdAt)", () => {
    const dates = {
      createdAt: "2026-06-24T12:00:00", // 14 days before NOW
      targetGoLive: "2026-07-18T12:00:00", // 10 days after NOW
    };

    it("is At risk when nothing has been completed since kickoff", () => {
      const result = computeHealth([task(), task()], dates);
      expect(result.status).toBe("At risk");
      expect(result.reasons).toContain("No tasks completed in 14d");
    });

    it("is At risk when the completion rate won't hit go-live", () => {
      // 2 done in 14 days, 8 remaining → ~56 days needed, 10 available
      const tasks = [
        task({ status: "Done" }),
        task({ status: "Done" }),
        ...Array.from({ length: 8 }, () => task()),
      ];
      const result = computeHealth(tasks, dates);
      expect(result.status).toBe("At risk");
      expect(result.reasons).toContain(
        "Behind pace — 8 tasks left, 10d to go-live"
      );
    });

    it("stays On track when the pace is sufficient", () => {
      // 9 done in 14 days, 1 remaining → well ahead of the 10-day runway
      const tasks = [
        ...Array.from({ length: 9 }, () => task({ status: "Done" })),
        task(),
      ];
      expect(computeHealth(tasks, dates)).toEqual({
        status: "On track",
        reasons: [],
      });
    });

    it("skips the pace check when everything is done", () => {
      const tasks = [task({ status: "Done" })];
      expect(computeHealth(tasks, dates)).toEqual({
        status: "On track",
        reasons: [],
      });
    });

    it("skips the pace check in the first week", () => {
      const result = computeHealth([task()], {
        createdAt: "2026-07-05T12:00:00", // 3 days before NOW
        targetGoLive: "2026-07-18T12:00:00",
      });
      expect(result).toEqual({ status: "On track", reasons: [] });
    });

    it("is At risk past the go-live date with open tasks", () => {
      const result = computeHealth([task()], {
        createdAt: "2026-06-24T12:00:00",
        targetGoLive: "2026-07-01T12:00:00", // a week ago
      });
      expect(result.status).toBe("At risk");
      expect(result.reasons).toContain("Past go-live date with open tasks");
    });

    it("is fine past the go-live date when all tasks are done", () => {
      const result = computeHealth([task({ status: "Done" })], {
        createdAt: "2026-06-24T12:00:00",
        targetGoLive: "2026-07-01T12:00:00",
      });
      expect(result).toEqual({ status: "On track", reasons: [] });
    });

    it("skips the velocity check entirely without a targetGoLive", () => {
      const result = computeHealth([task()], {
        createdAt: "2026-06-24T12:00:00",
      });
      expect(result).toEqual({ status: "On track", reasons: [] });
    });

    it("does not downgrade Blocked to At risk when also behind pace", () => {
      const result = computeHealth(
        [task({ status: "Blocked" }), task()],
        dates
      );
      expect(result.status).toBe("Blocked");
      expect(result.reasons).toContain("No tasks completed in 14d");
    });
  });
});
