import { cleanDraftRef, draftDependsOn, isDraftLink } from "./task-dependencies";

type OrderableDraft = {
  id: number;
  action: string;
  sourceEventId: number | null;
  onboardingId: number | null;
  payload: Record<string, unknown> | null;
};

/** Prerequisites precede their dependents within the same meeting/onboarding.
 *  Keep the incoming order wherever no dependency requires a move. Missing
 *  references and text labels do not create relationships. A malformed cycle
 *  keeps the original order rather than losing cards or inventing a sequence.
 *  This changes display order only; it never changes or approves a draft. */
export function orderDraftsByDependencies<T extends OrderableDraft>(drafts: T[]): T[] {
  const byId = new Map(drafts.map((draft) => [draft.id, draft]));
  const byRef = new Map<string, T | null>();
  const byTask = new Map<string, T[]>();
  const scope = (draft: T) => `${draft.onboardingId}/${draft.sourceEventId}`;
  for (const draft of drafts) {
    const ref = cleanDraftRef(draft.payload?.draftRef);
    if (draft.action === "create_task" && ref) {
      const key = `${scope(draft)}/${ref}`;
      byRef.set(key, byRef.has(key) ? null : draft);
    }
    const taskId = Number(draft.payload?.taskId);
    if (draft.action !== "create_task" && Number.isInteger(taskId) && taskId > 0) {
      const key = `${scope(draft)}/${taskId}`;
      byTask.set(key, [...(byTask.get(key) ?? []), draft]);
    }
  }

  const ordered: T[] = [];
  const visited = new Set<number>();
  const visiting = new Set<number>();
  let cycle = false;
  function visit(draft: T) {
    if (visited.has(draft.id)) return;
    if (visiting.has(draft.id)) { cycle = true; return; }
    visiting.add(draft.id);
    const changes = draft.payload?.changes;
    const payload = changes && typeof changes === "object" ? changes : draft.payload;
    for (const dependency of draftDependsOn(payload)) {
      let prerequisites: T[] = [];
      if (isDraftLink(dependency)) {
        const prerequisite = dependency.draftId != null
          ? byId.get(dependency.draftId)
          : byRef.get(`${scope(draft)}/${dependency.draftRef}`);
        if (prerequisite) prerequisites = [prerequisite];
      } else if ("taskId" in dependency) {
        prerequisites = byTask.get(`${scope(draft)}/${dependency.taskId}`) ?? [];
      }
      for (const prerequisite of prerequisites) {
        if (prerequisite.id !== draft.id && scope(prerequisite) === scope(draft)) visit(prerequisite);
      }
    }
    visiting.delete(draft.id);
    visited.add(draft.id);
    ordered.push(draft);
  }
  for (const draft of drafts) visit(draft);
  return cycle ? [...drafts] : ordered;
}
