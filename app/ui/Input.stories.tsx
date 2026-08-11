import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, userEvent, within } from "storybook/test";
import Input from "./Input";
import { dsMetaDescription } from "./ds-meta";
import { meta as dsMeta } from "./Input.meta";

/**
 * NOTE (Caroline's review, pending): two NEW design decisions live here —
 * nothing in the app renders them yet.
 * 1. The STANDALONE focus style (border → `action` on :focus). Until now only
 *    the `.search-input` wrapper had a focus treatment (:focus-within); naked
 *    inputs were outline-none with nothing.
 * 2. The invalid state: `danger` border that holds through hover and focus.
 * Both are extracted-from-`.search-input` otherwise: `border` on `bg` →
 * hover `bg-hover` + `buttonSecondaryBorder`.
 */
const config: Meta<typeof Input> = {
  component: Input,
  tags: ["autodocs"],
  parameters: {
    docs: { description: { component: dsMetaDescription(dsMeta) } },
    dsMeta,
  },
  // Standalone stories need aria-label; in app code the accessible name
  // normally comes from <Field label=…>.
  args: { placeholder: "Task name", "aria-label": "Task name" },
  decorators: [
    (Story) => (
      <div style={{ width: 320 }}>
        <Story />
      </div>
    ),
  ],
};
export default config;

type Story = StoryObj<typeof Input>;

/** Resting state: `border` border on `bg`, placeholder in `textMuted`. */
export const Default: Story = {};

/** Placeholder rendering — `textMuted`, never a label substitute. */
export const Placeholder: Story = {
  args: { placeholder: "e.g. Tom Okafor", "aria-label": "Name" },
};

export const Filled: Story = {
  args: { defaultValue: "Kickoff call notes", "aria-label": "Title" },
};

export const Hover: Story = { parameters: { pseudo: { hover: true } } };

/** NEW — pending Caroline's review: standalone focus = `action` border. */
export const Focus: Story = { parameters: { pseudo: { focus: true } } };

/** NEW — pending Caroline's review: invalid = `danger` border + aria-invalid. */
export const Invalid: Story = {
  args: { invalid: true, defaultValue: "not-an-email", "aria-label": "Email" },
  play: async ({ canvasElement }) => {
    const input = within(canvasElement).getByRole("textbox");
    await expect(input).toHaveAttribute("aria-invalid", "true");
  },
};

export const Disabled: Story = {
  args: { disabled: true, defaultValue: "Locked value" },
  play: async ({ canvasElement }) => {
    await expect(
      within(canvasElement).getByRole("textbox")
    ).toBeDisabled();
  },
};

export const TypingBehaviour: Story = {
  args: { placeholder: "Type here", "aria-label": "Notes" },
  play: async ({ canvasElement }) => {
    const input = within(canvasElement).getByRole("textbox");
    await userEvent.type(input, "Renew SSO contract");
    await expect(input).toHaveValue("Renew SSO contract");
  },
};

/** Every control state at once — the visual-regression money shot. */
export const AllStates: Story = {
  render: () => (
    <div style={{ display: "flex", flexDirection: "column", gap: 12, width: 320 }}>
      <Input aria-label="Empty" placeholder="Placeholder" />
      <Input aria-label="Filled" defaultValue="Filled value" />
      <Input aria-label="Invalid" invalid defaultValue="not-an-email" />
      <Input aria-label="Disabled" disabled defaultValue="Disabled value" />
    </div>
  ),
};
