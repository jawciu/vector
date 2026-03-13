import { STATUS_COLORS } from "@/lib/constants";

export default function StatusBadge({ status }) {
  const color = STATUS_COLORS[status] || "var(--text-muted)";
  const s = { color, border: color };

  return (
    <span
      className="inline-flex h-fit rounded text-xs font-medium"
      style={{
        paddingTop: 2,
        paddingBottom: 2,
        paddingLeft: 4,
        paddingRight: 4,
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
