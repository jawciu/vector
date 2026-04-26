import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getAICallStats, getRecentAICalls } from "@/lib/db";

export const dynamic = "force-dynamic";

/** Internal AI usage / cost / error dashboard. Auth-gated. */
export default async function AdminAIPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [stats30d, stats7d, statsToday, recent] = await Promise.all([
    getAICallStats({ days: 30 }),
    getAICallStats({ days: 7 }),
    getAICallStats({ days: 1 }),
    getRecentAICalls({ limit: 50 }),
  ]);

  const total = (rows) => rows.reduce((acc, r) => acc + r.totalCostUsd, 0);
  const totalCalls = (rows) => rows.reduce((acc, r) => acc + r.count, 0);
  const totalErrors = (rows) => rows.reduce((acc, r) => acc + r.errorCount, 0);

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

        {/* Top-line summary cards */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
          <SummaryCard label="Today" cost={total(statsToday)} calls={totalCalls(statsToday)} errors={totalErrors(statsToday)} />
          <SummaryCard label="Last 7 days" cost={total(stats7d)} calls={totalCalls(stats7d)} errors={totalErrors(stats7d)} />
          <SummaryCard label="Last 30 days" cost={total(stats30d)} calls={totalCalls(stats30d)} errors={totalErrors(stats30d)} />
        </div>

        {/* Per-kind breakdown for the last 30 days */}
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

        {/* Recent calls log */}
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
    </div>
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
