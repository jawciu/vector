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
            className="flex items-center gap-1.5 text-sm font-medium pb-2 relative"
            style={{
              color: isActive ? "var(--text)" : "var(--text-muted)",
              background: "none",
              border: "none",
              cursor: "pointer",
              paddingLeft: 8,
              paddingRight: 8,
              paddingTop: 6,
            }}
          >
            {tab.icon}
            {tab.label}
            {isActive && (
              <span
                style={{
                  position: "absolute",
                  bottom: -1,
                  left: 0,
                  right: 0,
                  height: 2,
                  borderRadius: 99,
                  background: "var(--text)",
                }}
              />
            )}
          </button>
        );
      })}
    </div>
  );
}
