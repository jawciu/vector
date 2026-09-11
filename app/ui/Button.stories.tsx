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
 *
 * Controls cover the props (variant, size, tone, disabled, loading, children).
 * Hover / active / focus-visible are not props: they come from the pseudo
 * states toolbar, so they are named stories only. Long label is just children.
 */
const config: Meta<typeof Button> = {
  component: Button,
  tags: ["autodocs"],
  parameters: {
    docs: { description: { component: dsMetaDescription(dsMeta) } },
    dsMeta,
  },
  args: { children: "Save changes", onClick: fn() },
  argTypes: {
    variant: { control: "radio", options: ["primary", "secondary", "tertiary", "destructive"] },
    size: { control: "radio", options: ["sm", "xs"] },
    tone: {
      control: "radio",
      options: ["action", "danger"],
      description: "Tertiary only. Ignored elsewhere.",
      if: { arg: "variant", eq: "tertiary" },
    },
    disabled: { control: "boolean" },
    loading: { control: "boolean" },
    children: { control: "text" },
  },
};
export default config;

type Story = StoryObj<typeof Button>;

export const Primary: Story = {};
export const Secondary: Story = { args: { variant: "secondary" } };
export const Tertiary: Story = { args: { variant: "tertiary" } };
export const TertiaryDanger: Story = {
  name: "Tertiary danger",
  args: { variant: "tertiary", tone: "danger", children: "Revoke" },
};
export const Destructive: Story = { args: { variant: "destructive", children: "Delete task" } };
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

/**
 * Interaction test — the canvas intentionally looks like Primary. Open the
 * Interactions panel to watch it click the button and assert the wiring
 * (onClick fires once, type="button").
 */
export const ClickBehaviour: Story = {
  name: "Click behaviour (test)",
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
          <Button size={size} variant="tertiary" tone="danger">Tertiary danger</Button>
          <Button size={size} variant="destructive">Destructive</Button>
          <Button size={size} loading>Loading</Button>
          <Button size={size} disabled>Disabled</Button>
        </div>
      ))}
    </div>
  ),
};
