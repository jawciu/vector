/**
 * Additive notification seeder for the demo account.
 *
 * Why this exists: vendor Notification rows are only ever derived from
 * *contact*-authored ActivityLog entries (see deriveNotifications in
 * lib/db.js), and they fan out to the onboarding's owner. demo@vector.test
 * owns no onboardings, so its Notification Center renders "You're all caught
 * up" — nothing to show in demos or marketing screenshots. This plants a
 * realistic set of contact-authored events and points the notifications at
 * the demo user.
 *
 * Run via:  npm run seed:notifications
 *
 * Guarantees:
 *   - Additive. Never deletes.
 *   - Idempotent. Re-running won't pile up duplicates (matches on
 *     onboarding + contact + verb + entity).
 *   - Consistent with the board. Every "completed"/"status_changed" event
 *     names a task whose CURRENT status already matches the event, so the
 *     activity feed never contradicts the Kanban card.
 *   - Comment events get a real Comment row + commentCount bump, so a
 *     "commented on X" notification isn't a dead end when clicked through.
 *
 * Deliberately avoids Raycast: its AI insight says "no customer activity has
 * been recorded in the portal", which is the whole point of that account's
 * "gone dark" narrative. Planting contact activity there would contradict it.
 */

import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../lib/generated/prisma/client";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is not set in .env");
const adapter = new PrismaPg({ connectionString });
const prisma = new PrismaClient({ adapter });

const DEMO_EMAIL = "demo@vector.test";
const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/**
 * Mirrors computeGroupKey in lib/db.js — same 10-minute fixed bucket, so a
 * seeded group merges correctly with any real event that lands beside it.
 */
function computeGroupKey({ onboardingId, contactId, at }) {
  const bucket = Math.floor(at.getTime() / (10 * MINUTE));
  return `${onboardingId}:c${contactId}:${bucket}`;
}

/**
 * Each entry is one inbox group. `events` sharing a group render as
 * "made N changes" in the bell; a lone event renders its own phrase.
 * `ago` anchors the group; events are spaced seconds apart inside it.
 */
const GROUPS = [
  {
    company: "Function Health",
    contact: "Anna Kowalski",
    ago: 14 * MINUTE,
    events: [
      { verb: "commented", taskCode: "FN-4", body: "Service account is provisioned. Sharing the key over the secure channel now — can you confirm the IP allowlist on your side?" },
      { verb: "status_changed", taskCode: "FN-17", from: "In progress", to: "Blocked" },
      { verb: "commented", taskCode: "FN-5", body: "Both static IPs are added to the network policy. Waiting on our security team to approve the change window." },
    ],
  },
  {
    company: "Function Health",
    contact: "Grace Lin",
    ago: 3 * HOUR,
    events: [{ verb: "completed", taskCode: "FN-2" }],
  },
  {
    company: "beehiiv",
    contact: "Aisha Diallo",
    ago: 6 * HOUR,
    events: [
      { verb: "commented", taskCode: "BEE-4", body: "Held up on our side until infosec sign off on the read-only role. Should have an answer by Thursday." },
    ],
  },
  {
    company: "ChowNow",
    contact: "Lucia Herrera",
    ago: 1 * DAY,
    events: [
      { verb: "completed", taskCode: "CHOW-25" },
      { verb: "commented", taskCode: "CHOW-25", body: "Inventory is done — 18 dashboards in active use, the rest we're happy to retire rather than migrate." },
    ],
  },
  {
    company: "beehiiv",
    contact: "Marcus Bell",
    ago: 2 * DAY,
    events: [{ verb: "status_changed", taskCode: "BEE-2", from: "Not started", to: "Under investigation" }],
  },
  {
    // Already read — gives the panel a read/unread contrast.
    company: "Loop Returns",
    contact: "Sofia Marchetti",
    ago: 3 * DAY,
    read: true,
    events: [{ verb: "link_activated" }],
  },
];

/** Resolve "FN-4" → the Task row, scoped to the onboarding we're seeding. */
async function findTaskByCode(onboardingId, code) {
  const [prefix, numberRaw] = code.split("-");
  const number = Number(numberRaw);
  const task = await prisma.task.findFirst({
    where: { onboardingId, number, company: { prefix } },
    select: { id: true, title: true, status: true },
  });
  return task;
}

/** Build the metadata blob the bell's eventPhrase() expects for each verb. */
function buildMetadata(event, task) {
  switch (event.verb) {
    case "commented":
      return { taskId: event.taskCode, taskTitle: task.title };
    case "completed":
      return { taskId: event.taskCode, title: task.title };
    case "status_changed":
      return { taskId: event.taskCode, title: task.title, from: event.from, to: event.to };
    case "link_activated":
      return {};
    default:
      throw new Error(`Unhandled verb: ${event.verb}`);
  }
}

async function main() {
  const demo = await prisma.vendorUser.findUnique({
    where: { email: DEMO_EMAIL },
    select: { id: true },
  });
  if (!demo) throw new Error(`No VendorUser for ${DEMO_EMAIL} — nothing to notify.`);

  const now = Date.now();
  let planted = 0;
  let skipped = 0;

  for (const group of GROUPS) {
    const onboarding = await prisma.onboarding.findFirst({
      where: { company: { name: group.company } },
      orderBy: { id: "desc" },
      select: { id: true },
    });
    if (!onboarding) {
      console.log(`  skip: no onboarding for ${group.company}`);
      continue;
    }

    const contact = await prisma.contact.findFirst({
      where: { onboardingId: onboarding.id, name: group.contact },
      select: { id: true, name: true },
    });
    if (!contact) {
      console.log(`  skip: ${group.contact} not a contact on ${group.company}`);
      continue;
    }

    const groupAt = new Date(now - group.ago);
    const groupKey = computeGroupKey({
      onboardingId: onboarding.id,
      contactId: contact.id,
      at: groupAt,
    });

    for (const [i, event] of group.events.entries()) {
      // Space events a few seconds apart inside the group so ordering is stable.
      const at = new Date(groupAt.getTime() + i * 17 * 1000);

      let task = null;
      let entityType = "magic_link";
      let entityId = contact.id;

      if (event.taskCode) {
        task = await findTaskByCode(onboarding.id, event.taskCode);
        if (!task) {
          console.log(`  skip: ${event.taskCode} not found on ${group.company}`);
          continue;
        }
        // Guard the promise this script makes: never log an event that
        // contradicts the task's current status on the board.
        if (event.verb === "completed" && task.status !== "Done") {
          console.log(`  skip: ${event.taskCode} is "${task.status}", not Done — would contradict the board`);
          continue;
        }
        if (event.verb === "status_changed" && task.status !== event.to) {
          console.log(`  skip: ${event.taskCode} is "${task.status}", not "${event.to}" — would contradict the board`);
          continue;
        }
        entityType = "task";
        entityId = task.id;
      }

      const existing = await prisma.activityLog.findFirst({
        where: {
          onboardingId: onboarding.id,
          actorType: "contact",
          actorContactId: contact.id,
          verb: event.verb,
          entityType,
          entityId,
        },
        select: { id: true },
      });
      if (existing) {
        skipped += 1;
        continue;
      }

      const activity = await prisma.activityLog.create({
        data: {
          onboardingId: onboarding.id,
          actorType: "contact",
          actorContactId: contact.id,
          verb: event.verb,
          entityType,
          entityId,
          metadata: buildMetadata(event, task),
          createdAt: at,
        },
      });

      await prisma.notification.create({
        data: {
          activityLogId: activity.id,
          recipientType: "vendor",
          recipientVendorId: demo.id,
          groupKey,
          emailed: false,
          readAt: group.read ? new Date(at.getTime() + 5 * MINUTE) : null,
          createdAt: at,
        },
      });

      // A "commented" notification should lead somewhere real.
      if (event.verb === "commented" && task) {
        await prisma.comment.create({
          data: {
            taskId: task.id,
            author: contact.name,
            body: event.body,
            createdAt: at,
          },
        });
        await prisma.task.update({
          where: { id: task.id },
          data: { commentCount: { increment: 1 } },
        });
      }

      planted += 1;
      console.log(`  + ${group.company} / ${contact.name}: ${event.verb} ${event.taskCode ?? ""}`.trimEnd());
    }
  }

  const unread = await prisma.notification.count({
    where: { recipientVendorId: demo.id, readAt: null, archivedAt: null },
  });

  console.log(`\nPlanted ${planted} notification(s), skipped ${skipped} already present.`);
  console.log(`${DEMO_EMAIL} now has ${unread} unread.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
