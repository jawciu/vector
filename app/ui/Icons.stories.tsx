import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { GENERIC_ICONS, AI_ICONS, PriorityIcon } from "./Icons";
import { dsMetaDescription } from "./ds-meta";
import { meta as dsMeta } from "./Icons.meta";

/**
 * Icons is a registry module, not a single component, so the headline
 * stories are auto-generated grids driven by the exported category maps
 * (GENERIC_ICONS / AI_ICONS): an icon added to a map in Icons.tsx appears
 * here with zero story edits — the grids can never drift from the registry.
 *
 * AI_ICONS co-presents `Sparkle` (its own module, gradient-locked) with the
 * registry per Caroline's ruling that the sparkle belongs with the icons.
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

function IconGrid({ icons }: { icons: Record<string, React.ComponentType<{ size?: number }>> }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(120px, 1fr))", gap: 12 }}>
      {Object.entries(icons).map(([name, Icon]) => (
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
          <span style={{ fontSize: 12, color: "var(--text-muted)", fontFamily: "var(--font-geist-mono)", textAlign: "center" }}>
            {name}
          </span>
        </div>
      ))}
    </div>
  );
}

/** Every generic icon in the registry, labelled with its export name. */
export const AllIconsGeneric: Story = {
  render: () => <IconGrid icons={GENERIC_ICONS} />,
};

/** The AI-attribution marks — `Sparkle` co-presented with the registry (it keeps its fixed gradient; it is not a currentColor icon). */
export const AllIconsAI: Story = {
  render: () => <IconGrid icons={AI_ICONS} />,
};

/**
 * Icons carry no colour of their own: everything is drawn in `currentColor`,
 * so an icon inherits whatever text colour its parent sets. Colour variants
 * therefore do NOT live in the icon API — put the icon inside an element
 * with the right token colour. (The original 7 field icons bake `--text-muted`
 * as a default via inline style; every sweep icon is pure currentColor.)
 */
export const InheritedColor: Story = {
  render: () => {
    const DEMO_ICONS = [
      "BellIcon",
      "CommentIcon",
      "ClockIcon",
      "CheckCircleSolidIcon",
      "PlusIcon",
      "SearchIcon",
      "CloseIcon",
    ] as const;
    const PARENTS = [
      { label: "text-text-muted", className: "text-text-muted" },
      { label: "text-text", className: "text-text" },
      { label: "text-action", className: "text-action" },
      { label: "text-danger", className: "text-danger" },
    ];
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <p style={{ fontSize: 13, color: "var(--text-secondary)", maxWidth: 560 }}>
          The same icons, unchanged, inside parents with different token
          colours. The icons carry no colour of their own — `currentColor`
          inherits from the parent, so colouring an icon means colouring its
          container, never forking the icon.
        </p>
        {PARENTS.map(({ label, className }) => (
          <div key={label} style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <span style={{ fontSize: 12, color: "var(--text-muted)", fontFamily: "var(--font-geist-mono)", width: 140, flexShrink: 0 }}>
              {label}
            </span>
            <div className={className} style={{ display: "flex", alignItems: "center", gap: 14 }}>
              {DEMO_ICONS.map((name) => {
                const Icon = GENERIC_ICONS[name];
                return <Icon key={name} size={14} />;
              })}
            </div>
          </div>
        ))}
      </div>
    );
  },
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
