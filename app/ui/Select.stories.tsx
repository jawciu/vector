import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, userEvent, within } from "storybook/test";
import Select from "./Select";
import { dsMetaDescription } from "./ds-meta";
import { meta as dsMeta } from "./Select.meta";

/**
 * Same state model as TextField (the shared `.input` class), so the two NEW
 * decisions flagged there apply here too, pending Caroline's review:
 * standalone focus = `action` border, invalid = `danger` border that holds
 * through hover and focus. The dropdown arrow and popup are deliberately
 * NATIVE (see Select.tsx) — rich dropdowns are MenuList's job.
 */
const OWNER_OPTIONS = (
  <>
    <option value="tom">Tom Okafor</option>
    <option value="ada">Ada Nwosu</option>
    <option value="mia">Mia Feldt</option>
    <option value="leo">Leo Marchetti</option>
  </>
);

const config: Meta<typeof Select> = {
  component: Select,
  tags: ["autodocs"],
  parameters: {
    docs: { description: { component: dsMetaDescription(dsMeta) } },
    dsMeta,
  },
  // Standalone stories need aria-label; in app code the accessible name
  // normally comes from <Field label=…>.
  args: { "aria-label": "Owner", defaultValue: "tom", children: OWNER_OPTIONS },
  decorators: [
    (Story) => (
      <div style={{ width: 320 }}>
        <Story />
      </div>
    ),
  ],
};
export default config;

type Story = StoryObj<typeof Select>;

/** Resting state: `border` border on `bg`, native arrow. */
export const Default: Story = {};

/** Empty-value prompt: a disabled placeholder option in `textMuted`-ish
 *  native rendering — the closest a native select gets to a placeholder. */
export const Unselected: Story = {
  args: {
    defaultValue: "",
    "aria-label": "Phase",
    children: (
      <>
        <option value="" disabled>
          Select a phase…
        </option>
        <option value="kickoff">Kickoff</option>
        <option value="integration">Integration</option>
        <option value="training">Training</option>
        <option value="go-live">Go-live</option>
      </>
    ),
  },
};

export const Hover: Story = { parameters: { pseudo: { hover: true } } };

/** NEW — pending Caroline's review: standalone focus = `action` border. */
export const Focus: Story = { parameters: { pseudo: { focus: true } } };

/** NEW — pending Caroline's review: invalid = `danger` border + aria-invalid. */
export const Invalid: Story = {
  args: { invalid: true },
  play: async ({ canvasElement }) => {
    const select = within(canvasElement).getByRole("combobox");
    await expect(select).toHaveAttribute("aria-invalid", "true");
  },
};

export const Disabled: Story = {
  args: { disabled: true },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByRole("combobox")).toBeDisabled();
  },
};

export const SelectionBehaviour: Story = {
  play: async ({ canvasElement }) => {
    const select = within(canvasElement).getByRole("combobox");
    await userEvent.selectOptions(select, "ada");
    await expect(select).toHaveValue("ada");
  },
};

/** Every control state at once — the visual-regression money shot. */
export const AllStates: Story = {
  render: () => (
    <div style={{ display: "flex", flexDirection: "column", gap: 12, width: 320 }}>
      <Select aria-label="Default" defaultValue="tom">
        {OWNER_OPTIONS}
      </Select>
      <Select aria-label="Unselected" defaultValue="">
        <option value="" disabled>
          Select an owner…
        </option>
        {OWNER_OPTIONS}
      </Select>
      <Select aria-label="Invalid" invalid defaultValue="mia">
        {OWNER_OPTIONS}
      </Select>
      <Select aria-label="Disabled" disabled defaultValue="leo">
        {OWNER_OPTIONS}
      </Select>
    </div>
  ),
};
