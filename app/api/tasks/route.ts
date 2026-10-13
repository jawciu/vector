import { NextResponse } from "next/server";
import { createTask, DependencyError } from "@/lib/db";
import { createClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  try {
    // Auth check
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body: Parameters<typeof createTask>[0] = await request.json();

    // Validation
    if (!body.onboardingId || !body.title || !body.phaseId) {
      return NextResponse.json(
        { error: "onboardingId, phaseId, and title are all required" },
        { status: 400 }
      );
    }

    const task = await createTask(body, { actor: { type: "vendor", authUser: user } });
    return NextResponse.json(task, { status: 201 });
  } catch (error) {
    if (error instanceof DependencyError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("[POST /api/tasks]", error);
    return NextResponse.json(
      { error: (error as Error).message || "Failed to create task" },
      { status: 500 }
    );
  }
}
