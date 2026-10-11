import { readFileSync } from "node:fs";

/**
 * The onboarding the e2e specs run against, resolved dynamically by
 * prisma/seed-ai-test-fixtures.js during global-setup and written to
 * e2e/.auth/target.json ({ companyId, prefix, onboardingId, phaseId }).
 * Specs read it from here so seed script and assertions can never drift.
 */
export type E2ETarget = {
  companyId: number;
  prefix: string;
  onboardingId: number;
  phaseId: number;
};

export function loadTarget(): E2ETarget {
  try {
    return JSON.parse(readFileSync("e2e/.auth/target.json", "utf8"));
  } catch {
    throw new Error(
      "e2e/.auth/target.json missing — global-setup (seed-ai-test-fixtures) must run first."
    );
  }
}
