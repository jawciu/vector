import { NextResponse } from "next/server";
import { validatePortalAccess } from "@/lib/portal-auth";
import { createCommentAsPortalUser } from "@/lib/db";

export async function POST(request, { params }) {
  try {
    const session = await validatePortalAccess();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { taskId } = await params;
    const { body } = await request.json();

    if (!body || !body.trim()) {
      return NextResponse.json(
        { error: "Comment body is required" },
        { status: 400 }
      );
    }

    const comment = await createCommentAsPortalUser(
      taskId,
      session.magicLink.onboardingId,
      session.contact.name,
      body.trim(),
      { actor: { type: "contact", contactId: session.contact.id } }
    );

    if (!comment) {
      return NextResponse.json({ error: "Task not found" }, { status: 404 });
    }

    return NextResponse.json(comment, { status: 201 });
  } catch (error) {
    console.error("[POST /api/portal/tasks/:taskId/comments]", error);
    return NextResponse.json(
      { error: error.message || "Failed to add comment" },
      { status: 500 }
    );
  }
}
