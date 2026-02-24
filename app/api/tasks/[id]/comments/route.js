import { NextResponse } from "next/server";
import { getCommentsForTask, createComment } from "@/lib/db";
import { createClient } from "@/lib/supabase/server";

export async function GET(request, { params }) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id } = await params;
    const comments = await getCommentsForTask(id);
    return NextResponse.json(comments);
  } catch (error) {
    return NextResponse.json({ error: error.message || "Failed to fetch comments" }, { status: 500 });
  }
}

export async function POST(request, { params }) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id } = await params;
    const { body } = await request.json();
    if (!body || !body.trim()) {
      return NextResponse.json({ error: "Comment body is required" }, { status: 400 });
    }

    const author = user.user_metadata?.full_name || user.email || "Unknown";
    const comment = await createComment(id, author, body.trim());
    return NextResponse.json(comment);
  } catch (error) {
    return NextResponse.json({ error: error.message || "Failed to create comment" }, { status: 500 });
  }
}
