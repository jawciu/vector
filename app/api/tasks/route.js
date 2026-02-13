import { NextResponse } from "next/server";
import { createTask } from "@/lib/db";
import { createClient } from "@/lib/supabase/server";

export async function POST(request) {
  try {
    // Auth check
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();

    // Validation
    if (!body.onboardingId || !body.title) {
      return NextResponse.json(
        { error: "onboardingId and title are required" },
        { status: 400 }
      );
    }

    const task = await createTask(body);
    return NextResponse.json(task, { status: 201 });
  } catch (error) {
    console.error("Error creating task:", error);
    return NextResponse.json(
      { error: error.message || "Failed to create task" },
      { status: 500 }
    );
  }
}
