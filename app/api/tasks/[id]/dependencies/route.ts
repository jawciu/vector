/**
 * [GET|POST /api/tasks/[id]/dependencies] — what a task waits on.
 *
 * GET  → { dependencies: TaskDependencyView[] }
 * POST { blockedByTaskId } | { text } | { dependsOn: [{ taskId } | { text }] }
 *      → the task in the board shape (with `dependencies`), so the drawer and
 *        the board can swap it in. Already-present dependencies are skipped.
 *        A blocker task on another onboarding, or the task itself, is a 400.
 */
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { addTaskDependencies, listTaskDependencies, getTaskOnboardingId, DependencyError } from "@/lib/db";
import { normaliseDependsOn } from "@/lib/task-dependencies";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const { id } = await params;
    if (Number.isNaN(Number(id))) return NextResponse.json({ error: "Invalid task id" }, { status: 400 });
    if ((await getTaskOnboardingId(id)) == null) return NextResponse.json({ error: "Task not found" }, { status: 404 });
    return NextResponse.json({ dependencies: await listTaskDependencies(id) });
  } catch (error) {
    console.error("[GET /api/tasks/:id/dependencies]", error);
    return NextResponse.json({ error: "Failed to load dependencies" }, { status: 500 });
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const { id } = await params;
    if (Number.isNaN(Number(id))) return NextResponse.json({ error: "Invalid task id" }, { status: 400 });

    let body: Record<string, unknown> = {};
    try { body = await request.json(); } catch { /* handled below */ }
    const items = normaliseDependsOn(
      body.dependsOn ?? (body.text !== undefined ? [{ text: body.text }] : []),
      body.blockedByTaskId
    );
    if (items.length === 0) {
      return NextResponse.json({ error: "Give a blocker task or some text" }, { status: 400 });
    }
    const task = await addTaskDependencies(id, items);
    if (!task) return NextResponse.json({ error: "Task not found" }, { status: 404 });
    return NextResponse.json(task);
  } catch (error) {
    if (error instanceof DependencyError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("[POST /api/tasks/:id/dependencies]", error);
    return NextResponse.json({ error: "Failed to add dependency" }, { status: 500 });
  }
}
