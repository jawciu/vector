import StatusBadge from "./StatusBadge";

export default function TaskCard({ task }) {
  return (
    <div
      style={{
        border: "1px solid #e5e7eb",
        borderRadius: 12,
        padding: 16,
        display: "flex",
        justifyContent: "space-between",
        gap: 16,
      }}
    >
      <div style={{ display: "grid", gap: 6 }}>
        <div style={{ fontWeight: 600 }}>{task.title}</div>
        <div style={{ fontSize: 13, color: "#4b5563" }}>
          Waiting on: <span style={{ color: "#111827" }}>{task.waitingOn}</span>
        </div>
      </div>

      <div style={{ display: "grid", justifyItems: "end", gap: 8 }}>
        <StatusBadge status={task.status} />
        <div style={{ fontSize: 13, color: "#4b5563" }}>Due: {task.due}</div>
      </div>
    </div>
  );
}
