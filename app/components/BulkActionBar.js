"use client";

import Button from "../ui/Button";

export default function BulkActionBar({
  selectedCount,
  loading,
  status, // null | "success" | "partial"
  successCount,
  failedCount,
  onClear,
  onGenerate,
  onRetry,
}) {
  if (status === "success") {
    return (
      <div className="bulk-action-bar">
        <span className="text-sm" style={{ color: "var(--success)" }}>
          Sent to {successCount} {successCount === 1 ? "member" : "members"}
        </span>
      </div>
    );
  }

  if (status === "partial") {
    return (
      <div className="bulk-action-bar">
        <span className="text-sm" style={{ color: "var(--text)" }}>
          Sent to {successCount} — {failedCount} failed
        </span>
        <div className="flex items-center gap-2 ml-auto">
          <Button variant="secondary" size="sm" onClick={onClear} disabled={loading}>
            Dismiss
          </Button>
          <Button variant="primary" size="sm" onClick={onRetry} disabled={loading}>
            {loading ? "Retrying…" : "Retry failed"}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="bulk-action-bar">
      <span className="text-sm" style={{ color: "var(--text)" }}>
        {selectedCount} {selectedCount === 1 ? "member" : "members"} selected
      </span>
      <div className="flex items-center gap-2 ml-auto">
        <Button variant="secondary" size="sm" onClick={onClear} disabled={loading}>
          Clear
        </Button>
        <Button variant="primary" size="sm" onClick={onGenerate} disabled={loading}>
          {loading ? "Sending…" : "Generate + email"}
        </Button>
      </div>
    </div>
  );
}
