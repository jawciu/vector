import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, fn, userEvent, within } from "storybook/test";
import Button from "./Button";
import { dsMetaDescription } from "./ds-meta";
import { meta as dsMeta } from "./Button.meta";

/**
 * THE PATTERN-SETTER (docs/DS-PLAN.md Phase 4). Every primitive's stories
 * follow this shape: one named story per blessed state, pseudo-state stories
 * for hover/focus, a play function asserting behaviour, an AllVariants grid
 * for visual regression, and the DsMeta rendered into the docs page.
 */
const config: Meta<typeof Button> = {
  component: Button,
  tags: ["autodocs"],
  parameters: {
    docs: { description: { component: dsMetaDescription(dsMeta) } },
    dsMeta,
  },
  args: { children: "Save changes", onClick: fn() },
};
export default config;

type Story = StoryObj<typeof Button>;

export const Primary: Story = {};
export const Secondary: Story = { args: { variant: "secondary" } };
export const Tertiary: Story = { args: { variant: "tertiary" } };
export const Destructive: Story = { args: { variant: "destructive", children: "Delete task" } };
export const TextAction: Story = { args: { variant: "text", children: "Edit" } };
export const TextDanger: Story = { args: { variant: "text", tone: "danger", children: "Remove" } };
export const SizeXS: Story = { args: { size: "xs", children: "Compact" } };

export const Hover: Story = { parameters: { pseudo: { hover: true } } };
export const Active: Story = { parameters: { pseudo: { active: true } } };
export const FocusVisible: Story = { parameters: { pseudo: { focusVisible: true } } };

export const Disabled: Story = {
  args: { disabled: true },
  play: async ({ args, canvasElement }) => {
    const button = within(canvasElement).getByRole("button");
    await expect(button).toBeDisabled();
    await expect(args.onClick).not.toHaveBeenCalled();
  },
};

export const Loading: Story = {
  args: { loading: true },
  play: async ({ canvasElement }) => {
    const button = within(canvasElement).getByRole("button");
    await expect(button).toHaveAttribute("aria-busy", "true");
    await expect(button).toBeDisabled();
    // width preservation: the label is invisible but still laid out
    const label = button.querySelector(".invisible");
    await expect(label).not.toBeNull();
  },
};

export const LongLabel: Story = {
  args: { children: "Send follow-up summary to every stakeholder on this onboarding" },
};

export const ClickBehaviour: Story = {
  play: async ({ args, canvasElement }) => {
    const button = within(canvasElement).getByRole("button");
    await userEvent.click(button);
    await expect(args.onClick).toHaveBeenCalledOnce();
    await expect(button).toHaveAttribute("type", "button");
  },
};

/** Every variant × size at once — the visual-regression money shot. */
export const AllVariants: Story = {
  render: () => (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {(["sm", "xs"] as const).map((size) => (
        <div key={size} style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <Button size={size}>Primary</Button>
          <Button size={size} variant="secondary">Secondary</Button>
          <Button size={size} variant="tertiary">Tertiary</Button>
          <Button size={size} variant="destructive">Destructive</Button>
          <Button size={size} variant="text">Text</Button>
          <Button size={size} variant="text" tone="danger">Text danger</Button>
          <Button size={size} loading>Loading</Button>
          <Button size={size} disabled>Disabled</Button>
        </div>
      ))}
    </div>
  ),
};
