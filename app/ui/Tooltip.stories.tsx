import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, userEvent, within } from "storybook/test";
import Tooltip from "./Tooltip";
import { dsMetaDescription } from "./ds-meta";
import { meta as dsMeta } from "./Tooltip.meta";

/**
 * Tooltip is hover-state driven JS (mouseenter/mouseleave), not CSS :hover —
 * the pseudo-states addon can't open it and there is no `open` prop. Each
 * "Open" story therefore opens it with a real userEvent.hover in its play
 * function and LEAVES it open, so the canvas (and the VRT screenshot, taken
 * after play) shows the tooltip itself, not just the bare trigger.
 */
const config: Meta<typeof Tooltip> = {
  component: Tooltip,
  tags: ["autodocs"],
  parameters: {
    docs: {
      description: { component: dsMetaDescription(dsMeta) },
      // Play functions don't run in inline docs previews, so inline docs
      // would show only the bare trigger — the "where is the tooltip?"
      // trap. Each preview gets its own iframe (the Modal pattern), where
      // the play runs and the open tooltip is actually visible.
      story: { inline: false, iframeHeight: 160 },
    },
    dsMeta,
  },
  args: {
    label: "AI confidence",
    children: <span className="text-sm">92%</span>,
  },
};
export default config;

type Story = StoryObj<typeof Tooltip>;

/**
 * The primary story: the tooltip held OPEN above its trigger (the play
 * hovers the trigger and stays there). `surfaceHover` body, `border`
 * hairline, `textSecondary` 12px text, centred arrow.
 */
export const Open: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.hover(canvas.getByText("92%"));
    const body = await canvas.findByText("AI confidence");
    await expect(body).toBeInTheDocument();
    // The fixed-position wrapper never traps the pointer.
    await expect(body.parentElement).toHaveStyle({ pointerEvents: "none" });
  },
};

/** `lines` renders one span per array item (ContactsPanel's bounce warning) — held open like Open. */
export const OpenMultiLine: Story = {
  args: {
    label: undefined,
    lines: ["Email bounced.", "This address might no longer be valid."],
    children: <span className="text-sm">Bounced</span>,
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.hover(canvas.getByText("Bounced"));
    await expect(await canvas.findByText("Email bounced.")).toBeInTheDocument();
    await expect(
      canvas.getByText("This address might no longer be valid."),
    ).toBeInTheDocument();
  },
};

/**
 * Interaction test — the canvas ends with the tooltip CLOSED again on
 * purpose: it drives the whole hover lifecycle (open on hover, dismiss on
 * mouse leave). Open the Interactions panel to watch it.
 */
export const HoverLifecycle: Story = {
  name: "Hover lifecycle (test)",
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const trigger = canvas.getByText("92%");
    await userEvent.hover(trigger);
    await expect(await canvas.findByText("AI confidence")).toBeInTheDocument();
    await userEvent.unhover(trigger);
    await expect(canvas.queryByText("AI confidence")).toBeNull();
  },
};

/**
 * Interaction test — no label and no lines: children render untouched, no
 * hover wrapper at all, and hovering shows nothing. The canvas is just the
 * bare trigger, by design.
 */
export const NoContent: Story = {
  name: "No content (test)",
  args: { label: undefined, lines: undefined },
  play: async ({ canvasElement }) => {
    const trigger = within(canvasElement).getByText("92%");
    // Children are returned as-is: no wrapping <span> around the trigger.
    await expect(trigger.parentElement?.tagName).not.toBe("SPAN");
    await userEvent.hover(trigger);
    await expect(within(canvasElement).queryByText("AI confidence")).toBeNull();
  },
};
