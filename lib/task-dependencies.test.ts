import { describe, it, expect } from "vitest";
import {
  normaliseDependsOn,
  cleanDependencyLabel,
  filterDependsOn,
  splitDependsOn,
  isDependencyOpen,
  MAX_DEPENDENCIES,
  draftDependsOn,
} from "./task-dependencies";

describe("normaliseDependsOn", () => {
  it("accepts a list of task and text items, in order", () => {
    expect(normaliseDependsOn([{ taskId: 4 }, { text: "platform team sign-off" }])).toEqual([
      { taskId: 4 },
      { text: "platform team sign-off" },
    ]);
  });

  it("accepts a single object, as the answer key and older payloads write it", () => {
    expect(normaliseDependsOn({ text: "legal review" })).toEqual([{ text: "legal review" }]);
  });

  it("folds the legacy blockedByTaskId in first", () => {
    expect(normaliseDependsOn([{ text: "x approval" }], 9)).toEqual([{ taskId: 9 }, { text: "x approval" }]);
    expect(normaliseDependsOn(undefined, "12")).toEqual([{ taskId: 12 }]);
    expect(normaliseDependsOn(undefined, null)).toEqual([]);
  });

  it("de-duplicates tasks and case-insensitive text", () => {
    expect(
      normaliseDependsOn([{ taskId: 4 }, { taskId: 4 }, { text: "Sign-off" }, { text: "sign-off " }], 4)
    ).toEqual([{ taskId: 4 }, { text: "Sign-off" }]);
  });

  it("drops malformed entries and never passes NaN or non-positive ids", () => {
    expect(
      normaliseDependsOn([null, 3, {}, { taskId: "abc" }, { taskId: -1 }, { taskId: 1.5 }, { text: "   " }, { taskId: 0 }])
    ).toEqual([]);
    expect(normaliseDependsOn("not a list")).toEqual([]);
  });

  it("keeps the task when an item has both (the text then describes it)", () => {
    expect(normaliseDependsOn([{ taskId: 3, text: "the export" }])).toEqual([{ taskId: 3 }]);
  });

  it("reads `label` and bare strings as text", () => {
    expect(normaliseDependsOn([{ label: "budget approval" }, "vendor contract"])).toEqual([
      { text: "budget approval" },
      { text: "vendor contract" },
    ]);
  });

  it("caps the list", () => {
    const many = Array.from({ length: 20 }, (_, i) => ({ taskId: i + 1 }));
    expect(normaliseDependsOn(many)).toHaveLength(MAX_DEPENDENCIES);
  });
});

describe("cleanDependencyLabel", () => {
  it("collapses whitespace and strips an old 'Blocked by:' prefix", () => {
    expect(cleanDependencyLabel("  Blocked by:   security\n review ")).toBe("security review");
  });
  it("cuts long labels to fit the database limit", () => {
    const out = cleanDependencyLabel("word ".repeat(100))!;
    expect(out.length).toBeLessThanOrEqual(200);
    expect(out.endsWith("…")).toBe(true);
  });
  it("returns null for nothing", () => {
    expect(cleanDependencyLabel("")).toBeNull();
    expect(cleanDependencyLabel(42)).toBeNull();
  });
});

describe("filterDependsOn / splitDependsOn", () => {
  it("drops task ids outside the allowed set and keeps all text", () => {
    const { kept, dropped } = filterDependsOn([{ taskId: 1 }, { taskId: 2 }, { text: "t" }], new Set([2]));
    expect(kept).toEqual([{ taskId: 2 }, { text: "t" }]);
    expect(dropped).toEqual([1]);
  });
  it("splits ids from text", () => {
    expect(splitDependsOn([{ taskId: 1 }, { text: "a" }])).toEqual({ taskIds: [1], texts: ["a"] });
  });
});

describe("isDependencyOpen", () => {
  it("a task blocker is open until its task is Done", () => {
    expect(isDependencyOpen({ blockedByTask: { status: "In progress" } })).toBe(true);
    expect(isDependencyOpen({ blockedByTask: { status: "Done" } })).toBe(false);
  });
  it("a text blocker is open until ticked off", () => {
    expect(isDependencyOpen({ label: "sign-off", resolvedAt: null })).toBe(true);
    expect(isDependencyOpen({ label: "sign-off", resolvedAt: "2026-10-01T00:00:00Z" })).toBe(false);
  });
});

describe("draftDependsOn", () => {
  it("a stored list wins, even empty, over a legacy blockedByTaskId", () => {
    expect(draftDependsOn({ dependsOn: [], blockedByTaskId: 7 })).toEqual([]);
    expect(draftDependsOn({ dependsOn: [{ text: "a" }], blockedByTaskId: 7 })).toEqual([{ text: "a" }]);
  });
  it("a legacy draft falls back to its single blocker", () => {
    expect(draftDependsOn({ blockedByTaskId: 7 })).toEqual([{ taskId: 7 }]);
    expect(draftDependsOn(null)).toEqual([]);
  });
});
