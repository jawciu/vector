/** Pure helper: compute onboarding health from tasks. No DB.
 *  Returns "Blocked" | "At risk" | "On track".
 *  "Blocked" is derived from blockedByTask or waitingOn, not stored as a status. */
export function computeHealth(tasks) {
  const total = tasks.length;
  if (total === 0) return "On track";
  const blockedCount = tasks.filter((t) => {
    if (t.blockedByTask && t.blockedByTask.status !== "Done") return true;
    if (t.waitingOn && t.waitingOn.trim() !== "") return true;
    return false;
  }).length;
  if (blockedCount === total) return "Blocked";
  if (blockedCount > 0) return "At risk";
  return "On track";
}
