import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, within } from "storybook/test";
import Spinner from "./Spinner";
import { dsMetaDescription } from "./ds-meta";
import { meta as dsMeta } from "./Spinner.meta";

const config: Meta<typeof Spinner> = {
  component: Spinner,
  tags: ["autodocs"],
  parameters: {
    docs: { description: { component: dsMetaDescription(dsMeta) } },
    dsMeta,
  },
};
export default config;

type Story = StoryObj<typeof Spinner>;

/** Default 16px, decorative (aria-hidden) — context must say "loading". */
export const Default: Story = {};

/** The size prop drives fontSize; the ring is 1em so one number scales it. */
export const Sizes: Story = {
  render: () => (
    <div style={{ display: "flex", alignItems: "center", gap: 24 }}>
      {[12, 16, 24, 32, 48].map((size) => (
        <div
          key={size}
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 8,
          }}
        >
          <Spinner size={size} />
          <span style={{ fontSize: 12, color: "var(--text-muted)" }}>
            {size}px
          </span>
        </div>
      ))}
    </div>
  ),
};

/** With a label the spinner becomes an announced role="status" region. */
export const WithLabel: Story = {
  args: { "aria-label": "Loading insights" },
  play: async ({ canvasElement }) => {
    const spinner = within(canvasElement).getByRole("status");
    await expect(spinner).toHaveAttribute("aria-label", "Loading insights");
    await expect(spinner).not.toHaveAttribute("aria-hidden");
  },
};
