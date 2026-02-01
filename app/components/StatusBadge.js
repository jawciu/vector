export default function StatusBadge({ status }) {
  const map = {
    Todo: { bg: "#f3f4f6", border: "#d1d5db" },
    "In progress": { bg: "#e0f2fe", border: "#7dd3fc" },
    Blocked: { bg: "#fee2e2", border: "#fca5a5" },
    Done: { bg: "#dcfce7", border: "#86efac" },
  };
  const s = map[status] || map.Todo;

  return (
    <span
      style={{
        background: s.bg,
        border: `1px solid ${s.border}`,
        padding: "4px 8px",
        borderRadius: 999,
        fontSize: 12,
      }}
    >
      {status}
    </span>
  );
}
