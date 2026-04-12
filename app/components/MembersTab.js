"use client";

import ContactsPanel from "./ContactsPanel";

export default function MembersTab({ onboardingId, contacts, onContactsChange, magicLinks }) {
  return (
    <ContactsPanel
      onboardingId={onboardingId}
      contacts={contacts}
      onContactsChange={onContactsChange}
      magicLinks={magicLinks}
    />
  );
}
