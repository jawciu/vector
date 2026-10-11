import { describe, expect, it } from "vitest";
import { TASK_STATUSES } from "@/lib/constants";
import { STATUS_COLOR, HEALTH_COLOR } from "./Badge";

// Badge owns the task status to colour mapping. This pins its keys to the
// app's status list so a new status cannot ship without a badge colour.
describe("Badge STATUS_COLOR", () => {
  it("covers every task status, and nothing else", () => {
    expect(Object.keys(STATUS_COLOR).sort()).toEqual([...TASK_STATUSES].sort());
  });
});

// Badge also owns health to colour, so the list, the board header and the AI
// card headers cannot drift apart. Pinned to what computeHealth returns.
describe("Badge HEALTH_COLOR", () => {
  it("covers every health state, and nothing else", () => {
    expect(Object.keys(HEALTH_COLOR).sort()).toEqual(["At risk", "Blocked", "On track"]);
  });

  it("uses the same three ramps as the AI trend pill", () => {
    expect(HEALTH_COLOR).toEqual({ "On track": "success", "At risk": "alert", Blocked: "danger" });
  });
});
