import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, userEvent, within } from "storybook/test";
import Tooltip from "./Tooltip";
import { dsMetaDescription } from "./ds-meta";
import { meta as dsMeta } from "./Tooltip.meta";

/**
 * Tooltip is hover-state driven JS (mouseenter/mouseleave), not CSS :hover —
 * the pseudo-states addon can't open it and there is no `open` prop. Each
 * story therefore opens it with a real userEvent.hover in its play function,
 * which also leaves it open for the VRT screenshot (screenshots run after
 * play).
 */
const config: Meta<typeof Tooltip> = {
  component: Tooltip,
  tags: ["autodocs"],
  parameters: {
    docs: { description: { component: dsMetaDescription(dsMeta) } },
    dsMeta,
  },
  args: {
    label: "AI confidence",
    children: <span className="text-sm">92%</span>,
  },
};
export default config;

type Story = StoryObj<typeof Tooltip>;

export const Default: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.hover(canvas.getByText("92%"));
    const body = await canvas.findByText("AI confidence");
    await expect(body).toBeInTheDocument();
    // The fixed-position wrapper never traps the pointer.
    await expect(body.parentElement).toHaveStyle({ pointerEvents: "none" });
  },
};

/** `lines` renders one span per array item (ContactsPanel's bounce warning). */
export const MultiLine: Story = {
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

/** No label and no lines → children render untouched, no hover wrapper at all. */
export const NoContent: Story = {
  args: { label: undefined, lines: undefined },
  play: async ({ canvasElement }) => {
    const trigger = within(canvasElement).getByText("92%");
    // Children are returned as-is: no wrapping <span> around the trigger.
    await expect(trigger.parentElement?.tagName).not.toBe("SPAN");
    await userEvent.hover(trigger);
    await expect(within(canvasElement).queryByText("AI confidence")).toBeNull();
  },
};

/** Dismisses on mouse leave — the whole lifecycle in one play. */
export const HoverLifecycle: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const trigger = canvas.getByText("92%");
    await userEvent.hover(trigger);
    await expect(await canvas.findByText("AI confidence")).toBeInTheDocument();
    await userEvent.unhover(trigger);
    await expect(canvas.queryByText("AI confidence")).toBeNull();
  },
};
