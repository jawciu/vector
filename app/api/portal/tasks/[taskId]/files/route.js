import { NextResponse } from "next/server";
import { validatePortalAccess } from "@/lib/portal-auth";
import { createFile } from "@/lib/db";
import { createClient } from "@/lib/supabase/server";

const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50 MB
const BUCKET_NAME = "portal-files";

export async function POST(request, { params }) {
  try {
    const session = await validatePortalAccess();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { taskId } = await params;
    const formData = await request.formData();
    const file = formData.get("file");

    if (!file || typeof file === "string") {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: "File too large (max 50 MB)" },
        { status: 400 }
      );
    }

    const onboardingId = session.magicLink.onboardingId;
    const contactId = session.contact.id;
    const contactName = session.contact.name;

    // Upload to Supabase Storage
    const supabase = await createClient();
    const storagePath = `${onboardingId}/${taskId}/${Date.now()}-${file.name}`;

    const { error: uploadError } = await supabase.storage
      .from(BUCKET_NAME)
      .upload(storagePath, file, {
        contentType: file.type,
        upsert: false,
      });

    if (uploadError) {
      console.error("Storage upload error:", uploadError);
      return NextResponse.json(
        { error: "Failed to upload file" },
        { status: 500 }
      );
    }

    // Create DB record
    const fileRecord = await createFile({
      taskId,
      onboardingId,
      contactId,
      uploadedBy: contactName,
      fileName: file.name,
      fileSize: file.size,
      mimeType: file.type || "application/octet-stream",
      storagePath,
    });

    return NextResponse.json(fileRecord, { status: 201 });
  } catch (error) {
    console.error("Portal file upload error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to upload file" },
      { status: 500 }
    );
  }
}
