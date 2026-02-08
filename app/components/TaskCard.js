import StatusBadge from "./StatusBadge";

export default function TaskCard({ task }) {
  return (
    <div
      className="flex justify-between gap-4 p-4 rounded-xl"
      style={{
        border: "1px solid var(--border)",
        background: "var(--surface)",
      }}
    >
      <div className="grid gap-1.5">
        <div className="font-medium" style={{ color: "var(--text)" }}>
          {task.title}
        </div>
        <div className="text-sm" style={{ color: "var(--text-muted)" }}>
          Waiting on: <span style={{ color: "var(--text)" }}>{task.waitingOn}</span>
        </div>
      </div>

      <div className="grid justify-items-end gap-2">
        <StatusBadge status={task.status} />
        <div className="text-sm" style={{ color: "var(--text-muted)" }}>
          Due: {task.due}
        </div>
      </div>
    </div>
  );
}
