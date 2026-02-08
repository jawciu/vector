import Link from "next/link";
import { getOnboardings } from "@/lib/db";

export default async function OnboardingsListPage() {
  const onboardings = await getOnboardings();

  return (
    <div className="max-w-3xl">
      <h1 className="text-xl font-semibold" style={{ color: "var(--text)" }}>
        Companies
      </h1>
      <p className="mt-1 text-sm" style={{ color: "var(--text-muted)" }}>
        Pick a company to view onboarding tasks and health.
      </p>
      <ul className="mt-6 list-none p-0 m-0 flex flex-col gap-3">
        {onboardings.map((ob) => (
          <li key={ob.id}>
            <Link
              href={`/onboardings/${ob.id}`}
              className="block p-4 rounded-xl text-inherit no-underline transition-colors hover:opacity-95"
              style={{
                border: "1px solid var(--border)",
                background: "var(--surface)",
              }}
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-medium" style={{ color: "var(--text)" }}>
                  {ob.companyName}
                </span>
                <span
                  className="text-sm font-medium"
                  style={{
                    color: ob.health === "At risk" ? "var(--danger)" : "var(--success)",
                  }}
                >
                  {ob.health}
                  {ob.blockedCount > 0 && ` (${ob.blockedCount} blocked)`}
                </span>
              </div>
              <div className="text-sm mt-1" style={{ color: "var(--text-muted)" }}>
                {ob.taskCount} tasks
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
