"use client";

import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import Button from "@/app/ui/Button";

export default function SignOut() {
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    let subscription;
    createClient().then((supabase) => {
      if (!supabase) {
        setMounted(true);
        return;
      }
      supabase.auth.getSession().then(({ data: { session } }) => {
        setUser(session?.user ?? null);
        setMounted(true);
      });
      const { data: { subscription: sub } } = supabase.auth.onAuthStateChange((_event, session) => {
        setUser(session?.user ?? null);
      });
      subscription = sub;
    });
    return () => subscription?.unsubscribe();
  }, []);

  async function handleSignOut() {
    const supabase = await createClient();
    if (!supabase) return;
    await supabase.auth.signOut();
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
