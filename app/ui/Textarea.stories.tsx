import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, userEvent, within } from "storybook/test";
import Textarea from "./Textarea";
import { dsMetaDescription } from "./ds-meta";
import { meta as dsMeta } from "./Textarea.meta";

/**
 * Same state model as TextField (the shared `.input` class), so the two NEW
 * decisions flagged there apply here too, pending Caroline's review:
 * standalone focus = `action` border, invalid = `danger` border that holds
 * through hover and focus. Textarea's own additions (`textarea.input`):
 * vertical-only resize + 80px min-height.
 */
const config: Meta<typeof Textarea> = {
  component: Textarea,
  tags: ["autodocs"],
  parameters: {
    docs: { description: { component: dsMetaDescription(dsMeta) } },
    dsMeta,
  },
  // Standalone stories need aria-label; in app code the accessible name
  // normally comes from <Field label=…>.
  args: { placeholder: "Add a note…", "aria-label": "Notes" },
  decorators: [
    (Story) => (
      <div style={{ width: 320 }}>
        <Story />
      </div>
    ),
  ],
};
export default config;

type Story = StoryObj<typeof Textarea>;

/** Resting state: `border` border on `bg`, 80px min-height. */
export const Default: Story = {};

/** Placeholder rendering — `textMuted`, never a label substitute. */
export const Placeholder: Story = {
  args: { placeholder: "e.g. Walk the customer through SSO setup", "aria-label": "Description" },
};

export const Filled: Story = {
  args: {
    defaultValue:
      "Walk the customer through SSO setup.\nCollect their IdP metadata first.",
    "aria-label": "Description",
  },
};

export const Hover: Story = { parameters: { pseudo: { hover: true } } };

/** NEW — pending Caroline's review: standalone focus = `action` border. */
export const Focus: Story = { parameters: { pseudo: { focus: true } } };

/** NEW — pending Caroline's review: invalid = `danger` border + aria-invalid. */
export const Invalid: Story = {
  args: {
    invalid: true,
    defaultValue: "…",
    "aria-label": "Summary",
  },
  play: async ({ canvasElement }) => {
    const textarea = within(canvasElement).getByRole("textbox");
    await expect(textarea).toHaveAttribute("aria-invalid", "true");
  },
};

export const Disabled: Story = {
  args: { disabled: true, defaultValue: "Locked meeting summary" },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByRole("textbox")).toBeDisabled();
  },
};

/** `rows` grows the initial box; min-height still floors it at 80px. */
export const Rows: Story = {
  args: { rows: 6, "aria-label": "Long description" },
};

/** Vertical-only resize — user drag can't break the horizontal layout. */
export const ResizeBehaviour: Story = {
  play: async ({ canvasElement }) => {
    const textarea = within(canvasElement).getByRole("textbox");
    const style = getComputedStyle(textarea);
    await expect(style.resize).toBe("vertical");
    await expect(style.minHeight).toBe("80px");
  },
};

export const TypingBehaviour: Story = {
  play: async ({ canvasElement }) => {
    const textarea = within(canvasElement).getByRole("textbox");
    await userEvent.type(textarea, "Kickoff notes:{enter}IdP metadata received.");
    await expect(textarea).toHaveValue("Kickoff notes:\nIdP metadata received.");
  },
};

/** Every control state at once — the visual-regression money shot. */
export const AllStates: Story = {
  render: () => (
    <div style={{ display: "flex", flexDirection: "column", gap: 12, width: 320 }}>
      <Textarea aria-label="Empty" placeholder="Placeholder" />
      <Textarea aria-label="Filled" defaultValue="Filled value" />
      <Textarea aria-label="Invalid" invalid defaultValue="Too short" />
      <Textarea aria-label="Disabled" disabled defaultValue="Disabled value" />
    </div>
  ),
};
