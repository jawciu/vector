"use client";

import { useState, useEffect, useRef, useCallback } from "react";

/**
 * "Draft follow-up with Vector" modal — opens from the task drawer.
 * User picks a tone (friendly / firmer / escalation), Vector streams a
 * subject + body, user copies it into their email tool.
 *
 * Vector NEVER auto-sends. The modal is purely a drafting helper.
 *
 * Props:
 *   open        — whether the modal is visible
 *   onClose     — callback to close
 *   taskId      — required to call the API
 *   taskTitle   — for the modal header (purely cosmetic)
 */
export default function FollowUpModal({ open, onClose, taskId, taskTitle }) {
  const [tone, setTone] = useState("friendly");
  const [streaming, setStreaming] = useState(false);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [error, setError] = useState(null);
  const [streamedText, setStreamedText] = useState("");
  const [copied, setCopied] = useState(null);
  const abortRef = useRef(null);

  const reset = useCallback(() => {
    setSubject("");
    setBody("");
    setStreamedText("");
    setError(null);
    setCopied(null);
  }, []);

  // Close on Escape.
  useEffect(() => {
    if (!open) return;
    function handleKey(e) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [open, onClose]);

  // Reset on close so the next open is fresh.
  useEffect(() => {
    if (!open) {
      reset();
      if (abortRef.current) {
        abortRef.current.abort();
        abortRef.current = null;
      }
    }
  }, [open, reset]);

  const generate = useCallback(async (chosenTone) => {
    if (streaming) return;
    reset();
    setStreaming(true);

    const ac = new AbortController();
    abortRef.current = ac;

    let res;
    try {
      res = await fetch(`/api/tasks/${taskId}/follow-up?tone=${encodeURIComponent(chosenTone)}`, {
        method: "POST",
        signal: ac.signal,
      });
    } catch (err) {
      if (err.name === "AbortError") return;
      setError(`Network error: ${err.message}`);
      setStreaming(false);
      return;
    }

    if (!res.ok || !res.body) {
      const errBody = await res.text().catch(() => "");
      setError(`Generate failed (${res.status}): ${errBody}`);
      setStreaming(false);
      return;
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let finalPayload = null;

    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let idx;
        while ((idx = buffer.indexOf("\n\n")) !== -1) {
          const raw = buffer.slice(0, idx).trim();
          buffer = buffer.slice(idx + 2);
          if (!raw.startsWith("data:")) continue;
          let event;
          try {
            event = JSON.parse(raw.slice(5).trim());
          } catch {
            continue;
          }
          if (event.delta) {
            setStreamedText((prev) => prev + event.delta);
          } else if (event.done) {
            finalPayload = event.payload;
          } else if (event.error) {
            setError(event.error);
            setStreaming(false);
            return;
          }
        }
      }
    } catch (err) {
      if (err.name !== "AbortError") {
        setError(`Stream error: ${err.message}`);
      }
      setStreaming(false);
      return;
    }

    if (finalPayload) {
      setSubject(finalPayload.subject ?? "");
      setBody(finalPayload.body ?? "");
    }
    setStreaming(false);
    abortRef.current = null;
  }, [taskId, streaming, reset]);

  // Auto-generate on first open with default tone.
  useEffect(() => {
    if (open && !subject && !body && !streaming && !error) {
      generate(tone);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  function handleToneChange(newTone) {
    if (streaming) return;
    setTone(newTone);
    generate(newTone);
  }

  function handleCopy(text, key) {
    if (!text) return;
    navigator.clipboard?.writeText(text).then(() => {
      setCopied(key);
      setTimeout(() => setCopied((c) => (c === key ? null : c)), 1500);
    });
  }

  const showStreamingPreview = streaming && !subject;
  const previewSubject = showStreamingPreview ? extractField(streamedText, "subject") : null;
  const previewBody = showStreamingPreview ? extractField(streamedText, "body") : null;

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: "rgba(0, 0, 0, 0.6)" }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="rounded-xl flex flex-col"
        style={{
          width: "90%",
          maxWidth: 640,
          maxHeight: "90vh",
          background: "var(--bg-elevated)",
          border: "1px solid var(--border)",
        }}
      >
        {/* Header */}
        <div
          style={{
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "space-between",
            padding: "16px 20px",
            borderBottom: "1px solid var(--border)",
            gap: 12,
          }}
        >
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2 }}>
              <SparkleIcon />
              <span style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: 0.6, color: "var(--text-muted)" }}>
                Vector — draft follow-up
              </span>
            </div>
            <h2 style={{ fontSize: 16, fontWeight: 600, color: "var(--text)", margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {taskTitle ?? "Follow-up"}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            style={{
              width: 28, height: 28, borderRadius: 6,
              background: "transparent", border: "none",
              color: "var(--text-muted)", cursor: "pointer",
              display: "inline-flex", alignItems: "center", justifyContent: "center",
              flexShrink: 0,
            }}
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M1 1L13 13M1 13L13 1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        {/* Tone tabs */}
        <div style={{ padding: "12px 20px", borderBottom: "1px solid var(--border-subtle)" }}>
          <div style={{ display: "flex", gap: 6 }}>
            {[
              { key: "friendly", label: "Friendly nudge", desc: "Warm check-in" },
              { key: "firmer", label: "Firmer reminder", desc: "Direct, asks for a date" },
              { key: "escalation", label: "Escalation", desc: "Loop in a sponsor" },
            ].map((t) => (
              <button
                key={t.key}
                onClick={() => handleToneChange(t.key)}
                disabled={streaming}
                style={{
                  flex: 1,
                  padding: "8px 10px",
                  fontSize: 12,
                  textAlign: "left",
                  border: `1px solid ${tone === t.key ? "var(--action)" : "var(--border)"}`,
                  background: tone === t.key ? "var(--surface-hover)" : "var(--surface)",
                  color: tone === t.key ? "var(--text)" : "var(--text-secondary)",
                  borderRadius: 8,
                  cursor: streaming ? "default" : "pointer",
                  opacity: streaming ? 0.6 : 1,
                  display: "flex",
                  flexDirection: "column",
                  gap: 2,
                }}
              >
                <span style={{ fontWeight: 500 }}>{t.label}</span>
                <span style={{ fontSize: 11, color: "var(--text-muted)", fontWeight: 400 }}>{t.desc}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Body — streaming or final */}
        <div style={{ padding: "16px 20px", overflow: "auto", flex: 1, display: "flex", flexDirection: "column", gap: 16 }}>
          {error && (
            <div
              style={{
                fontSize: 13,
                color: "var(--danger)",
                background: "rgba(255, 137, 155, 0.1)",
                padding: "8px 12px",
                borderRadius: 6,
              }}
            >
              {error}
            </div>
          )}

          {/* Subject */}
          <Field label="Subject" onCopy={() => handleCopy(subject || previewSubject || "", "subject")} copied={copied === "subject"} disabled={streaming}>
            <input
              type="text"
              value={streaming ? (previewSubject ?? "") : subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder={streaming ? "Vector is writing…" : "Subject"}
              readOnly={streaming}
              style={{
                width: "100%",
                padding: "8px 12px",
                fontSize: 13,
                background: "var(--bg)",
                color: "var(--text)",
                border: "1px solid var(--border)",
                borderRadius: 6,
                outline: "none",
              }}
            />
          </Field>

          {/* Body */}
          <Field label="Body" onCopy={() => handleCopy(body || previewBody || "", "body")} copied={copied === "body"} disabled={streaming}>
            <textarea
              value={streaming ? (previewBody ?? "") : body}
              onChange={(e) => setBody(e.target.value)}
              placeholder={streaming ? "Vector is writing…" : "Body"}
              readOnly={streaming}
              rows={10}
              style={{
                width: "100%",
                padding: "10px 12px",
                fontSize: 13,
                lineHeight: 1.6,
                background: "var(--bg)",
                color: "var(--text)",
                border: "1px solid var(--border)",
                borderRadius: 6,
                outline: "none",
                fontFamily: "inherit",
                resize: "vertical",
              }}
            />
          </Field>
        </div>

        {/* Footer */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "12px 20px",
            borderTop: "1px solid var(--border)",
            gap: 8,
          }}
        >
          <span style={{ fontSize: 11, color: "var(--text-muted)" }}>
            Vector never sends. Copy and paste into your email tool.
          </span>
          <div style={{ display: "flex", gap: 8 }}>
            <button
              onClick={() => generate(tone)}
              disabled={streaming}
              className="btn-secondary text-sm rounded-lg"
              style={{ padding: "4px 12px", fontSize: 13, opacity: streaming ? 0.5 : 1 }}
            >
              {streaming ? "…" : "↻ Regenerate"}
            </button>
            <button
              onClick={() => handleCopy(`Subject: ${subject}\n\n${body}`, "all")}
              disabled={streaming || (!subject && !body)}
              className="btn-primary text-sm rounded-lg"
              style={{ padding: "4px 14px", fontSize: 13, fontWeight: 600, opacity: streaming || (!subject && !body) ? 0.5 : 1 }}
            >
              {copied === "all" ? "Copied!" : "Copy all"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Field({ label, onCopy, copied, disabled, children }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span style={{ fontSize: 11, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: 0.5, fontWeight: 600 }}>
          {label}
        </span>
        <button
          onClick={onCopy}
          disabled={disabled}
          style={{
            fontSize: 11,
            color: copied ? "var(--action)" : "var(--text-muted)",
            background: "transparent",
            border: "none",
            cursor: disabled ? "default" : "pointer",
            padding: 0,
          }}
        >
          {copied ? "Copied!" : "Copy"}
        </button>
      </div>
      {children}
    </div>
  );
}

function SparkleIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 14 14" fill="currentColor" style={{ color: "var(--action)" }}>
      <path d="M7 1L8.5 5.5L13 7L8.5 8.5L7 13L5.5 8.5L1 7L5.5 5.5L7 1Z" />
    </svg>
  );
}

function extractField(text, key) {
  const re = new RegExp(`"${key}"\\s*:\\s*"((?:[^"\\\\]|\\\\.)*)`);
  const m = text.match(re);
  if (!m) return null;
  // Unescape JSON string escapes that might appear mid-stream
  try {
    return JSON.parse(`"${m[1]}"`);
  } catch {
    return m[1];
  }
}
