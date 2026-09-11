import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { useState } from "react";
import { expect, fn, userEvent, within } from "storybook/test";
import TaskTick from "./TaskTick";
import { dsMetaDescription } from "./ds-meta";
import { meta as dsMeta } from "./TaskTick.meta";

/**
 * Extracted from TaskCardView's CheckboxButton (the kanban done-tick),
 * including the shipped `.checkbox-bounce` animation on marking done.
 * NOTE (Caroline's review, pending): the focus-visible `focusRing` outline
 * is a NEW design decision — the shipped button had no keyboard focus style.
 */
const config: Meta<typeof TaskTick> = {
  component: TaskTick,
  tags: ["autodocs"],
  parameters: {
    docs: { description: { component: dsMetaDescription(dsMeta) } },
    dsMeta,
  },
  args: {
    checked: false,
    onChange: fn(),
    "aria-label": "Mark as done",
  },
};
export default config;

type Story = StoryObj<typeof TaskTick>;

/** Unchecked: `iconTertiary` ring + ghost check. */
export const Unchecked: Story = {};

/** Checked: `success` filled circle, tick as cutout. */
export const Checked: Story = {
  args: { checked: true, "aria-label": "Mark as incomplete" },
};

/** Hover turns ring + ghost check `success` — "this click completes". */
export const Hover: Story = { parameters: { pseudo: { hover: true } } };

/** NEW — pending Caroline's review: `focusRing` outline on keyboard focus. */
export const FocusVisible: Story = {
  parameters: { pseudo: { focusVisible: true } },
};

/** No onChange = read-only (InsightsPanel's shipped behaviour): renders
 *  inert, deliberately NOT washed out. */
export const ReadOnly: Story = {
  args: { checked: true, onChange: undefined, "aria-label": "Task is done" },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByRole("button")).toBeDisabled();
  },
};

export const Disabled: Story = {
  args: { disabled: true },
  play: async ({ args, canvasElement }) => {
    const tick = within(canvasElement).getByRole("button");
    await expect(tick).toBeDisabled();
    await expect(args.onChange).not.toHaveBeenCalled();
  },
};

/** Click reports the NEXT value; aria-pressed mirrors `checked`. */
export const ClickBehaviour: Story = {
  play: async ({ args, canvasElement }) => {
    const tick = within(canvasElement).getByRole("button");
    await expect(tick).toHaveAttribute("aria-pressed", "false");
    await userEvent.click(tick);
    await expect(args.onChange).toHaveBeenCalledWith(true);
  },
};

/** Full toggle loop with the bounce on marking done. */
export const ToggleBehaviour: Story = {
  tags: ["no-vrt"],
  render: () => {
    function TickPlayground() {
      const [checked, setChecked] = useState(false);
      return (
        <TaskTick
          checked={checked}
          onChange={setChecked}
          aria-label={checked ? "Mark as incomplete" : "Mark as done"}
        />
      );
    }
    return <TickPlayground />;
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const tick = canvas.getByRole("button", { name: "Mark as done" });
    await userEvent.click(tick);
    await expect(tick).toHaveAttribute("aria-pressed", "true");
    await expect(tick).toHaveAccessibleName("Mark as incomplete");
    await userEvent.click(tick);
    await expect(tick).toHaveAttribute("aria-pressed", "false");
  },
};

/** Every state at once — the visual-regression money shot. */
export const AllStates: Story = {
  render: () => (
    <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
      <TaskTick checked={false} onChange={() => {}} aria-label="Unchecked" />
      <TaskTick checked onChange={() => {}} aria-label="Checked" />
      <TaskTick checked aria-label="Read-only done" />
      <TaskTick checked={false} disabled onChange={() => {}} aria-label="Disabled" />
    </div>
  ),
};
