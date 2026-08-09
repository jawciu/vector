/**
 * DsMeta — the judgement half of every primitive's documentation.
 *
 * The props type says what's POSSIBLE; the colocated `<Component>.meta.ts`
 * says what's INTENDED: when to reach for the component, when not to, and the
 * accessibility contract it upholds. Agents grep these as plain TS; Storybook
 * renders them into each component's autodocs page (see dsMetaDescription).
 *
 * Every file in app/ui MUST have one. `status` drives trust: agents should
 * prefer `stable`, treat `experimental` as subject to change, and never adopt
 * `deprecated` into new code.
 */

export type DsStatus = "stable" | "experimental" | "deprecated";

export interface DsMeta {
  status: DsStatus;
  /** Situations this component is the blessed answer for. */
  useWhen: string[];
  /** Situations that look right but aren't — name the alternative. */
  dontUseWhen: string[];
  /** The a11y contract the component upholds (and callers must not break). */
  a11y: string[];
  /** DESIGN.md tokens this component is built from (for traceability). */
  tokens?: string[];
}

/** Renders a DsMeta into the markdown shown at the top of the autodocs page. */
export function dsMetaDescription(meta: DsMeta): string {
  const list = (items: string[]) => items.map((i) => `- ${i}`).join("\n");
  return [
    `**Status: ${meta.status}**`,
    "",
    "**Use when**",
    list(meta.useWhen),
    "",
    "**Don't use when**",
    list(meta.dontUseWhen),
    "",
    "**Accessibility contract**",
    list(meta.a11y),
    ...(meta.tokens?.length ? ["", `**Tokens:** ${meta.tokens.join(", ")}`] : []),
  ].join("\n");
}
