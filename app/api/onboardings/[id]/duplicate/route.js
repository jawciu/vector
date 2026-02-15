import { NextResponse } from "next/server";
import { duplicateOnboarding } from "@/lib/db";
import { createClient } from "@/lib/supabase/server";

export async function POST(request, { params }) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const onboarding = await duplicateOnboarding(id);
    return NextResponse.json(onboarding, { status: 201 });
  } catch (error) {
    console.error("Error duplicating onboarding:", error);
    return NextResponse.json(
      { error: error.message || "Failed to duplicate onboarding" },
      { status: 500 }
    );
  }
}
