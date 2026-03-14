"use client";

import { useState } from "react";
import PortalOverview from "./PortalOverview";
import PortalTasks from "./PortalTasks";

const TABS = [
  { id: "overview", label: "Overview", icon: (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <rect x="2" y="2" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.2" />
      <rect x="9" y="2" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.2" />
      <rect x="2" y="9" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.2" />
      <rect x="9" y="9" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.2" />
    </svg>
  )},
  { id: "my-tasks", label: "My Tasks", icon: (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <circle cx="8" cy="5" r="3" stroke="currentColor" strokeWidth="1.2" />
      <path d="M3 14c0-2.8 2.2-5 5-5s5 2.2 5 5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  )},
  { id: "all-tasks", label: "All Tasks", icon: (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <path d="M3 4h10M3 8h10M3 12h10" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  )},
];

export default function PortalShell({ data, tasks, contactName }) {
  const [activeTab, setActiveTab] = useState("overview");

  return (
    <div style={{ maxWidth: 640, margin: "0 auto" }}>
      {/* Header */}
      <header
        style={{
          padding: "20px 16px 16px",
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
      <div style={{ padding: 16, paddingBottom: 80 }}>
        {activeTab === "overview" && <PortalOverview data={data} />}
        {activeTab === "my-tasks" && <PortalTasks tasks={tasks} myOnly contactName={contactName} />}
        {activeTab === "all-tasks" && <PortalTasks tasks={tasks} myOnly={false} contactName={contactName} />}
      </div>

      {/* Bottom nav — larger touch targets with icons */}
      <nav
        className="fixed bottom-0 left-0 right-0 flex justify-around items-center"
        style={{
          padding: "8px 0 calc(8px + env(safe-area-inset-bottom, 0px))",
          background: "var(--bg-elevated)",
          borderTop: "1px solid var(--border)",
          maxWidth: 640,
          margin: "0 auto",
        }}
      >
        {TABS.map(({ id, label, icon }) => (
          <button
            key={id}
            onClick={() => setActiveTab(id)}
            className="flex flex-col items-center gap-0.5"
            style={{
              background: "none",
              border: "none",
              color: activeTab === id ? "var(--action)" : "var(--text-muted)",
              cursor: activeTab === id ? "default" : "pointer",
              padding: "6px 20px",
              minHeight: 44,
            }}
          >
            {icon}
            <span className="text-[10px] font-medium">{label}</span>
          </button>
        ))}
      </nav>
    </div>
  );
}
