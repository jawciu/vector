import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { listVendorUsers, getOrCreateVendorUser } from "@/lib/db";
import TeamPanel from "@/app/components/TeamPanel";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const me = await getOrCreateVendorUser({
    authUserId: user.id,
    email: user.email,
    name: user.user_metadata?.full_name ?? user.email,
  });
  const users = await listVendorUsers();

  return (
    <div className="max-w-2xl px-6 py-6 md:px-8 md:py-8 h-full overflow-y-auto">
      <header style={{ marginBottom: 24 }}>
        <h1 className="text-2xl font-semibold" style={{ color: "var(--text)" }}>
          Settings
        </h1>
        <p className="mt-1 text-sm" style={{ color: "var(--text-muted)" }}>
          Manage your team and preferences.
        </p>
      </header>

      <TeamPanel initialUsers={users} currentVendorUserId={me.id} />
    </div>
  );
}
