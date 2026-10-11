/**
 * Client-side shapes for the customer portal. These mirror what
 * `getPortalOnboarding` / `getPortalTasks` / `getPortalActivitySinceLastSeen`
 * (lib/db) and the /api/portal routes hand back, restricted to the fields the
 * portal components actually read.
 */

export interface PortalComment {
  id: number;
  author: string;
  body: string;
  createdAt: string | Date;
}

export interface PortalFile {
  id: number;
  fileName: string;
  fileSize: number;
}

export interface PortalTask {
  id: number;
  title: string;
  description?: string;
  status: string;
  due: string;
  owner?: string;
  priority: string | null;
  sortOrder?: number;
  previousStatus?: string | null;
  phase?: { id: number; name: string; sortOrder: number } | null;
  assigneeContact?: { id: number; name: string } | null;
  isAssignedToMe?: boolean;
  commentCount: number;
  comments?: PortalComment[];
  files: PortalFile[];
  taskId?: string | null;
}

export interface PortalTaskSummary {
  notStarted: number;
  inProgress: number;
  onHold: number;
  blocked: number;
  done: number;
  total: number;
}

export interface PortalOnboarding {
  id: number;
  companyName: string;
  companyLogoUrl: string | null;
  targetGoLive: string | null;
  taskSummary: PortalTaskSummary;
}

/** Serialised cached insight, as built in the portal page. */
export interface PortalCachedInsight {
  contextHash: string;
  payload: unknown;
  generatedAt: string;
}

export interface PortalActivityEvent {
  id: number;
  verb: string;
  entityType: string;
  entityId: number;
  metadata: Record<string, unknown> | null;
  createdAt: string;
  actorName: string;
}

export type PortalTaskUpdatedHandler = (taskId: number, updatedTask: Partial<PortalTask>) => void;
