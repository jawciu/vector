import Link from "next/link";
import { getOnboardings } from "@/lib/db";

export default async function OnboardingsListPage() {
  const onboardings = await getOnboardings();

  return (
    <main style={{ maxWidth: 720, margin: "40px auto", padding: 16, display: "grid", gap: 16 }}>
      <h1 className="text-4xl font-bold underline">Onboarding Orchestrator</h1>
      <p style={{ fontSize: 14, color: "#4b5563" }}>
        Pick an onboarding to view tasks and health. (Sign in above; roles and personas later.)
      </p>

      <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: 12 }}>
        {onboardings.map((ob) => (
          <li key={ob.id}>
            <Link
              href={`/onboardings/${ob.id}`}
              style={{
                display: "block",
                padding: 16,
                border: "1px solid #e5e7eb",
                borderRadius: 12,
                textDecoration: "none",
                color: "inherit",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
                <span style={{ fontWeight: 600 }}>{ob.companyName}</span>
                <span
                  style={{
                    fontSize: 14,
                    color: ob.health === "At risk" ? "#b91c1c" : "#166534",
                  }}
                >
                  {ob.health}
                  {ob.blockedCount > 0 && ` (${ob.blockedCount} blocked)`}
                </span>
              </div>
              <div style={{ fontSize: 13, color: "#6b7280", marginTop: 4 }}>
                {ob.taskCount} tasks
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
