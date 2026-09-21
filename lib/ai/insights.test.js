import { describe, it, expect } from "vitest";
import { buildInsightRequest, INSIGHT_MODEL, getInsightSchema } from "./insights.js";

// One request definition, two callers (the streaming route and the nightly
// warm-up). If these drift, a warmed insight stops being the insight the page
// would have generated.
describe("buildInsightRequest", () => {
  const snapshot = { facts: { tasksDone: 4 } };
  const today = new Date("2026-09-21T05:17:00.000Z");

  it("carries the model, the scope's schema and the snapshot verbatim", () => {
    const req = buildInsightRequest("onboarding", snapshot, today);
    expect(req.model).toBe(INSIGHT_MODEL);
    expect(req.output_config.format.schema).toBe(getInsightSchema("onboarding"));
    expect(req.messages).toEqual([{ role: "user", content: JSON.stringify(snapshot) }]);
  });

  it("stamps today's date into the system prompt and marks it cacheable", () => {
    const [system] = buildInsightRequest("portfolio", snapshot, today).system;
    expect(system.text).toContain("2026-09-21");
    expect(system.text).not.toContain("{{TODAY}}");
    expect(system.cache_control).toEqual({ type: "ephemeral" });
  });

  it("uses a different schema per scope", () => {
    expect(buildInsightRequest("portfolio", snapshot, today).output_config.format.schema)
      .not.toBe(buildInsightRequest("onboarding", snapshot, today).output_config.format.schema);
  });
});
