import { describe, expect, it } from "vitest";
import { TASK_STATUSES } from "@/lib/constants";
import { STATUS_COLOR } from "./Badge";

// Badge owns the task status to colour mapping. This pins its keys to the
// app's status list so a new status cannot ship without a badge colour.
describe("Badge STATUS_COLOR", () => {
  it("covers every task status, and nothing else", () => {
    expect(Object.keys(STATUS_COLOR).sort()).toEqual([...TASK_STATUSES].sort());
  });
});
