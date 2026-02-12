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
      <div className="font-medium" style={{ color: "var(--text)" }}>
        {task.title}
      </div>

      <div className="flex items-center justify-between gap-3 text-xs">
        <div style={{ color: "var(--text-muted)" }}>
          Waiting on: <span style={{ color: "var(--text)" }}>{task.waitingOn}</span>
        </div>
        <div style={{ color: "var(--text-muted)" }}>
          Due: {task.due}
        </div>
      </div>
    </div>
  );
}
