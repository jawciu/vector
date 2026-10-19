/**
 * Client-side shapes shared by app/components and app/onboardings.
 *
 * These describe the JSON the browser actually holds (dates as strings after a
 * fetch, relations flattened by lib/db), not the Prisma rows. Server-rendered
 * props arrive with the same fields, so one shape covers both.
 *
 * Append-only: several builders add types here. Consolidate into lib/types.ts
 * once the lib layer's view types settle.
 */

import type { TaskDependencyView } from "@/lib/task-dependencies";

/** A file attached to a task (subset of the Prisma File row). */
export type TaskFile = {
  id: number;
  fileName: string;
  fileSize: number;
  mimeType?: string;
  [key: string]: unknown;
};

/** Task as the kanban board, drawer and cards hold it (lib/db getTasksForOnboarding + taskId). */
export type ClientTask = {
  id: number;
  taskId?: string | null;
  phaseId: number;
  title: string;
  status: string;
  /** "YYYY-MM-DD", or "" when cleared (the column is a non-null String). */
  due: string;
  description?: string | null;
  members?: string[];
  owner?: string | null;
  ownerId?: number | null;
  notes?: string | null;
  sortOrder: number;
  priority?: string | null;
  commentCount?: number;
  previousStatus?: string | null;
  blockedByTaskId?: number | null;
  blockedByTask?: { id: number; title: string; status: string; taskId?: string | null } | null;
  /** What the task waits on: board tasks and text blockers, oldest first
   *  (GAPS-PLAN feature 2). The source of truth; blockedByTask mirrors the
   *  first task blocker for older readers. */
  dependencies?: TaskDependencyView[];
  assigneeContactId?: number | null;
  assigneeContact?: { id: number; name: string } | null;
  files?: TaskFile[];
  number?: number | null;
};

/** Phase column on the board. `taskCount`/`doneCount` are added client-side. */
export type ClientPhase = {
  id: number;
  name: string;
  sortOrder: number;
  taskCount?: number;
  doneCount?: number;
};

/** Customer contact as the board/drawer use it. */
export type ClientContact = {
  id: number;
  name: string;
  email?: string | null;
  role?: string | null;
};

/** Vector team member (VendorUser) as pickers use it. */
export type ClientVendorUser = {
  id: number;
  name: string;
  email?: string | null;
};

// ── AI insight payloads (mirror the JSON schemas in lib/ai/insights.ts) ──────
// Loose on enum fields: payloads are model output, and cached rows can predate
// a schema change (e.g. the trend rename).

export type InsightRisk = { severity: string; summary: string };

export type InsightWin = {
  kind?: string;
  taskId?: number;
  contactId?: number;
  headline: string;
  detail: string;
};

export type InsightFocusToday = { taskId: number; reason: string };

export type InsightFocusThisWeek = { summary: string; priority: "low" | "medium" | "high" };

/** Onboarding-scope insight (InsightsPanel). */
export type OnboardingInsightPayload = {
  status?: string;
  summary: string;
  risks: InsightRisk[];
  wins: InsightWin[];
  focusToday: InsightFocusToday[];
  focusThisWeek: InsightFocusThisWeek[];
};

/** Portfolio-scope insight (PortfolioInsightsHero). */
export type PortfolioInsightPayload = {
  status?: string;
  summary: string;
  priority: {
    mode: "risk" | "focus" | string;
    items: { onboardingId: number; issues: string[] }[];
  };
  wins: { onboardingId: number; headline: string; detail: string }[];
};

/** A cached Insight row as serialised by the server page (dates as ISO strings). */
export type CachedInsight = {
  contextHash: string | null;
  /** Prisma Json column; narrowed by each consumer's shape guard. */
  payload: unknown;
  generatedAt: string;
};

/** Portal magic link as ContactsPanel holds it (lib/db getMagicLinksForOnboarding + API responses). */
export type ClientMagicLink = {
  id: number;
  token: string;
  contactId: number;
  onboardingId?: number;
  expiresAt: string | Date;
  revokedAt?: string | Date | null;
  createdAt?: string | Date;
  lastUsedAt?: string | Date | null;
  sentAt?: string | Date | null;
  sentTo?: string | null;
  /** Only on a POST /magic-links response whose invite email was not sent. */
  emailStatus?: string;
};

// ── Meetings (Miniti ExternalEvent rows, lib/db getMeetingsForOnboarding / getMeetingByEventId) ──

export type MeetingAttendee = {
  name?: string | null;
  email?: string | null;
  domain?: string | null;
};

export type MeetingTurn = { speaker: string; text: string };

export type MeetingCompany = {
  name: string;
  domain: string | null;
  logoUrl: string | null;
};

/** Meetings-tab row; also the MeetingDrawer's `seed`. */
export type ClientMeeting = {
  id: number;
  sourceId?: string;
  onboardingId: number | null;
  occurredAt: string;
  durationSeconds?: number | null;
  company?: MeetingCompany | null;
  meetingTitle: string;
  summary?: string | null;
  attendees: MeetingAttendee[];
  transcript: MeetingTurn[];
  processedAt?: string | null;
};

/** Pass 1 action item as the meeting drawer renders it (model output, loose). */
export type MeetingActionItem = {
  claim?: string;
  sourceQuote?: string | null;
  [key: string]: unknown;
};

/** Sibling draft summary on GET /api/meetings/[id]. */
export type MeetingSiblingDraft = {
  id: number;
  action: string;
  status: string;
  title: string | null;
  createdAt: string;
  sourceQuote: string | null;
  appliedTaskId: number | null;
  taskId: string | null;
  /** Not sent by getMeetingByEventId; MeetingDrawer reads it anyway. */
  payload?: { action?: unknown } | null;
};

/** Full meeting body from GET /api/meetings/[id]. */
export type ClientMeetingDetail = ClientMeeting & {
  extractionActionItems?: MeetingActionItem[];
  siblingDrafts?: MeetingSiblingDraft[];
};

// ── AI drafts (PendingAIChange as serialised by lib/db listPendingAIChanges) ──

/** The JSON `payload` column. Model output; older rows predate fields. */
export type DraftPayload = {
  action?: string;
  taskId?: number | string | null;
  title?: string;
  description?: string;
  subject?: string;
  body?: string;
  to?: string | null;
  toName?: string | null;
  tone?: string;
  reasons?: unknown;
  newStatus?: string;
  newDueDate?: string;
  newPriority?: string;
  dueDate?: string;
  priority?: string;
  notes?: string;
  ownerId?: number | null;
  assigneeContactId?: number | null;
  phaseId?: number | null;
  blockedByTaskId?: number | null;
  /** match_existing: every change in one draft (lib/ai/task-update.ts). */
  changes?: Record<string, unknown>;
  [key: string]: unknown;
};

/** A draft row as the inbox / inline lists hold it (dates as ISO strings). */
export type AIDraft = {
  id: number;
  source: string;
  sourceEventId: number | null;
  onboardingId: number | null;
  onboardingName?: string | null;
  action: string;
  payload: DraftPayload | null;
  sourceQuote?: string | null;
  sourceUrl?: string | null;
  confidence: string;
  status: string;
  rejectedReason?: string | null;
  createdAt: string;
  resolvedAt?: string | null;
  resolvedBy?: number | null;
  appliedTaskId?: number | null;
  taskTitle?: string | null;
  meetingTitle?: string | null;
};

/** Overrides body for POST /api/ai-drafts/[id]/approve. Shape varies by action. */
export type DraftOverrides = Record<string, unknown>;

/** Lookup lists for draft editors (GET /api/onboardings/[id]/draft-options). */
export type VendorUserOption = { id: number; name?: string | null; email?: string | null };
export type ContactOption = { id: number; name?: string | null; email?: string | null };
export type PhaseOption = { id: number; name: string };
export type OpenTaskOption = {
  id: number;
  title: string;
  taskId?: string | null;
  due?: string | null;
  status?: string | null;
  priority?: string | null;
  /** Current owner / assignee, the "before" side of an update draft's diff. */
  ownerId?: number | null;
  assigneeContactId?: number | null;
};
