import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, fn, userEvent, within } from "storybook/test";
import FieldRow from "./FieldRow";
import { CalendarIcon } from "./Icons";
import { dsMetaDescription } from "./ds-meta";
import { meta as dsMeta } from "./FieldRow.meta";

/**
 * ONE canonical content across every state story (Caroline's review call,
 * 2026-08, matching FieldPill): CalendarIcon + muted "Target" + a date value
 * — the TaskDrawer detail-field idiom. Default/Hover/Active/Focused all
 * render this exact row, so the ONLY visible difference between those
 * stories is the state itself. Unlike FieldPill the row is content-hugging
 * and completely bare at rest — no fill, no border.
 */
const canonicalIcon = <CalendarIcon style={{ flexShrink: 0 }} />;
const canonicalFilled = (
  <>
    <span className="text-sm" style={{ color: "var(--text-muted)" }}>
      Target
    </span>
    <span className="text-sm" style={{ color: "var(--text)" }}>
      18 September 2026
    </span>
  </>
);

const config: Meta<typeof FieldRow> = {
  component: FieldRow,
  tags: ["autodocs"],
  parameters: {
    docs: { description: { component: dsMetaDescription(dsMeta) } },
    dsMeta,
  },
  args: {
    icon: canonicalIcon,
    onClick: fn(),
    children: canonicalFilled,
  },
};
export default config;

type Story = StoryObj<typeof FieldRow>;

/**
 * The row at rest, carrying a value — this IS the filled state. Completely
 * transparent: no fill, no border; just icon + `textMuted` field name +
 * `text` value. Every state story below renders this exact content.
 */
export const Default: Story = { name: "Default (filled)" };

/**
 * No value yet: no children, so the muted `label` renders as the placeholder
 * (`textMuted`). Same icon and field name as the filled row — the only
 * difference is the missing value.
 */
export const Empty: Story = {
  name: "Empty (placeholder)",
  args: { children: undefined, label: "Target" },
};

/**
 * What hover ACTUALLY changes: a `bgHover` wash fades in over the transparent
 * rest state (border stays transparent). The hover rule is guarded with
 * `:not([data-active]):not(:focus-within)` so an open or focused row keeps
 * its stronger `surfaceHover` treatment instead.
 */
export const Hover: Story = { parameters: { pseudo: { hover: true } } };

/**
 * `active` while the row's dropdown is open: the `surfaceHover` fill AND the
 * `buttonSecondaryBorder` border appear — one step stronger than hover, the
 * same hover → active direction as `.menu-option` and IconButton.
 */
export const Active: Story = { name: "Active (open)", args: { active: true } };

/**
 * NEW — pending Caroline's review. The focus ring on field editors is a new
 * visible state: with `onClick` the row is role="button" + tabIndex=0 (the
 * Lens 3 "mouse-only field editors" gap, fixed), and :focus-visible draws
 * the shared 2px `focusRing` outline (the `:focus-within` rule also gives the
 * focused row the `surfaceHover` + border treatment). The play walks the
 * keyboard path: Tab reaches the row, Enter activates it, Space activates it
 * too (with preventDefault so the page doesn't scroll).
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

/**
 * Interaction test — the canvas intentionally looks like Default (filled).
 * Open the Interactions panel to watch it click the row and assert onClick
 * fires exactly once.
 */
export const ClickBehaviour: Story = {
  name: "Click behaviour (test)",
  play: async ({ args, canvasElement }) => {
    await userEvent.click(within(canvasElement).getByText("18 September 2026"));
    await expect(args.onClick).toHaveBeenCalledOnce();
  },
};

/** Empty / filled / active with the canonical content — the visual-regression shot. */
export const AllVariants: Story = {
  render: () => (
    <div style={{ display: "flex", flexDirection: "column", gap: 12, alignItems: "flex-start" }}>
      <FieldRow icon={<CalendarIcon style={{ flexShrink: 0 }} />} label="Target" />
      <FieldRow icon={<CalendarIcon style={{ flexShrink: 0 }} />}>{canonicalFilled}</FieldRow>
      <FieldRow icon={<CalendarIcon style={{ flexShrink: 0 }} />} active>
        {canonicalFilled}
      </FieldRow>
    </div>
  ),
};
