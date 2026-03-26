"use client";

import { useState } from "react";

function formatExpiry(dateStr) {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = date - now;
  if (diffMs <= 0) return "Expired";
  const days = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
  if (days === 1) return "Expires tomorrow";
  return `Expires in ${days} days`;
}

export default function MagicLinkActions({ contactId, onboardingId, magicLinks }) {
  const [links, setLinks] = useState(magicLinks);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  const activeLink = links.find((l) => !l.revokedAt && new Date(l.expiresAt) > new Date());

  async function handleGenerate(e) {
    e.stopPropagation();
    setLoading(true);
    try {
      const res = await fetch(`/api/onboardings/${onboardingId}/magic-links`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contactId }),
      });
      if (!res.ok) throw new Error("Failed to generate link");
      const newLink = await res.json();
      // New link replaces any previous active ones (backend revokes old ones)
      setLinks((prev) =>
        prev.map((l) => (l.revokedAt ? l : { ...l, revokedAt: new Date().toISOString() }))
          .concat(newLink)
      );
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  async function handleCopy(e) {
    e.stopPropagation();
    if (!activeLink) return;
    const url = `${window.location.origin}/api/portal/auth?token=${activeLink.token}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback for non-secure contexts
      const input = document.createElement("input");
      input.value = url;
      document.body.appendChild(input);
      input.select();
      document.execCommand("copy");
      document.body.removeChild(input);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }

  async function handleRevoke(e) {
    e.stopPropagation();
    if (!activeLink) return;
    setLoading(true);
    try {
      const res = await fetch(
        `/api/onboardings/${onboardingId}/magic-links/${activeLink.id}`,
        { method: "PATCH" }
      );
      if (!res.ok) throw new Error("Failed to revoke link");
      setLinks((prev) =>
        prev.map((l) =>
          l.id === activeLink.id ? { ...l, revokedAt: new Date().toISOString() } : l
        )
      );
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  if (activeLink) {
    return (
      <div
        className="flex items-center gap-1.5 mt-1"
        onClick={(e) => e.stopPropagation()}
      >
        <span
          className="text-[10px]"
          style={{ color: "var(--success)" }}
        >
          Portal active
        </span>
        <span className="text-[10px]" style={{ color: "var(--text-muted)" }}>
          · {formatExpiry(activeLink.expiresAt)}
        </span>
        <button
          onClick={handleCopy}
          disabled={loading}
          className="text-[10px] font-medium ml-auto"
          style={{ color: "var(--action)", background: "none", border: "none", cursor: "pointer" }}
        >
          {copied ? "Copied!" : "Copy link"}
        </button>
        <button
          onClick={handleRevoke}
          disabled={loading}
          className="text-[10px] font-medium"
          style={{ color: "var(--danger)", background: "none", border: "none", cursor: "pointer" }}
        >
          Revoke
        </button>
      </div>
    );
  }

  return (
    <div
      className="mt-1"
      onClick={(e) => e.stopPropagation()}
    >
      <button
        onClick={handleGenerate}
        disabled={loading}
        className="text-sm font-medium"
        style={{ color: "var(--action)", background: "none", border: "none", cursor: "pointer" }}
      >
        {loading ? "Generating…" : "Generate portal link"}
      </button>
    </div>
  );
}
