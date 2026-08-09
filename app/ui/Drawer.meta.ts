import type { DsMeta } from "./ds-meta";

export const meta: DsMeta = {
  status: "stable",
  useWhen: [
    "Right-edge detail/editor panels that slide over board content — TaskDrawer, MeetingDrawer and the portal drawer all wrap this shell so every drawer shares the kanban look (fixed right edge, 520px default width, 44px top offset clearing the nav).",
    "Keep it MOUNTED and toggle `open` — the slide animation needs DOM presence (`.task-drawer` / `.task-drawer--open` in globals.css).",
    "Parents that own their outside-click logic (e.g. kanban card-swap): pass `useClickOutside={false}` and do your own `contains()` check via the forwarded ref.",
  ],
  dontUseWhen: [
    "Blocking confirmations or create forms — that's Modal territory (DS-PLAN Phase 5), which brings real dialog semantics.",
    "Dropdowns/popovers — use MenuList + MenuOption.",
    "Content that should sit in the page flow — this is `position: fixed`; it always overlays.",
  ],
  a11y: [
    "ESC calls `onClose` (listener only attached while open); the built-in close button carries `aria-label=\"Close\"`.",
    "HONEST GAPS (audit Lens 3 — documented, not yet fixed): no `role=\"dialog\"`/`aria-modal`, no focus trap, no initial-focus or focus-restore; children stay mounted and IN THE TAB ORDER even while closed, so an off-screen drawer leaks tab stops. Callers must manage focus themselves until the DS grows a focus-managed drawer.",
    "The slide transition is not `prefers-reduced-motion`-guarded (Lens 3).",
  ],
  tokens: ["deeperBg (default background)", "border"],
};
