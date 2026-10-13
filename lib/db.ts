/**
 * Postgres read layer via Prisma.
 * Singleton client for Next.js; Prisma 7 needs adapter when run outside CLI.
 */

import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient, Prisma } from "./generated/prisma/client";
import type { ActivityLog } from "./generated/prisma/client";
import type { Actor, HealthStatus } from "./types";
import { computeHealth as computeHealthFromTasks, countsAsBlocked } from "./health";
import { sendTaskAssigned, sendTaskCommented } from "./email";
import { derivePrefix } from "./companies";
import {
  normaliseDependsOn,
  cleanDependencyLabel,
  type DependsOnItem,
  type DraftLinkItem,
  type TaskDependencyView,
} from "./task-dependencies";
import {
  bindPayloadLinks,
  classifyDraftLink,
  payloadDraftLinks,
  readDraftLinks,
  type AppliedDraftLink,
  type LinkedDraftInfo,
  type SiblingDraft,
} from "./draft-links";
import {
  TASK_STATUSES,
  PRIORITIES,
  STATUS_COLORS,
  CONTACT_ROLES,
  ONBOARDING_STATUSES,
  DEFAULT_PHASES,
} from "./constants";

/** Anything callers pass as an id: route params arrive as strings, Prisma rows as numbers. */
type IdLike = number | string;
/** The Prisma client or an interactive-transaction client. */
type DbClient = PrismaClient | Prisma.TransactionClient;

const globalForPrisma = (typeof globalThis !== "undefined" ? globalThis : {}) as { prisma?: PrismaClient };
const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is not set in .env");
const adapter = new PrismaPg({ connectionString });
const prisma = globalForPrisma.prisma ?? new PrismaClient({ adapter });
if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

// Re-export constants for backward compatibility
export const STATUSES = TASK_STATUSES;
export { PRIORITIES, STATUS_COLORS, CONTACT_ROLES, ONBOARDING_STATUSES, DEFAULT_PHASES };

/** Check if a task is blocked (status-based). */
export function isTaskBlocked(task: { status: string }): boolean {
  return task.status === "Blocked";
}

/**
 * Identity projection for a Task row returned by Prisma.
 *
 * Phase 0: pure passthrough — preserves whatever shape the caller's
 * include/select produced. The point is to isolate the projection seam so a
 * later phase can fill in a computed `taskId` string (company.prefix + number)
 * here without having to find every return site again.
 *
 * Callers should funnel any Task object that flows OUT of lib/db.js through
 * this helper (or `tasks.map(mapTask)` for arrays). Internal-only task rows
 * that never reach a caller can stay unwrapped.
 *
 * @param {object | null | undefined} task — Prisma Task row, possibly with relations loaded
 * @returns {object | null | undefined} same shape as input
 */
type MapTaskInput = {
  number?: number | null;
  onboarding?: { company?: { prefix?: string | null } | null } | null;
};
// `dependencies` rows come back mapped to TaskDependencyView (mapDependency).
type Mapped<T> = Omit<T, "dependencies"> & { taskId: string | null } &
  ("dependencies" extends keyof T ? { dependencies: TaskDependencyView[] } : unknown);
function mapTask<T extends MapTaskInput>(task: T): Mapped<T>;
function mapTask<T extends MapTaskInput>(task: T | null): Mapped<T> | null;
function mapTask<T extends MapTaskInput>(task: T | null | undefined): Mapped<T> | null | undefined;
function mapTask<T extends MapTaskInput>(task: T | null | undefined): Mapped<T> | null | undefined {
  if (!task) return task;
  const prefix = task?.onboarding?.company?.prefix ?? null;
  const number = task?.number ?? null;
  const blocker = (task as { blockedByTask?: MapTaskInput | null }).blockedByTask;
  const deps = (task as { dependencies?: RawDependency[] }).dependencies;
  return {
    ...task,
    taskId: prefix && number ? `${prefix}-${number}` : null,
    // The blocker renders its own id chip on the card, so give it a taskId too.
    ...(blocker && { blockedByTask: mapTask(blocker) }),
    ...(Array.isArray(deps) && { dependencies: deps.map(mapDependency) }),
  } as unknown as Mapped<T>;
}

/** A TaskDependency row as loaded with DEPENDENCIES_INCLUDE. */
type RawDependency = {
  id: number;
  label: string | null;
  resolvedAt: Date | null;
  blockedByTask: (MapTaskInput & { id: number; title: string; status: string }) | null;
};

/** The client shape of one dependency (lib/task-dependencies.ts TaskDependencyView). */
function mapDependency(d: RawDependency): TaskDependencyView {
  if (d.blockedByTask) {
    const b = mapTask(d.blockedByTask);
    return { id: d.id, blockedByTask: { id: b.id, taskId: b.taskId, title: b.title, status: b.status } };
  }
  return { id: d.id, label: d.label, resolvedAt: d.resolvedAt ? d.resolvedAt.toISOString() : null };
}

/** Blocker fields the board card needs, including what mapTask composes taskId from. */
const BLOCKED_BY_TASK_SELECT = {
  id: true,
  title: true,
  status: true,
  number: true,
  onboarding: { select: { company: { select: { prefix: true } } } },
};

/** A task's dependencies, oldest first, with what the card needs of each blocker task. */
const DEPENDENCIES_INCLUDE = {
  orderBy: [{ createdAt: "asc" as const }, { id: "asc" as const }],
  select: {
    id: true,
    label: true,
    resolvedAt: true,
    blockedByTask: { select: BLOCKED_BY_TASK_SELECT },
  },
};

/** Health only needs to know which text blockers are still open (lib/health.ts). */
const OPEN_TEXT_BLOCKERS_SELECT = {
  where: { label: { not: null }, resolvedAt: null },
  select: { label: true, resolvedAt: true },
};

/**
 * Resolve a Supabase auth user to their VendorUser row, creating one on first call.
 * Backfills `authUserId` on a pre-seeded row matched by email (lets the seeded
 * Caroline row pick up her real auth identity the first time she logs in).
 */
export async function getOrCreateVendorUser({
  authUserId,
  email,
  name,
}: {
  authUserId: string | null | undefined;
  email: string | null | undefined;
  name?: string | null;
}) {
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
  // Brand-new user with no prior invitation. The very first VendorUser ever
  // becomes admin (founder bootstrap); everyone else defaults to member.
  // Promotion to admin happens explicitly via Settings (future), not by
  // sneaking around the invite flow.
  const existingCount = await prisma.vendorUser.count();
  const role = existingCount === 0 ? "admin" : "member";
  return prisma.vendorUser.create({
    data: { authUserId, email, name: name || email, role },
  });
}

/** List all team members. authUserId is included so the UI can show whether
 *  someone has signed in yet. */
export async function listVendorUsers() {
  return prisma.vendorUser.findMany({
    orderBy: [{ id: "asc" }],
    select: { id: true, name: true, email: true, role: true, authUserId: true, createdAt: true },
  });
}

/** Add a team member by name + email. Auth account is optional — `authUserId`
 *  gets backfilled the first time they sign in (see getOrCreateVendorUser). */
export async function createVendorUser({ name, email, role = "member" }: { name?: string | null; email: string; role?: string }) {
  if (!email) throw new Error("email is required");
  const cleanEmail = String(email).trim().toLowerCase();
  const cleanName = (name || cleanEmail).trim();
  return prisma.vendorUser.create({
    data: { name: cleanName, email: cleanEmail, role },
  });
}

/** Delete a team member. The `Task.ownerId` and `Onboarding.ownerId`
 *  relations are SetNull on delete (per schema), so existing rows lose the
 *  owner but aren't deleted. */
export async function deleteVendorUser(id: IdLike) {
  const vId = Number(id);
  if (Number.isNaN(vId)) return null;
  return prisma.vendorUser.delete({ where: { id: vId } });
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
export interface EmitActivityInput {
  onboardingId: number;
  actor: Actor;
  verb: string;
  entityType: string;
  entityId: number;
  metadata?: Prisma.InputJsonObject;
}

export async function emitActivity({ onboardingId, actor, verb, entityType, entityId, metadata = {} }: EmitActivityInput) {
  try {
    let actorVendorId: number | null = null;
    let actorContactId: number | null = null;

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
      throw new Error(`unknown actor type "${(actor as { type: string }).type}"`);
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
async function deriveNotifications(activity: ActivityLog) {
  const rows: Prisma.NotificationCreateManyInput[] = [];

  if (activity.actorType === "contact") {
    let recipientVendorId: number | null = null;
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
async function deriveCustomerEmails(activity: ActivityLog) {
  try {
    if (activity.actorType !== "vendor") return;
    if (activity.verb !== "assigned" && activity.verb !== "commented") return;
    if (activity.entityType !== "task") return;

    const task = await prisma.task.findUnique({
      where: { id: activity.entityId },
      select: {
        id: true,
        title: true,
        number: true,
        onboardingId: true,
        assigneeContactId: true,
        assigneeContact: { select: { id: true, name: true, email: true, bouncedAt: true } },
        onboarding: { select: { company: { select: { name: true, prefix: true } } } },
      },
    });
    if (!task?.assigneeContact) return;
    if (!task.assigneeContact.email) return;
    if (task.assigneeContact.bouncedAt) return;
    // Compose the human-readable task ID (e.g. "AC-12") so email subjects
    // can prefix `[AC-12]`. Mirrors the composition in mapTask().
    const taskCode = task.onboarding?.company?.prefix && task.number
      ? `${task.onboarding.company.prefix}-${task.number}`
      : null;

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

    const companyName = task.onboarding?.company?.name ?? "your";

    if (activity.verb === "assigned") {
      await sendTaskAssigned({
        to: task.assigneeContact.email,
        contactName: task.assigneeContact.name,
        companyName,
        taskTitle: task.title,
        taskCode,
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
      taskCode,
      authorName,
      excerpt: (activity.metadata as { excerpt?: string } | null)?.excerpt ?? "",
      token: link.token,
    });
  } catch (err) {
    console.error("[deriveCustomerEmails]", err);
  }
}

/** Mark a contact as bounced so we stop trying to email them. Matches by
 *  email (case-insensitive). Returns number of rows updated. */
export async function markContactBounced(email: string | null | undefined) {
  if (!email) return 0;
  const result = await prisma.contact.updateMany({
    where: { email: email.toLowerCase(), bouncedAt: null },
    data: { bouncedAt: new Date() },
  });
  return result.count;
}

function computeGroupKey({
  onboardingId,
  actorType,
  actorVendorId,
  actorContactId,
  createdAt,
}: Pick<ActivityLog, "onboardingId" | "actorType" | "actorVendorId" | "actorContactId" | "createdAt">) {
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
export interface NotificationEvent {
  notificationId: number;
  verb: string;
  entityType: string;
  entityId: number;
  metadata: Prisma.JsonValue;
  createdAt: string;
  readAt: string | null;
}

export interface NotificationGroup {
  groupKey: string;
  onboardingId: number;
  onboardingName: string;
  actorType: string;
  actorName: string;
  events: NotificationEvent[];
  unreadCount: number;
  latestAt: string;
  allRead: boolean;
}

export async function getNotificationsForVendor(
  vendorUserId: IdLike
): Promise<{ unreadCount: number; groups: NotificationGroup[] }> {
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

  const groupMap = new Map<string, NotificationGroup>();
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
export async function markNotificationGroupRead(groupKey: string, vendorUserId: IdLike) {
  const id = Number(vendorUserId);
  if (Number.isNaN(id) || !groupKey) return 0;
  const result = await prisma.notification.updateMany({
    where: { groupKey, recipientVendorId: id, readAt: null },
    data: { readAt: new Date() },
  });
  return result.count;
}

/** Mark every unread notification for this vendor as read. Returns number updated. */
export async function markAllNotificationsRead(vendorUserId: IdLike) {
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
export async function getPortalActivitySinceLastSeen(contactId: IdLike, onboardingId: IdLike) {
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
  // metadata is JSON; file-upload rows carry { taskId }.
  type FileMeta = { taskId?: IdLike | null } | null;
  const taskIds = new Set<number>();
  for (const r of rows) {
    if (r.entityType === "task") taskIds.add(r.entityId);
    else if (r.entityType === "file" && (r.metadata as FileMeta)?.taskId) taskIds.add(Number((r.metadata as FileMeta)!.taskId));
  }
  const tasks = taskIds.size > 0
    ? await prisma.task.findMany({
        where: { id: { in: Array.from(taskIds) } },
        select: { id: true, assigneeContactId: true },
      })
    : [];
  const assigneeByTask = new Map(tasks.map((t) => [t.id, t.assigneeContactId]));

  const filtered: typeof rows = [];
  for (const e of rows) {
    let targetTaskId: number | null = null;
    if (e.entityType === "task") targetTaskId = e.entityId;
    else if (e.entityType === "file" && (e.metadata as FileMeta)?.taskId) targetTaskId = Number((e.metadata as FileMeta)!.taskId);

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
export async function markPortalSeen(contactId: IdLike) {
  const id = Number(contactId);
  if (Number.isNaN(id)) return null;
  return prisma.contact.update({
    where: { id },
    data: { lastSeenPortalAt: new Date() },
  });
}

/** List onboardings with company name, health, blocked count, task count. */
export async function getOnboardings(statusFilter?: string | null) {
  const where = statusFilter && statusFilter !== "All"
    ? { status: statusFilter }
    : {};
  const list = await prisma.onboarding.findMany({
    where,
    include: {
      company: true,
      tasks: {
        include: {
          blockedByTask: { select: { id: true, status: true } },
          dependencies: OPEN_TEXT_BLOCKERS_SELECT,
        },
      },
    },
    orderBy: { id: "asc" },
  });
  return list.map((ob) => {
    const { status: health, reasons: healthReasons } = computeHealthFromTasks(ob.tasks, {
      targetGoLive: ob.targetGoLive,
      createdAt: ob.createdAt,
    });
    const blockedCount = ob.tasks.filter((t) => countsAsBlocked(t)).length;
    const nextTask = ob.tasks.find(
      (t) => t.status !== "Done" && !countsAsBlocked(t)
    );
    return {
      id: String(ob.id),
      companyName: ob.company.name,
      companyLogoUrl: ob.company.logoUrl ?? null,
      health,
      healthReasons,
      blockedCount,
      taskCount: ob.tasks.length,
      nextAction: nextTask ? nextTask.title : null,
      lastActivity: ob.updatedAt ? ob.updatedAt.toISOString() : null,
      owner: ob.owner || null,
      onboardingStatus: ob.status || "Active",
      targetGoLive: ob.targetGoLive ? ob.targetGoLive.toISOString() : null,
    };
  });
}

/** Single onboarding by id (for detail page). */
export async function getOnboarding(id: IdLike) {
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
    companyLogoUrl: ob.company.logoUrl ?? null,
    owner: ob.owner || "",
    status: ob.status || "Active",
    targetGoLive: ob.targetGoLive ? ob.targetGoLive.toISOString() : null,
    createdAt: ob.createdAt ? ob.createdAt.toISOString() : null,
  };
}

/** Tasks for one onboarding (for detail page). */
export async function getTasksForOnboarding(onboardingId: IdLike) {
  const id = Number(onboardingId);
  if (Number.isNaN(id)) return [];
  const tasks = await prisma.task.findMany({
    where: { onboardingId: id },
    include: {
      blockedByTask: { select: BLOCKED_BY_TASK_SELECT },
      dependencies: DEPENDENCIES_INCLUDE,
      assigneeContact: { select: { id: true, name: true } },
      files: { orderBy: { createdAt: "desc" } },
      onboarding: { select: { company: { select: { prefix: true } } } },
    },
    orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
  });
  return tasks.map((t) => mapTask({
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
    dependencies: t.dependencies,
    assigneeContactId: t.assigneeContactId,
    assigneeContact: t.assigneeContact || null,
    files: t.files || [],
    number: t.number ?? null,
    onboarding: t.onboarding ?? null,
  }));
}

/**
 * Create a new task.
 *
 * Internally bumps the parent Company's `taskCounter` atomically and assigns
 * the resulting per-company sequence value as `Task.number` along with the
 * denormalized `Task.companyId`. Callers must NOT pass `companyId` or
 * `number` in `data` — those fields are computed here. If a caller is already
 * inside a Prisma transaction (e.g. `duplicateOnboarding`) they can pass it
 * as `tx` so the counter bump + task insert participate in the outer tx.
 */
/** Fields accepted by createTask. Ids may arrive as strings from request bodies. */
export interface CreateTaskInput {
  onboardingId: IdLike;
  phaseId: IdLike;
  title?: string | null;
  description?: string | null;
  status?: string | null;
  due?: string | null;
  owner?: string | null;
  ownerId?: IdLike | null;
  members?: string[] | null;
  notes?: string | null;
  priority?: string | null;
  blockedByTaskId?: IdLike | null;
  /** What the task waits on: board tasks and/or text blockers. Task ids must be on the same onboarding. */
  dependsOn?: DependsOnItem[] | null;
  assigneeContactId?: IdLike | null;
}

/**
 * Work to run once the caller's transaction has committed (activity rows and
 * their notifications). A function given `tx` and an `afterCommit` list pushes
 * its side effects there instead of running them inside the transaction, so a
 * rollback never leaves a "created" activity for a task that does not exist.
 */
export type AfterCommit = (() => Promise<unknown>)[];

export async function createTask(
  data: CreateTaskInput,
  { actor, tx = null, afterCommit = null }: { actor?: Actor | null; tx?: Prisma.TransactionClient | null; afterCommit?: AfterCommit | null } = {}
) {
  if ("companyId" in data || "number" in data) {
    throw new Error("createTask: callers must not supply companyId or number — both are computed internally");
  }
  const onboardingId = Number(data.onboardingId);
  if (Number.isNaN(onboardingId)) {
    throw new Error("Invalid onboarding ID");
  }
  const phaseId = Number(data.phaseId);
  if (Number.isNaN(phaseId)) {
    throw new Error("Invalid phase ID");
  }

  const assigneeContactId = data.assigneeContactId != null ? Number(data.assigneeContactId) : null;
  const ownerId = data.ownerId != null ? Number(data.ownerId) : null;
  // `dependsOn` (task or text blockers) and the legacy single blockedByTaskId
  // are one list; the old column keeps the first task blocker (add-then-tighten).
  const dependsOn = normaliseDependsOn(data.dependsOn, data.blockedByTaskId);
  const firstBlocker = dependsOn.find((d): d is { taskId: number } => "taskId" in d);
  const firstBlockerTaskId = firstBlocker ? firstBlocker.taskId : null;

  // Inner worker: assumes a Prisma client/tx is in scope. Performs the
  // atomic counter bump, computes sortOrder for the target phase, and
  // creates the task with the new fields wired up.
  async function runWith(client: DbClient) {
    const maxSort = await client.task.aggregate({
      where: { phaseId },
      _max: { sortOrder: true },
    });
    const sortOrder = (maxSort._max.sortOrder ?? -1) + 1;

    // Atomically bump the company's taskCounter to GREATEST(taskCounter,
    // MAX(existing task.number for the company)) + 1. The MAX clamp is a
    // safety net against accidental drift between Company.taskCounter and
    // the actual task numbers (e.g. partial backfill, manual edits).
    const rows = await client.$queryRaw<{ number: number | bigint; companyId: number | bigint }[]>`
      WITH ob AS (
        SELECT "companyId" FROM "Onboarding" WHERE id = ${onboardingId}
      ),
      mx AS (
        SELECT COALESCE(MAX(t."number"), 0) AS max_n
          FROM "Task" t
          JOIN "Onboarding" o ON o.id = t."onboardingId"
         WHERE o."companyId" = (SELECT "companyId" FROM ob)
      ),
      upd AS (
        UPDATE "Company"
           SET "taskCounter" = GREATEST("taskCounter", (SELECT max_n FROM mx)) + 1
         WHERE id = (SELECT "companyId" FROM ob)
         RETURNING "taskCounter", id
      )
      SELECT "taskCounter" AS "number", id AS "companyId" FROM upd;
    `;
    if (!rows || rows.length === 0) {
      throw new Error(`Onboarding ${onboardingId} not found`);
    }
    // INTEGER columns can arrive as BigInt under some pg adapter configs.
    const number = Number(rows[0].number);
    const companyId = Number(rows[0].companyId);

    const created = await client.task.create({
      data: {
        onboardingId,
        phaseId,
        title: data.title || "Untitled task",
        description: data.description || "",
        status: data.status || "Not started",
        due: data.due || "",
        owner: data.owner || "",
        ownerId,
        members: data.members || [],
        notes: data.notes || "",
        sortOrder,
        priority: data.priority || null,
        blockedByTaskId: firstBlockerTaskId,
        assigneeContactId,
        companyId,
        number,
      },
      include: {
        blockedByTask: { select: BLOCKED_BY_TASK_SELECT },
        assigneeContact: { select: { id: true, name: true } },
        onboarding: { select: { company: { select: { prefix: true } } } },
      },
    });
    if (dependsOn.length === 0) return created;
    // Dependencies go in with the task, in the same transaction. The legacy
    // column already holds the first task blocker (set above).
    await insertDependencies(client, created.id, onboardingId, dependsOn);
    return client.task.findUniqueOrThrow({
      where: { id: created.id },
      include: {
        blockedByTask: { select: BLOCKED_BY_TASK_SELECT },
        dependencies: DEPENDENCIES_INCLUDE,
        assigneeContact: { select: { id: true, name: true } },
        onboarding: { select: { company: { select: { prefix: true } } } },
      },
    });
  }

  // If we're nested inside a caller-supplied transaction, run sequentially
  // on that client. Otherwise open our own transaction so the counter bump
  // and the task insert commit atomically.
  const task = tx
    ? await runWith(tx)
    : await prisma.$transaction((innerTx) => runWith(innerTx));

  if (actor) {
    const emitCreated = async () => {
    const mapped = mapTask(task);
    await emitActivity({
      onboardingId,
      actor,
      verb: "created",
      entityType: "task",
      entityId: task.id,
      metadata: { title: task.title, taskId: mapped.taskId },
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
          taskId: mapped.taskId,
          assigneeContactId: task.assigneeContactId,
          assigneeName: task.assigneeContact?.name ?? null,
        },
      });
    }
    };
    if (afterCommit) afterCommit.push(emitCreated);
    else await emitCreated();
  }

  return mapTask(task);
}

/**
 * Detect whether a task mutation flipped the onboarding's computed health
 * and, if so, emit a `health_flipped` ActivityLog row. The "before" health
 * is recomputed by swapping the post-mutation task back to its pre-mutation
 * shape inside the same task list, so we don't need to store any extra
 * state on the Onboarding row.
 *
 * Called from updateTask. createTask / deleteTask are rare enough on this
 * project that v1 only covers the update path.
 *
 * No-op if `actor` is missing (audit-only mutations like the seed run).
 */
type HealthFlipTask = { id: number; status: string; due: string };

async function maybeEmitHealthFlip({
  onboardingId,
  taskBefore,
  taskAfter,
  actor,
  client = prisma,
  afterCommit = null,
}: {
  onboardingId: number;
  taskBefore: HealthFlipTask;
  taskAfter: HealthFlipTask;
  actor?: Actor | null;
  /** Read through the caller's transaction, so its uncommitted writes count. */
  client?: DbClient;
  afterCommit?: AfterCommit | null;
}) {
  if (!actor) return;
  const onboarding = await client.onboarding.findUnique({
    where: { id: onboardingId },
    select: { targetGoLive: true, createdAt: true },
  });
  if (!onboarding) return;
  const allTasks = await client.task.findMany({
    where: { onboardingId },
    select: { id: true, status: true, due: true, dependencies: OPEN_TEXT_BLOCKERS_SELECT },
  });
  const beforeTasks = allTasks.map((t) => (t.id === taskAfter.id ? { ...taskBefore, dependencies: t.dependencies } : t));
  const opts = { targetGoLive: onboarding.targetGoLive, createdAt: onboarding.createdAt };
  const before = computeHealthFromTasks(beforeTasks, opts).status;
  const after = computeHealthFromTasks(allTasks, opts).status;
  if (before === after) return;
  const emit = () => emitActivity({
    onboardingId,
    actor,
    verb: "health_flipped",
    entityType: "onboarding",
    entityId: onboardingId,
    metadata: { from: before, to: after },
  });
  if (afterCommit) afterCommit.push(emit);
  else await emit();
}

/** Update an existing task (partial updates). */
/** Partial task update. Ids may arrive as strings from request bodies. */
export interface UpdateTaskInput {
  title?: string;
  description?: string;
  status?: string;
  due?: string;
  owner?: string;
  ownerId?: IdLike | null;
  members?: string[];
  notes?: string;
  priority?: string | null;
  commentCount?: number;
  previousStatus?: string | null;
  sortOrder?: number;
  phaseId?: IdLike;
  blockedByTaskId?: IdLike | null;
  assigneeContactId?: IdLike | null;
  /** Rejected at runtime: tasks cannot move between onboardings. */
  onboardingId?: never;
}

/**
 * `addDependencies` adds blockers in the SAME transaction as the field update,
 * so an AI update draft that changes fields (e.g. appends a note) and adds
 * blockers applies all or nothing: a rejected blocker (another onboarding, a
 * loop) leaves the task untouched and the draft pending, and a retry cannot
 * append the note twice.
 *
 * With `tx`, every write runs inside the caller's transaction (the AI draft
 * approval, which also records draft links in it); activity is pushed to
 * `afterCommit` when given.
 */
export async function updateTask(
  id: IdLike,
  data: UpdateTaskInput,
  {
    actor,
    addDependencies = [],
    tx = null,
    afterCommit = null,
  }: { actor?: Actor | null; addDependencies?: DependsOnItem[]; tx?: Prisma.TransactionClient | null; afterCommit?: AfterCommit | null } = {}
) {
  // Defensive: moving a task to a different onboarding would break the
  // Task.companyId == Onboarding.companyId invariant. The whitelist below
  // already excludes it, but make the rule explicit so accidental future
  // edits don't quietly enable it.
  if ("onboardingId" in data) {
    throw new Error("Cannot change a task's onboardingId (would break Task.companyId invariant)");
  }

  const taskId = Number(id);
  if (Number.isNaN(taskId)) return null;

  const existing = await (tx ?? prisma).task.findUnique({
    where: { id: taskId },
    select: { id: true, status: true, due: true, onboardingId: true, title: true, assigneeContactId: true },
  });
  if (!existing) return null;

  // Legacy single-blocker writes (older clients, scripts): replace the task's
  // first task blocker. Dependencies are the source of truth; the column is
  // re-derived from them.
  if (data.blockedByTaskId !== undefined) {
    if (tx) throw new Error("updateTask: blockedByTaskId cannot be written inside a caller's transaction; use addDependencies");
    await replaceLegacyBlocker(taskId, existing.onboardingId, data.blockedByTaskId);
  }

  const deps = normaliseDependsOn(addDependencies);
  const run = async (tx: Prisma.TransactionClient) => {
   if (deps.length > 0) {
    await insertDependencies(tx, taskId, existing.onboardingId, deps);
    await syncLegacyBlockedBy(tx, taskId);
   }
   return tx.task.update({
    where: { id: taskId },
    data: {
      ...(data.title !== undefined && { title: data.title }),
      ...(data.description !== undefined && { description: data.description }),
      ...(data.status !== undefined && { status: data.status }),
      ...(data.due !== undefined && { due: data.due }),
      ...(data.owner !== undefined && { owner: data.owner }),
      ...(data.ownerId !== undefined && {
        ownerId: data.ownerId != null ? Number(data.ownerId) : null,
      }),
      ...(data.members !== undefined && { members: data.members }),
      ...(data.notes !== undefined && { notes: data.notes }),
      ...(data.priority !== undefined && { priority: data.priority }),
      ...(data.commentCount !== undefined && { commentCount: data.commentCount }),
      ...(data.previousStatus !== undefined && { previousStatus: data.previousStatus }),
      ...(data.sortOrder !== undefined && { sortOrder: data.sortOrder }),
      ...(data.phaseId !== undefined && { phaseId: Number(data.phaseId) }),
      ...(data.assigneeContactId !== undefined && {
        assigneeContactId: data.assigneeContactId != null ? Number(data.assigneeContactId) : null,
      }),
    },
    include: {
      blockedByTask: { select: BLOCKED_BY_TASK_SELECT },
      dependencies: DEPENDENCIES_INCLUDE,
      assigneeContact: { select: { id: true, name: true } },
      onboarding: { select: { company: { select: { prefix: true } } } },
    },
   });
  };
  const updated = tx ? await run(tx) : await prisma.$transaction(run);

  const updatedMapped = mapTask(updated);
  // Side effects: now, or after the caller's commit when it asked for that.
  const later = (fn: () => Promise<unknown>) => (afterCommit ? (afterCommit.push(fn), undefined) : fn());
  if (actor && data.status !== undefined && existing.status !== updated.status) {
    await later(() => emitActivity({
      onboardingId: existing.onboardingId,
      actor,
      verb: updated.status === "Done" ? "completed" : "status_changed",
      entityType: "task",
      entityId: updated.id,
      metadata: { from: existing.status, to: updated.status, title: updated.title, taskId: updatedMapped.taskId },
    }));
  }

  if (
    actor &&
    data.assigneeContactId !== undefined &&
    existing.assigneeContactId !== updated.assigneeContactId &&
    updated.assigneeContactId != null
  ) {
    await later(() => emitActivity({
      onboardingId: existing.onboardingId,
      actor,
      verb: "assigned",
      entityType: "task",
      entityId: updated.id,
      metadata: {
        title: updated.title,
        taskId: updatedMapped.taskId,
        assigneeContactId: updated.assigneeContactId,
        assigneeName: updated.assigneeContact?.name ?? null,
        previousAssigneeContactId: existing.assigneeContactId,
      },
    }));
  }

  // Health may have flipped if any input to computeHealth changed.
  const healthInputs = ["status", "due", "blockedByTaskId"] as const;
  if (healthInputs.some((k) => data[k] !== undefined) || deps.length > 0) {
    await maybeEmitHealthFlip({
      onboardingId: existing.onboardingId,
      taskBefore: { id: existing.id, status: existing.status, due: existing.due ?? "" },
      taskAfter: { id: updated.id, status: updated.status, due: updated.due ?? "" },
      actor,
      client: tx ?? prisma,
      afterCommit,
    });
  }

  return mapTask(updated);
}

// ---------------------------------------------------------------------------
// Task dependencies (GAPS-PLAN feature 2). A task waits on board tasks and/or
// text blockers. TaskDependency is the source of truth; Task.blockedByTaskId is
// kept equal to the first task blocker (oldest row) until a later migration
// retires it, so anything still reading the column stays right.
// ---------------------------------------------------------------------------

/** A dependency write the caller got wrong (400), as opposed to a server fault. */
export class DependencyError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.name = "DependencyError";
    this.status = status;
  }
}

/** Set Task.blockedByTaskId to the task's first task blocker (or null). */
async function syncLegacyBlockedBy(client: DbClient, taskId: number) {
  const first = await client.taskDependency.findFirst({
    where: { taskId, blockedByTaskId: { not: null } },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    select: { blockedByTaskId: true },
  });
  await client.task.update({
    where: { id: taskId },
    data: { blockedByTaskId: first?.blockedByTaskId ?? null },
  });
}

/**
 * Insert dependencies for a task, skipping ones it already has. Task blockers
 * must be other tasks on the same onboarding (DependencyError otherwise).
 * Does not sync the legacy column; callers do.
 */
async function insertDependencies(client: DbClient, taskId: number, onboardingId: number, items: DependsOnItem[]) {
  if (items.length === 0) return;
  const taskIds = items.filter((i): i is { taskId: number } => "taskId" in i).map((i) => i.taskId);
  if (taskIds.includes(taskId)) throw new DependencyError("A task cannot depend on itself");
  if (taskIds.length > 0) {
    const found = await client.task.findMany({
      where: { id: { in: taskIds }, onboardingId },
      select: { id: true },
    });
    if (found.length !== new Set(taskIds).size) {
      throw new DependencyError("Blocker task not found on this onboarding");
    }
  }
  for (const blockerId of new Set(taskIds)) {
    const loop = await findDependencyLoop(client, taskId, blockerId);
    if (loop) {
      const codes = await taskCodes(client, [taskId, ...loop]);
      const [self, ...path] = [taskId, ...loop].map((id) => codes.get(id) ?? `#${id}`);
      const chain = [...path, self];
      throw new DependencyError(
        `${path[0]} can't block ${self}: ${chain[0]} already waits on ${chain.slice(1).join(", which waits on ")}, so this would make a loop`
      );
    }
  }
  const existing = await client.taskDependency.findMany({
    where: { taskId },
    select: { blockedByTaskId: true, label: true },
  });
  const haveTasks = new Set(existing.map((e) => e.blockedByTaskId).filter((x): x is number => x != null));
  const haveLabels = new Set(existing.map((e) => e.label?.toLowerCase()).filter(Boolean));
  for (const item of items) {
    if ("taskId" in item) {
      if (haveTasks.has(item.taskId)) continue;
      haveTasks.add(item.taskId);
      await client.taskDependency.create({ data: { taskId, blockedByTaskId: item.taskId } });
    } else {
      const label = cleanDependencyLabel(item.text);
      if (!label || haveLabels.has(label.toLowerCase())) continue;
      haveLabels.add(label.toLowerCase());
      await client.taskDependency.create({ data: { taskId, label } });
    }
  }
}

/**
 * Would "taskId waits on blockerId" close a loop? Follows what blockerId
 * already waits on (task blockers only, any status) and returns the chain
 * [blockerId, ..., a task that waits on taskId] if it reaches taskId, else
 * null. Visits each task once, so loops already in the data (old rows) cannot
 * hang it.
 */
async function findDependencyLoop(client: DbClient, taskId: number, blockerId: number): Promise<number[] | null> {
  const parent = new Map<number, number | null>([[blockerId, null]]);
  let frontier = [blockerId];
  while (frontier.length > 0) {
    const edges = await client.taskDependency.findMany({
      where: { taskId: { in: frontier }, blockedByTaskId: { not: null } },
      select: { taskId: true, blockedByTaskId: true },
    });
    const next: number[] = [];
    for (const e of edges) {
      const to = e.blockedByTaskId as number;
      if (to === taskId) {
        const chain = [e.taskId];
        let p = parent.get(e.taskId) ?? null;
        while (p != null) { chain.unshift(p); p = parent.get(p) ?? null; }
        return chain;
      }
      if (!parent.has(to)) { parent.set(to, e.taskId); next.push(to); }
    }
    frontier = next;
  }
  return null;
}

/** "RAY-7" codes for task ids. */
async function taskCodes(client: DbClient, ids: number[]): Promise<Map<number, string>> {
  const rows = await client.task.findMany({
    where: { id: { in: ids } },
    select: { id: true, number: true, onboarding: { select: { company: { select: { prefix: true } } } } },
  });
  return new Map(rows.map((r) => [r.id, `${r.onboarding.company.prefix}-${r.number}`]));
}

/** Legacy `blockedByTaskId` write: swap the first task blocker for `next` (null = drop it). */
async function replaceLegacyBlocker(taskId: number, onboardingId: number, next: IdLike | null) {
  const nextId = next != null && next !== "" ? Number(next) : null;
  if (nextId != null && Number.isNaN(nextId)) throw new DependencyError("Invalid blocker task id");
  await prisma.$transaction(async (tx) => {
    const current = await tx.task.findUnique({ where: { id: taskId }, select: { blockedByTaskId: true } });
    if (current?.blockedByTaskId != null && current.blockedByTaskId !== nextId) {
      await tx.taskDependency.deleteMany({ where: { taskId, blockedByTaskId: current.blockedByTaskId } });
    }
    if (nextId != null) await insertDependencies(tx, taskId, onboardingId, [{ taskId: nextId }]);
    await syncLegacyBlockedBy(tx, taskId);
  });
}

/** One task in the board shape (same as getTasksForOnboarding's rows). Null if missing. */
export async function getTaskForBoard(id: IdLike) {
  const taskId = Number(id);
  if (Number.isNaN(taskId)) return null;
  const t = await prisma.task.findUnique({
    where: { id: taskId },
    include: {
      blockedByTask: { select: BLOCKED_BY_TASK_SELECT },
      dependencies: DEPENDENCIES_INCLUDE,
      assigneeContact: { select: { id: true, name: true } },
      files: { orderBy: { createdAt: "desc" } },
      onboarding: { select: { company: { select: { prefix: true } } } },
    },
  });
  if (!t) return null;
  return mapTask({
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
    dependencies: t.dependencies,
    assigneeContactId: t.assigneeContactId,
    assigneeContact: t.assigneeContact || null,
    files: t.files || [],
    number: t.number ?? null,
    onboarding: t.onboarding ?? null,
  });
}

/**
 * Sort proposed blocker task ids for an onboarding: `open` (on this onboarding,
 * not Done) can be linked; `closed` are Done; `missing` no longer exist;
 * `foreign` belong to another onboarding (a tampered or mis-scoped draft).
 */
export async function classifyBlockerTasks(onboardingId: IdLike, taskIds: number[]) {
  const obId = Number(onboardingId);
  const ids = [...new Set(taskIds.filter((n) => Number.isInteger(n)))];
  const result = { open: [] as number[], closed: [] as number[], missing: [] as number[], foreign: [] as number[] };
  if (Number.isNaN(obId) || ids.length === 0) return result;
  const rows = await prisma.task.findMany({
    where: { id: { in: ids } },
    select: { id: true, onboardingId: true, status: true },
  });
  const byId = new Map(rows.map((r) => [r.id, r]));
  for (const id of ids) {
    const r = byId.get(id);
    if (!r) result.missing.push(id);
    else if (r.onboardingId !== obId) result.foreign.push(id);
    else if (r.status === "Done") result.closed.push(id);
    else result.open.push(id);
  }
  return result;
}

/** A task's dependencies, oldest first. [] for a bad id or a missing task. */
export async function listTaskDependencies(taskId: IdLike): Promise<TaskDependencyView[]> {
  const id = Number(taskId);
  if (Number.isNaN(id)) return [];
  const rows = await prisma.taskDependency.findMany({ where: { taskId: id }, ...DEPENDENCIES_INCLUDE });
  return rows.map(mapDependency);
}

/**
 * Add dependencies to a task (board tasks and/or text). Already-present ones
 * are skipped. Returns the task in the board shape, or null when the task is
 * missing. Throws DependencyError for a blocker on another onboarding or the
 * task itself.
 */
export async function addTaskDependencies(taskId: IdLike, items: DependsOnItem[]) {
  const id = Number(taskId);
  if (Number.isNaN(id)) return null;
  const task = await prisma.task.findUnique({ where: { id }, select: { onboardingId: true } });
  if (!task) return null;
  const clean = normaliseDependsOn(items);
  if (clean.length === 0) throw new DependencyError("Nothing to add: give a task or some text");
  await prisma.$transaction(async (tx) => {
    await insertDependencies(tx, id, task.onboardingId, clean);
    await syncLegacyBlockedBy(tx, id);
  });
  return getTaskForBoard(id);
}

/** Remove one dependency from a task. Null when the task or dependency is missing. */
export async function removeTaskDependency(taskId: IdLike, dependencyId: IdLike) {
  const id = Number(taskId);
  const depId = Number(dependencyId);
  if (Number.isNaN(id) || Number.isNaN(depId)) return null;
  const removed = await prisma.$transaction(async (tx) => {
    const r = await tx.taskDependency.deleteMany({ where: { id: depId, taskId: id } });
    if (r.count === 0) return false;
    await syncLegacyBlockedBy(tx, id);
    return true;
  });
  return removed ? getTaskForBoard(id) : null;
}

/**
 * Tick a text blocker off (or un-tick it). Task blockers are resolved by their
 * task being Done, so this is a DependencyError for them. Null when missing.
 */
export async function setTaskDependencyResolved(taskId: IdLike, dependencyId: IdLike, resolved: boolean) {
  const id = Number(taskId);
  const depId = Number(dependencyId);
  if (Number.isNaN(id) || Number.isNaN(depId)) return null;
  const dep = await prisma.taskDependency.findFirst({ where: { id: depId, taskId: id }, select: { label: true } });
  if (!dep) return null;
  if (dep.label == null) throw new DependencyError("A task blocker is resolved by completing that task");
  await prisma.taskDependency.update({
    where: { id: depId },
    data: { resolvedAt: resolved ? new Date() : null },
  });
  return getTaskForBoard(id);
}

/** Delete a task. */
export async function deleteTask(id: IdLike) {
  const taskId = Number(id);
  if (Number.isNaN(taskId)) return null;

  const exists = await prisma.task.findUnique({ where: { id: taskId }, select: { id: true } });
  if (!exists) return null;
  // Tasks waiting on this one lose that dependency (FK cascade); re-derive
  // their legacy column afterwards so it never points at a later blocker's gap.
  const dependents = await prisma.taskDependency.findMany({
    where: { blockedByTaskId: taskId },
    select: { taskId: true },
  });

  // Re-fetch with the prefix include so the returned shape has taskId
  // computed; Prisma's `delete()` does support `include`, but we need both
  // the company prefix and the number — both are present in the row by
  // this point.
  const deleted = await prisma.task.delete({
    where: { id: taskId },
    include: {
      onboarding: { select: { company: { select: { prefix: true } } } },
    },
  });
  for (const d of dependents) await syncLegacyBlockedBy(prisma, d.taskId);
  return mapTask(deleted);
}

/** Reorder a task: move to a target phase at a specific sortOrder position. */
export async function reorderTask(taskId: IdLike, targetPhaseId: IdLike, newSortOrder: number) {
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

  const reordered = await prisma.task.findUnique({
    where: { id },
    include: {
      blockedByTask: { select: BLOCKED_BY_TASK_SELECT },
      dependencies: DEPENDENCIES_INCLUDE,
      onboarding: { select: { company: { select: { prefix: true } } } },
    },
  });
  return mapTask(reordered);
}

/** Bulk update multiple tasks (primarily for status changes). */
export async function bulkUpdateTasks(taskIds: IdLike[], data: { status?: string }) {
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
  return companies.map((c) => ({ id: c.id, name: c.name, domain: c.domain ?? null, logoUrl: c.logoUrl ?? null }));
}

/** Get all onboardings for a company (used by Miniti match heuristic). */
export async function getOnboardingsByCompanyId(companyId: IdLike) {
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

/** Create a new company. Optional domain (used by Miniti webhook matching).
 *
 *  Auto-derives a unique task-ID prefix from the company name. If a
 *  concurrent insert grabbed the same prefix (P2002), we retry up to 3
 *  times — each retry recomputes against the now-larger taken set so we
 *  pick the next available candidate. */
export async function createCompany(name: string, { domain = null }: { domain?: string | null } = {}) {
  if (!name || !name.trim()) {
    throw new Error("Company name is required");
  }
  const cleanName = name.trim();
  const cleanDomain = domain ? domain.trim().toLowerCase() : null;

  const MAX_ATTEMPTS = 4; // 1 normal + 3 retries on prefix collision
  let lastError: unknown = null;
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const existingPrefixes = await prisma.company.findMany({
      select: { prefix: true },
    });
    const taken = new Set(existingPrefixes.map((c) => c.prefix).filter(Boolean));
    const prefix = derivePrefix(cleanName, taken);
    try {
      return await prisma.company.create({
        data: { name: cleanName, domain: cleanDomain, prefix },
      });
    } catch (err) {
      // P2002 = unique constraint violation. Could be prefix or domain;
      // only retry on prefix collisions.
      const e = err as { code?: string; meta?: { target?: unknown } } | null;
      const isPrefixCollision =
        e?.code === "P2002" && Array.isArray(e?.meta?.target)
          ? e.meta.target.includes("prefix")
          : false;
      if (!isPrefixCollision) throw err;
      lastError = err;
    }
  }
  throw lastError ?? new Error("createCompany: exhausted prefix collision retries");
}

/** Update an existing company (name and/or domain). */
export async function updateCompany(id: IdLike, { name, domain }: { name?: string; domain?: string | null }) {
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
export interface OnboardingInput {
  companyId?: IdLike;
  owner?: string;
  status?: string;
  targetGoLive?: string | number | Date | null;
}

export async function createOnboarding(data: OnboardingInput & { companyId: IdLike }) {
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
export async function updateOnboarding(id: IdLike, data: OnboardingInput) {
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
export async function deleteOnboarding(id: IdLike) {
  const obId = Number(id);
  if (Number.isNaN(obId)) return null;

  const exists = await prisma.onboarding.findUnique({ where: { id: obId }, select: { id: true } });
  if (!exists) return null;

  return await prisma.onboarding.delete({
    where: { id: obId },
  });
}

/** List contacts for an onboarding. */
export async function getContactsForOnboarding(onboardingId: IdLike) {
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
    lastSeenPortalAt: c.lastSeenPortalAt ? c.lastSeenPortalAt.toISOString() : null,
  }));
}

/** Create a new contact. */
export async function createContact(data: { onboardingId: IdLike; name: string; email?: string | null; role?: string | null }) {
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
export async function updateContact(id: IdLike, data: { name?: string; email?: string; role?: string }) {
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
export async function deleteContact(id: IdLike) {
  const contactId = Number(id);
  if (Number.isNaN(contactId)) return null;

  const exists = await prisma.contact.findUnique({ where: { id: contactId }, select: { id: true } });
  if (!exists) return null;

  return await prisma.contact.delete({
    where: { id: contactId },
  });
}

/** Duplicate an onboarding with all its tasks and phases. */
export async function duplicateOnboarding(id: IdLike) {
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

  // Run onboarding + phases + each task inside one transaction so the
  // counter-bump per task can't race with another writer (and so a partial
  // failure leaves no orphaned onboarding behind).
  const newObId = await prisma.$transaction(async (tx) => {
    const newOb = await tx.onboarding.create({
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
      include: { phases: { orderBy: { sortOrder: "asc" } } },
    });

    // Build old phaseId → new phaseId map
    const phaseMap = new Map<number, number>();
    original.phases.forEach((oldPhase, idx) => {
      phaseMap.set(oldPhase.id, newOb.phases[idx].id);
    });

    // Create tasks one-by-one through createTask so each gets its own
    // counter bump + companyId/number assignment (no blockedByTaskId copy).
    for (const t of original.tasks) {
      await createTask(
        {
          onboardingId: newOb.id,
          phaseId: phaseMap.get(t.phaseId) || newOb.phases[0].id,
          title: t.title,
          status: "Not started",
          due: "",
          description: t.description || "",
          members: t.members || [],
          owner: t.owner,
          notes: t.notes,
        },
        { tx },
      );
    }

    return newOb.id;
  });

  const duplicated = await prisma.onboarding.findUnique({
    where: { id: newObId },
    include: {
      company: true,
      tasks: {
        include: {
          onboarding: { select: { company: { select: { prefix: true } } } },
        },
      },
      phases: true,
    },
  });
  if (!duplicated) return duplicated;
  return { ...duplicated, tasks: duplicated.tasks.map(mapTask) };
}

// ── Comment functions ─────────────────────────────────────────────

/** List comments for a task, ordered oldest first. */
export async function getCommentsForTask(taskId: IdLike) {
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
export async function createComment(
  taskId: IdLike,
  author: string,
  body: string,
  { actor }: { actor?: Actor | null } = {}
) {
  const id = Number(taskId);
  if (Number.isNaN(id)) throw new Error("Invalid task ID");

  const [comment, updatedTask] = await prisma.$transaction([
    prisma.comment.create({
      data: { taskId: id, author, body },
    }),
    prisma.task.update({
      where: { id },
      data: { commentCount: { increment: 1 } },
      select: {
        onboardingId: true,
        title: true,
        number: true,
        onboarding: { select: { company: { select: { prefix: true } } } },
      },
    }),
  ]);

  if (actor) {
    const taskCode = updatedTask.onboarding?.company?.prefix && updatedTask.number
      ? `${updatedTask.onboarding.company.prefix}-${updatedTask.number}`
      : null;
    await emitActivity({
      onboardingId: updatedTask.onboardingId,
      actor,
      verb: "commented",
      entityType: "task",
      entityId: id,
      metadata: { taskTitle: updatedTask.title, taskId: taskCode, excerpt: body.slice(0, 120) },
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
export async function getPhasesForOnboarding(onboardingId: IdLike) {
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
export interface PhaseInput {
  name?: string;
  sortOrder?: number;
  targetDate?: string | number | Date | null;
  isComplete?: boolean;
}

export async function createPhase(data: PhaseInput & { onboardingId: IdLike }) {
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
export async function updatePhase(id: IdLike, data: PhaseInput) {
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
export async function deletePhase(id: IdLike) {
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
export async function createMagicLink(contactId: IdLike, onboardingId: IdLike, expiresInDays = 30) {
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
export async function getMagicLinkRaw(token: unknown) {
  if (!token || typeof token !== "string") return null;
  return prisma.magicLink.findUnique({ where: { token } });
}

/** Look up a magic link by token. Returns null if not found, expired, or revoked. */
export async function getMagicLinkByToken(token: unknown) {
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
export async function revokeMagicLink(id: IdLike) {
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
export async function getMagicLinksForOnboarding(onboardingId: IdLike) {
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
export async function createMagicLinksBulk(
  contactIds: IdLike[] | null | undefined,
  onboardingId: IdLike,
  expiresInDays = 30,
  { force = false }: { force?: boolean } = {}
) {
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

  let toCreate: number[];
  let skipped: { contactId: number; reason: string }[];

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
export async function markMagicLinkSent(id: IdLike, sentTo: string | null | undefined) {
  const linkId = Number(id);
  if (Number.isNaN(linkId)) return null;
  return await prisma.magicLink.update({
    where: { id: linkId },
    data: { sentAt: new Date(), sentTo: sentTo || null },
  });
}

// ─── Portal reads ────────────────────────────────────────────

/** Get onboarding data for portal view (phases with task counts by status). */
export async function getPortalOnboarding(onboardingId: IdLike) {
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
      tasks: { include: { dependencies: OPEN_TEXT_BLOCKERS_SELECT } },
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
    companyLogoUrl: onboarding.company.logoUrl,
    owner: onboarding.owner,
    status: onboarding.status,
    targetGoLive: onboarding.targetGoLive ? onboarding.targetGoLive.toISOString() : null,
    createdAt: onboarding.createdAt.toISOString(),
    health,
    phases,
    taskSummary: {
      notStarted: onboarding.tasks.filter((t) => t.status === "Not started").length,
      inProgress: onboarding.tasks.filter((t) => ["In progress", "Under investigation"].includes(t.status)).length,
      // "On hold" was added as a 6th status after this summary was written; without
      // its own bucket those tasks fell through every filter below and the portal
      // counts silently summed to less than `total`.
      onHold: onboarding.tasks.filter((t) => t.status === "On hold").length,
      blocked: onboarding.tasks.filter((t) => t.status === "Blocked").length,
      done: onboarding.tasks.filter((t) => t.status === "Done").length,
      total: onboarding.tasks.length,
    },
  };
}

/** Get tasks for the portal, marking which are assigned to this contact. */
export async function getPortalTasks(onboardingId: IdLike, contactId: IdLike | null | undefined) {
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
      onboarding: { select: { company: { select: { prefix: true } } } },
    },
    orderBy: [{ phase: { sortOrder: "asc" } }, { sortOrder: "asc" }],
  });

  return tasks.map((t) => mapTask({
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
    number: t.number ?? null,
    onboarding: t.onboarding ?? null,
  }));
}

/** Update a task from the portal (only status changes allowed). */
export async function updateTaskAsPortalUser(
  taskId: IdLike,
  onboardingId: IdLike,
  data: { status?: string; previousStatus?: string | null },
  { actor }: { actor?: Actor | null } = {}
) {
  const tId = Number(taskId);
  const oId = Number(onboardingId);
  if (Number.isNaN(tId) || Number.isNaN(oId)) return null;

  // Verify task belongs to this onboarding
  const task = await prisma.task.findFirst({
    where: { id: tId, onboardingId: oId },
  });
  if (!task) return null;

  // Only allow status and previousStatus updates
  const updateData: Prisma.TaskUpdateInput = {};
  if (data.status) updateData.status = data.status;
  if (data.previousStatus !== undefined) updateData.previousStatus = data.previousStatus;

  const updated = await prisma.task.update({
    where: { id: tId },
    data: updateData,
    include: {
      onboarding: { select: { company: { select: { prefix: true } } } },
    },
  });

  const updatedMapped = mapTask(updated);
  if (actor && data.status !== undefined && task.status !== updated.status) {
    await emitActivity({
      onboardingId: oId,
      actor,
      verb: updated.status === "Done" ? "completed" : "status_changed",
      entityType: "task",
      entityId: updated.id,
      metadata: { from: task.status, to: updated.status, title: updated.title, taskId: updatedMapped.taskId },
    });
  }

  return updatedMapped;
}

/** Create a comment from a portal user. */
export async function createCommentAsPortalUser(
  taskId: IdLike,
  onboardingId: IdLike,
  contactName: string,
  body: string,
  { actor }: { actor?: Actor | null } = {}
) {
  const tId = Number(taskId);
  const oId = Number(onboardingId);
  if (Number.isNaN(tId) || Number.isNaN(oId)) return null;

  // Verify task belongs to this onboarding
  const task = await prisma.task.findFirst({
    where: { id: tId, onboardingId: oId },
    include: { onboarding: { select: { company: { select: { prefix: true } } } } },
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
    const taskCode = task.onboarding?.company?.prefix && task.number
      ? `${task.onboarding.company.prefix}-${task.number}`
      : null;
    await emitActivity({
      onboardingId: oId,
      actor,
      verb: "commented",
      entityType: "task",
      entityId: tId,
      metadata: { taskTitle: task.title, taskId: taskCode, excerpt: body.slice(0, 120) },
    });
  }

  return comment;
}

// ─── File uploads ────────────────────────────────────────────

/** Create a file record (after uploading to Supabase Storage). */
export interface CreateFileInput {
  taskId: IdLike;
  onboardingId: IdLike;
  contactId?: IdLike | null;
  uploadedBy: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  storagePath: string;
}

export async function createFile(
  { taskId, onboardingId, contactId, uploadedBy, fileName, fileSize, mimeType, storagePath }: CreateFileInput,
  { actor }: { actor?: Actor | null } = {}
) {
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
export async function getFilesForTask(taskId: IdLike) {
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
/** Lightweight helper: returns the onboardingId for a task, or null if the
 *  task doesn't exist. Used by the approve handler to verify a draft's target
 *  task belongs to the draft's onboarding (prevents IDOR via tampered payload). */
export async function getTaskOnboardingId(id: IdLike | null | undefined) {
  const tId = Number(id);
  if (Number.isNaN(tId)) return null;
  const t = await prisma.task.findUnique({
    where: { id: tId },
    select: { onboardingId: true },
  });
  return t ? t.onboardingId : null;
}

/** A task's current notes, for appending to them (approve route, match_existing
 *  drafts). Null if the task doesn't exist. */
export async function getTaskNotes(id: IdLike | null | undefined) {
  const tId = Number(id);
  if (Number.isNaN(tId)) return null;
  const t = await prisma.task.findUnique({ where: { id: tId }, select: { notes: true } });
  return t ? t.notes ?? "" : null;
}

export async function getTaskForFollowup(id: IdLike) {
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
    task: mapTask({
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
      number: task.number ?? null,
      onboarding: { company: { prefix: task.onboarding?.company?.prefix ?? null } },
    }),
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
export async function getFileForPortal(id: IdLike, onboardingId: IdLike) {
  const fId = Number(id);
  const oId = Number(onboardingId);
  if (Number.isNaN(fId) || Number.isNaN(oId)) return null;
  return await prisma.file.findFirst({
    where: { id: fId, onboardingId: oId },
  });
}

/** Get a file record by ID (vendor-side, no scoping). */
export async function getFile(id: IdLike) {
  const fId = Number(id);
  if (Number.isNaN(fId)) return null;
  return await prisma.file.findUnique({ where: { id: fId } });
}

/** Delete a file record by ID. */
export async function deleteFile(id: IdLike) {
  const fId = Number(id);
  if (Number.isNaN(fId)) return null;
  return await prisma.file.delete({ where: { id: fId } });
}

// ─── Phase 3: External events + PendingAIChange ─────────────

// The parts of the JSON columns this layer reads. Payloads are stored as
// received (Miniti) or as the model produced them, so every field is optional
// and every read below stays defensive exactly as it was in JS.
interface MinitiAttendeeJson {
  name?: string | null;
  email?: string | null;
  domain?: string | null;
}
interface MinitiTranscriptLineJson {
  speaker?: string | null;
  text?: string | null;
}
interface MeetingPayload {
  meeting?: {
    title?: string | null;
    summary?: string | null;
    duration_seconds?: number | null;
    attendees?: (MinitiAttendeeJson | null)[];
    transcript?: (MinitiTranscriptLineJson | null)[];
  };
}
/** Draft payload fields read for titles / task links. */
interface DraftPayloadJson {
  title?: string | null;
  subject?: string | null;
  taskId?: IdLike | null;
  ownerId?: IdLike | null;
}


/** Idempotent insert of an ExternalEvent. Returns null if already deduped. */
export async function createExternalEvent({
  source,
  sourceId,
  occurredAt,
  payload,
  onboardingId,
  matchAmbiguous = false,
}: {
  source: string;
  sourceId: string | number;
  occurredAt: string | number | Date;
  /** Raw webhook body, stored as-is. */
  payload: object;
  onboardingId?: IdLike | null;
  matchAmbiguous?: boolean;
}) {
  try {
    return await prisma.externalEvent.create({
      data: {
        source,
        sourceId: String(sourceId),
        occurredAt: new Date(occurredAt),
        payload: payload as Prisma.InputJsonValue,
        onboardingId: onboardingId == null ? null : Number(onboardingId),
        matchAmbiguous,
      },
    });
  } catch (err) {
    // P2002 = unique constraint violation → silently dedup
    if ((err as { code?: string } | null)?.code === "P2002") return null;
    throw err;
  }
}

/** Fetch one ExternalEvent + parsed payload. */
export async function getExternalEvent(id: IdLike) {
  const eId = Number(id);
  if (Number.isNaN(eId)) return null;
  return prisma.externalEvent.findUnique({ where: { id: eId } });
}

/** List ambiguous (unmatched) ExternalEvents waiting for manual assignment. */
export async function listAmbiguousEvents({ source = "miniti", limit = 50 }: { source?: string; limit?: number } = {}) {
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
export async function countAmbiguousEvents({ source = "miniti" }: { source?: string } = {}) {
  return prisma.externalEvent.count({
    where: { source, matchAmbiguous: true, processedAt: null },
  });
}

/** Assign an ExternalEvent to a specific onboarding (clears ambiguous flag). */
export async function assignExternalEventOnboarding(eventId: IdLike, onboardingId: IdLike) {
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
export async function getIntegrationStats({ source = "miniti", days = 30 }: { source?: string; days?: number } = {}) {
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
export async function listStuckEvents({ source = "miniti", limit = 20 }: { source?: string; limit?: number } = {}) {
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
    meetingTitle: (r.payload as MeetingPayload | null)?.meeting?.title ?? "(untitled)",
    // Debug surface for the "Show debug" toggle. Three nullable stages
    // of the two-pass orchestrator (see orchestrator.js).
    orchestratorInput: r.orchestratorInput ?? null,
    orchestratorExtraction: r.orchestratorExtraction ?? null,
    orchestratorOutput: r.orchestratorOutput ?? null,
  }));
}

/** Mark an ExternalEvent processed (idempotency for orchestrator retries). */
export async function markExternalEventProcessed(id: IdLike, { error = null }: { error?: string | null } = {}) {
  const eId = Number(id);
  if (Number.isNaN(eId)) return null;
  return prisma.externalEvent.update({
    where: { id: eId },
    data: { processedAt: new Date(), error },
  });
}

/** Flag an ExternalEvent as fired from the /admin/ai test panel. */
export async function markEventAsTestRun(id: IdLike) {
  const eId = Number(id);
  if (Number.isNaN(eId)) return null;
  return prisma.externalEvent.update({
    where: { id: eId },
    data: { isTestRun: true },
  });
}

/**
 * List meetings (Miniti ExternalEvent rows) for one onboarding's Meetings
 * tab. Real meetings only — test-run events are excluded. Returns the
 * minimal shape the timeline UI needs: title, date, attendees, summary,
 * transcript, plus the event id for cross-linking from drafts.
 */
export async function getMeetingsForOnboarding(onboardingId: IdLike) {
  const oId = Number(onboardingId);
  if (Number.isNaN(oId)) return [];
  const rows = await prisma.externalEvent.findMany({
    where: {
      source: "miniti",
      onboardingId: oId,
      isTestRun: false,
    },
    orderBy: { occurredAt: "desc" },
    include: {
      onboarding: {
        select: {
          company: { select: { name: true, domain: true, logoUrl: true } },
        },
      },
    },
  });
  // These rows seed the MeetingDrawer's first paint, so they carry the same
  // company / duration / attendee-domain fields the drawer's own fetch
  // returns. Without them the header would flip look once the fetch landed.
  return rows.map((r) => ({
    id: r.id,
    sourceId: r.sourceId,
    onboardingId: r.onboardingId,
    occurredAt: r.occurredAt.toISOString(),
    durationSeconds: (r.payload as MeetingPayload | null)?.meeting?.duration_seconds ?? null,
    company: r.onboarding?.company
      ? {
          name: r.onboarding.company.name,
          domain: r.onboarding.company.domain ?? null,
          logoUrl: r.onboarding.company.logoUrl ?? null,
        }
      : null,
    meetingTitle: (r.payload as MeetingPayload | null)?.meeting?.title ?? "(untitled meeting)",
    summary: (r.payload as MeetingPayload | null)?.meeting?.summary ?? null,
    attendees: Array.isArray((r.payload as MeetingPayload | null)?.meeting?.attendees)
      ? (r.payload as MeetingPayload).meeting!.attendees!.map((a) => ({
          name: a?.name ?? null,
          email: a?.email ?? null,
          domain: a?.domain ?? emailDomain(a?.email),
        }))
      : [],
    transcript: Array.isArray((r.payload as MeetingPayload | null)?.meeting?.transcript)
      ? (r.payload as MeetingPayload).meeting!.transcript!.map((t) => ({
          speaker: t?.speaker ?? "—",
          text: t?.text ?? "",
        }))
      : [],
    processedAt: r.processedAt ? r.processedAt.toISOString() : null,
  }));
}

/**
 * Admin-scope timeline: every ExternalEvent across all onboardings,
 * including ambiguous + stuck + test-runs. Used by /admin/ai → Pipeline.
 *
 * Returns rich rows: meeting + onboarding link + draft summary + the
 * three orchestrator JSONB fields. Filtered by `state` discriminator
 * which collapses our many fields into the buckets the UI shows.
 */
export async function listExternalEventsForAdmin({ limit = 100, state = "all" }: { limit?: number; state?: string } = {}) {
  const where: Prisma.ExternalEventWhereInput = { source: "miniti" };
  if (state === "test") where.isTestRun = true;
  if (state === "ambiguous") {
    where.matchAmbiguous = true;
    where.processedAt = null;
  }
  if (state === "stuck") {
    where.matchAmbiguous = false;
    where.onboardingId = { not: null };
    where.processedAt = null;
  }
  if (state === "errored") where.error = { not: null };
  if (state === "processed") where.processedAt = { not: null };

  const rows = await prisma.externalEvent.findMany({
    where,
    orderBy: { receivedAt: "desc" },
    take: limit,
    include: {
      onboarding: { select: { id: true, company: { select: { name: true } } } },
      pendingChanges: {
        select: { id: true, action: true, status: true, payload: true, createdAt: true },
        orderBy: { createdAt: "asc" },
      },
    },
  });

  return rows.map((r) => ({
    id: r.id,
    source: r.source,
    sourceId: r.sourceId,
    occurredAt: r.occurredAt.toISOString(),
    receivedAt: r.receivedAt.toISOString(),
    processedAt: r.processedAt ? r.processedAt.toISOString() : null,
    error: r.error ?? null,
    onboardingId: r.onboardingId,
    onboardingName: r.onboarding?.company?.name ?? null,
    matchAmbiguous: r.matchAmbiguous,
    isTestRun: r.isTestRun,
    meetingTitle: (r.payload as MeetingPayload | null)?.meeting?.title ?? "(untitled)",
    meetingSummary: (r.payload as MeetingPayload | null)?.meeting?.summary ?? null,
    attendees: Array.isArray((r.payload as MeetingPayload | null)?.meeting?.attendees)
      ? (r.payload as MeetingPayload).meeting!.attendees!.map((a) => ({
          name: a?.name ?? null,
          email: a?.email ?? null,
        }))
      : [],
    transcript: Array.isArray((r.payload as MeetingPayload | null)?.meeting?.transcript)
      ? (r.payload as MeetingPayload).meeting!.transcript!.map((t) => ({
          speaker: t?.speaker ?? "—",
          text: t?.text ?? "",
        }))
      : [],
    orchestratorInput: r.orchestratorInput ?? null,
    orchestratorExtraction: r.orchestratorExtraction ?? null,
    orchestratorOutput: r.orchestratorOutput ?? null,
    drafts: r.pendingChanges.map((d) => ({
      id: d.id,
      action: d.action,
      status: d.status,
      title: (d.payload as DraftPayloadJson | null)?.title ?? (d.payload as DraftPayloadJson | null)?.subject ?? null,
      createdAt: d.createdAt.toISOString(),
    })),
  }));
}

/**
 * Single meeting (ExternalEvent) by id for the meeting drawer. Returns
 * meta + summary + transcript + Pass 1 extraction summary + sibling
 * drafts that came from the same meeting. The drawer needs all of this
 * to give the reviewer one-click context: did the AI catch this? what
 * other drafts came from the same call?
 */
export async function getMeetingByEventId(eventId: IdLike) {
  const eId = Number(eventId);
  if (Number.isNaN(eId)) return null;
  const r = await prisma.externalEvent.findUnique({
    where: { id: eId },
    include: {
      onboarding: {
        select: {
          company: { select: { name: true, domain: true, logoUrl: true } },
        },
      },
      pendingChanges: {
        select: {
          id: true,
          action: true,
          status: true,
          payload: true,
          createdAt: true,
          sourceQuote: true,
          appliedTaskId: true,
        },
        orderBy: { createdAt: "asc" },
      },
    },
  });
  if (!r) return null;
  // Applied drafts point at a task by id; the drawer shows the human task
  // code (RAY-42) next to the item, so resolve those ids in one extra query.
  // A task can have been deleted since, hence the map-and-guard.
  const appliedTaskIds = [
    ...new Set(r.pendingChanges.map((d) => d.appliedTaskId).filter((id): id is number => id != null)),
  ];
  const appliedTasks = appliedTaskIds.length
    ? await prisma.task.findMany({
        where: { id: { in: appliedTaskIds } },
        select: {
          id: true,
          number: true,
          onboarding: { select: { company: { select: { prefix: true } } } },
        },
      })
    : [];
  const taskCodeById = new Map(
    appliedTasks.map((t): [number, string | null] => [t.id, mapTask(t).taskId]).filter(([, code]) => code)
  );
  return {
    id: r.id,
    sourceId: r.sourceId,
    onboardingId: r.onboardingId,
    occurredAt: r.occurredAt.toISOString(),
    // Miniti reports the call length in seconds; the drawer renders it as
    // minutes beside the date. Null when the provider omitted it.
    durationSeconds: (r.payload as MeetingPayload | null)?.meeting?.duration_seconds ?? null,
    // The customer company on this onboarding. The drawer uses `domain` to
    // tell customer attendees from vendor ones, and the logo to mark them.
    company: r.onboarding?.company
      ? {
          name: r.onboarding.company.name,
          domain: r.onboarding.company.domain ?? null,
          logoUrl: r.onboarding.company.logoUrl ?? null,
        }
      : null,
    meetingTitle: (r.payload as MeetingPayload | null)?.meeting?.title ?? "(untitled meeting)",
    summary: (r.payload as MeetingPayload | null)?.meeting?.summary ?? null,
    attendees: Array.isArray((r.payload as MeetingPayload | null)?.meeting?.attendees)
      ? (r.payload as MeetingPayload).meeting!.attendees!.map((a) => ({
          name: a?.name ?? null,
          email: a?.email ?? null,
          domain: a?.domain ?? emailDomain(a?.email),
        }))
      : [],
    transcript: Array.isArray((r.payload as MeetingPayload | null)?.meeting?.transcript)
      ? (r.payload as MeetingPayload).meeting!.transcript!.map((t) => ({
          speaker: t?.speaker ?? "—",
          text: t?.text ?? "",
        }))
      : [],
    // Pass 1 extracted action items (already structured) — feeds the
    // drawer's "did the AI catch this?" panel.
    extractionActionItems: Array.isArray((r.orchestratorExtraction as { actionItems?: unknown } | null)?.actionItems)
      ? ((r.orchestratorExtraction as { actionItems: Prisma.JsonArray }).actionItems)
      : [],
    // Sibling drafts from the same meeting (every PendingAIChange row
    // where sourceEventId matches this event). `sourceQuote` is the join
    // back to the extraction: an action item and the draft it produced
    // carry the same quote, which is how the drawer shows "this item
    // became RAY-42" without a second relation.
    siblingDrafts: r.pendingChanges.map((d) => ({
      id: d.id,
      action: d.action,
      // ActionIcon branches match_existing drafts on the sub-action; only
      // that field is needed, so the full payload stays server-side.
      payload: { action: (d.payload as { action?: string } | null)?.action ?? null },
      status: d.status,
      title: (d.payload as DraftPayloadJson | null)?.title ?? (d.payload as DraftPayloadJson | null)?.subject ?? null,
      createdAt: d.createdAt.toISOString(),
      sourceQuote: d.sourceQuote ?? null,
      appliedTaskId: d.appliedTaskId ?? null,
      taskId: d.appliedTaskId != null ? (taskCodeById.get(d.appliedTaskId) ?? null) : null,
    })),
  };
}

/** Domain part of an email, lower-cased. Null for anything unparseable. */
function emailDomain(email: unknown): string | null {
  if (typeof email !== "string") return null;
  const at = email.lastIndexOf("@");
  if (at < 0 || at === email.length - 1) return null;
  return email.slice(at + 1).toLowerCase();
}

/** Persist orchestrator I/O for debugging. Three nullable JSONB columns:
 *  input (Pass 0 context), extraction (Pass 1 facts), output (Pass 2 tool
 *  calls). Each call only updates the fields you pass — undefined fields
 *  are left as-is, so the two-pass pipeline can write `extraction` after
 *  Pass 1 and `output` after Pass 2 without clobbering each other. */
export async function setExternalEventOrchestratorIO(
  id: IdLike,
  {
    input,
    extraction,
    output,
  }: { input?: object | null; extraction?: object | null; output?: object | null } = {}
) {
  const eId = Number(id);
  if (Number.isNaN(eId)) return null;
  // Prisma rejects a bare `null` for a nullable Json column; a failed pass
  // is recorded as SQL NULL via Prisma.DbNull so callers can pass plain null.
  const json = (v: unknown) =>
    v === null ? Prisma.DbNull : (v as Prisma.InputJsonValue);
  const data: Prisma.ExternalEventUpdateInput = {};
  if (input !== undefined) data.orchestratorInput = json(input);
  if (extraction !== undefined) data.orchestratorExtraction = json(extraction);
  if (output !== undefined) data.orchestratorOutput = json(output);
  if (Object.keys(data).length === 0) return null;
  return prisma.externalEvent.update({
    where: { id: eId },
    data,
  });
}

/** Create a PendingAIChange row from one orchestrator tool call.
 *
 *  `ownerId` is the real FK column (only draft_followup sets it). Callers may
 *  omit it and leave the owner in `payload.ownerId`; we mirror the payload
 *  value into the column so the two can never drift. The column is what the
 *  visibility filters read — the payload copy is legacy and due for removal. */
export type CreatePendingAIChangeInput = {
  source: string;
  sourceEventId?: IdLike | null;
  onboardingId: IdLike;
  action: string;
  /** Tool-call arguments; stored as JSON. */
  payload: object;
  ownerId?: IdLike | null;
  sourceQuote?: string | null;
  sourceUrl?: string | null;
  confidence?: string;
};

function pendingAIChangeData({
  source,
  sourceEventId,
  onboardingId,
  action,
  payload,
  ownerId = null,
  sourceQuote = null,
  sourceUrl = null,
  confidence = "medium",
}: CreatePendingAIChangeInput) {
  const resolvedOwnerId = ownerId ?? (payload as DraftPayloadJson | null)?.ownerId ?? null;
  return {
    source,
    sourceEventId: sourceEventId == null ? null : Number(sourceEventId),
    onboardingId: Number(onboardingId),
    action,
    payload: payload as Prisma.InputJsonObject,
    ownerId: resolvedOwnerId == null ? null : Number(resolvedOwnerId),
    sourceQuote,
    sourceUrl,
    confidence,
  };
}

export async function createPendingAIChange(input: CreatePendingAIChangeInput) {
  return prisma.pendingAIChange.create({ data: pendingAIChangeData(input) });
}

/**
 * Write all of one meeting's drafts in ONE transaction, then bind their
 * sibling-draft links (GAPS-PLAN feature 3): a `{ draftRef: "d2" }` in any
 * draft's dependsOn becomes `{ draftId, draftRef, title }` pointing at the
 * create draft that carries that ref. Two passes, because a row id only
 * exists once the row is written. All or nothing: a meeting never ends up
 * with half its drafts, or with links that point nowhere.
 */
export async function createMeetingDrafts(rows: CreatePendingAIChangeInput[]) {
  if (rows.length === 0) return [];
  return prisma.$transaction(async (tx) => {
    const created: { id: number; action: string; payload: Prisma.JsonValue }[] = [];
    for (const r of rows) {
      const row = await tx.pendingAIChange.create({ data: pendingAIChangeData(r) });
      created.push({ id: row.id, action: row.action, payload: row.payload });
    }
    const idByRef = new Map<string, number>();
    for (const c of created) {
      const ref = (c.payload as { draftRef?: unknown } | null)?.draftRef;
      if (c.action === "create_task" && typeof ref === "string" && !idByRef.has(ref)) idByRef.set(ref, c.id);
    }
    for (const c of created) {
      const bound = bindPayloadLinks((c.payload ?? {}) as Record<string, unknown>, idByRef, c.id);
      if (!bound) continue;
      await tx.pendingAIChange.update({ where: { id: c.id }, data: { payload: bound as Prisma.InputJsonObject } });
      c.payload = bound as Prisma.JsonValue;
    }
    return created;
  }, { maxWait: 10_000, timeout: 30_000 });
}

/** List pending drafts (default: most recent first, status=pending).
 *  When `forVendorUserId` is set, draft_followup rows are filtered to those
 *  whose `ownerId` matches — task owners only see follow-up suggestions
 *  for their own tasks. Other action types are unaffected.
 *  When `onboardingId` is set, scope the query to drafts under that onboarding
 *  (used by the per-onboarding Actions tab). */
export async function listPendingAIChanges({
  status = "pending",
  limit = 100,
  forVendorUserId = null,
  onboardingId = null,
}: { status?: string; limit?: number; forVendorUserId?: IdLike | null; onboardingId?: IdLike | null } = {}) {
  const where: Prisma.PendingAIChangeWhereInput = { status };
  if (onboardingId != null) {
    const obId = Number(onboardingId);
    if (Number.isNaN(obId)) return [];
    where.onboardingId = obId;
  }
  // Owner-scoping runs in the database now that ownerId is a real column
  // (indexed on action, status, ownerId) rather than a key inside `payload`.
  if (forVendorUserId != null) {
    where.OR = [
      { action: { not: "draft_followup" } },
      { action: "draft_followup", ownerId: Number(forVendorUserId) },
    ];
  }
  const filtered = await prisma.pendingAIChange.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: limit,
    include: {
      onboarding: { select: { id: true, company: { select: { name: true } } } },
    },
  });

  // Hydrate linked task titles (draft_followup payloads carry a taskId) and
  // meeting titles (Miniti events carry one in ExternalEvent.payload.meeting.title).
  // Both feed the inbox search bar and the per-card meta row.
  const taskIds = new Set<number>();
  const eventIds = new Set<number>();
  for (const r of filtered) {
    if (r.action === "draft_followup" && (r.payload as DraftPayloadJson | null)?.taskId != null) {
      const tid = Number((r.payload as DraftPayloadJson).taskId);
      if (!Number.isNaN(tid)) taskIds.add(tid);
    }
    if (r.sourceEventId != null) eventIds.add(r.sourceEventId);
  }
  const [tasks, events] = await Promise.all([
    taskIds.size
      ? prisma.task.findMany({
          where: { id: { in: Array.from(taskIds) } },
          select: { id: true, title: true },
        })
      : Promise.resolve([] as { id: number; title: string }[]),
    eventIds.size
      ? prisma.externalEvent.findMany({
          where: { id: { in: Array.from(eventIds) } },
          select: { id: true, payload: true },
        })
      : Promise.resolve([] as { id: number; payload: Prisma.JsonValue }[]),
  ]);
  const taskTitleById = new Map(tasks.map((t) => [t.id, t.title]));
  const linksById = await hydrateDraftLinks(filtered);
  const meetingTitleByEventId = new Map(
    events.map((e) => [e.id, (e.payload as MeetingPayload | null)?.meeting?.title ?? null])
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
    // Hydrated for inbox display + search.
    taskTitle:
      r.action === "draft_followup" && (r.payload as DraftPayloadJson | null)?.taskId != null
        ? taskTitleById.get(Number((r.payload as DraftPayloadJson).taskId)) ?? null
        : null,
    meetingTitle: r.sourceEventId != null
      ? meetingTitleByEventId.get(r.sourceEventId) ?? null
      : null,
    // Sibling-draft links (GAPS-PLAN feature 3), for the card's "Depends on"
    // line and the reject warning. Absent when the draft has none.
    ...(linksById.get(r.id) ?? {}),
  }));
}

/** Count of pending drafts. When `forVendorUserId` is set, draft_followup
 *  rows are filtered to that owner only. When `onboardingId` is set, scope
 *  to that onboarding (used by the home table column + per-onboarding tab). */
export async function countPendingAIChanges({
  forVendorUserId = null,
  onboardingId = null,
}: { forVendorUserId?: IdLike | null; onboardingId?: IdLike | null } = {}) {
  const where: Prisma.PendingAIChangeWhereInput = { status: "pending" };
  if (onboardingId != null) {
    const obId = Number(onboardingId);
    if (Number.isNaN(obId)) return 0;
    where.onboardingId = obId;
  }
  if (forVendorUserId != null) {
    where.OR = [
      { action: { not: "draft_followup" } },
      { action: "draft_followup", ownerId: Number(forVendorUserId) },
    ];
  }
  return prisma.pendingAIChange.count({ where });
}

/** Aggregate pending-draft counts per onboarding for the home table column.
 *  Returns a Map<onboardingId, number> — owner-scoped for draft_followup
 *  if forVendorUserId is set. */
export async function getPendingAIChangeCountsByOnboarding({
  forVendorUserId = null,
}: { forVendorUserId?: IdLike | null } = {}): Promise<Map<number, number>> {
  const where: Prisma.PendingAIChangeWhereInput = { status: "pending" };
  if (forVendorUserId != null) {
    where.OR = [
      { action: { not: "draft_followup" } },
      { action: "draft_followup", ownerId: Number(forVendorUserId) },
    ];
  }
  const grouped = await prisma.pendingAIChange.groupBy({
    by: ["onboardingId"],
    where,
    _count: true,
  });
  return new Map(grouped.map((g) => [g.onboardingId, g._count]));
}

/** Find which of the given task IDs already have a pending draft_followup —
 *  used by the stale-scanner to avoid creating duplicate drafts. */
export async function findPendingDraftFollowupTaskIds(taskIds: number[]): Promise<Set<number>> {
  if (!Array.isArray(taskIds) || taskIds.length === 0) return new Set();
  const rows = await prisma.pendingAIChange.findMany({
    where: { action: "draft_followup", status: "pending" },
    select: { payload: true },
  });
  const set = new Set<number>();
  for (const r of rows) {
    const tid = Number((r.payload as DraftPayloadJson | null)?.taskId);
    if (taskIds.includes(tid)) set.add(tid);
  }
  return set;
}

/** Look up a vendor user by id — used by the scanner to resolve the task
 *  owner's name + email for the email "from" line. Returns null if not found. */
export async function getVendorUserById(id: IdLike) {
  const vId = Number(id);
  if (Number.isNaN(vId)) return null;
  return prisma.vendorUser.findUnique({
    where: { id: vId },
    select: { id: true, name: true, email: true },
  });
}

/** Get one draft. */
export async function getPendingAIChange(id: IdLike) {
  const cId = Number(id);
  if (Number.isNaN(cId)) return null;
  return prisma.pendingAIChange.findUnique({ where: { id: cId } });
}

/** Merge a partial payload into an existing pending draft. Used by the
 *  inbox autosave when Caroline edits a `draft_followup` subject/body. Only
 *  pending drafts can be edited; resolved ones are immutable. */
export async function updatePendingAIChangePayload(id: IdLike, payloadPatch: Record<string, unknown>) {
  const cId = Number(id);
  if (Number.isNaN(cId)) return null;
  const existing = await prisma.pendingAIChange.findUnique({
    where: { id: cId },
    select: { id: true, status: true, payload: true },
  });
  if (!existing || existing.status !== "pending") return null;
  const merged = { ...((existing.payload ?? {}) as Prisma.JsonObject), ...payloadPatch };
  return prisma.pendingAIChange.update({
    where: { id: cId },
    data: { payload: merged as Prisma.InputJsonObject },
  });
}

/** Mark a draft applied — set status, resolvedAt, resolvedBy, appliedTaskId. */
export async function markAIChangeApplied(
  id: IdLike,
  { resolvedBy, appliedTaskId = null }: { resolvedBy?: IdLike | null; appliedTaskId?: IdLike | null }
) {
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
export async function markAIChangeRejected(
  id: IdLike,
  { resolvedBy, reason = null }: { resolvedBy?: IdLike | null; reason?: string | null }
) {
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

// ─── Draft-to-draft links (GAPS-PLAN feature 3) ──────────────
// A draft may wait on another create draft from the same meeting
// (`{ draftId }` in its dependsOn). How a link resolves at approval, and how
// a pending one is held and later completed, is documented in
// lib/draft-links.ts. The functions below do the writes, each in ONE
// transaction that first takes a per-meeting advisory lock, so approvals and
// rejections from one meeting (a bulk action fires them back to back) are
// applied one at a time and always see each other's results.

/** Approving or rejecting a draft that is no longer pending (or gone). */
export class DraftConflictError extends Error {
  status: number;
  constructor(message: string, status = 409) {
    super(message);
    this.name = "DraftConflictError";
    this.status = status;
  }
}

/** Advisory-lock namespace for "drafts of one meeting" (any constant int4). */
const DRAFT_LINK_LOCK = 730301;

async function lockMeetingDrafts(tx: Prisma.TransactionClient, sourceEventId: number | null) {
  if (sourceEventId == null) return;
  await tx.$queryRaw`SELECT 1 AS ok FROM (SELECT pg_advisory_xact_lock(${DRAFT_LINK_LOCK}::int, ${sourceEventId}::int)) AS l`;
}

type DraftRow = { id: number; action: string; status: string; onboardingId: number; sourceEventId: number | null; payload: Prisma.JsonValue; appliedTaskId: number | null };
const DRAFT_ROW_SELECT = { id: true, action: true, status: true, onboardingId: true, sourceEventId: true, payload: true, appliedTaskId: true } as const;

/** The pending draft, locked against the other drafts of its meeting. */
async function lockPendingDraft(tx: Prisma.TransactionClient, draftId: number): Promise<DraftRow> {
  const first = await tx.pendingAIChange.findUnique({ where: { id: draftId }, select: DRAFT_ROW_SELECT });
  if (!first) throw new DraftConflictError("Draft not found", 404);
  await lockMeetingDrafts(tx, first.sourceEventId);
  // Re-read under the lock: a concurrent approval of the same draft wins once.
  const draft = await tx.pendingAIChange.findUnique({ where: { id: draftId }, select: DRAFT_ROW_SELECT });
  if (!draft) throw new DraftConflictError("Draft not found", 404);
  if (draft.status !== "pending") throw new DraftConflictError(`Draft already ${draft.status}`);
  return draft;
}

async function loadSiblingDrafts(client: DbClient, ids: number[]): Promise<Map<number, SiblingDraft>> {
  const unique = [...new Set(ids)];
  if (unique.length === 0) return new Map();
  const rows = await client.pendingAIChange.findMany({ where: { id: { in: unique } }, select: DRAFT_ROW_SELECT });
  const taskIds = rows.map((r) => r.appliedTaskId).filter((x): x is number => x != null);
  const tasks = taskIds.length
    ? await client.task.findMany({ where: { id: { in: taskIds } }, select: { id: true, status: true, onboardingId: true } })
    : [];
  const taskById = new Map(tasks.map((t) => [t.id, t]));
  return new Map(rows.map((r) => [r.id, {
    id: r.id,
    status: r.status,
    onboardingId: r.onboardingId,
    sourceEventId: r.sourceEventId,
    title: typeof (r.payload as { title?: unknown } | null)?.title === "string" ? (r.payload as { title: string }).title : null,
    appliedTask: r.appliedTaskId != null ? taskById.get(r.appliedTaskId) ?? null : null,
  }]));
}

/** A dependent's pending link completed (or settled) by a sibling's approval. */
export type ResolvedDraftLink = { draftId: number; taskId: number | null; state: AppliedDraftLink["state"]; blockedByTaskId: number | null; reason?: string };

/**
 * Approve a draft, resolving its sibling-draft links, in ONE transaction:
 *
 *   1. lock the meeting's drafts; refuse if this draft is no longer pending;
 *   2. classify each link by the sibling's state now (lib/draft-links.ts
 *      classifyDraftLink) into a task blocker, a text placeholder, or nothing;
 *   3. run `work` (the route's createTask / updateTask, on `tx`, with those
 *      extra dependencies);
 *   4. mark the draft applied and record what became of each link on its
 *      payload (`draftLinks`, with the TaskDependency row standing for it);
 *   5. if this was a create draft, complete every sibling's PENDING link to it:
 *      the sibling's text placeholder row becomes a task blocker on the new
 *      task (once: a link already "linked" is left alone), unless that would
 *      make a loop or someone ticked / deleted the placeholder meanwhile.
 *
 * Activity rows are written after the commit. Throws DraftConflictError
 * (404 / 409) and DependencyError (400) for the route to turn into responses.
 */
export async function applyDraftApproval<T>({
  draftId,
  resolvedBy,
  links,
  work,
}: {
  draftId: number;
  resolvedBy: number | null;
  /** The draft's sibling links, after the reviewer's edits. */
  links: DraftLinkItem[];
  work: (ctx: { tx: Prisma.TransactionClient; linkDeps: DependsOnItem[]; afterCommit: AfterCommit }) => Promise<{ appliedTaskId: number | null; value: T }>;
}): Promise<{ value: T; draftLinks: AppliedDraftLink[]; resolved: ResolvedDraftLink[] }> {
  const afterCommit: AfterCommit = [];
  const out = await prisma.$transaction(async (tx) => {
    const draft = await lockPendingDraft(tx, draftId);
    const siblings = await loadSiblingDrafts(tx, links.map((l) => l.draftId).filter((x): x is number => x != null));
    const classified = links.map((l) => classifyDraftLink(l, l.draftId != null ? siblings.get(l.draftId) : null, draft));
    const linkDeps = classified.flatMap((c) => (c.dep ? [c.dep] : []));

    const { appliedTaskId, value } = await work({ tx, linkDeps, afterCommit });

    const draftLinks: AppliedDraftLink[] = [];
    for (const c of classified) {
      if (c.draftId == null || c.reason === "self") continue;
      const entry: AppliedDraftLink = { draftId: c.draftId, title: c.title, state: c.state, ...(c.reason && { reason: c.reason }) };
      if (appliedTaskId != null && c.dep) {
        const row = "taskId" in c.dep
          ? await tx.taskDependency.findFirst({ where: { taskId: appliedTaskId, blockedByTaskId: c.dep.taskId }, select: { id: true } })
          : await tx.taskDependency.findFirst({
              where: { taskId: appliedTaskId, label: { equals: cleanDependencyLabel(c.dep.text) ?? c.dep.text, mode: "insensitive" } },
              orderBy: { id: "asc" },
              select: { id: true },
            });
        entry.dependencyId = row?.id ?? null;
        if ("taskId" in c.dep) entry.blockedByTaskId = c.dep.taskId;
      }
      draftLinks.push(entry);
    }

    const payload = draftLinks.length > 0
      ? ({ ...((draft.payload ?? {}) as Prisma.JsonObject), draftLinks } as unknown as Prisma.InputJsonObject)
      : undefined;
    const marked = await tx.pendingAIChange.updateMany({
      where: { id: draftId, status: "pending" },
      data: {
        status: "applied",
        resolvedAt: new Date(),
        resolvedBy: resolvedBy ?? null,
        appliedTaskId: appliedTaskId ?? null,
        ...(payload && { payload }),
      },
    });
    if (marked.count !== 1) throw new DraftConflictError("Draft already resolved");

    const resolved = draft.action === "create_task" && appliedTaskId != null
      ? await completeLinksTo(tx, draft, appliedTaskId)
      : [];
    return { value, draftLinks, resolved };
  }, { maxWait: 10_000, timeout: 30_000 });
  for (const fn of afterCommit) {
    await fn().catch((err) => console.warn("[applyDraftApproval] after-commit activity failed", err));
  }
  return out;
}

/** Step 5 of applyDraftApproval: complete the siblings' pending links to `draft`. */
async function completeLinksTo(tx: Prisma.TransactionClient, draft: DraftRow, newTaskId: number): Promise<ResolvedDraftLink[]> {
  if (draft.sourceEventId == null) return [];
  const dependents = await tx.pendingAIChange.findMany({
    where: { sourceEventId: draft.sourceEventId, onboardingId: draft.onboardingId, status: "applied", id: { not: draft.id } },
    select: { id: true, payload: true, appliedTaskId: true },
    orderBy: { id: "asc" },
  });
  const out: ResolvedDraftLink[] = [];
  for (const d of dependents) {
    const links = readDraftLinks(d.payload);
    let changed = false;
    for (const l of links) {
      if (l.draftId !== draft.id || l.state !== "pending") continue;
      changed = true;
      const taskId = d.appliedTaskId;
      const row = l.dependencyId != null && taskId != null
        ? await tx.taskDependency.findFirst({ where: { id: l.dependencyId, taskId }, select: { id: true, blockedByTaskId: true, resolvedAt: true } })
        : null;
      if (!row || taskId == null) {
        l.state = "removed";
      } else if (row.blockedByTaskId != null) {
        l.state = "linked";
        l.blockedByTaskId = row.blockedByTaskId;
      } else if (row.resolvedAt) {
        l.state = "kept_as_text";
        l.reason = "ticked off by hand";
      } else if (taskId === newTaskId || (await findDependencyLoop(tx, taskId, newTaskId))) {
        l.state = "kept_as_text";
        l.reason = "would make a loop";
      } else {
        const dup = await tx.taskDependency.findFirst({ where: { taskId, blockedByTaskId: newTaskId }, select: { id: true } });
        if (dup) {
          await tx.taskDependency.delete({ where: { id: row.id } });
          l.dependencyId = dup.id;
        } else {
          await tx.taskDependency.update({ where: { id: row.id }, data: { blockedByTaskId: newTaskId, label: null, resolvedAt: null } });
        }
        await syncLegacyBlockedBy(tx, taskId);
        l.state = "linked";
        l.blockedByTaskId = newTaskId;
      }
      out.push({ draftId: d.id, taskId, state: l.state, blockedByTaskId: l.blockedByTaskId ?? null, ...(l.reason && { reason: l.reason }) });
    }
    if (changed) {
      await tx.pendingAIChange.update({
        where: { id: d.id },
        data: { payload: { ...((d.payload ?? {}) as Prisma.JsonObject), draftLinks: links } as unknown as Prisma.InputJsonObject },
      });
    }
  }
  return out;
}

/** A draft that waits on the one being rejected. */
export type DependentDraft = { draftId: number; title: string; status: string };

/**
 * Reject a draft in one transaction under the meeting lock. Siblings that wait
 * on it keep that blocker as text: an applied one already has the text
 * placeholder (its link is marked kept_as_text), a pending one gets the text
 * when it is approved. Returns those siblings so the inbox can say so.
 * Throws DraftConflictError when the draft is gone or no longer pending.
 */
export async function rejectDraftWithLinks(
  draftId: number,
  { resolvedBy, reason = null }: { resolvedBy?: number | null; reason?: string | null }
): Promise<{ dependents: DependentDraft[] }> {
  return prisma.$transaction(async (tx) => {
    const draft = await lockPendingDraft(tx, draftId);
    await tx.pendingAIChange.update({
      where: { id: draftId },
      data: { status: "rejected", rejectedReason: reason, resolvedAt: new Date(), resolvedBy: resolvedBy ?? null },
    });
    const dependents: DependentDraft[] = [];
    if (draft.action !== "create_task" || draft.sourceEventId == null) return { dependents };
    const siblings = await tx.pendingAIChange.findMany({
      where: { sourceEventId: draft.sourceEventId, onboardingId: draft.onboardingId, status: { in: ["pending", "applied"] }, id: { not: draftId } },
      select: DRAFT_ROW_SELECT,
      orderBy: { id: "asc" },
    });
    const titles = await siblingTitles(tx, siblings);
    for (const sib of siblings) {
      const title = titles.get(sib.id)!;
      if (sib.status === "pending") {
        if (payloadDraftLinks(sib.payload).some((l) => l.draftId === draftId)) dependents.push({ draftId: sib.id, title, status: sib.status });
        continue;
      }
      const links = readDraftLinks(sib.payload);
      let changed = false;
      for (const l of links) {
        if (l.draftId !== draftId || l.state !== "pending") continue;
        l.state = "kept_as_text";
        l.reason = "rejected";
        changed = true;
      }
      if (!changed) continue;
      dependents.push({ draftId: sib.id, title, status: sib.status });
      await tx.pendingAIChange.update({
        where: { id: sib.id },
        data: { payload: { ...((sib.payload ?? {}) as Prisma.JsonObject), draftLinks: links } as unknown as Prisma.InputJsonObject },
      });
    }
    return { dependents };
  }, { maxWait: 10_000, timeout: 30_000 });
}

/**
 * How a sibling draft is named to the reviewer: a create draft by its title,
 * an existing-task update as "Update to <that task's title>".
 */
async function siblingTitles(client: DbClient, rows: { id: number; action: string; payload: Prisma.JsonValue }[]): Promise<Map<number, string>> {
  const taskIds = rows
    .filter((r) => r.action !== "create_task")
    .map((r) => Number((r.payload as { taskId?: unknown } | null)?.taskId))
    .filter((n) => Number.isInteger(n) && n > 0);
  const tasks = taskIds.length ? await client.task.findMany({ where: { id: { in: taskIds } }, select: { id: true, title: true } }) : [];
  const taskTitle = new Map(tasks.map((t) => [t.id, t.title]));
  return new Map(rows.map((r) => {
    const p = (r.payload ?? {}) as { title?: unknown; taskId?: unknown };
    if (r.action === "create_task") return [r.id, typeof p.title === "string" && p.title.trim() ? p.title.trim() : "A new task"];
    const t = taskTitle.get(Number(p.taskId));
    return [r.id, t ? `Update to ${t}` : "An update to a task"];
  }));
}

/**
 * For the inbox: per draft, the sibling drafts it links to (with their state
 * and the task code they created) and the siblings that link to it. Reads
 * every draft of the meetings involved, whatever their status, because a
 * pending card needs to know a sibling was already applied or rejected.
 */
async function hydrateDraftLinks(rows: { id: number; sourceEventId: number | null; payload: Prisma.JsonValue }[]) {
  const eventIds = [...new Set(rows.map((r) => r.sourceEventId).filter((x): x is number => x != null))];
  const empty = { linkedDrafts: [] as LinkedDraftInfo[], dependentDrafts: [] as DependentDraft[] };
  if (eventIds.length === 0) return new Map<number, typeof empty>();
  const siblings = await prisma.pendingAIChange.findMany({
    where: { sourceEventId: { in: eventIds } },
    select: DRAFT_ROW_SELECT,
  });
  const anyLinks = siblings.some((s) => payloadDraftLinks(s.payload).length > 0 || readDraftLinks(s.payload).length > 0);
  if (!anyLinks) return new Map<number, typeof empty>();
  const taskIds = siblings.map((s) => s.appliedTaskId).filter((x): x is number => x != null);
  const codes = taskIds.length ? await taskCodes(prisma, taskIds) : new Map<number, string>();
  const byId = new Map(siblings.map((s) => [s.id, s]));
  const titles = await siblingTitles(prisma, siblings);
  const info = (id: number): LinkedDraftInfo | null => {
    const s = byId.get(id);
    if (!s) return null;
    return {
      id: s.id,
      status: s.status,
      title: (s.payload as { title?: unknown } | null)?.title as string | null ?? null,
      taskCode: s.status === "applied" && s.appliedTaskId != null ? codes.get(s.appliedTaskId) ?? null : null,
    };
  };
  const linksOf = (s: { payload: Prisma.JsonValue }) =>
    [...new Set([...payloadDraftLinks(s.payload).map((l) => l.draftId!), ...readDraftLinks(s.payload).map((l) => l.draftId)])];
  const out = new Map<number, typeof empty>();
  for (const r of rows) {
    const linkedDrafts = linksOf(r).map(info).filter((x): x is LinkedDraftInfo => x != null);
    const dependentDrafts = siblings
      .filter((s) => s.id !== r.id && s.status !== "rejected" && s.sourceEventId === r.sourceEventId && linksOf(s).includes(r.id))
      .map((s) => ({ draftId: s.id, title: titles.get(s.id)!, status: s.status }));
    if (linkedDrafts.length || dependentDrafts.length) out.set(r.id, { linkedDrafts, dependentDrafts });
  }
  return out;
}

// ─── AI insights ─────────────────────────────────────────────

/** Get the latest cached Insight for a (scope, scopeId). Returns null if none. */
export async function getCachedInsight(scope: string, scopeId: IdLike | null | undefined) {
  if (!scope || !scopeId) return null;
  return prisma.insight.findFirst({
    where: { scope, scopeId: String(scopeId) },
    orderBy: { generatedAt: "desc" },
  });
}

/** Persist a freshly-generated insight payload. Append-only; no upsert. */
export async function saveInsight({
  scope,
  scopeId,
  contextHash,
  payload,
  model,
  durationMs,
}: {
  scope: string;
  scopeId: IdLike;
  contextHash: string;
  payload: object;
  model: string;
  durationMs: number;
}) {
  return prisma.insight.create({
    data: {
      scope,
      scopeId: String(scopeId),
      contextHash,
      payload: payload as Prisma.InputJsonValue,
      model,
      durationMs,
    },
  });
}

/** Aggregate AICall stats by kind for a recent window. */
interface AICallKindAgg {
  kind: string;
  count: number;
  errorCount: number;
  totalCostUsd: number;
  durations: number[];
  totalInput: number;
  totalCacheRead: number;
  totalCacheWrite: number;
  totalOutput: number;
}

export async function getAICallStats({ days = 30 }: { days?: number } = {}) {
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

  const byKind = new Map<string, AICallKindAgg>();
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
export async function getRecentAICalls({ limit = 50 }: { limit?: number } = {}) {
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
}: {
  kind: string;
  scopeId?: IdLike | null;
  model: string;
  inputTokens: number;
  cacheReadTokens?: number;
  cacheWriteTokens?: number;
  outputTokens: number;
  costUsd: number;
  durationMs: number;
  error?: string | null;
  requestId?: string | null;
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

/**
 * Recent activity-driven wins for ONE onboarding. Powers the per-onboarding
 * "Wins" section. Returns a flat list the model picks from. We pre-filter
 * + dedupe + format here so the prompt doesn't need any logic.
 *
 * Four kinds:
 *   - task_completed      (verb="completed", entityType="task")
 *   - task_unblocked      (verb="status_changed", metadata.from = "Blocked", metadata.to != "Done")
 *   - contact_first_login (verb="link_activated"; first event per contact)
 *   - health_improved     (verb="health_flipped", direction Blocked→{At risk,On track} or At risk→On track)
 *
 * Items: { kind, headline, detail, taskId?, contactId?, occurredAt }
 */
export type RecentWin = {
  kind: "task_completed" | "task_unblocked" | "contact_first_login" | "health_improved";
  headline: string;
  detail: string;
  taskId?: number;
  contactId?: number;
  occurredAt: Date;
};

/** ActivityLog.metadata fields read when building wins. */
interface WinMetadataJson {
  title?: string | null;
  from?: string | null;
  to?: string | null;
}

export async function getRecentWinsForOnboarding(
  onboardingId: IdLike,
  { sinceDays = 7, currentHealth = null }: { sinceDays?: number; currentHealth?: string | null } = {}
): Promise<RecentWin[]> {
  const oId = Number(onboardingId);
  if (Number.isNaN(oId)) return [];
  const since = new Date(Date.now() - sinceDays * 24 * 60 * 60 * 1000);
  const rows = await prisma.activityLog.findMany({
    where: {
      onboardingId: oId,
      createdAt: { gte: since },
      OR: [
        { verb: "completed", entityType: "task" },
        { verb: "status_changed", entityType: "task" },
        { verb: "link_activated" },
        { verb: "health_flipped", entityType: "onboarding" },
      ],
    },
    select: { verb: true, entityType: true, entityId: true, metadata: true, createdAt: true },
    orderBy: { createdAt: "desc" },
  });
  if (rows.length === 0) return [];

  // Only the LATEST health_flipped row is meaningful. Earlier flips this
  // week may have been superseded. We also drop the win if the current
  // computed health is worse than the flip's "to" — that means the
  // onboarding regressed after the improvement, so it's not a present win.
  const latestHealthFlipId = (() => {
    const latest = rows.find((r) => r.verb === "health_flipped");
    return latest ? `${latest.createdAt.toISOString()}-${latest.entityId}` : null;
  })();

  const wins: RecentWin[] = [];
  const seenContactFirstLogin = new Set<number>();

  // Precompute contact lookup for link_activated rows. The activity logs the
  // magic link id; we want the contact name.
  const linkRows = rows.filter((r) => r.verb === "link_activated");
  const linkIds = Array.from(new Set(linkRows.map((r) => r.entityId)));
  const links = linkIds.length
    ? await prisma.magicLink.findMany({
        where: { id: { in: linkIds } },
        select: { id: true, contactId: true, contact: { select: { id: true, name: true } } },
      })
    : [];
  const linkById = new Map(links.map((l) => [l.id, l]));

  // Precompute task lookup for task-related rows.
  const taskIds = Array.from(
    new Set(rows.filter((r) => r.entityType === "task").map((r) => r.entityId))
  );
  const tasks = taskIds.length
    ? await prisma.task.findMany({
        where: { id: { in: taskIds } },
        select: { id: true, title: true },
      })
    : [];
  const taskTitleById = new Map(tasks.map((t) => [t.id, t.title]));

  for (const r of rows) {
    const meta = r.metadata as WinMetadataJson | null;
    if (r.verb === "completed" && r.entityType === "task") {
      const title = meta?.title || taskTitleById.get(r.entityId);
      if (!title) continue;
      wins.push({
        kind: "task_completed",
        headline: title,
        detail: "moved to complete",
        taskId: r.entityId,
        occurredAt: r.createdAt,
      });
    } else if (r.verb === "status_changed" && r.entityType === "task") {
      if (meta?.from !== "Blocked") continue;
      if (meta?.to === "Done") continue; // covered by "completed"
      const title = meta?.title || taskTitleById.get(r.entityId);
      if (!title) continue;
      const to = String(meta?.to ?? "").toLowerCase();
      wins.push({
        kind: "task_unblocked",
        headline: title,
        detail: to ? `unblocked, now ${to}` : "unblocked",
        taskId: r.entityId,
        occurredAt: r.createdAt,
      });
    } else if (r.verb === "link_activated") {
      const link = linkById.get(r.entityId);
      const contactId = link?.contactId ?? null;
      if (contactId == null) continue;
      if (seenContactFirstLogin.has(contactId)) continue;
      seenContactFirstLogin.add(contactId);
      wins.push({
        kind: "contact_first_login",
        headline: link?.contact?.name ?? "Customer contact",
        detail: "opened their portal for the first time",
        contactId,
        occurredAt: r.createdAt,
      });
    } else if (r.verb === "health_flipped") {
      const rowId = `${r.createdAt.toISOString()}-${r.entityId}`;
      if (rowId !== latestHealthFlipId) continue; // older flip superseded
      const from = meta?.from;
      const to = meta?.to;
      if (!isHealthImprovement(from, to)) continue;
      // If we know the current health and it's worse than the flip's "to",
      // the onboarding regressed since — drop the stale claim.
      if (currentHealth && (HEALTH_ORDER[currentHealth] ?? -1) < (HEALTH_ORDER[to as string] ?? -1)) {
        continue;
      }
      wins.push({
        kind: "health_improved",
        headline: "Health",
        detail: `moved from ${from} to ${to}`,
        occurredAt: r.createdAt,
      });
    }
  }

  return wins;
}

// Health ranking — only flips that climb the ladder count as wins.
const HEALTH_ORDER: Record<string, number> = { Blocked: 0, "At risk": 1, "On track": 2 };
function isHealthImprovement(from: string | null | undefined, to: string | null | undefined): boolean {
  // null/undefined index as "null"/"undefined" keys at runtime → -1, as in JS.
  return (HEALTH_ORDER[to as string] ?? -1) > (HEALTH_ORDER[from as string] ?? -1);
}

/**
 * Recent task completions grouped by onboarding. Used by the portfolio
 * insights snapshot to give the model real "wins" to anchor on (without
 * leaking full activity history). Pulls from ActivityLog so we get the
 * canonical "task moved to Done" event, not any updatedAt change.
 *
 * Returns: Map<onboardingId, { count: number, titles: string[] }>
 */
export async function getRecentCompletionsByOnboarding({
  sinceDays = 7,
  titleLimitPerOnboarding = 3,
}: { sinceDays?: number; titleLimitPerOnboarding?: number } = {}): Promise<Map<number, { count: number; titles: string[] }>> {
  const since = new Date(Date.now() - sinceDays * 24 * 60 * 60 * 1000);
  const rows = await prisma.activityLog.findMany({
    where: {
      verb: "completed",
      entityType: "task",
      createdAt: { gte: since },
    },
    select: { onboardingId: true, entityId: true, createdAt: true },
    orderBy: { createdAt: "desc" },
  });
  if (rows.length === 0) return new Map();

  const taskIds = Array.from(new Set(rows.map((r) => r.entityId)));
  const tasks = await prisma.task.findMany({
    where: { id: { in: taskIds } },
    select: { id: true, title: true },
  });
  const titleById = new Map(tasks.map((t) => [t.id, t.title]));

  const byOnboarding = new Map<number, { count: number; titles: string[] }>();
  for (const r of rows) {
    let entry = byOnboarding.get(r.onboardingId);
    if (!entry) {
      entry = { count: 0, titles: [] };
      byOnboarding.set(r.onboardingId, entry);
    }
    entry.count += 1;
    if (entry.titles.length < titleLimitPerOnboarding) {
      const title = titleById.get(r.entityId);
      if (title) entry.titles.push(title);
    }
  }
  return byOnboarding;
}
