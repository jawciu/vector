"use client";

import type { ComponentProps } from "react";
import ContactsPanel from "./ContactsPanel";

type ContactsPanelProps = ComponentProps<typeof ContactsPanel>;

type MembersTabProps = {
  onboardingId: ContactsPanelProps["onboardingId"];
  contacts: ContactsPanelProps["contacts"];
  onContactsChange: ContactsPanelProps["onContactsChange"];
  magicLinks: ContactsPanelProps["magicLinks"];
};

export default function MembersTab({ onboardingId, contacts, onContactsChange, magicLinks }: MembersTabProps) {
  return (
    <ContactsPanel
      onboardingId={onboardingId}
      contacts={contacts}
      onContactsChange={onContactsChange}
      magicLinks={magicLinks}
    />
  );
}
