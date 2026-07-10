/**
 * Shared constants used across components and the data layer.
 * Import from here instead of re-defining locally.
 */

export const TASK_STATUSES = ["Not started", "In progress", "Under investigation", "On hold", "Blocked", "Done"];

export const PRIORITIES = ["low", "medium", "high"];

export const STATUS_COLORS = {
  "Not started": "var(--text-muted)",
  "In progress": "var(--mint)",
  "Under investigation": "var(--sky)",
  "On hold": "var(--candy)",
  "Blocked": "var(--danger)",
  "Done": "var(--success)",
};

export const CONTACT_ROLES = ["Champion", "Technical Lead", "IT Admin", "Exec Sponsor"];

export const ONBOARDING_STATUSES = ["Active", "Completed", "Paused", "Archived"];

export const DEFAULT_PHASES = [
  { name: "Kickoff", sortOrder: 0 },
  { name: "Configuration", sortOrder: 1 },
  { name: "Data Migration", sortOrder: 2 },
  { name: "Training", sortOrder: 3 },
  { name: "Go-Live", sortOrder: 4 },
];
