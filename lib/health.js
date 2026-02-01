/** Pure helper: compute onboarding health from tasks. No DB. */
export function computeHealth(tasks) {
  const blockedCount = tasks.filter((t) => t.status === "Blocked").length;
  return blockedCount > 0 ? "At risk" : "On track";
}
