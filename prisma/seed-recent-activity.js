/**
 * Additive activity seeder. Plants ActivityLog rows on existing onboardings
 * so the per-onboarding "Wins" section has data to render. Never deletes
 * anything. Idempotent — re-running won't pile up duplicates.
 *
 * Run via:  npm run seed:activity
 *
 * Three kinds of wins are seeded across active onboardings (where data
 * permits):
 *   - task_completed       (verb="completed",      entityType="task")
 *   - task_unblocked       (verb="status_changed", from=Blocked, to≠Done)
 *   - contact_first_login  (verb="link_activated"; magic link must exist
 *                           and have lastUsedAt set so the activity row
 *                           reflects an actual portal login)
 *
 * Skipped quietly if the prerequisite data isn't there (e.g. no Blocked
 * task to unblock for a particular onboarding).
 */

import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../lib/generated/prisma/client";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is not set in .env");
const adapter = new PrismaPg({ connectionString });
const prisma = new PrismaClient({ adapter });

const DAY_MS = 24 * 60 * 60 * 1000;

async function getCarolineId() {
  const v = await prisma.vendorUser.findUnique({
    where: { email: "jaworskycaroline@gmail.com" },
    select: { id: true },
  });
  return v?.id ?? null;
}

/** Skip if a matching activity row already exists for this onboarding/verb/entity. */
async function alreadyLogged({ onboardingId, verb, entityType, entityId }) {
  const existing = await prisma.activityLog.findFirst({
    where: { onboardingId, verb, entityType, entityId },
    select: { id: true },
  });
  return Boolean(existing);
}

async function plantTaskCompleted({ onboardingId, taskTitle, daysAgo, actorVendorId }) {
  const task = await prisma.task.findFirst({
    where: { onboardingId, title: taskTitle },
    select: { id: true, status: true, title: true },
  });
  if (!task) return { skipped: "task-not-found", taskTitle };
  if (await alreadyLogged({ onboardingId, verb: "completed", entityType: "task", entityId: task.id })) {
    return { skipped: "exists", taskTitle };
  }
  await prisma.activityLog.create({
    data: {
      onboardingId,
      actorType: "vendor",
      actorVendorId,
      verb: "completed",
      entityType: "task",
      entityId: task.id,
      metadata: { from: task.status, to: "Done", title: task.title },
      createdAt: new Date(Date.now() - daysAgo * DAY_MS),
    },
  });
  return { ok: true, taskTitle };
}

async function plantTaskUnblocked({ onboardingId, taskTitle, daysAgo, actorVendorId, newStatus = "In progress" }) {
  const task = await prisma.task.findFirst({
    where: { onboardingId, title: taskTitle },
    select: { id: true, status: true, title: true },
  });
  if (!task) return { skipped: "task-not-found", taskTitle };
  if (await alreadyLogged({ onboardingId, verb: "status_changed", entityType: "task", entityId: task.id })) {
    return { skipped: "exists", taskTitle };
  }
  await prisma.activityLog.create({
    data: {
      onboardingId,
      actorType: "vendor",
      actorVendorId,
      verb: "status_changed",
      entityType: "task",
      entityId: task.id,
      metadata: { from: "Blocked", to: newStatus, title: task.title },
      createdAt: new Date(Date.now() - daysAgo * DAY_MS),
    },
  });
  return { ok: true, taskTitle };
}

async function plantHealthImprovement({ onboardingId, from, to, daysAgo, actorVendorId }) {
  if (
    await alreadyLogged({
      onboardingId,
      verb: "health_flipped",
      entityType: "onboarding",
      entityId: onboardingId,
    })
  ) {
    return { skipped: "exists" };
  }
  await prisma.activityLog.create({
    data: {
      onboardingId,
      actorType: "vendor",
      actorVendorId,
      verb: "health_flipped",
      entityType: "onboarding",
      entityId: onboardingId,
      metadata: { from, to },
      createdAt: new Date(Date.now() - daysAgo * DAY_MS),
    },
  });
  return { ok: true };
}

async function plantContactFirstLogin({ onboardingId, daysAgo, actorVendorId }) {
  // Find any contact for this onboarding without an existing link_activated
  // activity. Create or reuse a magic link to anchor the row.
  const contact = await prisma.contact.findFirst({
    where: { onboardingId },
    select: { id: true, name: true },
  });
  if (!contact) return { skipped: "no-contact" };

  let link = await prisma.magicLink.findFirst({
    where: { onboardingId, contactId: contact.id },
    select: { id: true },
  });
  if (!link) {
    link = await prisma.magicLink.create({
      data: {
        onboardingId,
        contactId: contact.id,
        expiresAt: new Date(Date.now() + 30 * DAY_MS),
        sentAt: new Date(Date.now() - (daysAgo + 1) * DAY_MS),
        lastUsedAt: new Date(Date.now() - daysAgo * DAY_MS),
      },
      select: { id: true },
    });
  }
  if (await alreadyLogged({ onboardingId, verb: "link_activated", entityType: "magic_link", entityId: link.id })) {
    return { skipped: "exists", contact: contact.name };
  }
  await prisma.activityLog.create({
    data: {
      onboardingId,
      actorType: "contact",
      actorContactId: contact.id,
      verb: "link_activated",
      entityType: "magic_link",
      entityId: link.id,
      metadata: { contactName: contact.name },
      createdAt: new Date(Date.now() - daysAgo * DAY_MS),
    },
  });
  return { ok: true, contact: contact.name };
}

async function main() {
  console.log("Seeding recent activity (additive, idempotent)...");
  const actorVendorId = await getCarolineId();
  if (!actorVendorId) console.warn("  Caroline VendorUser not found — using null actor.");

  // Pick three active onboardings to plant wins on. Companies are looked up
  // by name; if missing (e.g. seed renamed) we just skip that block.
  const onboardings = await prisma.onboarding.findMany({
    where: { status: "Active" },
    include: { company: { select: { name: true } } },
  });
  const byCompany = new Map(onboardings.map((o) => [o.company.name, o.id]));

  const results = [];

  // Acme Co — already At Risk in the seed, give it one quiet recovery win.
  if (byCompany.has("Acme Co")) {
    results.push(["Acme Co/task_completed",
      await plantTaskCompleted({
        onboardingId: byCompany.get("Acme Co"),
        taskTitle: "Document current workflow",
        daysAgo: 4,
        actorVendorId,
      })]);
  }

  // Globex Industries — completion + unblocked combo.
  if (byCompany.has("Globex Industries")) {
    const oId = byCompany.get("Globex Industries");
    results.push(["Globex/task_completed",
      await plantTaskCompleted({ onboardingId: oId, taskTitle: "Define success metrics", daysAgo: 5, actorVendorId })]);
  }

  // Initech — has Blocked tasks; unblock one and add a first-portal-login.
  if (byCompany.has("Initech")) {
    const oId = byCompany.get("Initech");
    results.push(["Initech/task_unblocked",
      await plantTaskUnblocked({
        onboardingId: oId,
        taskTitle: "VPN access for vendor team",
        daysAgo: 2,
        actorVendorId,
        newStatus: "In progress",
      })]);
    results.push(["Initech/contact_first_login",
      await plantContactFirstLogin({ onboardingId: oId, daysAgo: 1, actorVendorId })]);
  }

  // Wayne Industries — completion to demo a single-win section.
  if (byCompany.has("Wayne Industries")) {
    results.push(["Wayne/task_completed",
      await plantTaskCompleted({
        onboardingId: byCompany.get("Wayne Industries"),
        taskTitle: "Identify admin users",
        daysAgo: 3,
        actorVendorId,
      })]);
  }

  // Globex Industries — health flip from At risk → On track to demo
  // the health_improved win kind.
  if (byCompany.has("Globex Industries")) {
    results.push(["Globex/health_improved",
      await plantHealthImprovement({
        onboardingId: byCompany.get("Globex Industries"),
        from: "At risk",
        to: "On track",
        daysAgo: 2,
        actorVendorId,
      })]);
  }

  for (const [label, r] of results) {
    if (r.ok) console.log(`  + ${label}`);
    else console.log(`  · ${label} skipped (${r.skipped})`);
  }

  const totalActivity = await prisma.activityLog.count();
  console.log(`Done. ActivityLog now has ${totalActivity} rows.`);
}

main()
  .then(() => prisma.$disconnect())
  .then(() => process.exit(0))
  .catch(async (err) => {
    console.error(err);
    await prisma.$disconnect();
    process.exit(1);
  });
