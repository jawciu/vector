import { redirect } from "next/navigation";
import {
  getOnboardings,
  getCachedInsight,
  getOrCreateVendorUser,
  getPendingAIChangeCountsByOnboarding,
} from "@/lib/db";
import { createClient } from "@/lib/supabase/server";
import { buildPortfolioSnapshot, hashPortfolioSnapshot } from "@/lib/ai/context";
import OnboardingsActionBar from "./components/OnboardingsActionBar";
import PortfolioInsightsHero from "./components/PortfolioInsightsHero";
import WorkspacesTable from "./components/WorkspacesTable";

export default async function OnboardingsListPage({ searchParams }) {
  const params = await searchParams;
  const statusFilter = params?.status || "Active";

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const me = await getOrCreateVendorUser({
    authUserId: user.id,
    email: user.email,
    name: user.user_metadata?.full_name ?? user.email,
  });

  const [onboardings, portfolioSnapshot, cachedPortfolioInsight, actionCounts] = await Promise.all([
    getOnboardings(statusFilter),
    buildPortfolioSnapshot({ statusFilter }),
    getCachedInsight("portfolio", "all"),
    getPendingAIChangeCountsByOnboarding({ forVendorUserId: me.id }),
  ]);

  const portfolioContextHash = portfolioSnapshot ? hashPortfolioSnapshot(portfolioSnapshot) : null;
  const cachedPortfolioInsightSerialised = cachedPortfolioInsight
    ? {
        contextHash: cachedPortfolioInsight.contextHash,
        payload: cachedPortfolioInsight.payload,
        generatedAt: cachedPortfolioInsight.generatedAt.toISOString(),
      }
    : null;

  // getOnboardings stringifies ob.id; the count Map keys are numbers
  // (Prisma's onboardingId is Int). Coerce to keep the lookup honest.
  const rows = onboardings.map((ob) => ({
    ...ob,
    actionCount: actionCounts.get(Number(ob.id)) ?? 0,
  }));

  return (
    <div className="w-full pt-0 pb-0 h-full overflow-y-auto">
      <div
        className="w-full flex flex-col justify-center items-start border-b"
        style={{
          paddingLeft: 16,
          paddingRight: 16,
          height: 44,
          boxSizing: "border-box",
          borderColor: "var(--border)",
        }}
      >
        <h1
          className="text-base font-semibold"
          style={{ color: "var(--text)" }}
        >
          Workspace
        </h1>
      </div>
      {portfolioSnapshot && portfolioSnapshot.onboardings.length > 0 && (
        <PortfolioInsightsHero
          snapshot={portfolioSnapshot}
          contextHash={portfolioContextHash}
          cachedInsight={cachedPortfolioInsightSerialised}
        />
      )}
      <div
        className="w-full"
        style={{
          paddingLeft: 16,
          paddingRight: 16,
          paddingTop: 12,
          paddingBottom: 12,
          boxSizing: "border-box",
        }}
      >
        <OnboardingsActionBar />
      </div>
      <div
        className="border-b w-full"
        style={{ borderColor: "var(--border)" }}
      />
      <WorkspacesTable onboardings={rows} />
      {rows.length > 0 && (
        <div
          className="w-full"
          style={{
            paddingTop: 8,
            paddingBottom: 8,
            paddingLeft: 16,
            paddingRight: 16,
            boxSizing: "border-box",
          }}
        >
          <p
            className="mt-2 text-sm"
            style={{ color: "var(--text-muted)" }}
          >
            {rows.length} {rows.length === 1 ? "workspace" : "workspaces"}
          </p>
        </div>
      )}
    </div>
  );
}
