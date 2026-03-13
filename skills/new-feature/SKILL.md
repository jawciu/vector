---
name: new-feature
description: Scaffold a full-stack feature end-to-end — Prisma schema, migration, db.js query, API route, and component wiring. Use when building a new feature that touches the database, or when the user says "add [model/field/feature]" that needs backend + frontend.
disable-model-invocation: true
argument-hint: "[feature description]"
---

# New Feature Scaffold

Full-stack feature workflow for this project. Runs the same proven sequence every time — no steps forgotten.

## Pre-flight

Before starting, read these files to understand current state:
- `prisma/schema.prisma` — current models and relations
- `lib/db.js` — existing query patterns
- `app/api/` — existing API route patterns

## Step 1: Schema

Edit `prisma/schema.prisma`. Follow existing conventions:
- Auto-incrementing integer IDs: `@id @default(autoincrement())`
- Cascade deletes on parent relations: `onDelete: Cascade`
- SetNull for optional references: `onDelete: SetNull`
- Default empty strings for optional text: `@default("")`
- DateTime defaults: `@default(now())`

## Step 2: Migration

```bash
npx prisma migrate dev --name descriptive-name
```

If it hangs (Supabase connection issue), use `--create-only` and tell the user to run the SQL in Supabase SQL Editor.

## Step 3: Generate client

```bash
npx prisma generate
```

**Always run this.** Remind the user to restart `npm run dev` after.

## Step 4: Add db.js functions

Add to `lib/db.js`. Follow the existing pattern exactly:

```javascript
export async function getThings(parentId) {
  const numId = Number(parentId);
  if (Number.isNaN(numId)) return [];
  return prisma.thing.findMany({
    where: { parentId: numId },
    orderBy: { id: "asc" },
  });
}

export async function createThing(data) {
  return prisma.thing.create({ data });
}

export async function updateThing(id, data) {
  const numId = Number(id);
  if (Number.isNaN(numId)) return null;
  return prisma.thing.update({ where: { id: numId }, data });
}

export async function deleteThing(id) {
  const numId = Number(id);
  if (Number.isNaN(numId)) return null;
  return prisma.thing.delete({ where: { id: numId } });
}
```

Rules:
- Validate all IDs with `Number()` + `Number.isNaN()` — never pass NaN to Prisma
- Return `null` or `[]` on invalid ID, never throw
- Keep functions small and focused — one query per function

## Step 5: API route

Create in `app/api/<resource>/route.js`. Follow existing pattern:

```javascript
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getThings, createThing } from "@/lib/db";

export async function GET(request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const parentId = searchParams.get("parentId");
  const things = await getThings(parentId);
  return NextResponse.json(things);
}

export async function POST(request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const thing = await createThing(body);
  return NextResponse.json(thing);
}
```

Rules:
- **Always** call `supabase.auth.getUser()` as auth guard
- Return 401 if not authenticated
- For dynamic routes: `const { id } = await params` (Next.js 15+ requirement)

## Step 6: Wire into component

- Add fetch call in the relevant page/component
- Use optimistic updates where possible (update UI immediately, revalidate in background)
- Follow existing patterns in `OnboardingDetailClient.js` for data fetching

## Checklist before done

- [ ] Schema updated
- [ ] Migration created and applied
- [ ] `npx prisma generate` ran
- [ ] db.js functions added with ID validation
- [ ] API route created with auth guard
- [ ] Component wired up
- [ ] User reminded to restart dev server
