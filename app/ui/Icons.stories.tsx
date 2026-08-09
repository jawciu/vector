import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import * as Icons from "./Icons";
import { PriorityIcon } from "./Icons";
import { dsMetaDescription } from "./ds-meta";
import { meta as dsMeta } from "./Icons.meta";

/**
 * Icons is a registry module (7 named exports), not a single component, so the
 * headline story is an auto-generated grid: it maps over every export, so a
 * new icon added to Icons.tsx appears here with zero story edits — the grid
 * can never drift from the registry.
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

/** Every exported icon, labelled with its export name. */
export const AllIcons: Story = {
  render: () => (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(120px, 1fr))", gap: 12 }}>
      {Object.entries(Icons)
        .filter(([, exported]) => typeof exported === "function")
        .map(([name, Icon]) => (
          <div
            key={name}
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 10,
              padding: "16px 8px 12px",
              border: "1px solid var(--border)",
              borderRadius: 8,
            }}
          >
            <Icon />
            <span style={{ fontSize: 12, color: "var(--text-muted)", fontFamily: "var(--font-geist-mono)" }}>
              {name}
            </span>
          </div>
        ))}
    </div>
  ),
};

/**
 * PriorityIcon is the one stateful icon: the bar colouring is owned here
 * (unset → all muted; low/medium/high fill bottom-up with `action`).
 */
export const PriorityStates: Story = {
  render: () => (
    <div style={{ display: "flex", gap: 24 }}>
      {([null, "low", "medium", "high"] as const).map((priority) => (
        <div
          key={priority ?? "unset"}
          style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}
        >
          <PriorityIcon priority={priority} size={18} />
          <span style={{ fontSize: 12, color: "var(--text-muted)", fontFamily: "var(--font-geist-mono)" }}>
            {priority ?? "unset"}
          </span>
        </div>
      ))}
    </div>
  ),
};
