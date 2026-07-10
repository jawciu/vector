import { TASK_STATUSES, STATUS_COLORS } from "./constants";

const STATUS_BY_FILTER_ID = {
  "not-started": "Not started",
  "in-progress": "In progress",
  "under-investigation": "Under investigation",
  "on-hold": "On hold",
  "blocked": "Blocked",
  "done": "Done",
};

export const TASK_FILTER_OPTIONS = [
  { id: "active", label: "Active" },
  { id: "all", label: "All" },
  ...TASK_STATUSES.map((status) => ({
    id: Object.keys(STATUS_BY_FILTER_ID).find((k) => STATUS_BY_FILTER_ID[k] === status),
    label: status,
    status,
    color: STATUS_COLORS[status],
  })),
];

export function taskMatchesFilter(task, filterId) {
  if (!filterId || filterId === "all") return true;
  if (filterId === "active") return task.status !== "Done";
  const status = STATUS_BY_FILTER_ID[filterId];
  return status ? task.status === status : true;
}
