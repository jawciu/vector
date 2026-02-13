import StatusBadge from "./StatusBadge";

export default function TaskCard({ task }) {
  return (
    <div
      className="flex flex-col gap-3 rounded-lg"
      style={{
        border: "1px solid var(--border)",
        background: "var(--surface)",
        padding: "12px 16px",
      }}
    >
      <div className="text-sm font-medium" style={{ color: "var(--text)" }}>
        {task.title}
      </div>

      <div className="flex flex-col gap-1 text-xs">
        <div style={{ color: "var(--text-muted)" }}>
          Due: {task.due}
        </div>
        <div style={{ color: "var(--text-muted)" }}>
          Waiting on: <span style={{ color: "var(--text)" }}>{task.waitingOn}</span>
        </div>
      </div>
    </div>
  );
}
