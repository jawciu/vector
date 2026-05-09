import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getAICallStats, getRecentAICalls, getIntegrationStats, countAmbiguousEvents, listExternalEventsForAdmin } from "@/lib/db";
import ScanStaleButton from "@/app/components/ScanStaleButton";
import TestWebhookPanel from "@/app/components/TestWebhookPanel";
import AdminAITabs from "@/app/components/AdminAITabs";
import PipelineTimeline from "@/app/components/PipelineTimeline";
import { promises as fs } from "node:fs";
import path from "node:path";

async function listFixtureNames() {
  try {
    const dir = path.join(process.cwd(), "lib/integrations/miniti/fixtures");
    const entries = await fs.readdir(dir);
    return entries
      .filter((f) => f.endsWith(".json"))
      .map((f) => f.replace(/\.json$/, ""))
      .sort();
  } catch {
    return [];
  }
}

export const dynamic = "force-dynamic";

/** Internal AI usage / cost / error dashboard. Auth-gated. */
export default async function AdminAIPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [stats30d, stats7d, statsToday, recent, minitiStats7d, minitiStats30d, ambiguousNow, pipelineEvents, fixtures] = await Promise.all([
    getAICallStats({ days: 30 }),
    getAICallStats({ days: 7 }),
    getAICallStats({ days: 1 }),
    getRecentAICalls({ limit: 50 }),
    getIntegrationStats({ source: "miniti", days: 7 }),
    getIntegrationStats({ source: "miniti", days: 30 }),
    countAmbiguousEvents({ source: "miniti" }),
    listExternalEventsForAdmin({ limit: 100, state: "all" }),
    listFixtureNames(),
  ]);

  const total = (rows) => rows.reduce((acc, r) => acc + r.totalCostUsd, 0);
  const totalCalls = (rows) => rows.reduce((acc, r) => acc + r.count, 0);
  const totalErrors = (rows) => rows.reduce((acc, r) => acc + r.errorCount, 0);

  const overviewTab = (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
        <SummaryCard label="Today" cost={total(statsToday)} calls={totalCalls(statsToday)} errors={totalErrors(statsToday)} />
        <SummaryCard label="Last 7 days" cost={total(stats7d)} calls={totalCalls(stats7d)} errors={totalErrors(stats7d)} />
        <SummaryCard label="Last 30 days" cost={total(stats30d)} calls={totalCalls(stats30d)} errors={totalErrors(stats30d)} />
      </div>

      <Section title="Stale-task scanner">
        <p style={{ fontSize: 12, color: "var(--text-muted)", margin: "0 0 10px", lineHeight: 1.5 }}>
          Walks active onboardings, finds your overdue or blocked tasks, and drafts follow-up emails for each. Runs weekly via cron; you can also trigger it manually.
        </p>
        <ScanStaleButton />
      </Section>

      {ambiguousNow > 0 && (
        <div
          style={{
            padding: "10px 14px",
            borderRadius: 8,
            background: "var(--bg)",
            border: "1px solid var(--border-subtle)",
            fontSize: 13,
            color: "var(--text)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
          }}
        >
          <span>
            <strong>{ambiguousNow}</strong> meeting{ambiguousNow === 1 ? "" : "s"} waiting for manual assignment.
          </span>
          <Link
            href="/ai-drafts"
            style={{ color: "var(--action)", fontSize: 13, fontWeight: 500 }}
          >
            Review →
          </Link>
        </div>
      )}
    </div>
  );

  const usageTab = (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      <Section title="By feature (last 30 days)">
        {stats30d.length === 0 ? (
          <Empty>No AI calls yet.</Empty>
        ) : (
          <table style={{ width: "100%", fontSize: 13, color: "var(--text)", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ color: "var(--text-muted)", textAlign: "left" }}>
                <Th>Kind</Th>
                <Th align="right">Calls</Th>
                <Th align="right">Errors</Th>
                <Th align="right">Total cost</Th>
                <Th align="right">Avg cost</Th>
                <Th align="right">p95 latency</Th>
                <Th align="right">Cache hit %</Th>
              </tr>
            </thead>
            <tbody>
              {stats30d.map((r) => {
                const totalReadable = r.totalInput + r.totalCacheRead;
                const cacheHitPct = totalReadable > 0 ? (r.totalCacheRead / totalReadable) * 100 : 0;
                return (
                  <tr key={r.kind} style={{ borderTop: "1px solid var(--border-subtle)" }}>
                    <Td><code style={{ fontSize: 12 }}>{r.kind}</code></Td>
                    <Td align="right">{r.count}</Td>
                    <Td align="right">
                      {r.errorCount === 0 ? (
                        <span style={{ color: "var(--text-muted)" }}>—</span>
                      ) : (
                        <span style={{ color: "var(--danger)" }}>{r.errorCount}</span>
                      )}
                    </Td>
                    <Td align="right">{usd(r.totalCostUsd)}</Td>
                    <Td align="right">{usd(r.avgCostUsd)}</Td>
                    <Td align="right">{(r.p95DurationMs / 1000).toFixed(1)}s</Td>
                    <Td align="right">{cacheHitPct.toFixed(0)}%</Td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </Section>

      <Section title="Recent calls (latest 50)">
        {recent.length === 0 ? (
          <Empty>No calls logged yet.</Empty>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", fontSize: 12, color: "var(--text)", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ color: "var(--text-muted)", textAlign: "left" }}>
                  <Th>When</Th>
                  <Th>Kind</Th>
                  <Th>Scope</Th>
                  <Th>Model</Th>
                  <Th align="right">In / cache R / cache W / Out</Th>
                  <Th align="right">Cost</Th>
                  <Th align="right">Duration</Th>
                  <Th>Status</Th>
                </tr>
              </thead>
              <tbody>
                {recent.map((r) => (
                  <tr key={r.id} style={{ borderTop: "1px solid var(--border-subtle)" }}>
                    <Td><time>{new Date(r.createdAt).toLocaleString()}</time></Td>
                    <Td><code style={{ fontSize: 11 }}>{r.kind}</code></Td>
                    <Td>{r.scopeId ?? <span style={{ color: "var(--text-muted)" }}>—</span>}</Td>
                    <Td><span style={{ color: "var(--text-muted)" }}>{r.model}</span></Td>
                    <Td align="right" style={{ fontFamily: "monospace", fontSize: 11 }}>
                      {r.inputTokens} / {r.cacheReadTokens} / {r.cacheWriteTokens} / {r.outputTokens}
                    </Td>
                    <Td align="right">{usd(r.costUsd)}</Td>
                    <Td align="right">{(r.durationMs / 1000).toFixed(1)}s</Td>
                    <Td>
                      {r.error ? (
                        <span style={{ color: "var(--danger)", fontSize: 11 }}>{r.error}</span>
                      ) : (
                        <span style={{ color: "var(--success, #5cd6a5)", fontSize: 11 }}>ok</span>
                      )}
                    </Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>
    </div>
  );

  const pipelineTab = (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      <Section title="Miniti throughput">
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 16 }}>
          <IntegrationCard label="Last 7 days" stats={minitiStats7d} />
          <IntegrationCard label="Last 30 days" stats={minitiStats30d} />
        </div>
      </Section>

      <Section title="Event timeline">
        <p style={{ fontSize: 12, color: "var(--text-muted)", margin: "0 0 10px", lineHeight: 1.5 }}>
          Every Miniti event we&rsquo;ve received, newest first. Filter by state to focus on stuck, ambiguous, or test runs. Expand a row to see the meeting metadata, Pass 1 extraction, Pass 2 tool calls, drafts produced, and the full transcript.
        </p>
        <PipelineTimeline events={pipelineEvents} />
      </Section>
    </div>
  );

  const testTab = (
    <Section title="Test webhook">
      <TestWebhookPanel fixtures={fixtures} />
    </Section>
  );

  return (
    <div className="w-full h-full overflow-y-auto" style={{ padding: 24 }}>
      <div style={{ maxWidth: 1100, margin: "0 auto", display: "flex", flexDirection: "column", gap: 24 }}>
        <header>
          <h1 style={{ fontSize: 22, fontWeight: 600, color: "var(--text)", margin: 0 }}>
            Vector — usage & cost
          </h1>
          <p style={{ fontSize: 13, color: "var(--text-muted)", margin: "4px 0 0" }}>
            Internal observability dashboard. Anthropic Console has the raw billing view.
          </p>
        </header>

        <AdminAITabs
          tabs={[
            { id: "overview", label: "Overview", content: overviewTab },
            { id: "usage", label: "Usage", content: usageTab },
            { id: "pipeline", label: "Pipeline", content: pipelineTab },
            { id: "test", label: "Test webhook", content: testTab },
          ]}
        />
      </div>
    </div>
  );
}

function IntegrationCard({ label, stats }) {
  const { total, processed, ambiguous, errored, stuck, inFlight, stranded } = stats;
  const successRate = total > 0 ? Math.round((processed / total) * 100) : null;

  return (
    <div
      style={{
        padding: "14px 16px",
        borderRadius: 10,
        background: "var(--surface)",
        border: "1px solid var(--border)",
        display: "flex",
        flexDirection: "column",
        gap: 6,
      }}
    >
      <span style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: 0.5, color: "var(--text-muted)" }}>
        {label}
      </span>
      <span style={{ fontSize: 22, fontWeight: 600, color: "var(--text)" }}>{total}</span>
      <span style={{ fontSize: 12, color: "var(--text-muted)" }}>
        events received{successRate != null ? ` · ${successRate}% processed cleanly` : ""}
      </span>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 4 }}>
        <Pill label="processed" value={processed} color="var(--success, #5cd6a5)" />
        {inFlight > 0 && <Pill label="in-flight" value={inFlight} color="var(--text-muted)" />}
        {ambiguous > 0 && <Pill label="ambiguous" value={ambiguous} color="var(--alert)" />}
        {stuck > 0 && <Pill label="stuck" value={stuck} color="var(--danger)" />}
        {errored > 0 && <Pill label="errored" value={errored} color="var(--danger)" />}
        {stranded > 0 && <Pill label="stranded" value={stranded} color="var(--danger)" />}
      </div>
    </div>
  );
}

function Pill({ label, value, color }) {
  return (
    <span
      style={{
        fontSize: 11,
        color,
        padding: "2px 8px",
        borderRadius: 4,
        border: `1px solid ${color}`,
      }}
    >
      {value} {label}
    </span>
  );
}

function SummaryCard({ label, cost, calls, errors }) {
  return (
    <div
      style={{
        padding: "14px 16px",
        borderRadius: 10,
        background: "var(--surface)",
        border: "1px solid var(--border)",
        display: "flex",
        flexDirection: "column",
        gap: 4,
      }}
    >
      <span style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: 0.5, color: "var(--text-muted)" }}>
        {label}
      </span>
      <span style={{ fontSize: 24, fontWeight: 600, color: "var(--text)" }}>{usd(cost)}</span>
      <span style={{ fontSize: 12, color: "var(--text-muted)" }}>
        {calls} call{calls === 1 ? "" : "s"}
        {errors > 0 && (
          <>
            {" · "}
            <span style={{ color: "var(--danger)" }}>{errors} error{errors === 1 ? "" : "s"}</span>
          </>
        )}
      </span>
    </div>
  );
}

function Section({ title, children }) {
  return (
    <section style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <h2 style={{ fontSize: 14, fontWeight: 600, color: "var(--text)", margin: 0 }}>{title}</h2>
      <div
        style={{
          padding: "12px 16px",
          borderRadius: 10,
          background: "var(--surface)",
          border: "1px solid var(--border)",
        }}
      >
        {children}
      </div>
    </section>
  );
}

function Empty({ children }) {
  return <p style={{ fontSize: 13, color: "var(--text-muted)", margin: 0 }}>{children}</p>;
}

function Th({ children, align = "left" }) {
  return (
    <th style={{ fontWeight: 500, padding: "6px 8px", textAlign: align }}>
      {children}
    </th>
  );
}

function Td({ children, align = "left", style }) {
  return (
    <td style={{ padding: "6px 8px", textAlign: align, ...style }}>
      {children}
    </td>
  );
}

function usd(n) {
  if (n < 0.001) return `$${(n * 1000).toFixed(2)}m`;
  if (n < 1) return `$${n.toFixed(3)}`;
  return `$${n.toFixed(2)}`;
}
