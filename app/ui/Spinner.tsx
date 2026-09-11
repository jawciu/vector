/**
 * Spinner — DS primitive
 *
 * The `.btn-spinner` visual (globals.css) as a standalone: a 1em circular
 * track spun by CSS, sized here via `fontSize` so one number controls the
 * whole ring. Standalone spinners default to the action lilac (Caroline's
 * ruling, 2026-08-11); inside Button the raw class keeps `currentColor` so
 * the ring matches the button's text colour.
 *
 * Button.tsx keeps rendering the class internally for its `loading` state;
 * this component exists for loading affordances OUTSIDE a button (panel
 * fetches, inline waits) so nobody hand-rolls a second spinner.
 *
 * `aria-label` decides the semantics: with a label the spinner is a live
 * `role="status"` region a screen reader announces; without one it is
 * decorative (`aria-hidden`) and the surrounding context must carry the
 * loading message.
 */

export interface SpinnerProps {
  /** Diameter in px (sets `fontSize`; the class is 1em-based). Default 16. */
  size?: number;
  /** Announce the spinner (role="status"). Omit when context already says "loading". */
  "aria-label"?: string;
}

export default function Spinner({
  size = 16,
  "aria-label": ariaLabel,
}: SpinnerProps) {
  return (
    <span
      // inline-block: .btn-spinner has no display rule — inside Button the
      // flex parent blockifies it, but standalone an inline span would
      // ignore the 1em width/height and collapse.
      className="btn-spinner inline-block text-action"
      style={{ fontSize: size }}
      role={ariaLabel ? "status" : undefined}
      aria-label={ariaLabel}
      aria-hidden={ariaLabel ? undefined : true}
    />
  );
}
