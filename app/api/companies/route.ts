import { NextResponse } from "next/server";
import { getCompanies, createCompany } from "@/lib/db";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const companies = await getCompanies();
    return NextResponse.json(companies);
  } catch (error) {
    console.error("[GET /api/companies]", error);
    return NextResponse.json(
      { error: (error as Error).message || "Failed to fetch companies" },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body: { name?: string; domain?: string | null } = await request.json();

    if (!body.name || !body.name.trim()) {
      return NextResponse.json(
        { error: "Company name is required" },
        { status: 400 }
      );
    }

    const company = await createCompany(body.name, { domain: body.domain ?? null });
    return NextResponse.json(company, { status: 201 });
  } catch (error) {
    console.error("[POST /api/companies]", error);
    return NextResponse.json(
      { error: (error as Error).message || "Failed to create company" },
      { status: 500 }
    );
  }
}
