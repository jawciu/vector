import type { DsMeta } from "./ds-meta";

export const meta: DsMeta = {
  status: "experimental",
  useWhen: [
    "Any labelled form row: create/edit modal bodies, settings forms, the Phase 7 retrofit of the ~39 hand-rolled inputs.",
    "Wrapping exactly one TextField / Textarea / Select — Field owns the label, help and error copy plus all id/aria wiring.",
    "Validation errors: pass `error` and Field flips the control invalid and announces the message — don't hand-roll a red div.",
  ],
  dontUseWhen: [
    "Drawer detail rows (icon + value, no label copy) — use FieldRow.",
    "Pill-shaped dropdown triggers inside modals (due date, priority) — use FieldPill.",
    "Search fields — use SearchField (it owns its own icon + input layout, no Field wrapper).",
    "The local `<Field>` helpers inside TeamPanel.js / FollowUpModal.js are unrelated namesakes, not consumers of this primitive (retrofit is Phase 7's job).",
  ],
  a11y: [
    "useId wires label→control (htmlFor/id): clicking the label focuses the control and screen readers can name it. A child's own `id` wins over the generated one.",
    "`help` is announced via aria-describedby on the control.",
    "`error` sets aria-invalid + aria-errormessage on the control; the error id also rides in aria-describedby as a fallback for patchy aria-errormessage support.",
    "`required` renders an aria-hidden asterisk and sets native `required` on the control, so assistive tech hears it from the element itself, not the decoration.",
  ],
  tokens: ["smallLabel (typography)", "textMuted", "danger", "spacing.xs (4px stack gap)"],
};
