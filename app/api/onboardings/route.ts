import { NextResponse } from "next/server";
import { createOnboarding } from "@/lib/db";
import { createClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body: Parameters<typeof createOnboarding>[0] = await request.json();

    if (!body.companyId) {
      return NextResponse.json(
        { error: "Company is required" },
        { status: 400 }
      );
    }

    const onboarding = await createOnboarding(body);
    return NextResponse.json(onboarding, { status: 201 });
  } catch (error) {
    console.error("[POST /api/onboardings]", error);
    return NextResponse.json(
      { error: (error as Error).message || "Failed to create onboarding" },
      { status: 500 }
    );
  }
}
