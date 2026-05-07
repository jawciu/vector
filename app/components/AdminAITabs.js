"use client";

import { useState } from "react";
import TabBar from "@/app/ui/TabBar";

/**
 * Client-side tab switcher for /admin/ai. Receives pre-rendered server
 * content for each tab as React children-shaped props, only mounts the
 * active one. URL syncing via search params would be nicer but this
 * page is internal/low-traffic and the tabs are stateless — keep simple.
 */
export default function AdminAITabs({ tabs }) {
  const [activeId, setActiveId] = useState(tabs[0]?.id);
  const active = tabs.find((t) => t.id === activeId);
  const tabBarTabs = tabs.map((t) => ({ id: t.id, label: t.label }));
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      <TabBar tabs={tabBarTabs} activeTab={activeId} onTabChange={setActiveId} />
      <div>{active?.content}</div>
    </div>
  );
}
