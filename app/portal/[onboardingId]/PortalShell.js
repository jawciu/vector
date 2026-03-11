"use client";

import { useState } from "react";
import PortalOverview from "./PortalOverview";
import PortalTasks from "./PortalTasks";

const TABS = [
  { id: "overview", label: "Overview" },
  { id: "my-tasks", label: "My Tasks" },
  { id: "all-tasks", label: "All Tasks" },
];

export default function PortalShell({ data, tasks, contactName }) {
  const [activeTab, setActiveTab] = useState("overview");

  return (
    <div style={{ maxWidth: 600, margin: "0 auto" }}>
      {/* Header */}
      <header
        style={{
          padding: "16px 16px 12px",
          borderBottom: "1px solid var(--border)",
        }}
      >
        <div className="text-xs" style={{ color: "var(--text-muted)", marginBottom: 2 }}>
          Welcome, {contactName}
        </div>
        <h1 className="text-lg font-semibold" style={{ color: "var(--text)" }}>
          {data.companyName}
        </h1>
      </header>

      {/* Tab content */}
      <div style={{ padding: 16, paddingBottom: 72 }}>
        {activeTab === "overview" && <PortalOverview data={data} />}
        {activeTab === "my-tasks" && <PortalTasks tasks={tasks} myOnly contactName={contactName} />}
        {activeTab === "all-tasks" && <PortalTasks tasks={tasks} myOnly={false} contactName={contactName} />}
      </div>

      {/* Bottom nav */}
      <nav
        className="fixed bottom-0 left-0 right-0 flex justify-around"
        style={{
          padding: "10px 0",
          background: "var(--bg-elevated)",
          borderTop: "1px solid var(--border)",
          maxWidth: 600,
          margin: "0 auto",
        }}
      >
        {TABS.map(({ id, label }) => (
          <button
            key={id}
            onClick={() => setActiveTab(id)}
            className="text-xs font-medium"
            style={{
              background: "none",
              border: "none",
              color: activeTab === id ? "var(--action)" : "var(--text-muted)",
              cursor: activeTab === id ? "default" : "pointer",
              padding: "4px 16px",
            }}
          >
            {label}
          </button>
        ))}
      </nav>
    </div>
  );
}
