"use client";

import { useState } from "react";
import TabBar from "../../ui/TabBar";
import PortalOverview from "./PortalOverview";
import PortalTasks from "./PortalTasks";

const PORTAL_TABS = [
  {
    id: "overview",
    label: "Overview",
    icon: (
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg">
        <g clipPath="url(#overview-clip)">
          <path d="M1 10.3333C1 9.435 1 8.98583 1.20242 8.65567C1.31558 8.47075 1.47075 8.31558 1.65567 8.20242C1.98525 8 2.435 8 3.33333 8C4.23167 8 4.68083 8 5.011 8.20242C5.19592 8.31558 5.35108 8.47075 5.46425 8.65567C5.66667 8.98525 5.66667 9.435 5.66667 10.3333C5.66667 11.2317 5.66667 11.6808 5.46425 12.0116C5.35108 12.1959 5.19592 12.3511 5.011 12.4643C4.68142 12.6667 4.23167 12.6667 3.33333 12.6667C2.435 12.6667 1.98583 12.6667 1.65567 12.4643C1.47095 12.3513 1.31563 12.1962 1.20242 12.0116C1 11.6808 1 11.2317 1 10.3333ZM8 10.3333C8 9.435 8 8.98583 8.20242 8.65567C8.31558 8.47075 8.47075 8.31558 8.65567 8.20242C8.98525 8 9.435 8 10.3333 8C11.2317 8 11.6808 8 12.0116 8.20242C12.1959 8.31558 12.3511 8.47075 12.4643 8.65567C12.6667 8.98525 12.6667 9.435 12.6667 10.3333C12.6667 11.2317 12.6667 11.6808 12.4643 12.0116C12.351 12.1959 12.1959 12.351 12.0116 12.4643C11.6808 12.6667 11.2317 12.6667 10.3333 12.6667C9.435 12.6667 8.98583 12.6667 8.65567 12.4643C8.47089 12.3513 8.31556 12.1962 8.20242 12.0116C8 11.6808 8 11.2317 8 10.3333ZM1 3.33333C1 2.435 1 1.98583 1.20242 1.65567C1.31558 1.47075 1.47075 1.31558 1.65567 1.20242C1.98525 1 2.435 1 3.33333 1C4.23167 1 4.68083 1 5.011 1.20242C5.19592 1.31558 5.35108 1.47075 5.46425 1.65567C5.66667 1.98525 5.66667 2.435 5.66667 3.33333C5.66667 4.23167 5.66667 4.68083 5.46425 5.011C5.35108 5.19592 5.19592 5.35108 5.011 5.46425C4.68142 5.66667 4.23167 5.66667 3.33333 5.66667C2.435 5.66667 1.98583 5.66667 1.65567 5.46425C1.47089 5.35111 1.31556 5.19578 1.20242 5.011C1 4.68142 1 4.23167 1 3.33333ZM8 3.33333C8 2.435 8 1.98583 8.20242 1.65567C8.31558 1.47075 8.47075 1.31558 8.65567 1.20242C8.98525 1 9.435 1 10.3333 1C11.2317 1 11.6808 1 12.0116 1.20242C12.1959 1.31558 12.3511 1.47075 12.4643 1.65567C12.6667 1.98525 12.6667 2.435 12.6667 3.33333C12.6667 4.23167 12.6667 4.68083 12.4643 5.011C12.3511 5.19592 12.1959 5.35108 12.0116 5.46425C11.6808 5.66667 11.2317 5.66667 10.3333 5.66667C9.435 5.66667 8.98583 5.66667 8.65567 5.46425C8.47089 5.35111 8.31556 5.19578 8.20242 5.011C8 4.68142 8 4.23167 8 3.33333Z" stroke="currentColor" strokeWidth="0.878906" />
        </g>
        <defs>
          <clipPath id="overview-clip">
            <rect width="13.6667" height="13.6667" fill="white" />
          </clipPath>
        </defs>
      </svg>
    ),
  },
  {
    id: "my-tasks",
    label: "My Tasks",
    icon: (
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M7.29087 4.08305C7.29087 4.70184 7.04506 5.29529 6.6075 5.73285C6.16995 6.1704 5.5765 6.41622 4.9577 6.41622C4.33891 6.41622 3.74546 6.1704 3.3079 5.73285C2.87035 5.29529 2.62453 4.70184 2.62453 4.08305C2.62453 3.46425 2.87035 2.8708 3.3079 2.43325C3.74546 1.99569 4.33891 1.74988 4.9577 1.74988C5.5765 1.74988 6.16995 1.99569 6.6075 2.43325C7.04506 2.8708 7.29087 3.46425 7.29087 4.08305Z" stroke="currentColor" strokeWidth="1.16659" strokeLinecap="square" />
        <path d="M9.3324 11.6659V11.0826C9.3324 10.4638 9.08658 9.87031 8.64903 9.43276C8.21147 8.99521 7.61802 8.74939 6.99923 8.74939H2.91618C2.29738 8.74939 1.70393 8.99521 1.26638 9.43276C0.828823 9.87031 0.583008 10.4638 0.583008 11.0826V11.6659" stroke="currentColor" strokeWidth="1.16659" strokeLinecap="square" />
      </svg>
    ),
  },
  {
    id: "all-tasks",
    label: "All Tasks",
    icon: (
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg">
        <g clipPath="url(#alltasks-clip)">
          <path fillRule="evenodd" clipRule="evenodd" d="M2.625 11.8125C2.50897 11.8125 2.39769 11.7664 2.31564 11.6844C2.23359 11.6023 2.1875 11.491 2.1875 11.375V2.625C2.1875 2.50897 2.23359 2.39769 2.31564 2.31564C2.39769 2.23359 2.50897 2.1875 2.625 2.1875H10.7188C10.8928 2.1875 11.0597 2.11836 11.1828 1.99529C11.3059 1.87222 11.375 1.7053 11.375 1.53125C11.375 1.3572 11.3059 1.19028 11.1828 1.06721C11.0597 0.94414 10.8928 0.875 10.7188 0.875H2.625C2.16087 0.875 1.71575 1.05937 1.38756 1.38756C1.05937 1.71575 0.875 2.16087 0.875 2.625V11.375C0.875 11.8391 1.05937 12.2842 1.38756 12.6124C1.71575 12.9406 2.16087 13.125 2.625 13.125H11.375C11.8391 13.125 12.2842 12.9406 12.6124 12.6124C12.9406 12.2842 13.125 11.8391 13.125 11.375V8.53125C13.125 8.3572 13.0559 8.19028 12.9328 8.06721C12.8097 7.94414 12.6428 7.875 12.4688 7.875C12.2947 7.875 12.1278 7.94414 12.0047 8.06721C11.8816 8.19028 11.8125 8.3572 11.8125 8.53125V11.375C11.8125 11.491 11.7664 11.6023 11.6844 11.6844C11.6023 11.7664 11.491 11.8125 11.375 11.8125H2.625ZM13.8075 4.095C13.9234 3.9706 13.9865 3.80606 13.9835 3.63604C13.9805 3.46603 13.9117 3.30382 13.7914 3.18358C13.6712 3.06334 13.509 2.99447 13.339 2.99147C13.1689 2.98847 13.0044 3.05158 12.88 3.1675L8.01675 8.02988L6.37788 6.33588C6.31808 6.2734 6.24653 6.22335 6.16733 6.18862C6.08813 6.15388 6.00284 6.13515 5.91638 6.13349C5.82991 6.13182 5.74397 6.14727 5.66349 6.17893C5.58302 6.21059 5.50959 6.25785 5.44744 6.31798C5.38529 6.37812 5.33564 6.44994 5.30133 6.52933C5.26703 6.60872 5.24876 6.6941 5.24757 6.78058C5.24638 6.86705 5.26229 6.95291 5.29439 7.03321C5.3265 7.11351 5.37415 7.18668 5.43462 7.2485L7.53725 9.422C7.59775 9.48475 7.67014 9.53481 7.7502 9.56927C7.83026 9.60374 7.91638 9.62191 8.00354 9.62272C8.0907 9.62354 8.17714 9.60698 8.25783 9.57402C8.33852 9.54106 8.41184 9.49235 8.4735 9.43075L13.8075 4.095Z" fill="currentColor" />
        </g>
        <defs>
          <clipPath id="alltasks-clip">
            <rect width="14" height="14" fill="white" />
          </clipPath>
        </defs>
      </svg>
    ),
  },
];

export default function PortalShell({ data, tasks, contactName }) {
  const [activeTab, setActiveTab] = useState("overview");

  return (
    <div className="max-w-[640px] md:max-w-[960px]" style={{ margin: "0 auto" }}>
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

      {/* Desktop tabs — matches kanban board tab style */}
      <div className="hidden md:block">
        <TabBar tabs={PORTAL_TABS} activeTab={activeTab} onTabChange={setActiveTab} />
      </div>

      {/* Tab content — extra bottom padding on mobile for bottom nav */}
      <div className="p-4 pb-20 md:pb-4 md:p-6">
        {activeTab === "overview" && <PortalOverview data={data} />}
        {activeTab === "my-tasks" && <PortalTasks tasks={tasks} myOnly contactName={contactName} />}
        {activeTab === "all-tasks" && <PortalTasks tasks={tasks} myOnly={false} contactName={contactName} />}
      </div>

      {/* Bottom nav — mobile only */}
      <nav
        className="fixed bottom-0 left-0 right-0 flex justify-around items-center md:hidden"
        style={{
          padding: "8px 0 calc(8px + env(safe-area-inset-bottom, 0px))",
          background: "var(--bg-elevated)",
          borderTop: "1px solid var(--border)",
          maxWidth: 640,
          margin: "0 auto",
        }}
      >
        {PORTAL_TABS.map(({ id, label, icon }) => (
          <button
            key={id}
            onClick={() => setActiveTab(id)}
            className="flex flex-col items-center gap-0.5"
            style={{
              background: "none",
              border: "none",
              color: activeTab === id ? "var(--text)" : "var(--text-muted)",
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
