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
 * The focus ring on field editors: the main control is a native button, so
 * :focus-visible draws the shared 2px `focusRing` outline. The play walks the
 * keyboard path: Tab reaches the row, Enter activates it, Space too.
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
/**
 * A row whose value can be removed: `onClear` adds an inline Clear (X) at the
 * end of the row, absent at rest and shown on hover, focus-within or active,
 * so the row grows to fit it (the canvas shows hover). The play walks the
 * keyboard path, since synthetic hover cannot set CSS :hover: Tab to the row
 * (reveals the X), Tab to the X, Enter clears, and onClick must NOT fire.
 */
export const WithClear: Story = {
  name: "With clear (test)",
  args: { onClear: fn() },
  parameters: { pseudo: { hover: true } },
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    // Hidden (display:none) at rest, so it is queried only once focus reveals it.
    await expect(canvas.queryByRole("button", { name: "Clear" })).not.toBeInTheDocument();
    await userEvent.tab();
    await expect(canvas.getByRole("button", { name: /Target/ })).toHaveFocus();
    const clear = canvas.getByRole("button", { name: "Clear" });
    await userEvent.tab();
    await expect(clear).toHaveFocus();
    await expect(clear).toBeVisible();
    await userEvent.keyboard("{Enter}");
    await expect(args.onClear).toHaveBeenCalledOnce();
    await expect(args.onClick).not.toHaveBeenCalled();
  },
};

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
