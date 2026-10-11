import { NextResponse } from "next/server";
import { updateOnboarding, deleteOnboarding } from "@/lib/db";
import { createClient } from "@/lib/supabase/server";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const body: Parameters<typeof updateOnboarding>[1] = await request.json();

    const onboarding = await updateOnboarding(id, body);
    if (!onboarding) {
      return NextResponse.json({ error: "Onboarding not found" }, { status: 404 });
    }
    return NextResponse.json(onboarding);
  } catch (error) {
    console.error("[PATCH /api/onboardings/:id]", error);
    return NextResponse.json(
      { error: (error as Error).message || "Failed to update onboarding" },
      { status: 500 }
    );
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const result = await deleteOnboarding(id);
    if (!result) {
      return NextResponse.json({ error: "Onboarding not found" }, { status: 404 });
    }
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[DELETE /api/onboardings/:id]", error);
    return NextResponse.json(
      { error: (error as Error).message || "Failed to delete onboarding" },
      { status: 500 }
    );
  }
}
