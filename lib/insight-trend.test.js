import { describe, it, expect } from "vitest";
import { TREND_VALUES, DEFAULT_TREND, normaliseTrend } from "@/lib/insight-trend";

describe("normaliseTrend", () => {
  it("passes the three trend values through unchanged", () => {
    for (const value of TREND_VALUES) {
      expect(normaliseTrend(value)).toBe(value);
    }
  });

  it("maps legacy cached vocabulary onto a trend", () => {
    expect(normaliseTrend("Declining")).toBe("declining");
    expect(normaliseTrend("Improving")).toBe("improving");
    expect(normaliseTrend("At risk")).toBe("declining");
    expect(normaliseTrend("On track")).toBe("steady");
  });

  it("ignores case and surrounding whitespace", () => {
    expect(normaliseTrend("  IMPROVING ")).toBe("improving");
    expect(normaliseTrend("at RISK")).toBe("declining");
  });

  it("returns null for anything it does not recognise", () => {
    expect(normaliseTrend("Blocked")).toBeNull();
    expect(normaliseTrend("")).toBeNull();
    expect(normaliseTrend(undefined)).toBeNull();
    expect(normaliseTrend(null)).toBeNull();
    expect(normaliseTrend(3)).toBeNull();
  });

  it("never returns a health word", () => {
    const health = ["On track", "At risk", "Blocked"];
    for (const value of [...TREND_VALUES, ...health, "nonsense"]) {
      expect(health).not.toContain(normaliseTrend(value));
    }
  });

  it("offers a neutral fallback for unrecognised values", () => {
    expect(TREND_VALUES).toContain(DEFAULT_TREND);
    expect(normaliseTrend("gibberish") ?? DEFAULT_TREND).toBe("steady");
  });
});
