import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import type { ComponentType } from "react";
import { expect, fn, userEvent, within } from "storybook/test";
import { useState } from "react";
import CalendarDropdown from "./CalendarDropdown";
import FieldRow from "./FieldRow";
import { CalendarIcon } from "./Icons";
import { dsMetaDescription } from "./ds-meta";
import { meta as dsMeta } from "./CalendarDropdown.meta";

/** Fixed month so the story renders the same grid on any day (VRT-friendly). */
const VIEW_MONTH = new Date(2026, 7, 1); // August 2026

interface HostProps {
  value?: string;
  onChange?: (date: string) => void;
  onClear?: () => void;
  onClose?: () => void;
}

/**
 * The minimal anchor the real app uses (TaskDrawer's Target row): a
 * `position: relative` wrapper holding a FieldRow trigger, with the dropdown
 * conditionally rendered below it. CalendarDropdown is fully controlled, so
 * the host owns `viewDate` and the selected value.
 */
function CalendarHost({ value = "", onChange, onClear, onClose }: HostProps) {
  const [viewDate, setViewDate] = useState(VIEW_MONTH);
  const [selected, setSelected] = useState(value);
  return (
    <div style={{ minHeight: 400, width: 320 }}>
      <div className="relative">
        <FieldRow icon={<CalendarIcon style={{ flexShrink: 0 }} />} active>
          <span className="text-sm" style={{ color: "var(--text-muted)" }}>Target</span>
          {selected && (
            <span className="text-sm" style={{ color: "var(--text)" }}>
              {new Date(selected + "T00:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}
            </span>
          )}
        </FieldRow>
        <CalendarDropdown
          value={selected}
          viewDate={viewDate}
          onViewDateChange={setViewDate}
          onChange={(date: string) => {
            setSelected(date);
            onChange?.(date);
          }}
          onClear={() => {
            setSelected("");
            onClear?.();
          }}
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
    // KNOWN VIOLATION, documented not fixed (audit Lens 3 / CalendarDropdown
    // meta): the month prev/next buttons are icon-only with no accessible
    // name, which axe flags as critical. Marked todo until the component
    // grows aria-labels.
    a11y: { test: "todo" },
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

/** Open picker, nothing selected. Today (if in view) gets a border ring only. */
export const Default: Story = {};

/**
 * THE PLAYGROUND — starts COLLAPSED, exactly as the field looks at rest in
 * the task drawer. Click the Target row to open the picker; picking a date
 * (or clicking the row again) closes it and the row shows the value. The
 * other stories are frozen open states for docs and screenshot tests; this
 * one is for experiencing the real open/close flow. no-vrt.
 */
export const Interactive: Story = {
  tags: ["no-vrt"],
  render: (args) => {
    function ToggleHost() {
      const [open, setOpen] = useState(false);
      const [viewDate, setViewDate] = useState(VIEW_MONTH);
      const [selected, setSelected] = useState("");
      return (
        <div style={{ minHeight: 400, width: 320 }}>
          <div className="relative">
            <div onClick={() => setOpen((o) => !o)}>
              <FieldRow icon={<CalendarIcon style={{ flexShrink: 0 }} />} active={open}>
                <span className="text-sm" style={{ color: "var(--text-muted)" }}>Target</span>
                {selected && (
                  <span className="text-sm" style={{ color: "var(--text)" }}>
                    {new Date(selected + "T00:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}
                  </span>
                )}
              </FieldRow>
            </div>
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
                onClear={() => setSelected("")}
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

/** Clicking a day reports the YYYY-MM-DD string and fills the cell. */
export const DayClick: Story = {
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
  args: { value: "2026-08-14" },
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "Clear" }));
    await expect(args.onClear).toHaveBeenCalledOnce();
    await userEvent.click(canvas.getByRole("button", { name: "Today" }));
    // Today's actual date varies — assert the shape, not the value.
    await expect(args.onChange).toHaveBeenCalledWith(
      expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
    );
  },
};

/**
 * Month paging via the header chevrons. They have no accessible name (see
 * the meta's a11y gaps), so this play selects them positionally — the first
 * two buttons in the DOM are prev/next.
 */
export const MonthNavigation: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText("August 2026")).toBeInTheDocument();
    const [, nextButton] = canvas.getAllByRole("button");
    await userEvent.click(nextButton);
    await expect(canvas.getByText("September 2026")).toBeInTheDocument();
  },
};
