import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { useEffect, useRef, useState } from "react";
import { expect, fn, userEvent, waitFor, within } from "storybook/test";
import { MenuTriggerButton, MenuList, MenuOption } from "./Menu";
import { TASK_STATUSES, STATUS_COLORS } from "@/lib/constants";
import { dsMetaDescription } from "./ds-meta";
import { meta as dsMeta } from "./Menu.meta";

/**
 * Menu is a registry of three primitives (trigger / list / option), so the
 * stories render compositions rather than one component. The list stories
 * reproduce the real task status menu (TaskDrawer) — same TASK_STATUSES
 * labels, same status-pill spans inside each option.
 */
const config: Meta = {
  tags: ["autodocs"],
  parameters: {
    docs: { description: { component: dsMetaDescription(dsMeta) } },
    dsMeta,
  },
};
export default config;

type Story = StoryObj;

/** The status-pill span rendered inside each option, as TaskDrawer does. */
function StatusPill({ status }: { status: string }) {
  const color =
    (STATUS_COLORS as Record<string, string>)[status] ?? "var(--text-muted)";
  return (
    <span
      style={{
        color,
        border: `0.5px solid ${color}`,
        padding: "1px 4px",
        borderRadius: 6,
        fontSize: 12,
      }}
    >
      {status}
    </span>
  );
}

export const TriggerDefault: Story = {
  render: () => <MenuTriggerButton>Status</MenuTriggerButton>,
};

/** `active` while the menu is open — persistent surfaceHover fill. */
export const TriggerActive: Story = {
  render: () => <MenuTriggerButton active>Status</MenuTriggerButton>,
};

/** The real task status menu: trigger open, list anchored below it. */
export const ListWithOptions: Story = {
  render: () => (
    <div style={{ position: "relative", width: "fit-content", minHeight: 220 }}>
      <MenuTriggerButton active>Status</MenuTriggerButton>
      <MenuList style={{ minWidth: "100%" }}>
        {TASK_STATUSES.map((s: string) => (
          <MenuOption key={s} active={s === "In progress"}>
            <StatusPill status={s} />
          </MenuOption>
        ))}
      </MenuList>
    </div>
  ),
};

/** Selected row: menu-option-active fill, text/weight step up, aria-selected. */
export const OptionSelected: Story = {
  render: () => (
    <div style={{ width: 144 }}>
      <MenuOption active>In progress</MenuOption>
    </div>
  ),
};

/** Hover state (pseudo): bgHover wash on the row. */
export const OptionHover: Story = {
  parameters: { pseudo: { hover: true } },
  render: () => (
    <div style={{ width: 144 }}>
      <MenuOption>Under investigation</MenuOption>
    </div>
  ),
};

/**
 * THE PLAYGROUND — full lifecycle: trigger opens the list, clicking an
 * option selects it and closes, clicking outside closes. The parent owns
 * `open` + outside-click, exactly like the 14 real consumers. no-vrt.
 */
export const Interactive: StoryObj<{ onSelect: (status: string) => void }> = {
  tags: ["no-vrt"],
  args: { onSelect: fn() },
  render: (args) => {
    function MenuPlayground() {
      const [open, setOpen] = useState(false);
      const [status, setStatus] = useState("Not started");
      const wrapperRef = useRef<HTMLDivElement>(null);

      // Outside-click closes — callers own this until the DS grows a
      // managed menu (see the meta's honest gaps).
      useEffect(() => {
        if (!open) return;
        const onMouseDown = (e: MouseEvent) => {
          if (!wrapperRef.current?.contains(e.target as Node)) setOpen(false);
        };
        document.addEventListener("mousedown", onMouseDown);
        return () => document.removeEventListener("mousedown", onMouseDown);
      }, [open]);

      return (
        <div style={{ minHeight: 260, padding: 24 }}>
          <div
            ref={wrapperRef}
            style={{ position: "relative", width: "fit-content" }}
          >
            <MenuTriggerButton active={open} onClick={() => setOpen((o) => !o)}>
              <StatusPill status={status} />
            </MenuTriggerButton>
            {open && (
              <MenuList style={{ minWidth: "100%" }}>
                {TASK_STATUSES.map((s: string) => (
                  <MenuOption
                    key={s}
                    active={status === s}
                    onClick={() => {
                      args.onSelect(s);
                      setStatus(s);
                      setOpen(false);
                    }}
                  >
                    <StatusPill status={s} />
                  </MenuOption>
                ))}
              </MenuList>
            )}
          </div>
        </div>
      );
    }
    return <MenuPlayground />;
  },
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);

    // Trigger opens the list.
    await userEvent.click(canvas.getByRole("button", { name: "Not started" }));
    const listbox = canvas.getByRole("listbox");
    await expect(within(listbox).getAllByRole("option")).toHaveLength(6);

    // Clicking an option fires the selection and closes the list.
    await userEvent.click(within(listbox).getByRole("option", { name: "Blocked" }));
    await expect(args.onSelect).toHaveBeenCalledWith("Blocked");
    await waitFor(() => expect(canvas.queryByRole("listbox")).toBeNull());

    // Re-open: the chosen option carries aria-selected.
    await userEvent.click(canvas.getByRole("button", { name: "Blocked" }));
    const reopened = canvas.getByRole("listbox");
    await expect(
      within(reopened).getByRole("option", { name: "Blocked" })
    ).toHaveAttribute("aria-selected", "true");
    await expect(
      within(reopened).getByRole("option", { name: "Done" })
    ).toHaveAttribute("aria-selected", "false");
  },
};
