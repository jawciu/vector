import { NextResponse } from "next/server";
import { updateCompany } from "@/lib/db";
import { createClient } from "@/lib/supabase/server";

/**
 * [PATCH /api/companies/[id]] — update a company's name or domain.
 *
 * Used by the onboarding edit flow when the vendor changes the linked
 * company's domain (powers Miniti meeting → onboarding matching).
 */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const body: { name?: string; domain?: string | null } = await request.json();

    if (body.name === undefined && body.domain === undefined) {
      return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
    }

    const updated = await updateCompany(id, {
      ...(body.name !== undefined && { name: body.name }),
      ...(body.domain !== undefined && { domain: body.domain }),
    });

    if (!updated) {
      return NextResponse.json({ error: "Company not found" }, { status: 404 });
    }

    return NextResponse.json(updated);
  } catch (error) {
    console.error("[PATCH /api/companies/[id]]", error);
    return NextResponse.json(
      { error: (error as Error).message || "Failed to update company" },
      { status: 500 }
    );
  }
}
