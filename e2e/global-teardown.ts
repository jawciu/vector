import { execSync } from "node:child_process";

/** Remove tagged AI-draft fixtures + any tasks the approve specs created. */
export default async function globalTeardown() {
  execSync("npx tsx prisma/seed-ai-test-fixtures.js --clean", { stdio: "inherit" });
}
