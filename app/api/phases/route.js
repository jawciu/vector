import { NextResponse } from "next/server";
import { createPhase } from "@/lib/db";
import { createClient } from "@/lib/supabase/server";

export async function POST(request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();

    if (!body.onboardingId || !body.name) {
      return NextResponse.json(
        { error: "onboardingId and name are required" },
        { status: 400 }
      );
    }

    const phase = await createPhase(body);
    return NextResponse.json(phase, { status: 201 });
  } catch (error) {
    console.error("Error creating phase:", error);
    return NextResponse.json(
      { error: error.message || "Failed to create phase" },
      { status: 500 }
    );
  }
}
