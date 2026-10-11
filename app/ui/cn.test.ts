import { describe, expect, it } from "vitest";
import { cn } from "./cn";

// Pins the peer-review finding (2026-08-11): tailwind-merge eats custom
// classes whose names look like utilities. The DS keeps its named classes
// outside the utility namespace (.btn-*), and cn.ts keeps a registration
// hook for any that cannot be.
describe("cn", () => {
  it("passes the .btn-* named classes through untouched", () => {
    expect(cn("btn-tertiary", "btn-tertiary--danger")).toBe(
      "btn-tertiary btn-tertiary--danger"
    );
  });

  it("still lets caller utilities beat component defaults", () => {
    expect(cn("font-semibold", "font-normal")).toBe("font-normal");
    expect(cn("text-action", "text-danger")).toBe("text-danger");
  });

  it("does not let a real text-colour utility eat a named class", () => {
    expect(cn("btn-tertiary btn-tertiary--danger", "text-danger")).toBe(
      "btn-tertiary btn-tertiary--danger text-danger"
    );
  });
});
