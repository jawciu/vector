import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, fn, userEvent, within } from "storybook/test";
import IconButton from "./IconButton";
import { dsMetaDescription } from "./ds-meta";
import { meta as dsMeta } from "./IconButton.meta";

/** The 12px meatball menu icon — the most common IconButton payload in the app. */
const MeatballIcon = () => (
  <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
    <circle cx="8" cy="3" r="1.5" />
    <circle cx="8" cy="8" r="1.5" />
    <circle cx="8" cy="13" r="1.5" />
  </svg>
);

/** 12px bin glyph for the danger-tone stories (currentColor, like the app's icons). */
const TrashIcon = () => (
  <svg
    width="12"
    height="12"
    viewBox="0 0 16 16"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.5"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="M2.5 4.5h11" />
    <path d="M5.5 4.5V3a1 1 0 0 1 1-1h3a1 1 0 0 1 1 1v1.5" />
    <path d="M4 4.5l.7 9a1 1 0 0 0 1 .9h4.6a1 1 0 0 0 1-.9l.7-9" />
    <path d="M6.5 7.5v4" />
    <path d="M9.5 7.5v4" />
  </svg>
);

const config: Meta<typeof IconButton> = {
  component: IconButton,
  tags: ["autodocs"],
  parameters: {
    docs: { description: { component: dsMetaDescription(dsMeta) } },
    dsMeta,
  },
  args: {
    "aria-label": "Task actions",
    onClick: fn(),
    children: <MeatballIcon />,
  },
};
export default config;

type Story = StoryObj<typeof IconButton>;

/**
 * Rest state: NO background — the glyph sits bare at `textMuted`. A fill only
 * ever appears on hover (`bgHover`) or while pressed/open (`surfaceHover`).
 * (If this story ever shows a fill, that's leaked pseudo-state globals from a
 * previously-viewed Hover/Active story — guarded against in
 * .storybook/preview.tsx, see withPseudoGlobalsReset.)
 */
export const Default: Story = {};

/** Hover: `bgHover` fill appears and the glyph lifts from `textMuted` to `text`. */
export const Hover: Story = { parameters: { pseudo: { hover: true } } };

/**
 * `.icon-btn--active` — the controlled menu/popover is open. Same
 * `surfaceHover` fill as a held :active press: one step LIGHTER than the
 * hover fill, the same direction as `.menu-option` rows (hover `bgHover`,
 * active `surfaceHover`).
 */
export const Active: Story = { args: { isActive: true } };

/**
 * Hover vs pressed, side by side. Left is force-hovered (`bgHover` fill,
 * glyph at `text`); right is force-pressed (`surfaceHover` fill — one step
 * lighter than `bgHover`, matching the `.menu-option` hover/active
 * direction). The difference is deliberate but subtle: hover says "this is
 * interactive", pressed/open says "this is engaged".
 */
export const HoverVsActive: Story = {
  parameters: {
    pseudo: { hover: ["#ib-hover"], active: ["#ib-pressed"] },
  },
  render: () => (
    <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
      <IconButton id="ib-hover" aria-label="Hovered">
        <MeatballIcon />
      </IconButton>
      <IconButton id="ib-pressed" aria-label="Pressed">
        <MeatballIcon />
      </IconButton>
    </div>
  ),
};

export const FocusVisible: Story = { parameters: { pseudo: { focusVisible: true } } };

export const Disabled: Story = {
  args: { disabled: true },
  play: async ({ args, canvasElement }) => {
    const button = within(canvasElement).getByRole("button");
    await expect(button).toBeDisabled();
    // A click on a disabled icon button must be a no-op.
    await userEvent.click(button).catch(() => {});
    await expect(args.onClick).not.toHaveBeenCalled();
  },
};

/**
 * NEW — pending Caroline's review. `tone="danger"` for destructive icon
 * actions (delete a row, remove a member). Treatment mirrors
 * `.btn-tertiary--danger`: glyph at `danger`, stepping to `dangerHover` on
 * hover/active; the background fills stay the NEUTRAL `bgHover`/`surfaceHover`
 * steps so the only red is the glyph itself (no red wash).
 */
export const Danger: Story = {
  args: { tone: "danger", "aria-label": "Delete row", children: <TrashIcon /> },
};

/** NEW — pending Caroline's review. Danger hover: neutral `bgHover` fill, glyph `danger` → `dangerHover`. */
export const DangerHover: Story = {
  args: { tone: "danger", "aria-label": "Delete row", children: <TrashIcon /> },
  parameters: { pseudo: { hover: true } },
};

/** NEW — pending Caroline's review. Danger while its confirm popover is open: neutral `surfaceHover` fill. */
export const DangerActive: Story = {
  args: { tone: "danger", isActive: true, "aria-label": "Delete row", children: <TrashIcon /> },
};

/** NEW — pending Caroline's review. Disabled danger dims to `iconTertiary` like the action tone. */
export const DangerDisabled: Story = {
  args: { tone: "danger", disabled: true, "aria-label": "Delete row", children: <TrashIcon /> },
};

/**
 * Interaction test — the canvas intentionally looks like Default. Open the
 * Interactions panel to watch it click the button and assert the wiring
 * (onClick fires once, type="button", accessible name from aria-label).
 */
export const ClickBehaviour: Story = {
  name: "Click behaviour (test)",
  play: async ({ args, canvasElement }) => {
    const button = within(canvasElement).getByRole("button");
    await userEvent.click(button);
    await expect(args.onClick).toHaveBeenCalledOnce();
    await expect(button).toHaveAttribute("type", "button");
    await expect(button).toHaveAccessibleName("Task actions");
  },
};

/**
 * Every state of both tones at once — the visual-regression money shot.
 * Row per tone; columns: rest, hover (forced), pressed (forced :active),
 * open (isActive), disabled.
 */
export const AllVariants: Story = {
  parameters: {
    pseudo: {
      hover: ["#av-action-hover", "#av-danger-hover"],
      active: ["#av-action-pressed", "#av-danger-pressed"],
    },
  },
  render: () => (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <IconButton aria-label="Rest">
          <MeatballIcon />
        </IconButton>
        <IconButton id="av-action-hover" aria-label="Hovered">
          <MeatballIcon />
        </IconButton>
        <IconButton id="av-action-pressed" aria-label="Pressed">
          <MeatballIcon />
        </IconButton>
        <IconButton aria-label="Open" isActive>
          <MeatballIcon />
        </IconButton>
        <IconButton aria-label="Disabled" disabled>
          <MeatballIcon />
        </IconButton>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <IconButton tone="danger" aria-label="Danger rest">
          <TrashIcon />
        </IconButton>
        <IconButton tone="danger" id="av-danger-hover" aria-label="Danger hovered">
          <TrashIcon />
        </IconButton>
        <IconButton tone="danger" id="av-danger-pressed" aria-label="Danger pressed">
          <TrashIcon />
        </IconButton>
        <IconButton tone="danger" aria-label="Danger open" isActive>
          <TrashIcon />
        </IconButton>
        <IconButton tone="danger" aria-label="Danger disabled" disabled>
          <TrashIcon />
        </IconButton>
      </div>
    </div>
  ),
};
