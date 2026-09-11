import type { CSSProperties } from "react";

/**
 * Render an AI prose string with inline backtick-delimited spans converted
 * into `code-style chips` (.task-ref). The insight prompts ask the model
 * to wrap task title references in backticks; this is the single render
 * helper that turns those into the styled spans.
 */
export interface InlineProseProps {
  text?: string | null;
  className?: string;
  style?: CSSProperties;
}

export default function InlineProse({ text, className, style }: InlineProseProps) {
  if (!text) return null;
  const segments = splitBackticks(text);
  return (
    <span className={className} style={style}>
      {segments.map((seg, i) =>
        seg.code ? (
          <span key={i} className="task-ref">
            {seg.text}
          </span>
        ) : (
          <span key={i}>{seg.text}</span>
        )
      )}
    </span>
  );
}

interface Segment {
  code: boolean;
  text: string;
}

function splitBackticks(text: string): Segment[] {
  const out: Segment[] = [];
  const re = /`([^`]+)`/g;
  let lastIndex = 0;
  let match;
  while ((match = re.exec(text)) !== null) {
    if (match.index > lastIndex) {
      out.push({ code: false, text: text.slice(lastIndex, match.index) });
    }
    out.push({ code: true, text: match[1] });
    lastIndex = re.lastIndex;
  }
  if (lastIndex < text.length) {
    out.push({ code: false, text: text.slice(lastIndex) });
  }
  return out;
}
