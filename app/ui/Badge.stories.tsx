import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import Badge, { STATUS_COLOR, type BadgeColor, type BadgeStatus } from "./Badge";
import { dsMetaDescription } from "./ds-meta";
import { meta as dsMeta } from "./Badge.meta";

const COLORS: BadgeColor[] = ["success", "danger", "alert", "action", "muted", "mint", "sky", "candy"];
const STATUSES = Object.keys(STATUS_COLOR) as BadgeStatus[];

/** Example label per colour so the grid reads like real product copy. */
const LABELS: Record<BadgeColor, string> = {
  success: "On track",
  danger: "Blocked",
  alert: "At risk",
  action: "New",
  muted: "Not started",
  mint: "In progress",
  sky: "Under investigation",
  candy: "On hold",
};

const row = { display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" as const };

const config: Meta<typeof Badge> = {
  component: Badge,
  tags: ["autodocs"],
  parameters: {
    docs: { description: { component: dsMetaDescription(dsMeta) } },
    dsMeta,
  },
  args: { children: "On track", color: "success" },
  argTypes: {
    variant: { control: "radio", options: ["outlined", "filled"] },
    size: {
      control: "radio",
      options: ["md", "sm"],
      description: "Outlined only. Filled has one size.",
      if: { arg: "variant", neq: "filled" },
    },
    color: { control: "select", options: COLORS },
    status: {
      control: "select",
      options: STATUSES,
      description: "Task status. Replaces `color`: Badge owns the mapping.",
    },
    children: { control: "text" },
  },
};
export default config;

type Story = StoryObj<typeof Badge>;

/** Outlined md: the kanban card chip. */
export const Outlined: Story = {};

/** Outlined sm: the task drawer status picker chip. */
export const OutlinedSmall: Story = { name: "Outlined small", args: { size: "sm" } };

/** Filled: the board header blocked-count pill, and the AI trend pill. Health is never filled. */
export const Filled: Story = { args: { variant: "filled" } };

/** Task status in: Badge picks the colour. */
export const ByStatus: Story = {
  name: "By status",
  args: { status: "In progress", color: undefined, children: "In progress" },
};

/** Every colour, outlined md. */
export const AllOutlined: Story = {
  name: "All colours, outlined",
  render: () => (
    <div style={row}>
      {COLORS.map((color) => (
        <Badge key={color} color={color}>
          {LABELS[color]}
        </Badge>
      ))}
    </div>
  ),
};

/** Every colour, outlined sm. */

/** Every colour, filled. */
export const AllFilled: Story = {
  name: "All colours, filled",
  render: () => (
    <div style={row}>
      {COLORS.map((color) => (
        <Badge key={color} color={color} variant="filled">
          {LABELS[color]}
        </Badge>
      ))}
    </div>
  ),
};

/** Every task status through the `status` prop, both variants. */
export const AllStatuses: Story = {
  name: "All task statuses",
  render: () => (
    <div style={{ display: "grid", gap: 12 }}>
      <div style={row}>
        {STATUSES.map((status) => (
          <Badge key={status} status={status}>
            {status}
          </Badge>
        ))}
      </div>
      <div style={row}>
        {STATUSES.map((status) => (
          <Badge key={status} status={status} size="sm">
            {status}
          </Badge>
        ))}
      </div>
      <div style={row}>
        {STATUSES.map((status) => (
          <Badge key={status} status={status} variant="filled">
            {status}
          </Badge>
        ))}
      </div>
    </div>
  ),
};
