import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import type { ComponentType, CSSProperties, ReactNode } from "react";
import {
  InsightCard as InsightCardJs,
  InsightCardHeader as InsightCardHeaderJs,
  InsightDivider,
  InsightSection,
  InsightStatusPill,
  RiskCard,
  WinRow,
  FocusTodayItem as FocusTodayItemJs,
  ThisWeekRow,
  EmptyMessage,
} from "./InsightCard";
import InlineProse from "./InlineProse";
import { dsMetaDescription } from "./ds-meta";
import { meta as dsMeta } from "./InsightCard.meta";

/**
 * InsightCard.js stays JS this phase, so TS infers destructured props as
 * required `any`s. These casts restate the real (optional) APIs purely for
 * story typing; delete them when the module converts to TSX.
 */
const InsightCard = InsightCardJs as unknown as ComponentType<{
  isStreaming?: boolean;
  children?: ReactNode;
  style?: CSSProperties;
}>;
const InsightCardHeader = InsightCardHeaderJs as unknown as ComponentType<{
  title: ReactNode;
  statusPill?: ReactNode;
  isStreaming?: boolean;
  payload?: unknown;
  onRegenerate?: () => void;
}>;
const FocusTodayItem = FocusTodayItemJs as unknown as ComponentType<{
  index: number;
  reason: string;
  task?: Record<string, unknown> | null;
  onTaskClick?: (task: unknown) => void;
}>;

/**
 * Compositional primitives — the interesting story is the realistic full
 * card (mirroring InsightsPanel's vendor overview), plus focused stories for
 * each sub-primitive's variants. The streaming/payload state machine lives
 * with consumers; these stories only exercise the presentational contract.
 */
const config: Meta<typeof InsightCard> = {
  component: InsightCard,
  subcomponents: {
    InsightCardHeader,
    InsightDivider,
    InsightSection,
    InsightStatusPill,
    RiskCard,
    WinRow,
    FocusTodayItem,
    ThisWeekRow,
    EmptyMessage,
  },
  tags: ["autodocs"],
  parameters: {
    layout: "padded",
    docs: { description: { component: dsMetaDescription(dsMeta) } },
    dsMeta,
  },
};
export default config;

type Story = StoryObj<typeof InsightCard>;

/** Caption for the variant grids. */
function VariantLabel({ children }: { children: string }) {
  return (
    <span style={{ fontSize: 12, color: "var(--text-muted)", fontFamily: "var(--font-geist-mono)" }}>
      {children}
    </span>
  );
}

/** Realistic task for the Focus today section (TaskCardView underneath). */
const FOCUS_TASK = {
  taskId: "AC-12",
  title: "Configure SSO for pilot users",
  status: "Blocked",
  due: "2026-08-12",
  owner: "Priya Nair",
  priority: "high",
  notes: "Waiting on SAML metadata from their IT team.",
  files: [],
  commentCount: 3,
  blockedByTask: null,
};

/**
 * The full vendor-overview composition, copied from InsightsPanel: header
 * (sparkle + company + status pill + regenerate), the oi-row--top grid
 * (Summary | Risks | Wins), divider, and the oi-row--bottom grid
 * (Focus today | This week). Backticked task references render as chips
 * via InlineProse.
 */
export const ComposedOverview: Story = {
  render: () => (
    <InsightCard>
      <InsightCardHeader
        title="Acme Logistics"
        statusPill={<InsightStatusPill status="declining" />}
        onRegenerate={() => {}}
      />
      <div className="oi-row oi-row--top">
        <InsightSection title="Summary" className="oi-section oi-section--summary">
          <div className="oi-section-body">
            <p style={{ fontSize: 14, lineHeight: "18px", color: "var(--text)", margin: 0 }}>
              <InlineProse text={"Kick-off is complete and sandbox credentials are issued, but `Configure SSO for pilot users` has slipped a week and the customer has gone quiet on the data-mapping thread."} />
            </p>
          </div>
        </InsightSection>
        <InsightSection title="Risks" className="oi-section oi-section--risks">
          <div className="oi-section-body">
            <div style={{ display: "flex", gap: 0, borderRadius: 12, overflow: "hidden", flex: 1, alignItems: "stretch" }}>
              <RiskCard
                severity="high"
                summary={"`Configure SSO for pilot users` is blocked on the customer's IT team and gates four downstream tasks."}
                position="left"
              />
              <RiskCard
                severity="medium"
                summary="No reply on the data-mapping thread for five working days."
                position="right"
              />
            </div>
          </div>
        </InsightSection>
        <InsightSection title="Wins" className="oi-section oi-section--wins">
          <div className="oi-section-body">
            <div style={{ display: "flex", flexDirection: "column", borderRadius: 12, overflow: "hidden", flex: 1 }}>
              <WinRow headline="Sandbox delivered early." detail="Two days ahead of the target date." position="top" />
              <WinRow headline="All kick-off actions closed." detail="Six of six completed within the first week." position="bottom" />
            </div>
          </div>
        </InsightSection>
      </div>
      <InsightDivider />
      <div className="oi-row oi-row--bottom">
        <InsightSection title="Focus today" className="oi-section oi-section--focus">
          <div className="oi-section-body">
            <div style={{ display: "flex", gap: 24, flex: 1, alignItems: "stretch", flexWrap: "wrap" }}>
              <FocusTodayItem
                index={1}
                reason={"Chase the IT contact on `Configure SSO for pilot users` — it gates the whole pilot cohort."}
                task={FOCUS_TASK}
                onTaskClick={() => {}}
              />
              <FocusTodayItem
                index={2}
                reason="Re-open the data-mapping thread with a summary of exactly what is missing."
              />
            </div>
          </div>
        </InsightSection>
        <InsightSection title="This week" className="oi-section oi-section--week">
          <div className="oi-section-body">
            <div style={{ display: "flex", flexDirection: "column", borderRadius: 12, overflow: "hidden", flex: 1 }}>
              <ThisWeekRow summary={"Get `Configure SSO for pilot users` unblocked or agree a revised go-live date."} priority="high" position="top" />
              <ThisWeekRow summary="Confirm the pilot user list with the customer champion." priority="medium" position="middle" />
              <ThisWeekRow summary="Draft the week-three progress note for the exec sponsor." priority="low" position="bottom" />
            </div>
          </div>
        </InsightSection>
      </div>
    </InsightCard>
  ),
};

/**
 * `isStreaming` — the rotating ai-gradient border (`.is-streaming`) plus the
 * header's disabled regenerate button and "regenerating…" note (shown when a
 * previous payload is still on screen). Reduced motion pauses the spin.
 */
export const Streaming: Story = {
  render: () => (
    <InsightCard isStreaming>
      <InsightCardHeader
        title="Acme Logistics"
        statusPill={<InsightStatusPill status="declining" />}
        isStreaming
        payload={{}}
        onRegenerate={() => {}}
      />
      <div className="oi-row oi-row--top" style={{ gridTemplateColumns: "1fr", gridTemplateAreas: '"summary"' }}>
        <InsightSection title="Summary" className="oi-section oi-section--summary">
          <div className="oi-section-body">
            <p style={{ fontSize: 14, lineHeight: "18px", color: "var(--text)", margin: 0 }}>
              Kick-off is complete and sandbox credentials are issued, but the SSO
              task has slipped a week…
            </p>
          </div>
        </InsightSection>
      </div>
    </InsightCard>
  ),
};

/**
 * The vendor pill states a trend, and only a trend. Health (On track / At
 * risk / Blocked) is computed by `lib/health.js` and rendered by its own
 * pills, so nothing here may borrow those words. Insights cached before the
 * rename still hold the old vocabulary: `normaliseTrend` maps them on the
 * way in, silently, so an old card never crashes and never shows a health
 * word. `At risk` → declining, `On track` → steady.
 */
export const TrendPills: Story = {
  render: () => (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <VariantLabel>trend</VariantLabel>
        <InsightStatusPill status="improving" />
        <InsightStatusPill status="steady" />
        <InsightStatusPill status="declining" />
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <VariantLabel>legacy cached</VariantLabel>
        <InsightStatusPill status="At risk" />
      </div>
    </div>
  ),
};

/** Both pill vocabularies. Unknown statuses fall back to a muted pill. */
export const StatusPillVariants: Story = {
  render: () => (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <VariantLabel>vendor</VariantLabel>
        <InsightStatusPill status="improving" />
        <InsightStatusPill status="steady" />
        <InsightStatusPill status="declining" />
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <VariantLabel>customer</VariantLabel>
        <InsightStatusPill audience="customer" status="On track" />
        <InsightStatusPill audience="customer" status="Needs your input" />
        <InsightStatusPill audience="customer" status="In progress" />
      </div>
    </div>
  ),
};

/**
 * REALITY CHECK (audit Lens 6, finding #19 — documented, not fixed): WinRow
 * only implements `top` and `only` distinctly; `middle` and `bottom` both
 * fall through to the same bottom-rounded branch, so the two rows below
 * render identically. ThisWeekRow is the position API done fully.
 */
export const WinRowPositions: Story = {
  render: () => (
    <div style={{ display: "flex", flexDirection: "column", gap: 24, width: 420 }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <VariantLabel>stacked pair (the real InsightsPanel usage)</VariantLabel>
        <div style={{ display: "flex", flexDirection: "column", borderRadius: 12, overflow: "hidden" }}>
          <WinRow headline="Sandbox delivered early." detail="Two days ahead of target." position="top" />
          <WinRow headline="All kick-off actions closed." detail="Six of six within a week." position="bottom" />
        </div>
      </div>
      {(["top", "middle", "bottom", "only"] as const).map((position) => (
        <div key={position} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <VariantLabel>{position === "middle" ? "middle (falls through — renders as bottom)" : position}</VariantLabel>
          <WinRow headline="Sandbox delivered early." detail="Two days ahead of target." position={position} />
        </div>
      ))}
    </div>
  ),
};

/** All four positions implemented distinctly (unlike WinRow — see above). */
export const ThisWeekRowPositions: Story = {
  render: () => (
    <div style={{ display: "flex", flexDirection: "column", gap: 24, width: 420 }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <VariantLabel>stacked (top / middle / bottom)</VariantLabel>
        <div style={{ display: "flex", flexDirection: "column", borderRadius: 12, overflow: "hidden" }}>
          <ThisWeekRow summary="Get the SSO task unblocked or agree a revised date." priority="high" position="top" />
          <ThisWeekRow summary="Confirm the pilot user list with the champion." priority="medium" position="middle" />
          <ThisWeekRow summary="Draft the week-three progress note." priority="low" position="bottom" />
        </div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <VariantLabel>only</VariantLabel>
        <ThisWeekRow summary="Single strategic priority this week." priority="medium" position="only" />
      </div>
    </div>
  ),
};

/** The blessed empty-section state, in its natural InsightSection habitat. */
export const EmptySection: Story = {
  render: () => (
    <div style={{ width: 320 }}>
      <InsightSection title="Risks" className="oi-section">
        <div className="oi-section-body">
          <EmptyMessage>No active risks.</EmptyMessage>
        </div>
      </InsightSection>
    </div>
  ),
};
