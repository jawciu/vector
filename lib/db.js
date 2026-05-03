/**
 * Postgres read layer via Prisma.
 * Singleton client for Next.js; Prisma 7 needs adapter when run outside CLI.
 */

import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "./generated/prisma/client";
import { computeHealth as computeHealthFromTasks } from "./health.js";
import { sendTaskAssigned, sendTaskCommented } from "./email.js";
import {
  TASK_STATUSES,
  PRIORITIES,
  STATUS_COLORS,
  CONTACT_ROLES,
  ONBOARDING_STATUSES,
  DEFAULT_PHASES,
} from "./constants.js";

const globalForPrisma = typeof globalThis !== "undefined" ? globalThis : {};
const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is not set in .env");
const adapter = new PrismaPg({ connectionString });
const prisma = globalForPrisma.prisma ?? new PrismaClient({ adapter });
if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

// Re-export constants for backward compatibility
export const STATUSES = TASK_STATUSES;
export { PRIORITIES, STATUS_COLORS, CONTACT_ROLES, ONBOARDING_STATUSES, DEFAULT_PHASES };

/** Check if a task is blocked (status-based). */
export function isTaskBlocked(task) {
  return task.status === "Blocked";
}

/**
 * Resolve a Supabase auth user to their VendorUser row, creating one on first call.
 * Backfills `authUserId` on a pre-seeded row matched by email (lets the seeded
 * Caroline row pick up her real auth identity the first time she logs in).
 */
export async function getOrCreateVendorUser({ authUserId, email, name }) {
  if (!authUserId || !email) {
    throw new Error("getOrCreateVendorUser: authUserId and email are required");
  }
  const byAuthId = await prisma.vendorUser.findUnique({ where: { authUserId } });
  if (byAuthId) return byAuthId;
  const byEmail = await prisma.vendorUser.findUnique({ where: { email } });
  if (byEmail) {
    return prisma.vendorUser.update({
      where: { id: byEmail.id },
      data: { authUserId },
    });
  }
  return prisma.vendorUser.create({
    data: { authUserId, email, name: name || email, role: "admin" },
  });
}

/**
 * Write an activity log row AND derive notification rows per recipient.
 * Feeds the vendor inbox (step 4 UI) and Phase 3 AI summaries.
 *
 * Never throws into the mutation path — failures are logged and swallowed
 * so activity logging can't break the action that triggered it.
 *
 * actor shapes:
 *   { type: "vendor", authUser }       — Supabase user; VendorUser is resolved / created
 *   { type: "vendor", vendorUserId }   — pre-resolved id
 *   { type: "contact", contactId }
 *   { type: "system" }
 */
export async function emitActivity({ onboardingId, actor, verb, entityType, entityId, metadata = {} }) {
  try {
    let actorVendorId = null;
    let actorContactId = null;

    if (actor.type === "vendor") {
      if (actor.vendorUserId != null) {
        actorVendorId = actor.vendorUserId;
      } else if (actor.authUser) {
        const vu = await getOrCreateVendorUser({
          authUserId: actor.authUser.id,
          email: actor.authUser.email,
          name: actor.authUser.user_metadata?.full_name ?? actor.authUser.email,
        });
        actorVendorId = vu.id;
      } else {
        throw new Error("vendor actor requires vendorUserId or authUser");
      }
    } else if (actor.type === "contact") {
      if (actor.contactId == null) throw new Error("contact actor requires contactId");
      actorContactId = actor.contactId;
    } else if (actor.type !== "system") {
      throw new Error(`unknown actor type "${actor.type}"`);
    }

    const activity = await prisma.activityLog.create({
      data: {
        onboardingId,
        actorType: actor.type,
        actorVendorId,
        actorContactId,
        verb,
        entityType,
        entityId,
        metadata,
      },
    });

    await deriveNotifications(activity);
    await deriveCustomerEmails(activity);

    return activity;
  } catch (err) {
    console.error("[emitActivity]", { verb, entityType, entityId, onboardingId }, err);
    return null;
  }
}

/**
 * Derive Notification rows from an ActivityLog entry per the event taxonomy.
 *
 * Single-seat rules (step 3):
 *   - Contact-authored events → notify the onboarding's vendor owner
 *     (fallback: the first VendorUser if ownerId is unset).
 *   - Vendor-authored events → no recipients in single-seat (the actor is
 *     the only vendor). Multi-seat will add cross-vendor recipients later.
 *   - Own action never notifies the actor.
 *
 * Portal banner does NOT use Notification rows — it queries ActivityLog
 * directly since its only state is Contact.lastSeenPortalAt.
 */
async function deriveNotifications(activity) {
  const rows = [];

  if (activity.actorType === "contact") {
    let recipientVendorId = null;
    const ob = await prisma.onboarding.findUnique({
      where: { id: activity.onboardingId },
      select: { ownerId: true },
    });
    recipientVendorId = ob?.ownerId ?? null;
    if (recipientVendorId == null) {
      const fallback = await prisma.vendorUser.findFirst({ orderBy: { id: "asc" }, select: { id: true } });
      recipientVendorId = fallback?.id ?? null;
    }
    if (recipientVendorId != null) {
      rows.push({
        activityLogId: activity.id,
        recipientType: "vendor",
        recipientVendorId,
        groupKey: computeGroupKey(activity),
      });
    }
  }

  if (rows.length === 0) return;
  await prisma.notification.createMany({ data: rows });
}

/**
 * Group related events from the same actor on the same onboarding within a
 * 10-minute bucket into one inbox row. Buckets are fixed (not rolling) so
 * each row deterministically hashes to a single key.
 */
/**
 * Email customers on high-signal vendor-authored events. Per Caroline's
 * scope-rule (memory: project_portal_notification_filtering.md), emails
 * fire only for:
 *   - verb=assigned AND the assignee is the contact (direct assignment)
 *   - verb=commented on a task where the contact is the assignee
 * Everything else (banner-worthy status changes, peer assignments, etc.)
 * stays silent on the email channel so the inbox doesn't get noisy.
 *
 * Fire-and-forget semantics: errors are logged, never thrown into the
 * mutation path. Contacts with no email or a set bouncedAt are skipped.
 */
async function deriveCustomerEmails(activity) {
  try {
    if (activity.actorType !== "vendor") return;
    if (activity.verb !== "assigned" && activity.verb !== "commented") return;
    if (activity.entityType !== "task") return;

    const task = await prisma.task.findUnique({
      where: { id: activity.entityId },
      select: {
        id: true,
        title: true,
        onboardingId: true,
        assigneeContactId: true,
        assigneeContact: { select: { id: true, name: true, email: true, bouncedAt: true } },
      },
    });
    if (!task?.assigneeContact) return;
    if (!task.assigneeContact.email) return;
    if (task.assigneeContact.bouncedAt) return;

    // Locate an active magic link so the email includes a working portal URL.
    const link = await prisma.magicLink.findFirst({
      where: {
        contactId: task.assigneeContact.id,
        onboardingId: task.onboardingId,
        revokedAt: null,
        expiresAt: { gt: new Date() },
      },
      orderBy: { createdAt: "desc" },
      select: { token: true },
    });
    if (!link) return;

    const onboarding = await prisma.onboarding.findUnique({
      where: { id: task.onboardingId },
      select: { company: { select: { name: true } } },
    });
    const companyName = onboarding?.company?.name ?? "your";

    if (activity.verb === "assigned") {
      await sendTaskAssigned({
        to: task.assigneeContact.email,
        contactName: task.assigneeContact.name,
        companyName,
        taskTitle: task.title,
        token: link.token,
      });
      return;
    }

    // commented
    const vendor = activity.actorVendorId
      ? await prisma.vendorUser.findUnique({
          where: { id: activity.actorVendorId },
          select: { name: true },
        })
      : null;
    const authorName = vendor?.name ?? "A team member";
    await sendTaskCommented({
      to: task.assigneeContact.email,
      contactName: task.assigneeContact.name,
      companyName,
      taskTitle: task.title,
      authorName,
      excerpt: activity.metadata?.excerpt ?? "",
      token: link.token,
    });
  } catch (err) {
    console.error("[deriveCustomerEmails]", err);
  }
}

/** Mark a contact as bounced so we stop trying to email them. Matches by
 *  email (case-insensitive). Returns number of rows updated. */
export async function markContactBounced(email) {
  if (!email) return 0;
  const result = await prisma.contact.updateMany({
    where: { email: email.toLowerCase(), bouncedAt: null },
    data: { bouncedAt: new Date() },
  });
  return result.count;
}

function computeGroupKey({ onboardingId, actorType, actorVendorId, actorContactId, createdAt }) {
  const actorPart =
    actorType === "vendor" ? `v${actorVendorId ?? 0}` :
    actorType === "contact" ? `c${actorContactId ?? 0}` :
    "s";
  const bucketMs = 10 * 60 * 1000;
  const bucket = Math.floor(new Date(createdAt).getTime() / bucketMs);
  return `${onboardingId}:${actorPart}:${bucket}`;
}

/**
 * List notifications for a vendor, grouped by groupKey. Returns the
 * newest 50 groups with full event details + total unread count. Archived
 * rows are excluded. Portal notifications aren't populated in step 3 so
 * this path is vendor-only today.
 */
export async function getNotificationsForVendor(vendorUserId) {
  const id = Number(vendorUserId);
  if (Number.isNaN(id)) return { unreadCount: 0, groups: [] };

  const notifications = await prisma.notification.findMany({
    where: { recipientVendorId: id, archivedAt: null },
    include: {
      activityLog: {
        include: {
          actorVendor: { select: { id: true, name: true } },
          actorContact: { select: { id: true, name: true } },
          onboarding: { select: { id: true, company: { select: { name: true } } } },
        },
      },
    },
    orderBy: { createdAt: "desc" },
    take: 300,
  });

  const groupMap = new Map();
  for (const n of notifications) {
    const a = n.activityLog;
    const actorName =
      a.actorType === "vendor" ? a.actorVendor?.name ?? "Unknown vendor" :
      a.actorType === "contact" ? a.actorContact?.name ?? "Unknown contact" :
      "System";

    let group = groupMap.get(n.groupKey);
    if (!group) {
      group = {
        groupKey: n.groupKey,
        onboardingId: a.onboardingId,
        onboardingName: a.onboarding?.company?.name ?? "Unknown",
        actorType: a.actorType,
        actorName,
        events: [],
        unreadCount: 0,
        latestAt: a.createdAt.toISOString(),
        allRead: true,
      };
      groupMap.set(n.groupKey, group);
    }
    group.events.push({
      notificationId: n.id,
      verb: a.verb,
      entityType: a.entityType,
      entityId: a.entityId,
      metadata: a.metadata,
      createdAt: a.createdAt.toISOString(),
      readAt: n.readAt?.toISOString() ?? null,
    });
    if (n.readAt == null) {
      group.unreadCount += 1;
      group.allRead = false;
    }
  }

  const groups = Array.from(groupMap.values()).slice(0, 50);

  const unreadCount = await prisma.notification.count({
    where: { recipientVendorId: id, readAt: null, archivedAt: null },
  });

  return { unreadCount, groups };
}

/** Mark all notifications in a group as read for this vendor. Returns number updated. */
export async function markNotificationGroupRead(groupKey, vendorUserId) {
  const id = Number(vendorUserId);
  if (Number.isNaN(id) || !groupKey) return 0;
  const result = await prisma.notification.updateMany({
    where: { groupKey, recipientVendorId: id, readAt: null },
    data: { readAt: new Date() },
  });
  return result.count;
}

/** Mark every unread notification for this vendor as read. Returns number updated. */
export async function markAllNotificationsRead(vendorUserId) {
  const id = Number(vendorUserId);
  if (Number.isNaN(id)) return 0;
  const result = await prisma.notification.updateMany({
    where: { recipientVendorId: id, readAt: null },
    data: { readAt: new Date() },
  });
  return result.count;
}

/**
 * Portal banner feed — vendor-authored activity on this onboarding since the
 * contact last visited. Per the customer-noise rule, events are filtered by
 * the task's assigneeContactId:
 *   - Task assigned to this contact → include (high signal)
 *   - Task assigned to a peer contact → include (medium signal)
 *   - Task unassigned / internal vendor admin → skip
 * Events whose entity isn't a task we can resolve are skipped for safety.
 * The whole list clears when lastSeenPortalAt advances. Null lastSeen falls
 * back to the last 7 days.
 */
export async function getPortalActivitySinceLastSeen(contactId, onboardingId) {
  const cId = Number(contactId);
  const oId = Number(onboardingId);
  if (Number.isNaN(cId) || Number.isNaN(oId)) return { count: 0, events: [] };

  const contact = await prisma.contact.findUnique({
    where: { id: cId },
    select: { lastSeenPortalAt: true },
  });
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const since = contact?.lastSeenPortalAt ?? sevenDaysAgo;

  const rows = await prisma.activityLog.findMany({
    where: {
      onboardingId: oId,
      actorType: "vendor",
      createdAt: { gt: since },
    },
    include: { actorVendor: { select: { name: true } } },
    orderBy: { createdAt: "desc" },
    take: 150, // larger pool, then filter down to 50
  });

  // Resolve the target task for each event (entityId for task events, metadata.taskId for file uploads).
  const taskIds = new Set();
  for (const r of rows) {
    if (r.entityType === "task") taskIds.add(r.entityId);
    else if (r.entityType === "file" && r.metadata?.taskId) taskIds.add(Number(r.metadata.taskId));
  }
  const tasks = taskIds.size > 0
    ? await prisma.task.findMany({
        where: { id: { in: Array.from(taskIds) } },
        select: { id: true, assigneeContactId: true },
      })
    : [];
  const assigneeByTask = new Map(tasks.map((t) => [t.id, t.assigneeContactId]));

  const filtered = [];
  for (const e of rows) {
    let targetTaskId = null;
    if (e.entityType === "task") targetTaskId = e.entityId;
    else if (e.entityType === "file" && e.metadata?.taskId) targetTaskId = Number(e.metadata.taskId);

    if (targetTaskId == null) continue; // e.g. link_activated — not shown on banner
    const assigneeId = assigneeByTask.get(targetTaskId) ?? null;
    if (assigneeId == null) continue; // internal / unassigned → skip
    // Either this contact's task (high-signal) or a peer contact's task (medium-signal)
    filtered.push(e);
    if (filtered.length >= 50) break;
  }

  return {
    count: filtered.length,
    events: filtered.map((e) => ({
      id: e.id,
      verb: e.verb,
      entityType: e.entityType,
      entityId: e.entityId,
      metadata: e.metadata,
      createdAt: e.createdAt.toISOString(),
      actorName: e.actorVendor?.name ?? "Vendor",
    })),
  };
}

/** Reset the portal banner baseline for this contact. */
export async function markPortalSeen(contactId) {
  const id = Number(contactId);
  if (Number.isNaN(id)) return null;
  return prisma.contact.update({
    where: { id },
    data: { lastSeenPortalAt: new Date() },
  });
}

/** List onboardings with company name, health, blocked count, task count. */
export async function getOnboardings(statusFilter) {
  const where = statusFilter && statusFilter !== "All"
    ? { status: statusFilter }
    : {};
  const list = await prisma.onboarding.findMany({
    where,
    include: {
      company: true,
      tasks: {
        include: { blockedByTask: { select: { id: true, status: true } } },
      },
    },
    orderBy: { id: "asc" },
  });
  return list.map((ob) => {
    const { status: health, reasons: healthReasons } = computeHealthFromTasks(ob.tasks, {
      targetGoLive: ob.targetGoLive,
      createdAt: ob.createdAt,
    });
    const blockedCount = ob.tasks.filter((t) => isTaskBlocked(t)).length;
    const nextTask = ob.tasks.find(
      (t) => t.status !== "Done" && !isTaskBlocked(t)
    );
    return {
      id: String(ob.id),
      companyName: ob.company.name,
      health,
      healthReasons,
      blockedCount,
      taskCount: ob.tasks.length,
      nextAction: nextTask ? nextTask.title : null,
      lastActivity: ob.updatedAt ? ob.updatedAt.toISOString() : null,
      owner: ob.owner || null,
      onboardingStatus: ob.status || "Active",
    };
  });
}

/** Single onboarding by id (for detail page). */
export async function getOnboarding(id) {
  const numId = Number(id);
  if (Number.isNaN(numId)) return null;
  const ob = await prisma.onboarding.findUnique({
    where: { id: numId },
    include: { company: true },
  });
  if (!ob) return null;
  return {
    id: String(ob.id),
    companyId: ob.companyId,
    companyName: ob.company.name,
    companyDomain: ob.company.domain ?? null,
    owner: ob.owner || "",
    status: ob.status || "Active",
    targetGoLive: ob.targetGoLive ? ob.targetGoLive.toISOString() : null,
    createdAt: ob.createdAt ? ob.createdAt.toISOString() : null,
  };
}

/** Tasks for one onboarding (for detail page). */
export async function getTasksForOnboarding(onboardingId) {
  const id = Number(onboardingId);
  if (Number.isNaN(id)) return [];
  const tasks = await prisma.task.findMany({
    where: { onboardingId: id },
    include: {
      blockedByTask: { select: { id: true, title: true, status: true } },
      assigneeContact: { select: { id: true, name: true } },
      files: { orderBy: { createdAt: "desc" } },
    },
    orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
  });
  return tasks.map((t) => ({
    id: t.id,
    phaseId: t.phaseId,
    title: t.title,
    status: t.status,
    due: t.due,
    description: t.description || "",
    members: t.members || [],
    owner: t.owner,
    ownerId: t.ownerId,
    notes: t.notes,
    sortOrder: t.sortOrder,
    priority: t.priority || null,
    commentCount: t.commentCount ?? 0,
    previousStatus: t.previousStatus || null,
    blockedByTaskId: t.blockedByTaskId,
    blockedByTask: t.blockedByTask || null,
    assigneeContactId: t.assigneeContactId,
    assigneeContact: t.assigneeContact || null,
    files: t.files || [],
  }));
}

/** Create a new task. */
export async function createTask(data, { actor } = {}) {
  const onboardingId = Number(data.onboardingId);
  if (Number.isNaN(onboardingId)) {
    throw new Error("Invalid onboarding ID");
  }
  const phaseId = Number(data.phaseId);
  if (Number.isNaN(phaseId)) {
    throw new Error("Invalid phase ID");
  }

  const maxSort = await prisma.task.aggregate({
    where: { phaseId },
    _max: { sortOrder: true },
  });
  const sortOrder = (maxSort._max.sortOrder ?? -1) + 1;

  const assigneeContactId = data.assigneeContactId != null ? Number(data.assigneeContactId) : null;

  const task = await prisma.task.create({
    data: {
      onboardingId,
      phaseId,
      title: data.title || "Untitled task",
      description: data.description || "",
      status: data.status || "Not started",
      due: data.due || "",
      owner: data.owner || "",
      members: data.members || [],
      notes: data.notes || "",
      sortOrder,
      priority: data.priority || null,
      blockedByTaskId: data.blockedByTaskId ? Number(data.blockedByTaskId) : null,
      assigneeContactId,
    },
    include: {
      blockedByTask: { select: { id: true, title: true, status: true } },
      assigneeContact: { select: { id: true, name: true } },
    },
  });

  if (actor) {
    await emitActivity({
      onboardingId,
      actor,
      verb: "created",
      entityType: "task",
      entityId: task.id,
      metadata: { title: task.title },
    });
    if (task.assigneeContactId) {
      await emitActivity({
        onboardingId,
        actor,
        verb: "assigned",
        entityType: "task",
        entityId: task.id,
        metadata: {
          title: task.title,
          assigneeContactId: task.assigneeContactId,
          assigneeName: task.assigneeContact?.name ?? null,
        },
      });
    }
  }

  return task;
}

/** Update an existing task (partial updates). */
export async function updateTask(id, data, { actor } = {}) {
  const taskId = Number(id);
  if (Number.isNaN(taskId)) return null;

  const existing = await prisma.task.findUnique({
    where: { id: taskId },
    select: { id: true, status: true, onboardingId: true, title: true, assigneeContactId: true },
  });
  if (!existing) return null;

  const updated = await prisma.task.update({
    where: { id: taskId },
    data: {
      ...(data.title !== undefined && { title: data.title }),
      ...(data.description !== undefined && { description: data.description }),
      ...(data.status !== undefined && { status: data.status }),
      ...(data.due !== undefined && { due: data.due }),
      ...(data.owner !== undefined && { owner: data.owner }),
      ...(data.members !== undefined && { members: data.members }),
      ...(data.notes !== undefined && { notes: data.notes }),
      ...(data.priority !== undefined && { priority: data.priority }),
      ...(data.commentCount !== undefined && { commentCount: data.commentCount }),
      ...(data.previousStatus !== undefined && { previousStatus: data.previousStatus }),
      ...(data.sortOrder !== undefined && { sortOrder: data.sortOrder }),
      ...(data.phaseId !== undefined && { phaseId: Number(data.phaseId) }),
      ...(data.blockedByTaskId !== undefined && {
        blockedByTaskId: data.blockedByTaskId ? Number(data.blockedByTaskId) : null,
      }),
      ...(data.assigneeContactId !== undefined && {
        assigneeContactId: data.assigneeContactId != null ? Number(data.assigneeContactId) : null,
      }),
    },
    include: {
      blockedByTask: { select: { id: true, title: true, status: true } },
      assigneeContact: { select: { id: true, name: true } },
    },
  });

  if (actor && data.status !== undefined && existing.status !== updated.status) {
    await emitActivity({
      onboardingId: existing.onboardingId,
      actor,
      verb: updated.status === "Done" ? "completed" : "status_changed",
      entityType: "task",
      entityId: updated.id,
      metadata: { from: existing.status, to: updated.status, title: updated.title },
    });
  }

  if (
    actor &&
    data.assigneeContactId !== undefined &&
    existing.assigneeContactId !== updated.assigneeContactId &&
    updated.assigneeContactId != null
  ) {
    await emitActivity({
      onboardingId: existing.onboardingId,
      actor,
      verb: "assigned",
      entityType: "task",
      entityId: updated.id,
      metadata: {
        title: updated.title,
        assigneeContactId: updated.assigneeContactId,
        assigneeName: updated.assigneeContact?.name ?? null,
        previousAssigneeContactId: existing.assigneeContactId,
      },
    });
  }

  return updated;
}

/** Delete a task. */
export async function deleteTask(id) {
  const taskId = Number(id);
  if (Number.isNaN(taskId)) return null;

  const exists = await prisma.task.findUnique({ where: { id: taskId }, select: { id: true } });
  if (!exists) return null;

  return await prisma.task.delete({
    where: { id: taskId },
  });
}

/** Reorder a task: move to a target phase at a specific sortOrder position. */
export async function reorderTask(taskId, targetPhaseId, newSortOrder) {
  const id = Number(taskId);
  const phaseId = Number(targetPhaseId);
  if (Number.isNaN(id) || Number.isNaN(phaseId)) {
    throw new Error("Invalid task or phase ID");
  }

  const task = await prisma.task.findUnique({ where: { id } });
  if (!task) throw new Error("Task not found");

  const sourcePhaseId = task.phaseId;

  // Shift tasks in target phase to make room
  await prisma.task.updateMany({
    where: {
      phaseId,
      sortOrder: { gte: newSortOrder },
      id: { not: id },
    },
    data: { sortOrder: { increment: 1 } },
  });

  // Move the task
  await prisma.task.update({
    where: { id },
    data: { phaseId, sortOrder: newSortOrder },
  });

  // Re-normalize source phase if task moved to a different phase
  if (sourcePhaseId !== phaseId) {
    const sourceTasks = await prisma.task.findMany({
      where: { phaseId: sourcePhaseId },
      orderBy: { sortOrder: "asc" },
      select: { id: true },
    });
    await prisma.$transaction(
      sourceTasks.map((task, i) =>
        prisma.task.update({
          where: { id: task.id },
          data: { sortOrder: i },
        })
      )
    );
  }

  return await prisma.task.findUnique({
    where: { id },
    include: { blockedByTask: { select: { id: true, title: true, status: true } } },
  });
}

/** Bulk update multiple tasks (primarily for status changes). */
export async function bulkUpdateTasks(taskIds, data) {
  const validIds = taskIds
    .map(id => Number(id))
    .filter(id => !Number.isNaN(id));

  if (validIds.length === 0) {
    throw new Error("No valid task IDs provided");
  }

  return await prisma.task.updateMany({
    where: { id: { in: validIds } },
    data: {
      ...(data.status !== undefined && { status: data.status }),
    },
  });
}

/** List all companies (for onboarding creation dropdown). */
export async function getCompanies() {
  const companies = await prisma.company.findMany({
    orderBy: { name: "asc" },
  });
  return companies.map((c) => ({ id: c.id, name: c.name, domain: c.domain ?? null }));
}

/** Get all onboardings for a company (used by Miniti match heuristic). */
export async function getOnboardingsByCompanyId(companyId) {
  const id = Number(companyId);
  if (Number.isNaN(id)) return [];
  const list = await prisma.onboarding.findMany({
    where: { companyId: id },
    orderBy: { createdAt: "desc" },
  });
  return list.map((ob) => ({
    id: String(ob.id),
    companyId: ob.companyId,
    status: ob.status,
    targetGoLive: ob.targetGoLive ? ob.targetGoLive.toISOString() : null,
    createdAt: ob.createdAt ? ob.createdAt.toISOString() : null,
  }));
}

/** Create a new company. Optional domain (used by Miniti webhook matching). */
export async function createCompany(name, { domain = null } = {}) {
  if (!name || !name.trim()) {
    throw new Error("Company name is required");
  }
  return await prisma.company.create({
    data: {
      name: name.trim(),
      domain: domain ? domain.trim().toLowerCase() : null,
    },
  });
}

/** Update an existing company (name and/or domain). */
export async function updateCompany(id, { name, domain }) {
  const cId = Number(id);
  if (Number.isNaN(cId)) return null;
  const exists = await prisma.company.findUnique({ where: { id: cId }, select: { id: true } });
  if (!exists) return null;
  return prisma.company.update({
    where: { id: cId },
    data: {
      ...(name !== undefined && { name: name.trim() }),
      ...(domain !== undefined && { domain: domain ? domain.trim().toLowerCase() : null }),
    },
  });
}

/** Create a new onboarding. */
export async function createOnboarding(data) {
  const companyId = Number(data.companyId);
  if (Number.isNaN(companyId)) {
    throw new Error("Invalid company ID");
  }

  return await prisma.onboarding.create({
    data: {
      companyId,
      owner: data.owner || "",
      status: data.status || "Active",
      targetGoLive: data.targetGoLive ? new Date(data.targetGoLive) : null,
      phases: {
        create: DEFAULT_PHASES.map((p) => ({
          name: p.name,
          sortOrder: p.sortOrder,
        })),
      },
    },
    include: { company: true },
  });
}

/** Update an existing onboarding (partial updates). */
export async function updateOnboarding(id, data) {
  const obId = Number(id);
  if (Number.isNaN(obId)) return null;

  const exists = await prisma.onboarding.findUnique({ where: { id: obId }, select: { id: true } });
  if (!exists) return null;

  return await prisma.onboarding.update({
    where: { id: obId },
    data: {
      ...(data.owner !== undefined && { owner: data.owner }),
      ...(data.status !== undefined && { status: data.status }),
      ...(data.targetGoLive !== undefined && {
        targetGoLive: data.targetGoLive ? new Date(data.targetGoLive) : null,
      }),
      ...(data.companyId !== undefined && { companyId: Number(data.companyId) }),
    },
    include: { company: true },
  });
}

/** Delete an onboarding and all its tasks (cascade). */
export async function deleteOnboarding(id) {
  const obId = Number(id);
  if (Number.isNaN(obId)) return null;

  const exists = await prisma.onboarding.findUnique({ where: { id: obId }, select: { id: true } });
  if (!exists) return null;

  return await prisma.onboarding.delete({
    where: { id: obId },
  });
}

/** List contacts for an onboarding. */
export async function getContactsForOnboarding(onboardingId) {
  const id = Number(onboardingId);
  if (Number.isNaN(id)) return [];
  const contacts = await prisma.contact.findMany({
    where: { onboardingId: id },
    orderBy: { id: "asc" },
  });
  return contacts.map((c) => ({
    id: c.id,
    onboardingId: c.onboardingId,
    name: c.name,
    email: c.email,
    role: c.role,
    bouncedAt: c.bouncedAt ? c.bouncedAt.toISOString() : null,
  }));
}

/** Create a new contact. */
export async function createContact(data) {
  const onboardingId = Number(data.onboardingId);
  if (Number.isNaN(onboardingId)) {
    throw new Error("Invalid onboarding ID");
  }
  return await prisma.contact.create({
    data: {
      onboardingId,
      name: data.name,
      email: data.email || "",
      role: data.role || "",
    },
  });
}

/** Update an existing contact (partial updates). */
export async function updateContact(id, data) {
  const contactId = Number(id);
  if (Number.isNaN(contactId)) return null;

  const exists = await prisma.contact.findUnique({ where: { id: contactId }, select: { id: true } });
  if (!exists) return null;

  return await prisma.contact.update({
    where: { id: contactId },
    data: {
      ...(data.name !== undefined && { name: data.name }),
      ...(data.email !== undefined && { email: data.email }),
      ...(data.role !== undefined && { role: data.role }),
    },
  });
}

/** Delete a contact. */
export async function deleteContact(id) {
  const contactId = Number(id);
  if (Number.isNaN(contactId)) return null;

  const exists = await prisma.contact.findUnique({ where: { id: contactId }, select: { id: true } });
  if (!exists) return null;

  return await prisma.contact.delete({
    where: { id: contactId },
  });
}

/** Duplicate an onboarding with all its tasks and phases. */
export async function duplicateOnboarding(id) {
  const obId = Number(id);
  if (Number.isNaN(obId)) {
    throw new Error("Invalid onboarding ID");
  }

  const original = await prisma.onboarding.findUnique({
    where: { id: obId },
    include: { tasks: true, company: true, phases: { orderBy: { sortOrder: "asc" } } },
  });

  if (!original) {
    throw new Error("Onboarding not found");
  }

  // Create onboarding with duplicated phases
  const newOb = await prisma.onboarding.create({
    data: {
      companyId: original.companyId,
      owner: original.owner,
      status: "Active",
      targetGoLive: null,
      phases: {
        create: original.phases.map((p) => ({
          name: p.name,
          sortOrder: p.sortOrder,
          targetDate: p.targetDate,
        })),
      },
    },
    include: { company: true, phases: { orderBy: { sortOrder: "asc" } } },
  });

  // Build old phaseId → new phaseId map
  const phaseMap = new Map();
  original.phases.forEach((oldPhase, idx) => {
    phaseMap.set(oldPhase.id, newOb.phases[idx].id);
  });

  // Create tasks with mapped phaseIds (no blockedByTaskId copy)
  if (original.tasks.length > 0) {
    await prisma.task.createMany({
      data: original.tasks.map((t) => ({
        onboardingId: newOb.id,
        phaseId: phaseMap.get(t.phaseId) || newOb.phases[0].id,
        title: t.title,
        status: "Not started",
        due: "",
        description: t.description || "",
    members: t.members || [],
        owner: t.owner,
        notes: t.notes,
      })),
    });
  }

  return await prisma.onboarding.findUnique({
    where: { id: newOb.id },
    include: { company: true, tasks: true, phases: true },
  });
}

// ── Comment functions ─────────────────────────────────────────────

/** List comments for a task, ordered oldest first. */
export async function getCommentsForTask(taskId) {
  const id = Number(taskId);
  if (Number.isNaN(id)) return [];
  const comments = await prisma.comment.findMany({
    where: { taskId: id },
    orderBy: { createdAt: "asc" },
  });
  return comments.map((c) => ({
    id: c.id,
    taskId: c.taskId,
    author: c.author,
    body: c.body,
    createdAt: c.createdAt.toISOString(),
  }));
}

/** Create a comment and increment the task's commentCount. */
export async function createComment(taskId, author, body, { actor } = {}) {
  const id = Number(taskId);
  if (Number.isNaN(id)) throw new Error("Invalid task ID");

  const [comment, updatedTask] = await prisma.$transaction([
    prisma.comment.create({
      data: { taskId: id, author, body },
    }),
    prisma.task.update({
      where: { id },
      data: { commentCount: { increment: 1 } },
      select: { onboardingId: true, title: true },
    }),
  ]);

  if (actor) {
    await emitActivity({
      onboardingId: updatedTask.onboardingId,
      actor,
      verb: "commented",
      entityType: "task",
      entityId: id,
      metadata: { taskTitle: updatedTask.title, excerpt: body.slice(0, 120) },
    });
  }

  return {
    id: comment.id,
    taskId: comment.taskId,
    author: comment.author,
    body: comment.body,
    createdAt: comment.createdAt.toISOString(),
  };
}

// ── Phase functions ──────────────────────────────────────────────

/** List phases for an onboarding with task counts. */
export async function getPhasesForOnboarding(onboardingId) {
  const id = Number(onboardingId);
  if (Number.isNaN(id)) return [];
  const phases = await prisma.phase.findMany({
    where: { onboardingId: id },
    include: {
      _count: { select: { tasks: true } },
      tasks: { select: { status: true } },
    },
    orderBy: { sortOrder: "asc" },
  });
  return phases.map((p) => ({
    id: p.id,
    onboardingId: p.onboardingId,
    name: p.name,
    sortOrder: p.sortOrder,
    targetDate: p.targetDate ? p.targetDate.toISOString() : null,
    isComplete: p.isComplete,
    taskCount: p._count.tasks,
    doneCount: p.tasks.filter((t) => t.status === "Done").length,
  }));
}

/** Create a new phase. */
export async function createPhase(data) {
  const onboardingId = Number(data.onboardingId);
  if (Number.isNaN(onboardingId)) {
    throw new Error("Invalid onboarding ID");
  }
  const phase = await prisma.phase.create({
    data: {
      onboardingId,
      name: data.name || "New Phase",
      sortOrder: data.sortOrder ?? 0,
      targetDate: data.targetDate ? new Date(data.targetDate) : null,
    },
  });
  return {
    id: phase.id,
    onboardingId: phase.onboardingId,
    name: phase.name,
    sortOrder: phase.sortOrder,
    targetDate: phase.targetDate ? phase.targetDate.toISOString() : null,
    isComplete: phase.isComplete,
    taskCount: 0,
    doneCount: 0,
  };
}

/** Update an existing phase (partial updates). */
export async function updatePhase(id, data) {
  const phaseId = Number(id);
  if (Number.isNaN(phaseId)) return null;

  const exists = await prisma.phase.findUnique({ where: { id: phaseId }, select: { id: true } });
  if (!exists) return null;

  const phase = await prisma.phase.update({
    where: { id: phaseId },
    data: {
      ...(data.name !== undefined && { name: data.name }),
      ...(data.sortOrder !== undefined && { sortOrder: data.sortOrder }),
      ...(data.targetDate !== undefined && {
        targetDate: data.targetDate ? new Date(data.targetDate) : null,
      }),
      ...(data.isComplete !== undefined && { isComplete: data.isComplete }),
    },
    include: {
      _count: { select: { tasks: true } },
      tasks: { select: { status: true } },
    },
  });
  return {
    id: phase.id,
    onboardingId: phase.onboardingId,
    name: phase.name,
    sortOrder: phase.sortOrder,
    targetDate: phase.targetDate ? phase.targetDate.toISOString() : null,
    isComplete: phase.isComplete,
    taskCount: phase._count.tasks,
    doneCount: phase.tasks.filter((t) => t.status === "Done").length,
  };
}

/** Delete a phase (only if no tasks remain). */
export async function deletePhase(id) {
  const phaseId = Number(id);
  if (Number.isNaN(phaseId)) return null;

  const exists = await prisma.phase.findUnique({ where: { id: phaseId }, select: { id: true } });
  if (!exists) return null;

  const count = await prisma.task.count({ where: { phaseId } });
  if (count > 0) {
    throw new Error("Cannot delete phase with tasks. Move or delete tasks first.");
  }
  return await prisma.phase.delete({ where: { id: phaseId } });
}

// ─── Magic Links ─────────────────────────────────────────────

/** Create a magic link for a contact on an onboarding. Revokes any existing active link first. */
export async function createMagicLink(contactId, onboardingId, expiresInDays = 30) {
  const cId = Number(contactId);
  const oId = Number(onboardingId);
  if (Number.isNaN(cId) || Number.isNaN(oId)) return null;

  // Revoke any existing active links for this contact + onboarding
  await prisma.magicLink.updateMany({
    where: { contactId: cId, onboardingId: oId, revokedAt: null },
    data: { revokedAt: new Date() },
  });

  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + expiresInDays);

  return await prisma.magicLink.create({
    data: { contactId: cId, onboardingId: oId, expiresAt },
    include: { contact: true },
  });
}

/** Look up a magic link by token without filtering. Used to determine why auth failed. */
export async function getMagicLinkRaw(token) {
  if (!token || typeof token !== "string") return null;
  return prisma.magicLink.findUnique({ where: { token } });
}

/** Look up a magic link by token. Returns null if not found, expired, or revoked. */
export async function getMagicLinkByToken(token) {
  if (!token || typeof token !== "string") return null;

  const link = await prisma.magicLink.findUnique({
    where: { token },
    include: {
      contact: true,
      onboarding: { include: { company: true } },
    },
  });

  if (!link) return null;
  if (link.revokedAt) return null;
  if (link.expiresAt < new Date()) return null;

  const isFirstUse = link.lastUsedAt == null;

  // Update lastUsedAt
  await prisma.magicLink.update({
    where: { id: link.id },
    data: { lastUsedAt: new Date() },
  });

  if (isFirstUse) {
    await emitActivity({
      onboardingId: link.onboardingId,
      actor: { type: "contact", contactId: link.contactId },
      verb: "link_activated",
      entityType: "magic_link",
      entityId: link.id,
      metadata: { contactName: link.contact.name, contactEmail: link.contact.email },
    });
  }

  return link;
}

/** Revoke a magic link by ID. */
export async function revokeMagicLink(id) {
  const linkId = Number(id);
  if (Number.isNaN(linkId)) return null;

  const exists = await prisma.magicLink.findUnique({ where: { id: linkId }, select: { id: true } });
  if (!exists) return null;

  return await prisma.magicLink.update({
    where: { id: linkId },
    data: { revokedAt: new Date() },
  });
}

/** Get all magic links for an onboarding (for vendor management UI). */
export async function getMagicLinksForOnboarding(onboardingId) {
  const oId = Number(onboardingId);
  if (Number.isNaN(oId)) return [];
  return await prisma.magicLink.findMany({
    where: { onboardingId: oId },
    include: { contact: true },
    orderBy: { createdAt: "desc" },
  });
}

/** Create magic links for many contacts on an onboarding.
 *  Skips any contact that already has an active (unrevoked, unexpired) link.
 *  With force=true, revokes existing active links instead of skipping (for retry).
 *  Returns { created: MagicLink[], skipped: [{ contactId, reason }] }. */
export async function createMagicLinksBulk(contactIds, onboardingId, expiresInDays = 30, { force = false } = {}) {
  const oId = Number(onboardingId);
  if (Number.isNaN(oId)) return { created: [], skipped: [] };

  const ids = (contactIds || [])
    .map((c) => Number(c))
    .filter((c) => !Number.isNaN(c));
  if (ids.length === 0) return { created: [], skipped: [] };

  // Find contacts that already have an active link for this onboarding
  const now = new Date();
  const activeLinks = await prisma.magicLink.findMany({
    where: {
      onboardingId: oId,
      contactId: { in: ids },
      revokedAt: null,
      expiresAt: { gt: now },
    },
    select: { contactId: true, id: true },
  });
  const activeSet = new Set(activeLinks.map((l) => l.contactId));

  let toCreate;
  let skipped;

  if (force) {
    // Revoke existing active links for these contacts, then recreate all
    if (activeLinks.length > 0) {
      await prisma.magicLink.updateMany({
        where: { id: { in: activeLinks.map((l) => l.id) } },
        data: { revokedAt: new Date() },
      });
    }
    toCreate = ids;
    skipped = [];
  } else {
    toCreate = ids.filter((id) => !activeSet.has(id));
    skipped = ids
      .filter((id) => activeSet.has(id))
      .map((contactId) => ({ contactId, reason: "already_active" }));
  }

  if (toCreate.length === 0) return { created: [], skipped };

  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + expiresInDays);

  const created = await prisma.$transaction(
    toCreate.map((contactId) =>
      prisma.magicLink.create({
        data: { contactId, onboardingId: oId, expiresAt },
        include: { contact: true },
      })
    )
  );

  return { created, skipped };
}

/** Record that a magic link email was sent. */
export async function markMagicLinkSent(id, sentTo) {
  const linkId = Number(id);
  if (Number.isNaN(linkId)) return null;
  return await prisma.magicLink.update({
    where: { id: linkId },
    data: { sentAt: new Date(), sentTo: sentTo || null },
  });
}

// ─── Portal reads ────────────────────────────────────────────

/** Get onboarding data for portal view (phases with task counts by status). */
export async function getPortalOnboarding(onboardingId) {
  const oId = Number(onboardingId);
  if (Number.isNaN(oId)) return null;

  const onboarding = await prisma.onboarding.findUnique({
    where: { id: oId },
    include: {
      company: true,
      phases: {
        orderBy: { sortOrder: "asc" },
        include: {
          tasks: { select: { id: true, status: true } },
        },
      },
      tasks: true,
    },
  });
  if (!onboarding) return null;

  const phases = onboarding.phases.map((p) => ({
    id: p.id,
    name: p.name,
    sortOrder: p.sortOrder,
    targetDate: p.targetDate ? p.targetDate.toISOString() : null,
    isComplete: p.isComplete,
    statusCounts: {
      notStarted: p.tasks.filter((t) => t.status === "Not started").length,
      inProgress: p.tasks.filter((t) => ["In progress", "Under investigation"].includes(t.status)).length,
      blocked: p.tasks.filter((t) => t.status === "Blocked").length,
      done: p.tasks.filter((t) => t.status === "Done").length,
      total: p.tasks.length,
    },
  }));

  const health = computeHealthFromTasks(onboarding.tasks, {
    targetGoLive: onboarding.targetGoLive,
    createdAt: onboarding.createdAt,
  });

  return {
    id: onboarding.id,
    companyName: onboarding.company.name,
    owner: onboarding.owner,
    status: onboarding.status,
    targetGoLive: onboarding.targetGoLive ? onboarding.targetGoLive.toISOString() : null,
    createdAt: onboarding.createdAt.toISOString(),
    health,
    phases,
    taskSummary: {
      notStarted: onboarding.tasks.filter((t) => t.status === "Not started").length,
      inProgress: onboarding.tasks.filter((t) => ["In progress", "Under investigation"].includes(t.status)).length,
      blocked: onboarding.tasks.filter((t) => t.status === "Blocked").length,
      done: onboarding.tasks.filter((t) => t.status === "Done").length,
      total: onboarding.tasks.length,
    },
  };
}

/** Get tasks for the portal, marking which are assigned to this contact. */
export async function getPortalTasks(onboardingId, contactId) {
  const oId = Number(onboardingId);
  const cId = Number(contactId);
  if (Number.isNaN(oId)) return [];

  const tasks = await prisma.task.findMany({
    where: { onboardingId: oId },
    include: {
      phase: { select: { id: true, name: true, sortOrder: true } },
      assigneeContact: { select: { id: true, name: true } },
      comments: { orderBy: { createdAt: "asc" } },
      files: { orderBy: { createdAt: "desc" } },
    },
    orderBy: [{ phase: { sortOrder: "asc" } }, { sortOrder: "asc" }],
  });

  return tasks.map((t) => ({
    id: t.id,
    title: t.title,
    description: t.description,
    status: t.status,
    due: t.due,
    owner: t.owner,
    priority: t.priority,
    sortOrder: t.sortOrder,
    previousStatus: t.previousStatus,
    phase: t.phase,
    assigneeContact: t.assigneeContact,
    isAssignedToMe: !Number.isNaN(cId) && t.assigneeContactId === cId,
    commentCount: t.comments.length,
    comments: t.comments,
    files: t.files,
  }));
}

/** Update a task from the portal (only status changes allowed). */
export async function updateTaskAsPortalUser(taskId, onboardingId, data, { actor } = {}) {
  const tId = Number(taskId);
  const oId = Number(onboardingId);
  if (Number.isNaN(tId) || Number.isNaN(oId)) return null;

  // Verify task belongs to this onboarding
  const task = await prisma.task.findFirst({
    where: { id: tId, onboardingId: oId },
  });
  if (!task) return null;

  // Only allow status and previousStatus updates
  const updateData = {};
  if (data.status) updateData.status = data.status;
  if (data.previousStatus !== undefined) updateData.previousStatus = data.previousStatus;

  const updated = await prisma.task.update({
    where: { id: tId },
    data: updateData,
  });

  if (actor && data.status !== undefined && task.status !== updated.status) {
    await emitActivity({
      onboardingId: oId,
      actor,
      verb: updated.status === "Done" ? "completed" : "status_changed",
      entityType: "task",
      entityId: updated.id,
      metadata: { from: task.status, to: updated.status, title: updated.title },
    });
  }

  return updated;
}

/** Create a comment from a portal user. */
export async function createCommentAsPortalUser(taskId, onboardingId, contactName, body, { actor } = {}) {
  const tId = Number(taskId);
  const oId = Number(onboardingId);
  if (Number.isNaN(tId) || Number.isNaN(oId)) return null;

  // Verify task belongs to this onboarding
  const task = await prisma.task.findFirst({
    where: { id: tId, onboardingId: oId },
  });
  if (!task) return null;

  const [comment] = await prisma.$transaction([
    prisma.comment.create({
      data: { taskId: tId, author: contactName, body },
    }),
    prisma.task.update({
      where: { id: tId },
      data: { commentCount: { increment: 1 } },
    }),
  ]);

  if (actor) {
    await emitActivity({
      onboardingId: oId,
      actor,
      verb: "commented",
      entityType: "task",
      entityId: tId,
      metadata: { taskTitle: task.title, excerpt: body.slice(0, 120) },
    });
  }

  return comment;
}

// ─── File uploads ────────────────────────────────────────────

/** Create a file record (after uploading to Supabase Storage). */
export async function createFile({ taskId, onboardingId, contactId, uploadedBy, fileName, fileSize, mimeType, storagePath }, { actor } = {}) {
  const tId = Number(taskId);
  const oId = Number(onboardingId);
  if (Number.isNaN(tId) || Number.isNaN(oId)) return null;

  const file = await prisma.file.create({
    data: {
      taskId: tId,
      onboardingId: oId,
      contactId: contactId ? Number(contactId) : null,
      uploadedBy,
      fileName,
      fileSize,
      mimeType,
      storagePath,
    },
  });

  if (actor) {
    const task = await prisma.task.findUnique({ where: { id: tId }, select: { title: true } });
    await emitActivity({
      onboardingId: oId,
      actor,
      verb: "uploaded",
      entityType: "file",
      entityId: file.id,
      metadata: { fileName, fileSize, taskId: tId, taskTitle: task?.title ?? null },
    });
  }

  return file;
}

/** Get all files for a task. */
export async function getFilesForTask(taskId) {
  const tId = Number(taskId);
  if (Number.isNaN(tId)) return [];
  return await prisma.file.findMany({
    where: { taskId: tId },
    orderBy: { createdAt: "desc" },
  });
}

/** Fetch a task with the relations needed by the follow-up draft generator
 *  — onboarding (+ company name), recent comments, assignee, blockedBy task.
 *  Returns null if the task doesn't exist. */
export async function getTaskForFollowup(id) {
  const tId = Number(id);
  if (Number.isNaN(tId)) return null;
  const task = await prisma.task.findUnique({
    where: { id: tId },
    include: {
      onboarding: { include: { company: true } },
      blockedByTask: { select: { id: true, title: true, status: true } },
      assigneeContact: { select: { id: true, name: true, email: true } },
      comments: { orderBy: { createdAt: "asc" }, take: 20 },
    },
  });
  if (!task) return null;
  return {
    task: {
      id: task.id,
      title: task.title,
      description: task.description ?? "",
      status: task.status,
      due: task.due || null,
      priority: task.priority || null,
      owner: task.owner || null,
      ownerId: task.ownerId,
      assigneeContactId: task.assigneeContactId,
      blockedByTaskId: task.blockedByTaskId,
      blockedByTask: task.blockedByTask ?? null,
      onboardingId: task.onboardingId,
    },
    onboarding: {
      id: task.onboarding.id,
      companyName: task.onboarding.company.name,
      targetGoLive: task.onboarding.targetGoLive ? task.onboarding.targetGoLive.toISOString() : null,
    },
    assignee: task.assigneeContact ?? null,
    comments: task.comments.map((c) => ({
      id: c.id,
      author: c.author,
      body: c.body,
      createdAt: c.createdAt.toISOString(),
    })),
  };
}

/** Get a file record by ID, scoped to an onboarding. */
export async function getFileForPortal(id, onboardingId) {
  const fId = Number(id);
  const oId = Number(onboardingId);
  if (Number.isNaN(fId) || Number.isNaN(oId)) return null;
  return await prisma.file.findFirst({
    where: { id: fId, onboardingId: oId },
  });
}

/** Get a file record by ID (vendor-side, no scoping). */
export async function getFile(id) {
  const fId = Number(id);
  if (Number.isNaN(fId)) return null;
  return await prisma.file.findUnique({ where: { id: fId } });
}

/** Delete a file record by ID. */
export async function deleteFile(id) {
  const fId = Number(id);
  if (Number.isNaN(fId)) return null;
  return await prisma.file.delete({ where: { id: fId } });
}

// ─── Phase 3: External events + PendingAIChange ─────────────

/** Idempotent insert of an ExternalEvent. Returns null if already deduped. */
export async function createExternalEvent({ source, sourceId, occurredAt, payload, onboardingId, matchAmbiguous = false }) {
  try {
    return await prisma.externalEvent.create({
      data: {
        source,
        sourceId: String(sourceId),
        occurredAt: new Date(occurredAt),
        payload,
        onboardingId: onboardingId == null ? null : Number(onboardingId),
        matchAmbiguous,
      },
    });
  } catch (err) {
    // P2002 = unique constraint violation → silently dedup
    if (err?.code === "P2002") return null;
    throw err;
  }
}

/** Fetch one ExternalEvent + parsed payload. */
export async function getExternalEvent(id) {
  const eId = Number(id);
  if (Number.isNaN(eId)) return null;
  return prisma.externalEvent.findUnique({ where: { id: eId } });
}

/** List ambiguous (unmatched) ExternalEvents waiting for manual assignment. */
export async function listAmbiguousEvents({ source = "miniti", limit = 50 } = {}) {
  const rows = await prisma.externalEvent.findMany({
    where: { source, matchAmbiguous: true, processedAt: null },
    orderBy: { receivedAt: "desc" },
    take: limit,
  });
  return rows.map((r) => ({
    id: r.id,
    source: r.source,
    sourceId: r.sourceId,
    occurredAt: r.occurredAt.toISOString(),
    receivedAt: r.receivedAt.toISOString(),
    payload: r.payload,
    error: r.error,
  }));
}

/** Count of ambiguous events for the sidebar badge. */
export async function countAmbiguousEvents({ source = "miniti" } = {}) {
  return prisma.externalEvent.count({
    where: { source, matchAmbiguous: true, processedAt: null },
  });
}

/** Assign an ExternalEvent to a specific onboarding (clears ambiguous flag). */
export async function assignExternalEventOnboarding(eventId, onboardingId) {
  const eId = Number(eventId);
  const oId = Number(onboardingId);
  if (Number.isNaN(eId) || Number.isNaN(oId)) {
    throw new Error("Invalid event or onboarding ID");
  }
  return prisma.externalEvent.update({
    where: { id: eId },
    data: { onboardingId: oId, matchAmbiguous: false, error: null },
  });
}

/** Aggregated stats per source for the admin Integrations panel.
 *  "Stuck" = matched to an onboarding, no processedAt, no error, older than
 *  STUCK_AFTER_MINUTES — almost certainly the orchestrator was killed
 *  mid-run (Vercel 10s timeout, cold-start hiccup, etc). */
const STUCK_AFTER_MINUTES = 2;
export async function getIntegrationStats({ source = "miniti", days = 30 } = {}) {
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const stuckCutoff = new Date(Date.now() - STUCK_AFTER_MINUTES * 60 * 1000);
  const rows = await prisma.externalEvent.findMany({
    where: { source, receivedAt: { gte: since } },
    select: { processedAt: true, matchAmbiguous: true, error: true, receivedAt: true, onboardingId: true },
  });

  let processed = 0;
  let ambiguous = 0;
  let errored = 0;
  let stuck = 0;       // matched, unprocessed, no error, older than the cutoff
  let inFlight = 0;    // matched, unprocessed, no error, but younger than cutoff (probably still running)
  let stranded = 0;    // safety net: not in any other bucket — would have been silently invisible
  for (const r of rows) {
    if (r.error) {
      errored += 1;
      continue;
    }
    if (r.matchAmbiguous && !r.processedAt) {
      ambiguous += 1;
    } else if (r.processedAt) {
      processed += 1;
    } else if (r.onboardingId != null) {
      // Matched but not processed and no error — either in-flight or stuck.
      if (r.receivedAt < stuckCutoff) {
        stuck += 1;
      } else {
        inFlight += 1;
      }
    } else {
      // No onboarding, not ambiguous, not processed, not errored — should be
      // unreachable after the matchMeetingToOnboarding fix on 2026-04-29 that
      // marks zero-match events ambiguous=true. Keep this bucket so future
      // bugs don't silently strand events.
      stranded += 1;
    }
  }

  return {
    source,
    days,
    total: rows.length,
    processed,
    ambiguous,
    errored,
    stuck,
    inFlight,
    stranded,
  };
}

/** List individual stuck events for the admin "Stuck events" panel.
 *  Same definition as getIntegrationStats: matched, unprocessed, no error,
 *  older than STUCK_AFTER_MINUTES. */
export async function listStuckEvents({ source = "miniti", limit = 20 } = {}) {
  const stuckCutoff = new Date(Date.now() - STUCK_AFTER_MINUTES * 60 * 1000);
  const rows = await prisma.externalEvent.findMany({
    where: {
      source,
      processedAt: null,
      matchAmbiguous: false,
      error: null,
      onboardingId: { not: null },
      receivedAt: { lt: stuckCutoff },
    },
    orderBy: { receivedAt: "desc" },
    take: limit,
    include: {
      onboarding: { select: { id: true, company: { select: { name: true } } } },
    },
  });
  return rows.map((r) => ({
    id: r.id,
    source: r.source,
    sourceId: r.sourceId,
    occurredAt: r.occurredAt.toISOString(),
    receivedAt: r.receivedAt.toISOString(),
    ageMinutes: Math.floor((Date.now() - r.receivedAt.getTime()) / 60000),
    onboardingId: r.onboardingId,
    onboardingName: r.onboarding?.company?.name ?? null,
    meetingTitle: r.payload?.meeting?.title ?? "(untitled)",
  }));
}

/** Mark an ExternalEvent processed (idempotency for orchestrator retries). */
export async function markExternalEventProcessed(id, { error = null } = {}) {
  const eId = Number(id);
  if (Number.isNaN(eId)) return null;
  return prisma.externalEvent.update({
    where: { id: eId },
    data: { processedAt: new Date(), error },
  });
}

/** Create a PendingAIChange row from one orchestrator tool call. */
export async function createPendingAIChange({
  source,
  sourceEventId,
  onboardingId,
  action,
  payload,
  sourceQuote = null,
  sourceUrl = null,
  confidence = "medium",
}) {
  return prisma.pendingAIChange.create({
    data: {
      source,
      sourceEventId: sourceEventId == null ? null : Number(sourceEventId),
      onboardingId: Number(onboardingId),
      action,
      payload,
      sourceQuote,
      sourceUrl,
      confidence,
    },
  });
}

/** List pending drafts (default: most recent first, status=pending).
 *  When `forVendorUserId` is set, draft_followup rows are filtered to those
 *  whose payload.ownerId matches — task owners only see follow-up suggestions
 *  for their own tasks. Other action types are unaffected. */
export async function listPendingAIChanges({ status = "pending", limit = 100, forVendorUserId = null } = {}) {
  const rows = await prisma.pendingAIChange.findMany({
    where: { status },
    orderBy: { createdAt: "desc" },
    take: limit,
    include: {
      onboarding: { select: { id: true, company: { select: { name: true } } } },
    },
  });
  const filtered = forVendorUserId == null
    ? rows
    : rows.filter((r) =>
        r.action !== "draft_followup" ||
        Number(r.payload?.ownerId) === Number(forVendorUserId)
      );
  return filtered.map((r) => ({
    id: r.id,
    source: r.source,
    sourceEventId: r.sourceEventId,
    onboardingId: r.onboardingId,
    onboardingName: r.onboarding?.company?.name ?? null,
    action: r.action,
    payload: r.payload,
    sourceQuote: r.sourceQuote,
    sourceUrl: r.sourceUrl,
    confidence: r.confidence,
    status: r.status,
    rejectedReason: r.rejectedReason,
    createdAt: r.createdAt.toISOString(),
    resolvedAt: r.resolvedAt?.toISOString() ?? null,
    resolvedBy: r.resolvedBy,
    appliedTaskId: r.appliedTaskId,
  }));
}

/** Count of pending drafts (for the sidebar badge). When `forVendorUserId`
 *  is set, draft_followup rows are filtered to that owner only. */
export async function countPendingAIChanges({ forVendorUserId = null } = {}) {
  if (forVendorUserId == null) {
    return prisma.pendingAIChange.count({ where: { status: "pending" } });
  }
  // Fetch and filter in JS — Prisma JSON path equality is brittle and the
  // pending-drafts table is small.
  const rows = await prisma.pendingAIChange.findMany({
    where: { status: "pending" },
    select: { action: true, payload: true },
  });
  return rows.filter((r) =>
    r.action !== "draft_followup" ||
    Number(r.payload?.ownerId) === Number(forVendorUserId)
  ).length;
}

/** Find which of the given task IDs already have a pending draft_followup —
 *  used by the stale-scanner to avoid creating duplicate drafts. */
export async function findPendingDraftFollowupTaskIds(taskIds) {
  if (!Array.isArray(taskIds) || taskIds.length === 0) return new Set();
  const rows = await prisma.pendingAIChange.findMany({
    where: { action: "draft_followup", status: "pending" },
    select: { payload: true },
  });
  const set = new Set();
  for (const r of rows) {
    const tid = Number(r.payload?.taskId);
    if (taskIds.includes(tid)) set.add(tid);
  }
  return set;
}

/** Look up a vendor user by id — used by the scanner to resolve the task
 *  owner's name + email for the email "from" line. Returns null if not found. */
export async function getVendorUserById(id) {
  const vId = Number(id);
  if (Number.isNaN(vId)) return null;
  return prisma.vendorUser.findUnique({
    where: { id: vId },
    select: { id: true, name: true, email: true },
  });
}

/** Get one draft. */
export async function getPendingAIChange(id) {
  const cId = Number(id);
  if (Number.isNaN(cId)) return null;
  return prisma.pendingAIChange.findUnique({ where: { id: cId } });
}

/** Mark a draft applied — set status, resolvedAt, resolvedBy, appliedTaskId. */
export async function markAIChangeApplied(id, { resolvedBy, appliedTaskId = null }) {
  const cId = Number(id);
  if (Number.isNaN(cId)) return null;
  return prisma.pendingAIChange.update({
    where: { id: cId },
    data: {
      status: "applied",
      resolvedAt: new Date(),
      resolvedBy: resolvedBy == null ? null : Number(resolvedBy),
      appliedTaskId: appliedTaskId == null ? null : Number(appliedTaskId),
    },
  });
}

/** Mark a draft rejected with optional reason. */
export async function markAIChangeRejected(id, { resolvedBy, reason = null }) {
  const cId = Number(id);
  if (Number.isNaN(cId)) return null;
  return prisma.pendingAIChange.update({
    where: { id: cId },
    data: {
      status: "rejected",
      rejectedReason: reason,
      resolvedAt: new Date(),
      resolvedBy: resolvedBy == null ? null : Number(resolvedBy),
    },
  });
}

// ─── AI insights ─────────────────────────────────────────────

/** Get the latest cached Insight for a (scope, scopeId). Returns null if none. */
export async function getCachedInsight(scope, scopeId) {
  if (!scope || !scopeId) return null;
  return prisma.insight.findFirst({
    where: { scope, scopeId: String(scopeId) },
    orderBy: { generatedAt: "desc" },
  });
}

/** Persist a freshly-generated insight payload. Append-only; no upsert. */
export async function saveInsight({ scope, scopeId, contextHash, payload, model, durationMs }) {
  return prisma.insight.create({
    data: {
      scope,
      scopeId: String(scopeId),
      contextHash,
      payload,
      model,
      durationMs,
    },
  });
}

/** Aggregate AICall stats by kind for a recent window. */
export async function getAICallStats({ days = 30 } = {}) {
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const rows = await prisma.aICall.findMany({
    where: { createdAt: { gte: since } },
    select: {
      kind: true,
      costUsd: true,
      durationMs: true,
      error: true,
      inputTokens: true,
      cacheReadTokens: true,
      cacheWriteTokens: true,
      outputTokens: true,
    },
  });

  const byKind = new Map();
  for (const r of rows) {
    let agg = byKind.get(r.kind);
    if (!agg) {
      agg = {
        kind: r.kind,
        count: 0,
        errorCount: 0,
        totalCostUsd: 0,
        durations: [],
        totalInput: 0,
        totalCacheRead: 0,
        totalCacheWrite: 0,
        totalOutput: 0,
      };
      byKind.set(r.kind, agg);
    }
    agg.count += 1;
    if (r.error) agg.errorCount += 1;
    agg.totalCostUsd += Number(r.costUsd);
    agg.durations.push(r.durationMs);
    agg.totalInput += r.inputTokens;
    agg.totalCacheRead += r.cacheReadTokens;
    agg.totalCacheWrite += r.cacheWriteTokens;
    agg.totalOutput += r.outputTokens;
  }

  return Array.from(byKind.values()).map((a) => {
    const sorted = [...a.durations].sort((x, y) => x - y);
    const p95 = sorted.length === 0 ? 0 : sorted[Math.floor(sorted.length * 0.95)] ?? sorted[sorted.length - 1];
    return {
      kind: a.kind,
      count: a.count,
      errorCount: a.errorCount,
      totalCostUsd: a.totalCostUsd,
      avgCostUsd: a.count > 0 ? a.totalCostUsd / a.count : 0,
      p95DurationMs: p95,
      totalInput: a.totalInput,
      totalCacheRead: a.totalCacheRead,
      totalCacheWrite: a.totalCacheWrite,
      totalOutput: a.totalOutput,
    };
  }).sort((a, b) => b.totalCostUsd - a.totalCostUsd);
}

/** Recent AICall rows for the admin dashboard. */
export async function getRecentAICalls({ limit = 50 } = {}) {
  const rows = await prisma.aICall.findMany({
    orderBy: { createdAt: "desc" },
    take: limit,
  });
  return rows.map((r) => ({
    id: r.id,
    createdAt: r.createdAt.toISOString(),
    kind: r.kind,
    scopeId: r.scopeId,
    model: r.model,
    inputTokens: r.inputTokens,
    cacheReadTokens: r.cacheReadTokens,
    cacheWriteTokens: r.cacheWriteTokens,
    outputTokens: r.outputTokens,
    costUsd: Number(r.costUsd),
    durationMs: r.durationMs,
    error: r.error,
    requestId: r.requestId,
  }));
}

/** Append-only log of every Claude API call. Feeds the cost dashboard. */
export async function logAICall({
  kind,
  scopeId,
  model,
  inputTokens,
  cacheReadTokens = 0,
  cacheWriteTokens = 0,
  outputTokens,
  costUsd,
  durationMs,
  error = null,
  requestId = null,
}) {
  return prisma.aICall.create({
    data: {
      kind,
      scopeId: scopeId == null ? null : String(scopeId),
      model,
      inputTokens,
      cacheReadTokens,
      cacheWriteTokens,
      outputTokens,
      costUsd,
      durationMs,
      error,
      requestId,
    },
  });
}
