"use client";

export default function TabBar({ tabs, activeTab, onTabChange }) {
  return (
    <div
      className="flex items-end gap-1"
      style={{
        paddingLeft: 16,
        paddingRight: 16,
        paddingTop: 4,
        height: 54,
        borderBottom: "1px solid var(--border)",
      }}
    >
      {tabs.map((tab) => {
        const isActive = activeTab === tab.id;
        return (
          <button
            key={tab.id}
            type="button"
            onClick={() => onTabChange(tab.id)}
            className="tab-btn"
            data-active={isActive || undefined}
          >
            <span className="tab-btn__inner">
              {tab.icon}
              {tab.label}
            </span>
            {isActive && <span className="tab-btn__indicator" />}
          </button>
        );
      })}
    </div>
  );
}
