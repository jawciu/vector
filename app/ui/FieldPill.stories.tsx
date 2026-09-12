import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, fn, userEvent, within } from "storybook/test";
import FieldPill from "./FieldPill";
import { CalendarIcon } from "./Icons";
import { dsMetaDescription } from "./ds-meta";
import { meta as dsMeta } from "./FieldPill.meta";

/**
 * ONE canonical content across every state story (Caroline's review call,
 * 2026-08): CalendarIcon + muted "Target" + a date value — the TaskDrawer
 * field idiom. Default/Hover/Active/Focused all render this exact pill, so
 * the ONLY visible difference between those stories is the state itself.
 * The pill is flex-1, so stories render inside a fixed-width wrapper the way
 * a form row would.
 */
const canonicalIcon = <CalendarIcon style={{ flexShrink: 0 }} />;
const canonicalFilled = (
  <>
    <span className="text-sm" style={{ color: "var(--text-muted)" }}>
      Target
    </span>
    <span className="text-sm flex-1" style={{ color: "var(--text)" }}>
      18 September 2026
    </span>
  </>
);

const config: Meta<typeof FieldPill> = {
  component: FieldPill,
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

/**
 * The pill at rest, carrying a value — this IS the filled state. Fill is
 * `bgElevated` with a `buttonSecondaryBorder` hairline; the value reads at
 * full `text`, the field name stays `textMuted`. Every state story below
 * renders this exact content.
 */
export const Default: Story = { name: "Default (filled)" };

/**
 * No value yet: no children, so the muted `label` renders as the placeholder
 * (`textMuted`, same tone as the field name in the filled pill). This is the
 * only story with different content — by definition it has no value.
 */
export const Empty: Story = {
  name: "Empty (placeholder)",
  args: { children: undefined, label: "Target" },
};

/**
 * What hover ACTUALLY changes: the fill steps `bgElevated` → `bgHover` — one
 * step lighter on the surface scale. Border, text and icon are untouched, so
 * against Default the shift is deliberately subtle on this canvas. In the app
 * the pill sits on a `bgElevated` modal, where the rest fill is invisible and
 * that one-step lift is the entire hover affordance. Compare side-by-side
 * with Default (filled) — same content, fill one step lighter.
 */
export const Hover: Story = { parameters: { pseudo: { hover: true } } };

/**
 * `active` holds the pressed look while the pill's dropdown is open:
 * `surfaceHover` fill — one step lighter again than the hover fill, the same
 * hover → active direction as `.menu-option` and IconButton.
 */
export const Active: Story = {
  name: "Active (open)",
  args: { active: true },
  play: async ({ canvasElement }) => {
    const trigger = within(canvasElement).getByRole("button", { expanded: true });
    await expect(trigger).toHaveAttribute("aria-expanded", "true");
    await expect(trigger).toHaveAttribute("aria-haspopup", "menu");
  },
};

/**
 * The focus ring on field editors: the main control is a native button, so
 * :focus-visible draws the shared 2px `focusRing` outline. The play walks the
 * keyboard path: Tab reaches the pill, Enter activates it, Space too.
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

/**
 * Interaction test — the canvas intentionally looks like Default (filled).
 * Open the Interactions panel to watch it click the pill and assert onClick
 * fires exactly once.
 */
export const ClickBehaviour: Story = {
  name: "Click behaviour (test)",
  play: async ({ args, canvasElement }) => {
    await userEvent.click(within(canvasElement).getByText("18 September 2026"));
    await expect(args.onClick).toHaveBeenCalledOnce();
  },
};

/**
 * A pill whose value can be removed: `onClear` adds an inline Clear (X) at the
 * end of the row, absent at rest and shown on hover, focus-within or active,
 * so the pill grows to fit it (the canvas shows the hover state). The play
 * walks the keyboard path, since synthetic hover cannot set CSS :hover: Tab
 * to the pill (reveals the X), Tab to the X, Enter clears, and onClick must
 * NOT fire.
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

/** Empty / filled / active with the canonical content — the visual-regression shot. */
export const AllVariants: Story = {
  render: () => (
    <div style={{ display: "flex", flexDirection: "column", gap: 12, width: 260 }}>
      <FieldPill icon={<CalendarIcon style={{ flexShrink: 0 }} />} label="Target" onClick={() => {}} />
      <FieldPill icon={<CalendarIcon style={{ flexShrink: 0 }} />} onClick={() => {}}>{canonicalFilled}</FieldPill>
      <FieldPill icon={<CalendarIcon style={{ flexShrink: 0 }} />} active onClick={() => {}}>
        {canonicalFilled}
      </FieldPill>
    </div>
  ),
};

/**
 * CONTAINER mode — the pill holds a control instead of opening one. With no
 * `onClick` the main area renders as a plain <div>, so an <input> can live
 * inside it legally: inside a <button> the parser un-nests it (hydration
 * error) and it is a keyboard trap risk. The pressable hover fill and the
 * pointer cursor are off, `onClear` still works, and :focus-within still
 * lights the field. This is CreateOnboardingModal's Domain / Owner pill; it
 * becomes the boxed TextField in slice 4.
 */
export const AsContainer: Story = {
  name: "As container (test)",
  args: { onClick: undefined, children: undefined },
  render: () => (
    <FieldPill icon={canonicalIcon}>
      <input
        type="text"
        aria-label="Domain"
        placeholder="Domain"
        className="text-sm w-full outline-none"
        style={{ background: "transparent", border: "none", color: "var(--text)", padding: 0 }}
      />
    </FieldPill>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const input = canvas.getByLabelText("Domain");
    // The main area is a static container, NOT a button, so the input is legal.
    const main = canvasElement.querySelector(".field-main")!;
    await expect(main.tagName).toBe("DIV");
    await expect(canvasElement.querySelectorAll("button input")).toHaveLength(0);
    // The input is the only tab stop and takes focus on click.
    await userEvent.click(input);
    await expect(input).toHaveFocus();
    await userEvent.type(input, "raycast.com");
    await expect(input).toHaveValue("raycast.com");
  },
};
