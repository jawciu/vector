import "dotenv/config";
import { execSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { ensureTestUser } from "./test-user.js";

/** Provision the e2e auth user, seed AI-draft fixtures, ensure auth dir. */
export default async function globalSetup() {
  mkdirSync("e2e/.auth", { recursive: true });
  await ensureTestUser();
  execSync("npx tsx prisma/seed-ai-test-fixtures.js", { stdio: "inherit" });
}
