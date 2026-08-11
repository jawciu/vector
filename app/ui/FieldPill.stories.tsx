import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, fn, userEvent, within } from "storybook/test";
import FieldPill from "./FieldPill";
import { CalendarIcon, PriorityIcon } from "./Icons";
import { dsMetaDescription } from "./ds-meta";
import { meta as dsMeta } from "./FieldPill.meta";

/**
 * Content mirrors the real call sites (CreateTaskModal): icon + value span,
 * with `label` as the muted empty-state fallback. The pill is flex-1, so
 * stories render inside a fixed-width wrapper the way a form row would.
 */
const config: Meta<typeof FieldPill> = {
  component: FieldPill,
  tags: ["autodocs"],
  parameters: {
    docs: { description: { component: dsMetaDescription(dsMeta) } },
    dsMeta,
  },
  args: {
    icon: <CalendarIcon style={{ flexShrink: 0 }} />,
    onClick: fn(),
    children: (
      <span className="text-sm flex-1" style={{ color: "var(--text)" }}>
        18 September 2026
      </span>
    ),
  },
  decorators: [
    (Story) => (
      <div style={{ width: 260 }}>
        <Story />
      </div>
    ),
  ],
};
export default config;

type Story = StoryObj<typeof FieldPill>;

export const Default: Story = {};

/** No children → the muted `label` fallback (the empty field state). */
export const EmptyLabelFallback: Story = {
  args: { children: undefined, label: "Target" },
};

/** `active` holds the pressed look while the pill's dropdown is open. */
export const Active: Story = { args: { active: true } };

export const Hover: Story = { parameters: { pseudo: { hover: true } } };

export const ClickBehaviour: Story = {
  play: async ({ args, canvasElement }) => {
    await userEvent.click(within(canvasElement).getByText("18 September 2026"));
    await expect(args.onClick).toHaveBeenCalledOnce();
  },
};

/**
 * NEW — pending Caroline's review. The focus ring on field editors is a new
 * visible state: with `onClick` the pill is role="button" + tabIndex=0 (the
 * Lens 3 "mouse-only field editors" gap, fixed), and :focus-visible draws
 * the shared 2px `focus-ring` outline. The play walks the keyboard path:
 * Tab reaches the pill, Enter activates it, Space activates it too (with
 * preventDefault so the page doesn't scroll).
 */
export const FocusVisible: Story = {
  parameters: { pseudo: { focusVisible: true } },
  play: async ({ args, canvasElement }) => {
    await userEvent.tab();
    const pill = within(canvasElement).getByRole("button");
    await expect(pill).toHaveFocus();
    await userEvent.keyboard("{Enter}");
    await expect(args.onClick).toHaveBeenCalledOnce();
    await userEvent.keyboard(" ");
    await expect(args.onClick).toHaveBeenCalledTimes(2);
  },
};

/** Rest / empty / active side by side — the visual-regression shot. */
export const AllVariants: Story = {
  render: () => (
    <div style={{ display: "flex", flexDirection: "column", gap: 12, width: 260 }}>
      <FieldPill icon={<CalendarIcon style={{ flexShrink: 0 }} />} label="Target" />
      <FieldPill icon={<CalendarIcon style={{ flexShrink: 0 }} />}>
        <span className="text-sm flex-1" style={{ color: "var(--text)" }}>
          18 September 2026
        </span>
      </FieldPill>
      <FieldPill icon={<PriorityIcon priority="high" style={{ flexShrink: 0 }} />} active>
        <span className="text-sm flex-1 capitalize" style={{ color: "var(--text)" }}>
          high
        </span>
      </FieldPill>
    </div>
  ),
};
