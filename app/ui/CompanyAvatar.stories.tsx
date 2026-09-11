import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import CompanyAvatar from "./CompanyAvatar";
import { dsMetaDescription } from "./ds-meta";
import { meta as dsMeta } from "./CompanyAvatar.meta";

const config: Meta<typeof CompanyAvatar> = {
  component: CompanyAvatar,
  tags: ["autodocs"],
  parameters: {
    docs: { description: { component: dsMetaDescription(dsMeta) } },
    dsMeta,
  },
  args: { name: "Acme Corp" },
};
export default config;

type Story = StoryObj<typeof CompanyAvatar>;

/** Logo branch — bordered, cover-fit. Served from staticDirs (public/logos). */
export const WithLogo: Story = {
  args: { name: "Ashby", logoUrl: "/logos/ashby.png", size: 24, radius: 6 },
};

/** No logoUrl — deterministic palette colour + initials. */
export const InitialsFallback: Story = {
  args: { name: "Acme Corp" },
};

/**
 * The sizes shipped in the app (16 tables/hero, 24 portal shell) plus larger.
 * Font size steps automatically: ≤16 → 10px, ≤20 → 11px, else 12px.
 */
export const Sizes: Story = {
  render: () => (
    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
      {[16, 20, 24, 32].map((size) => (
        <div
          key={size}
          style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}
        >
          <CompanyAvatar name="Acme Corp" size={size} />
          <span style={{ fontSize: 11, color: "var(--text-muted)" }}>{size}px</span>
        </div>
      ))}
    </div>
  ),
};

/**
 * The full 8-colour avatar palette (rotates by name char-code hash — see
 * lib/avatar.js). These names are chosen to hit all 8 buckets:
 * sky / rose / lilac / mint / success / sunset / candy / alert.
 * The colours carry NO meaning — never use them for status.
 */
export const PaletteRange: Story = {
  render: () => (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {[
        "Acme Corp",
        "Fal AI",
        "Globex",
        "Initech",
        "Stark Industries",
        "Wayne Enterprises",
        "Hooli",
        "Soylent",
      ].map((name) => (
        <div key={name} style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <CompanyAvatar name={name} size={20} />
          <span style={{ fontSize: 13 }}>{name}</span>
        </div>
      ))}
    </div>
  ),
};
