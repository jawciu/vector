"use client";

import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { AuthChangeEvent, Session, Subscription, User } from "@supabase/supabase-js";
import Button from "@/app/ui/Button";

export default function SignOut() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    let subscription: Subscription | undefined;
    createClient().then((supabase) => {
      if (!supabase) {
        setMounted(true);
        return;
      }
      supabase.auth.getSession().then(({ data: { session } }: { data: { session: Session | null } }) => {
        setUser(session?.user ?? null);
        setMounted(true);
      });
      const { data: { subscription: sub } } = supabase.auth.onAuthStateChange((_event: AuthChangeEvent, session: Session | null) => {
        setUser(session?.user ?? null);
      });
      subscription = sub;
    });
    return () => subscription?.unsubscribe();
  }, []);

  async function handleSignOut() {
    const supabase = await createClient();
    if (!supabase) return;
    // scope: "local" clears this browser only. The default is "global", which
    // revokes every session for the account, and the public demo shares one
    // account: one visitor signing out would kill everyone else's session.
    await supabase.auth.signOut({ scope: "local" });
    router.push("/login");
    router.refresh();
  }

  if (!mounted || !user) return null;

  return (
    <Button
      onClick={handleSignOut}
      variant="primary" className="w-full h-9 justify-center text-center px-3 py-2 font-bold"
    >
      Sign out
    </Button>
  );
}
