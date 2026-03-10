"use client";

import ContactsPanel from "./ContactsPanel";

export default function MembersTab({ onboardingId, contacts, onContactsChange, magicLinks }) {
  return (
    <div style={{ padding: "16px 16px", maxWidth: 480 }}>
      <ContactsPanel
        onboardingId={onboardingId}
        contacts={contacts}
        onContactsChange={onContactsChange}
        magicLinks={magicLinks}
      />
    </div>
  );
}
