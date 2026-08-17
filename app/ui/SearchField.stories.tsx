import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { useState } from "react";
import { expect, fn, userEvent, within } from "storybook/test";
import SearchField from "./SearchField";
import { dsMetaDescription } from "./ds-meta";
import { meta as dsMeta } from "./SearchField.meta";

/**
 * Extracted from the shipped ActionsTab / MeetingsTab `SearchInput`s (the
 * `.search-input` wrapper pattern). Placeholders below are the real ones.
 *
 * NOTE (Caroline's review, pending): two NEW design decisions live here —
 * 1. The clear X icon button (`onClear`) — the shipped ActionsTab search
 *    used a text "Clear" button instead.
 * 2. The disabled state (50% wash) — no shipped search can be disabled.
 */
const config: Meta<typeof SearchField> = {
  component: SearchField,
  tags: ["autodocs"],
  parameters: {
    docs: { description: { component: dsMetaDescription(dsMeta) } },
    dsMeta,
  },
  args: {
    value: "",
    onChange: fn(),
    placeholder: "Search task, follow-up title, meeting…",
    "aria-label": "Search drafts",
  },
  decorators: [
    (Story) => (
      <div style={{ width: 300 }}>
        <Story />
      </div>
    ),
  ],
};
export default config;

type Story = StoryObj<typeof SearchField>;

/** Resting state: `border` on `bg`, magnifier in `textMuted`. */
export const Default: Story = {};

/** The MeetingsTab wording — placeholder is `textMuted`, 13px. */
export const MeetingsPlaceholder: Story = {
  args: {
    placeholder: "Search title, summary, attendees…",
    "aria-label": "Search meetings",
  },
};

export const Filled: Story = {
  args: { value: "kickoff" },
};

/** NEW — pending Caroline's review: clear X appears when non-empty + onClear. */
export const FilledWithClear: Story = {
  args: { value: "kickoff", onClear: fn() },
  play: async ({ args, canvasElement }) => {
    const clear = within(canvasElement).getByRole("button", { name: "Clear search" });
    await userEvent.click(clear);
    await expect(args.onClear).toHaveBeenCalledOnce();
  },
};

export const Hover: Story = { parameters: { pseudo: { hover: true } } };

/** Focus lives on the WRAPPER via :focus-within — `action` border. */
export const FocusWithin: Story = {
  parameters: { pseudo: { focusWithin: true } },
};

/** NEW — pending Caroline's review: no shipped search has a disabled state. */
export const Disabled: Story = {
  args: { value: "kickoff", disabled: true, onClear: fn() },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByRole("textbox")).toBeDisabled();
  },
};

export const TypingBehaviour: Story = {
  tags: ["no-vrt"],
  render: (args) => {
    function SearchPlayground() {
      const [value, setValue] = useState("");
      return (
        <SearchField
          {...args}
          value={value}
          onChange={setValue}
          onClear={() => setValue("")}
        />
      );
    }
    return <SearchPlayground />;
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const input = canvas.getByRole("textbox");
    await userEvent.type(input, "SSO contract");
    await expect(input).toHaveValue("SSO contract");
    // Clear X only exists while non-empty, and empties the field
    await userEvent.click(canvas.getByRole("button", { name: "Clear search" }));
    await expect(input).toHaveValue("");
    await expect(
      canvas.queryByRole("button", { name: "Clear search" })
    ).toBeNull();
  },
};

/** Every state at once — the visual-regression money shot. */
export const AllStates: Story = {
  render: () => (
    <div style={{ display: "flex", flexDirection: "column", gap: 12, width: 300 }}>
      <SearchField
        value=""
        onChange={() => {}}
        placeholder="Search task, follow-up title, meeting…"
        aria-label="Empty"
      />
      <SearchField value="kickoff" onChange={() => {}} aria-label="Filled" />
      <SearchField
        value="kickoff"
        onChange={() => {}}
        onClear={() => {}}
        aria-label="Filled with clear"
      />
      <SearchField
        value="kickoff"
        onChange={() => {}}
        disabled
        aria-label="Disabled"
      />
    </div>
  ),
};
