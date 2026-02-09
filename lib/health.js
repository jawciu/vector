/** Pure helper: compute onboarding health from tasks. No DB.
 *  Returns "Blocked" | "At risk" | "On track". */
export function computeHealth(tasks) {
  const total = tasks.length;
  if (total === 0) return "On track";
  const blockedCount = tasks.filter((t) => t.status === "Blocked").length;
  // All tasks blocked → Blocked; some blocked → At risk; none → On track
  if (blockedCount === total) return "Blocked";
  if (blockedCount > 0) return "At risk";
  return "On track";
}
