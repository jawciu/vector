export default function StatusBadge({ status }) {
  const map = {
    Todo: { bg: "rgba(163,163,163,0.2)", border: "var(--border)", color: "var(--text-muted)" },
    "In progress": { bg: "rgba(34,211,238,0.15)", border: "#0891b2", color: "#22d3ee" },
    Blocked: { bg: "rgba(248,113,113,0.15)", border: "var(--danger)", color: "var(--danger)" },
    Done: { bg: "rgba(52,211,153,0.15)", border: "var(--success)", color: "var(--success)" },
  };
  const s = map[status] || map.Todo;

  return (
    <span
      className="inline-flex h-fit rounded text-xs font-medium"
      style={{
        paddingTop: 2,
        paddingBottom: 2,
        paddingLeft: 4,
        paddingRight: 4,
        background: s.bg,
        borderRadius: 6,
        borderWidth: "0.5px",
        borderStyle: "solid",
        borderColor: s.border,
        color: s.color,
      }}
    >
      {status}
    </span>
  );
}
