import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import Sparkle from "./Sparkle";
import { dsMetaDescription } from "./ds-meta";
import { meta as dsMeta } from "./Sparkle.meta";

const config: Meta<typeof Sparkle> = {
  component: Sparkle,
  tags: ["autodocs"],
  parameters: {
    docs: { description: { component: dsMetaDescription(dsMeta) } },
    dsMeta,
  },
};
export default config;

type Story = StoryObj<typeof Sparkle>;

/** Default 16px — the size used next to insight-card titles. */
export const Default: Story = {};

/**
 * The sizes actually shipped in the app: 11 (FollowUpModal inline),
 * 14 (AIDraftInbox), 16 (default), plus larger for future hero contexts.
 * The 14×14 viewBox keeps the gradient mapping identical at every size.
 */
export const Sizes: Story = {
  render: () => (
    <div style={{ display: "flex", alignItems: "flex-end", gap: 16 }}>
      {[12, 16, 24, 32].map((size) => (
        <div
          key={size}
          style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}
        >
          <Sparkle size={size} />
          <span style={{ fontSize: 11, color: "var(--text-muted)" }}>{size}px</span>
        </div>
      ))}
    </div>
  ),
};
