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

export const Default: Story = {};

/** `.icon-btn--active` — the controlled menu/popover is open. */
export const Active: Story = { args: { isActive: true } };

export const Hover: Story = { parameters: { pseudo: { hover: true } } };
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

export const ClickBehaviour: Story = {
  play: async ({ args, canvasElement }) => {
    const button = within(canvasElement).getByRole("button");
    await userEvent.click(button);
    await expect(args.onClick).toHaveBeenCalledOnce();
    await expect(button).toHaveAttribute("type", "button");
    await expect(button).toHaveAccessibleName("Task actions");
  },
};

/** Every state at once — the visual-regression money shot. */
export const AllVariants: Story = {
  render: () => (
    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
      <IconButton aria-label="Default">
        <MeatballIcon />
      </IconButton>
      <IconButton aria-label="Active" isActive>
        <MeatballIcon />
      </IconButton>
      <IconButton aria-label="Disabled" disabled>
        <MeatballIcon />
      </IconButton>
    </div>
  ),
};
