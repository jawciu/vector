"use client";

export default function DetailsTab({ onboarding }) {
  const goLiveFormatted = onboarding.targetGoLive
    ? new Date(onboarding.targetGoLive).toLocaleDateString("en-GB", {
        day: "numeric",
        month: "short",
        year: "numeric",
      })
    : null;

  const fields = [
    { label: "Company", value: onboarding.companyName },
    { label: "Owner", value: onboarding.owner || null },
    { label: "Status", value: onboarding.status || "Active" },
    { label: "Target go-live", value: goLiveFormatted },
  ];

  return (
    <div className="flex flex-col gap-4" style={{ padding: "16px 16px", maxWidth: 480 }}>
      {fields.map(({ label, value }) => (
        <div key={label} className="flex flex-col gap-1">
          <span className="text-xs font-medium" style={{ color: "var(--text-muted)" }}>
            {label}
          </span>
          <span className="text-sm" style={{ color: value ? "var(--text)" : "var(--text-muted)" }}>
            {value || "—"}
          </span>
        </div>
      ))}
    </div>
  );
}
