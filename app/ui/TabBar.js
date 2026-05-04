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
        const badge = tab.badge;
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
              {badge != null && badge > 0 && (
                <span
                  aria-label={`${badge} pending`}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    minWidth: 18,
                    height: 18,
                    padding: "0 6px",
                    marginLeft: 6,
                    borderRadius: 9999,
                    background: "var(--action)",
                    color: "var(--action-text)",
                    fontSize: 10,
                    fontWeight: 600,
                    lineHeight: 1,
                  }}
                >
                  {badge > 99 ? "99+" : badge}
                </span>
              )}
            </span>
            {isActive && <span className="tab-btn__indicator" />}
          </button>
        );
      })}
    </div>
  );
}
