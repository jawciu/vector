import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, fn, userEvent, within } from "storybook/test";
import FieldRow from "./FieldRow";
import { CalendarIcon, OwnerIcon } from "./Icons";
import { dsMetaDescription } from "./ds-meta";
import { meta as dsMeta } from "./FieldRow.meta";

/**
 * Content mirrors the real call sites (TaskDrawer's detail fields): icon +
 * muted label span + value span. Unlike FieldPill it is content-hugging and
 * borderless at rest — border + background only appear when `active`.
 */
const config: Meta<typeof FieldRow> = {
  component: FieldRow,
  tags: ["autodocs"],
  parameters: {
    docs: { description: { component: dsMetaDescription(dsMeta) } },
    dsMeta,
  },
  args: {
    icon: <CalendarIcon style={{ flexShrink: 0 }} />,
    onClick: fn(),
    children: (
      <>
        <span className="text-sm" style={{ color: "var(--text-muted)" }}>
          Target
        </span>
        <span className="text-sm" style={{ color: "var(--text)" }}>
          18 September 2026
        </span>
      </>
    ),
  },
};
export default config;

type Story = StoryObj<typeof FieldRow>;

export const Default: Story = {};

/** No children → the muted `label` fallback (the empty field state). */
export const EmptyLabelFallback: Story = {
  args: { children: undefined, label: "Owner", icon: <OwnerIcon style={{ flexShrink: 0 }} /> },
};

/** `active` brings in the border + background while the row's dropdown is open. */
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
 * visible state: with `onClick` the row is role="button" + tabIndex=0 (the
 * Lens 3 "mouse-only field editors" gap, fixed), and :focus-visible draws
 * the shared 2px `focus-ring` outline. The play walks the keyboard path:
 * Tab reaches the row, Enter activates it, Space activates it too (with
 * preventDefault so the page doesn't scroll).
 */
export const FocusVisible: Story = {
  parameters: { pseudo: { focusVisible: true } },
  play: async ({ args, canvasElement }) => {
    await userEvent.tab();
    const row = within(canvasElement).getByRole("button");
    await expect(row).toHaveFocus();
    await userEvent.keyboard("{Enter}");
    await expect(args.onClick).toHaveBeenCalledOnce();
    await userEvent.keyboard(" ");
    await expect(args.onClick).toHaveBeenCalledTimes(2);
  },
};

/** Rest / empty / active side by side — the visual-regression shot. */
export const AllVariants: Story = {
  render: () => (
    <div style={{ display: "flex", flexDirection: "column", gap: 12, alignItems: "flex-start" }}>
      <FieldRow icon={<OwnerIcon style={{ flexShrink: 0 }} />} label="Owner" />
      <FieldRow icon={<CalendarIcon style={{ flexShrink: 0 }} />}>
        <span className="text-sm" style={{ color: "var(--text-muted)" }}>
          Target
        </span>
        <span className="text-sm" style={{ color: "var(--text)" }}>
          18 September 2026
        </span>
      </FieldRow>
      <FieldRow icon={<CalendarIcon style={{ flexShrink: 0 }} />} active>
        <span className="text-sm" style={{ color: "var(--text-muted)" }}>
          Target
        </span>
        <span className="text-sm" style={{ color: "var(--text)" }}>
          18 September 2026
        </span>
      </FieldRow>
    </div>
  ),
};
