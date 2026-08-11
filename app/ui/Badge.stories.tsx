import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import Badge, { type BadgeColor } from "./Badge";
import { dsMetaDescription } from "./ds-meta";
import { meta as dsMeta } from "./Badge.meta";

const COLORS: BadgeColor[] = ["success", "danger", "alert", "action", "muted"];

/** Example label per colour so the grid reads like real product copy. */
const LABELS: Record<BadgeColor, string> = {
  success: "On track",
  danger: "Declining",
  alert: "At risk",
  action: "New",
  muted: "Not started",
};

const config: Meta<typeof Badge> = {
  component: Badge,
  tags: ["autodocs"],
  parameters: {
    docs: { description: { component: dsMetaDescription(dsMeta) } },
    dsMeta,
  },
  args: { children: "On track", color: "success" },
};
export default config;

type Story = StoryObj<typeof Badge>;

/** Outlined default: border + text in the status colour. */
export const Outlined: Story = {};

/** Filled: status-colour fill, textDark text — the louder header variant. */
export const Filled: Story = { args: { filled: true } };

/** Every colour, outlined — the visual-regression grid. */
export const AllOutlined: Story = {
  render: () => (
    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
      {COLORS.map((color) => (
        <Badge key={color} color={color}>
          {LABELS[color]}
        </Badge>
      ))}
    </div>
  ),
};

/** Every colour, filled. */
export const AllFilled: Story = {
  render: () => (
    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
      {COLORS.map((color) => (
        <Badge key={color} color={color} filled>
          {LABELS[color]}
        </Badge>
      ))}
    </div>
  ),
};
