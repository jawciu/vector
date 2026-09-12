import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import type { ComponentType } from "react";
import { expect, fn, userEvent, within } from "storybook/test";
import { useState } from "react";
import CalendarDropdown from "./CalendarDropdown";
import FieldPill from "./FieldPill";
import { CalendarIcon } from "./Icons";
import { dsMetaDescription } from "./ds-meta";
import { meta as dsMeta } from "./CalendarDropdown.meta";

/**
 * Hosts open on the CURRENT month, or on the selected value's month when there
 * is one, exactly as every app call site does (AIDraftInbox, TaskDrawer, the
 * create modals). Stories that assert on month names pass a fixed `value` so
 * their month is deterministic; the playground has none, so it shows today.
 */
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const initialView = (value?: string) => (value ? new Date(value + "T00:00:00") : new Date());
const monthLabel = (d: Date) => `${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
const formatDate = (value: string) =>
  new Date(value + "T00:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });

interface HostProps {
  value?: string;
  onChange?: (date: string) => void;
  onClear?: () => void;
  onClose?: () => void;
}

/**
 * The anchor the real app uses (CreateTaskModal's due-date pill): a
 * `position: relative` wrapper holding a FieldPill trigger with `onClear`,
 * the dropdown rendered below it. CalendarDropdown is fully controlled, so
 * the host owns `viewDate` and the selected value. This host is always open.
 */
function CalendarHost({ value = "", onChange, onClear, onClose }: HostProps) {
  const [viewDate, setViewDate] = useState(() => initialView(value));
  const [selected, setSelected] = useState(value);
  const clear = () => {
    setSelected("");
    onClear?.();
  };
  return (
    <div style={{ minHeight: 400, width: 320 }}>
      <div className="relative">
        <FieldPill icon={<CalendarIcon style={{ flexShrink: 0 }} />} active popup="dialog" onClick={() => {}} onClear={selected ? clear : undefined}>
          <span className="text-sm" style={{ color: "var(--text-muted)" }}>Target</span>
          {selected && (
            <span className="text-sm" style={{ color: "var(--text)" }}>{formatDate(selected)}</span>
          )}
        </FieldPill>
        <CalendarDropdown
          value={selected}
          viewDate={viewDate}
          onViewDateChange={setViewDate}
          onChange={(date: string) => {
            setSelected(date);
            onChange?.(date);
          }}
          onClear={clear}
          onClose={onClose ?? (() => {})}
        />
      </div>
    </div>
  );
}

const config: Meta<typeof CalendarHost> = {
  // CalendarDropdown stays .js this phase; its inferred props (all-required
  // anys) don't match the host's args type, so cast for the docs page.
  component: CalendarDropdown as unknown as ComponentType<HostProps>,
  tags: ["autodocs"],
  parameters: {
    layout: "padded",
    docs: { description: { component: dsMetaDescription(dsMeta) } },
    dsMeta,
  },
  render: (args) => <CalendarHost {...args} />,
  args: {
    onChange: fn(),
    onClear: fn(),
    onClose: fn(),
  },
};
export default config;

type Story = StoryObj<typeof CalendarHost>;

/** Open picker on the current month, nothing selected. Today gets a border ring only. */
export const Default: Story = {};

/**
 * THE PLAYGROUND — starts COLLAPSED, exactly as the field looks at rest in a
 * create modal, and opens on the current month. Click the Target pill to open
 * the picker; picking a date (or clicking the pill again) closes it and the
 * pill shows the value. Hover the filled pill and the Clear (X) appears at its
 * right edge, the app's pattern. The other stories are frozen open states for
 * docs and screenshot tests; this one is for the real flow. no-vrt.
 */
export const Interactive: Story = {
  tags: ["no-vrt"],
  render: (args) => {
    function ToggleHost() {
      const [open, setOpen] = useState(false);
      const [viewDate, setViewDate] = useState(() => new Date());
      const [selected, setSelected] = useState("");
      const clear = () => {
        setSelected("");
        setOpen(false);
      };
      return (
        <div style={{ minHeight: 400, width: 320 }}>
          <div className="relative">
            <FieldPill
              icon={<CalendarIcon style={{ flexShrink: 0 }} />}
              active={open}
              popup="dialog"
              onClick={() => setOpen((o) => !o)}
              onClear={selected ? clear : undefined}
            >
              <span className="text-sm" style={{ color: "var(--text-muted)" }}>Target</span>
              {selected && (
                <span className="text-sm" style={{ color: "var(--text)" }}>{formatDate(selected)}</span>
              )}
            </FieldPill>
            {open && (
              <CalendarDropdown
                value={selected}
                viewDate={viewDate}
                onViewDateChange={setViewDate}
                onChange={(date: string) => {
                  setSelected(date);
                  setOpen(false);
                  args.onChange?.(date);
                }}
                onClear={clear}
                onClose={() => setOpen(false)}
              />
            )}
          </div>
        </div>
      );
    }
    return <ToggleHost />;
  },
};

/** Selected day fills with `action` / `actionText` and goes semibold. */
export const WithSelectedDate: Story = {
  args: { value: "2026-08-14" },
};

/** Clicking a day reports the YYYY-MM-DD string and fills the cell. Fixed month via `value`. */
export const DayClick: Story = {
  name: "Day click (test)",
  args: { value: "2026-08-01" },
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "14" }));
    await expect(args.onChange).toHaveBeenCalledWith("2026-08-14");
    // The host is controlled — the picked cell now renders selected.
    await expect(canvas.getByRole("button", { name: "14" })).toHaveStyle({ fontWeight: "600" });
  },
};

/** Footer: Clear reports onClear; Today reports today's date via onChange. */
export const FooterActions: Story = {
  name: "Footer actions (test)",
  args: { value: "2026-08-14" },
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    // The pill's own X is also named "Clear"; the footer button comes last in the DOM.
    await userEvent.click(canvas.getAllByRole("button", { name: "Clear" }).at(-1)!);
    await expect(args.onClear).toHaveBeenCalledOnce();
    await userEvent.click(canvas.getByRole("button", { name: "Today" }));
    // Today's actual date varies — assert the shape, not the value.
    await expect(args.onChange).toHaveBeenCalledWith(
      expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
    );
  },
};

/**
 * Month paging via the header chevrons, selected by their accessible names
 * ("Previous month" / "Next month") — pinning both the paging behaviour and
 * the labels themselves. The month is fixed via `value`; expected labels are
 * computed from that date, not hardcoded.
 */
const NAV_START = "2026-08-01";
export const MonthNavigation: Story = {
  name: "Month navigation (test)",
  args: { value: NAV_START },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const start = initialView(NAV_START);
    const next = new Date(start.getFullYear(), start.getMonth() + 1, 1);
    await expect(canvas.getByText(monthLabel(start))).toBeInTheDocument();
    await userEvent.click(canvas.getByRole("button", { name: "Next month" }));
    await expect(canvas.getByText(monthLabel(next))).toBeInTheDocument();
    await userEvent.click(canvas.getByRole("button", { name: "Previous month" }));
    await expect(canvas.getByText(monthLabel(start))).toBeInTheDocument();
  },
};

/**
 * The pill's own Clear (X), reached by keyboard (synthetic hover cannot set
 * CSS :hover): Tab to the pill, Tab to the X, Enter empties the pill and
 * reports onClear (the app pattern).
 */
export const ClearFromPill: Story = {
  name: "Clear from pill (test)",
  args: { value: "2026-08-14" },
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.tab();
    await expect(canvas.getByRole("button", { name: /Target/ })).toHaveFocus();
    // The pill's X comes first in the DOM; the footer "Clear" is last.
    const clear = canvas.getAllByRole("button", { name: "Clear" })[0];
    await userEvent.tab();
    await expect(clear).toHaveFocus();
    await expect(clear).toBeVisible();
    await userEvent.keyboard("{Enter}");
    await expect(args.onClear).toHaveBeenCalledOnce();
    await expect(canvas.queryByText(formatDate("2026-08-14"))).not.toBeInTheDocument();
  },
};
