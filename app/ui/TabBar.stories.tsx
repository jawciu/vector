import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, fn, userEvent, within } from "storybook/test";
import TabBar, { type Tab } from "./TabBar";
import { dsMetaDescription } from "./ds-meta";
import { meta as dsMeta } from "./TabBar.meta";

const TABS: Tab[] = [
  { id: "overview", label: "Overview" },
  { id: "tasks", label: "Tasks" },
  { id: "details", label: "Details" },
];

/** Small inline glyph standing in for the app's bespoke tab icons (currentColor). */
function DotIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
      <circle cx="7" cy="7" r="5" stroke="currentColor" strokeWidth="1" />
    </svg>
  );
}

const config: Meta<typeof TabBar> = {
  component: TabBar,
  tags: ["autodocs"],
  parameters: {
    docs: { description: { component: dsMetaDescription(dsMeta) } },
    dsMeta,
  },
  args: {
    tabs: TABS,
    activeTab: "overview",
    onTabChange: fn(),
  },
  decorators: [
    (Story) => (
      <div style={{ width: 480 }}>
        <Story />
      </div>
    ),
  ],
};
export default config;

type Story = StoryObj<typeof TabBar>;

export const Default: Story = {};

/** Badge pill hides at 0/null and caps at "99+" past two digits. */
export const WithBadges: Story = {
  args: {
    tabs: [
      { id: "overview", label: "Overview" },
      { id: "tasks", label: "Tasks", badge: 3 },
      { id: "details", label: "Details", badge: 120 },
    ],
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText("3")).toBeInTheDocument();
    await expect(canvas.getByText("99+")).toBeInTheDocument();
    // Count is part of the tab's accessible name via the badge aria-label.
    await expect(
      canvas.getByRole("button", { name: /Tasks.*3 pending/ }),
    ).toBeInTheDocument();
  },
};

/** Each tab active in turn — underline + `text` colour are the only cues. */
export const ActiveStates: Story = {
  render: (args) => (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      {TABS.map((tab) => (
        <TabBar key={tab.id} {...args} activeTab={tab.id} />
      ))}
    </div>
  ),
};

export const Hover: Story = { parameters: { pseudo: { hover: true } } };

export const ClickBehaviour: Story = {
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "Tasks" }));
    await expect(args.onTabChange).toHaveBeenCalledOnce();
    await expect(args.onTabChange).toHaveBeenCalledWith("tasks");
    // Clicking the already-active tab still fires (no internal guard).
    await userEvent.click(canvas.getByRole("button", { name: "Overview" }));
    await expect(args.onTabChange).toHaveBeenCalledWith("overview");
  },
};

/** Plain / icons / badges — the visual-regression shot. */
export const AllVariants: Story = {
  render: () => (
    <div style={{ display: "flex", flexDirection: "column", gap: 24, width: 480 }}>
      <TabBar tabs={TABS} activeTab="overview" onTabChange={fn()} />
      <TabBar
        tabs={TABS.map((t) => ({ ...t, icon: <DotIcon /> }))}
        activeTab="tasks"
        onTabChange={fn()}
      />
      <TabBar
        tabs={[
          { id: "overview", label: "Overview" },
          { id: "tasks", label: "Tasks", badge: 3 },
          { id: "details", label: "Details", badge: 120 },
        ]}
        activeTab="details"
        onTabChange={fn()}
      />
    </div>
  ),
};
