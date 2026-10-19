/**
 * [PATCH|DELETE /api/tasks/[id]/dependencies/[depId]] — one dependency.
 *
 * PATCH { resolved: boolean } ticks a text blocker off (or back on). A task
 *       blocker is resolved by completing its task, so PATCHing one is a 400.
 * DELETE removes the dependency.
 * Both return the task in the board shape.
 */
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { removeTaskDependency, setTaskDependencyResolved, DependencyError } from "@/lib/db";

type Params = { params: Promise<{ id: string; depId: string }> };

function badIds(id: string, depId: string) {
  return Number.isNaN(Number(id)) || Number.isNaN(Number(depId));
}

export async function PATCH(request: Request, { params }: Params) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const { id, depId } = await params;
    if (badIds(id, depId)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

    let body: { resolved?: unknown } = {};
    try { body = await request.json(); } catch { /* handled below */ }
    if (typeof body.resolved !== "boolean") {
      return NextResponse.json({ error: "Body must be { resolved: true | false }" }, { status: 400 });
    }
    const task = await setTaskDependencyResolved(id, depId, body.resolved);
    if (!task) return NextResponse.json({ error: "Dependency not found" }, { status: 404 });
    return NextResponse.json(task);
  } catch (error) {
    if (error instanceof DependencyError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("[PATCH /api/tasks/:id/dependencies/:depId]", error);
    return NextResponse.json({ error: "Failed to update dependency" }, { status: 500 });
  }
}

export async function DELETE(_request: Request, { params }: Params) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const { id, depId } = await params;
    if (badIds(id, depId)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });
    const task = await removeTaskDependency(id, depId);
    if (!task) return NextResponse.json({ error: "Dependency not found" }, { status: 404 });
    return NextResponse.json(task);
  } catch (error) {
    console.error("[DELETE /api/tasks/:id/dependencies/:depId]", error);
    return NextResponse.json({ error: "Failed to remove dependency" }, { status: 500 });
  }
}
