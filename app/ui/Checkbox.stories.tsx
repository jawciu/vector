import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { useState } from "react";
import { expect, fn, userEvent, within } from "storybook/test";
import Checkbox from "./Checkbox";
import { dsMetaDescription } from "./ds-meta";
import { meta as dsMeta } from "./Checkbox.meta";

/**
 * Extracted from the dropdown member pickers (TaskDrawer / CreateTaskModal;
 * ContactsPanel is the same family). NOTE (Caroline's review, pending): the
 * focus-visible `focusRing` outline is a NEW design decision — none of the
 * hand-rolled checkboxes had a keyboard focus style.
 */
const config: Meta<typeof Checkbox> = {
  component: Checkbox,
  tags: ["autodocs"],
  parameters: {
    docs: { description: { component: dsMetaDescription(dsMeta) } },
    dsMeta,
  },
  args: {
    checked: false,
    onChange: fn(),
    "aria-label": "Select Tom Okafor",
  },
};
export default config;

type Story = StoryObj<typeof Checkbox>;

/** Unchecked: `iconTertiary` outline on a 14px rounded square. */
export const Unchecked: Story = {};

/** Checked: `action` fill, tick in `actionText`. */
export const Checked: Story = { args: { checked: true } };

/** Hover flips the outline to `action` (the shipped group-hover swap). */
export const Hover: Story = { parameters: { pseudo: { hover: true } } };

/** NEW — pending Caroline's review: `focusRing` outline on keyboard focus. */
export const FocusVisible: Story = {
  parameters: { pseudo: { focusVisible: true } },
};

/** 40% wash + not-allowed cursor (the `.member-checkbox:disabled` idiom). */
export const Disabled: Story = {
  args: { disabled: true },
  play: async ({ args, canvasElement }) => {
    const checkbox = within(canvasElement).getByRole("checkbox");
    await expect(checkbox).toBeDisabled();
    await expect(args.onChange).not.toHaveBeenCalled();
  },
};

export const DisabledChecked: Story = {
  args: { disabled: true, checked: true },
};

/** Click toggles and reports the NEXT value (controlled component). */
export const ClickBehaviour: Story = {
  play: async ({ args, canvasElement }) => {
    const checkbox = within(canvasElement).getByRole("checkbox");
    await expect(checkbox).toHaveAttribute("aria-checked", "false");
    await userEvent.click(checkbox);
    await expect(args.onChange).toHaveBeenCalledWith(true);
  },
};

/** Space toggles from the keyboard (native button activation). */
export const KeyboardBehaviour: Story = {
  tags: ["no-vrt"],
  render: (args) => {
    function CheckboxPlayground() {
      const [checked, setChecked] = useState(false);
      return <Checkbox {...args} checked={checked} onChange={setChecked} />;
    }
    return <CheckboxPlayground />;
  },
  play: async ({ canvasElement }) => {
    const checkbox = within(canvasElement).getByRole("checkbox");
    checkbox.focus();
    await userEvent.keyboard(" ");
    await expect(checkbox).toHaveAttribute("aria-checked", "true");
    await userEvent.keyboard(" ");
    await expect(checkbox).toHaveAttribute("aria-checked", "false");
  },
};

/** Every state at once — the visual-regression money shot. */
export const AllStates: Story = {
  render: () => (
    <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
      <Checkbox checked={false} onChange={() => {}} aria-label="Unchecked" />
      <Checkbox checked onChange={() => {}} aria-label="Checked" />
      <Checkbox checked={false} disabled onChange={() => {}} aria-label="Disabled" />
      <Checkbox checked disabled onChange={() => {}} aria-label="Disabled checked" />
    </div>
  ),
};

/** In context: a dropdown-style row, the shipped usage shape. */
export const InARow: Story = {
  tags: ["no-vrt"],
  render: () => {
    function RowPlayground() {
      const [members, setMembers] = useState<Record<string, boolean>>({
        "Tom Okafor": true,
        "Ada Nwosu": false,
        "Mia Feldt": false,
      });
      return (
        <div style={{ display: "flex", flexDirection: "column", gap: 2, width: 220 }}>
          {Object.entries(members).map(([name, isMember]) => (
            <label
              key={name}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: 4,
                borderRadius: 4,
                fontSize: 14,
                color: isMember ? "var(--text)" : "var(--text-muted)",
                cursor: "pointer",
              }}
            >
              <Checkbox
                checked={isMember}
                onChange={(next) => setMembers((m) => ({ ...m, [name]: next }))}
                aria-label={`Select ${name}`}
              />
              {name}
            </label>
          ))}
        </div>
      );
    }
    return <RowPlayground />;
  },
};
