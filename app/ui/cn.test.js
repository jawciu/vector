import { describe, expect, it } from "vitest";
import { cn } from "./cn";

// Pins the peer-review finding (2026-08-11): tailwind-merge used to classify
// .text-btn / .text-btn-action / .text-btn-danger as competing text-colour
// utilities and silently drop all but the last, breaking Button's text
// variant. The custom class groups in cn.ts keep them intact.
describe("cn", () => {
  it("keeps the text-btn base class alongside its tone classes", () => {
    expect(cn("text-btn", "text-btn-action")).toBe("text-btn text-btn-action");
    expect(cn("text-btn", "text-btn-danger")).toBe("text-btn text-btn-danger");
  });

  it("still lets caller utilities beat component defaults", () => {
    expect(cn("font-semibold", "font-normal")).toBe("font-normal");
    expect(cn("text-action", "text-danger")).toBe("text-danger");
  });

  it("does not let a real text-colour utility eat the custom classes", () => {
    expect(cn("text-btn text-btn-action", "text-danger")).toBe(
      "text-btn text-btn-action text-danger"
    );
  });
});
