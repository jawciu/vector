"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useRef, useState, useEffect } from "react";
import { MenuTriggerButton, MenuList, MenuOption } from "./Menu";
import Button from "../ui/Button";
import CreateOnboardingModal from "./CreateOnboardingModal";

const FILTERS = ["Active", "Completed", "Paused", "Archived", "All"];

export default function OnboardingsActionBar() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const current = searchParams.get("status") || "Active";
  const [open, setOpen] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    function handleClick(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  function select(value) {
    setOpen(false);
    const params = new URLSearchParams(searchParams.toString());
    if (value === "Active") {
      params.delete("status");
    } else {
      params.set("status", value);
    }
    const qs = params.toString();
    router.push(qs ? `/?${qs}` : "/");
  }

  function handleOnboardingCreated(onboarding) {
    // Navigate to the new onboarding's detail page
    router.push(`/onboardings/${onboarding.id}`);
  }

  const label = current;

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-2 py-3">
        <div ref={ref} className="relative">
          <MenuTriggerButton
            onClick={() => setOpen((o) => !o)}
            aria-haspopup="listbox"
            aria-expanded={open}
          >
            <span className="flex w-full items-center justify-between gap-2">
              <span className="flex items-center gap-2">
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden style={{ color: "var(--text-muted)" }}>
                  <g clipPath="url(#clip0_ob_filter)">
                    <path d="M1 10.3333C1 9.435 1 8.98583 1.20242 8.65567C1.31558 8.47075 1.47075 8.31558 1.65567 8.20242C1.98525 8 2.435 8 3.33333 8C4.23167 8 4.68083 8 5.011 8.20242C5.19592 8.31558 5.35108 8.47075 5.46425 8.65567C5.66667 8.98525 5.66667 9.435 5.66667 10.3333C5.66667 11.2317 5.66667 11.6808 5.46425 12.0116C5.35108 12.1959 5.19592 12.3511 5.011 12.4643C4.68142 12.6667 4.23167 12.6667 3.33333 12.6667C2.435 12.6667 1.98583 12.6667 1.65567 12.4643C1.47095 12.3513 1.31563 12.1962 1.20242 12.0116C1 11.6808 1 11.2317 1 10.3333ZM8 10.3333C8 9.435 8 8.98583 8.20242 8.65567C8.31558 8.47075 8.47075 8.31558 8.65567 8.20242C8.98525 8 9.435 8 10.3333 8C11.2317 8 11.6808 8 12.0116 8.20242C12.1959 8.31558 12.3511 8.47075 12.4643 8.65567C12.6667 8.98525 12.6667 9.435 12.6667 10.3333C12.6667 11.2317 12.6667 11.6808 12.4643 12.0116C12.351 12.1959 12.1959 12.351 12.0116 12.4643C11.6808 12.6667 11.2317 12.6667 10.3333 12.6667C9.435 12.6667 8.98583 12.6667 8.65567 12.4643C8.47095 12.3513 8.31563 12.1962 8.20242 12.0116C8 11.6808 8 11.2317 8 10.3333ZM1 3.33333C1 2.435 1 1.98583 1.20242 1.65567C1.31558 1.47075 1.47075 1.31558 1.65567 1.20242C1.98525 1 2.435 1 3.33333 1C4.23167 1 4.68083 1 5.011 1.20242C5.19592 1.31558 5.35108 1.47075 5.46425 1.65567C5.66667 1.98525 5.66667 2.435 5.66667 3.33333C5.66667 4.23167 5.66667 4.68083 5.46425 5.011C5.35108 5.19592 5.19592 5.35108 5.011 5.46425C4.68142 5.66667 4.23167 5.66667 3.33333 5.66667C2.435 5.66667 1.98583 5.66667 1.65567 5.46425C1.47089 5.35111 1.31556 5.19578 1.20242 5.011C1 4.68142 1 4.23167 1 3.33333ZM8 3.33333C8 2.435 8 1.98583 8.20242 1.65567C8.31558 1.47075 8.47075 1.31558 8.65567 1.20242C8.98525 1 9.435 1 10.3333 1C11.2317 1 11.6808 1 12.0116 1.20242C12.1959 1.31558 12.3511 1.47075 12.4643 1.65567C12.6667 1.98525 12.6667 2.435 12.6667 3.33333C12.6667 4.23167 12.6667 4.68083 12.4643 5.011C12.3511 5.19592 12.1959 5.35108 12.0116 5.46425C11.6808 5.66667 11.2317 5.66667 10.3333 5.66667C9.435 5.66667 8.98583 5.66667 8.65567 5.46425C8.47089 5.35111 8.31556 5.19578 8.20242 5.011C8 4.68142 8 4.23167 8 3.33333Z" stroke="currentColor" strokeWidth="0.878906"/>
                  </g>
                  <defs>
                    <clipPath id="clip0_ob_filter">
                      <rect width="13.6667" height="13.6667" fill="white"/>
                    </clipPath>
                  </defs>
                </svg>
                <span style={{ color: "var(--text-muted)", fontWeight: 400 }}>Showing</span>
                {label}
              </span>
            </span>
          </MenuTriggerButton>
          {open && (
            <MenuList>
              {FILTERS.map((f) => (
                <MenuOption
                  key={f}
                  active={f === current}
                  onClick={() => select(f)}
                >
                  {f}
                </MenuOption>
              ))}
            </MenuList>
          )}
        </div>
        <Button variant="primary" size="sm" onClick={() => setModalOpen(true)}>
          + Add Onboarding
        </Button>
      </div>
      <CreateOnboardingModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onCreated={handleOnboardingCreated}
      />
    </>
  );
}
