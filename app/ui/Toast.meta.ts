import type { DsMeta } from "./ds-meta";

export const meta: DsMeta = {
  status: "experimental",
  useWhen: [
    "Transient confirmation that an action the user just took has completed: a draft approved into a task, a follow-up comment posted, a record saved.",
    "The confirmation needs a follow-on link the user may or may not want, e.g. \"Created RAY-40 in Training, Rollout & Go-live\" with a View link onto the board.",
    "Several confirmations can land in quick succession: mount one ToastStack and push into it, and the cards queue instead of overlapping.",
  ],
  dontUseWhen: [
    "Errors, or anything the user must read to carry on. A toast times out and is easy to miss, so failures belong in the inline error pattern next to the control that failed.",
    "Anything that needs a decision or a confirm step: that is Modal.",
    "Persistent state, such as a standing warning about the record on screen. A toast is a moment, not a status.",
    "Long copy. The message clamps to two lines by design; if it does not fit, it is not a toast.",
  ],
  a11y: [
    "role=\"status\" with aria-live=\"polite\": announced without stealing focus, since the user is mid-task elsewhere.",
    "Never the only route to the information. The toast can time out unseen, so whatever it confirms must also be visible in the UI it changed.",
    "Hovering pauses the dismiss timer, so a card carrying a link cannot vanish from under the pointer on the way to a click.",
    "Carries an explicit dismiss control (IconButton with an aria-label) rather than relying on the timer alone.",
    "Under prefers-reduced-motion the slide is dropped and the card only fades.",
  ],
  tokens: [
    "surface (card) / border / shadow.floating",
    "text (message) / success (icon) / action + action-hover (action link)",
    "rounded.xl (12px)",
    "motion.ease + 200ms",
  ],
};
