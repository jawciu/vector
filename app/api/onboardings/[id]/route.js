import { NextResponse } from "next/server";
import { updateOnboarding, deleteOnboarding } from "@/lib/db";
import { createClient } from "@/lib/supabase/server";

export async function PATCH(request, { params }) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const body = await request.json();

    const onboarding = await updateOnboarding(id, body);
    if (!onboarding) {
      return NextResponse.json({ error: "Onboarding not found" }, { status: 404 });
    }
    return NextResponse.json(onboarding);
  } catch (error) {
    console.error("Error updating onboarding:", error);
    return NextResponse.json(
      { error: error.message || "Failed to update onboarding" },
      { status: 500 }
    );
  }
}

export async function DELETE(request, { params }) {
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
    console.error("Error deleting onboarding:", error);
    return NextResponse.json(
      { error: error.message || "Failed to delete onboarding" },
      { status: 500 }
    );
  }
}
