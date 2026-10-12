/**
 * Shared domain types for Vector.
 *
 * Row shapes come straight from the Prisma-generated client so they can never
 * drift from the schema. Enum-like string columns (status, priority, role...)
 * are plain `String` in Postgres; the unions below mirror the comments in
 * prisma/schema.prisma and the arrays in lib/constants.ts.
 *
 * "View" types (what lib/db.ts actually hands to callers, with relations and
 * computed fields such as `taskId` and `health`) are derived from the db
 * functions' return types, so they follow the queries automatically.
 *
 * Import type-only: `import type { Task } from "@/lib/types"`.
 */

import type {
  Company,
  VendorUser,
  ActivityLog,
  Notification,
  Onboarding,
  Contact,
  Phase,
  Task,
  Comment,
  MagicLink,
  File as FileRow,
  Insight,
  ExternalEvent,
  PendingAIChange,
  IntegrationConnection,
  AICall,
} from "@/lib/generated/prisma/client";
import type * as db from "@/lib/db";

// ── Prisma row types (re-exported) ───────────────────────────────────────────

export type {
  Company,
  VendorUser,
  ActivityLog,
  Notification,
  Onboarding,
  Contact,
  Phase,
  Task,
  Comment,
  MagicLink,
  FileRow,
  Insight,
  ExternalEvent,
  PendingAIChange,
  IntegrationConnection,
  AICall,
};

// ── String unions ────────────────────────────────────────────────────────────

// Mirrors TASK_STATUSES / PRIORITIES / ONBOARDING_STATUSES / CONTACT_ROLES in
// lib/constants.ts. The arrays stay `string[]` so `.includes(someString)`
// keeps type-checking at call sites.
export type TaskStatus = "Not started" | "In progress" | "Under investigation" | "On hold" | "Blocked" | "Done";
export type Priority = "low" | "medium" | "high";
export type OnboardingStatus = "Active" | "Completed" | "Paused" | "Archived";
export type ContactRole = "Champion" | "Technical Lead" | "IT Admin" | "Exec Sponsor";
export type VendorRole = "admin" | "member" | "viewer";

export type HealthStatus = "On track" | "At risk" | "Blocked";
/** Result of `computeHealth` (lib/health.ts). */
export interface HealthResult {
  status: HealthStatus;
  reasons: string[];
}

/** Mirrors TREND_VALUES in lib/insight-trend.ts. */
export type InsightTrend = "improving" | "steady" | "declining";
export type InsightScope = "onboarding" | "portfolio";

export type ActorType = "vendor" | "contact" | "system";
/** Minimal Supabase auth user shape the db layer reads from. */
export interface AuthUserLike {
  id: string;
  email?: string | null;
  user_metadata?: { full_name?: string | null; [key: string]: unknown } | null;
}

/** Who did something, as passed to db write helpers (`{ actor }`). */
export type Actor =
  | { type: "vendor"; vendorUserId?: number | null; authUser?: AuthUserLike | null }
  | { type: "contact"; contactId?: number | null }
  | { type: "system" };

export type ExternalSource = "miniti" | "linear" | "attio";
export type AIConfidence = "low" | "medium" | "high";
export type PendingAIChangeStatus = "pending" | "approved" | "rejected" | "applied";
export type PendingAIChangeAction =
  | "create_task"
  | "match_existing"
  | "update_status"
  | "reassign"
  | "reprioritise"
  | "comment"
  | "draft_followup";

// ── PendingAIChange payload shapes (the JSON `payload` column) ───────────────
// Loose by design: payloads are model output and older rows predate fields.

export interface CreateTaskPayload {
  title?: string;
  description?: string;
  status?: string;
  due?: string | null;
  priority?: string | null;
  phaseId?: number | null;
  phaseName?: string | null;
  ownerId?: number | null;
  assigneeContactId?: number | null;
  [key: string]: unknown;
}

export interface TaskTargetPayload {
  taskId?: number | null;
  /** match_existing: every change in one draft (lib/ai/task-update.ts). */
  changes?: Record<string, unknown>;
  status?: string;
  priority?: string;
  ownerId?: number | null;
  body?: string;
  reason?: string;
  [key: string]: unknown;
}

export interface DraftFollowupPayload {
  taskId?: number | null;
  ownerId?: number | null;
  to?: string | null;
  subject?: string;
  body?: string;
  tone?: string;
  [key: string]: unknown;
}

export type PendingAIChangePayload = CreateTaskPayload | TaskTargetPayload | DraftFollowupPayload;

// ── View types: what lib/db.ts returns ───────────────────────────────────────

type Resolved<F extends (...args: never[]) => unknown> = Awaited<ReturnType<F>>;
type Item<T> = T extends readonly (infer U)[] ? U : never;

/** Onboarding list row (company, health, progress...). */
export type OnboardingListItem = Item<Resolved<typeof db.getOnboardings>>;
/** Single onboarding with company + owner. */
export type OnboardingDetail = NonNullable<Resolved<typeof db.getOnboarding>>;
/** Task as returned to the board: relations + computed `taskId`. */
export type BoardTask = Item<Resolved<typeof db.getTasksForOnboarding>>;
export type PhaseWithTasks = Item<Resolved<typeof db.getPhasesForOnboarding>>;
export type ContactRow = Item<Resolved<typeof db.getContactsForOnboarding>>;
export type CommentRow = Item<Resolved<typeof db.getCommentsForTask>>;
export type NotificationGroup = Item<Resolved<typeof db.getNotificationsForVendor>>;
export type PendingAIChangeRow = Item<Resolved<typeof db.listPendingAIChanges>>;
export type MeetingRow = Item<Resolved<typeof db.getMeetingsForOnboarding>>;
export type PortalOnboarding = NonNullable<Resolved<typeof db.getPortalOnboarding>>;
export type PortalTask = Item<Resolved<typeof db.getPortalTasks>>;
