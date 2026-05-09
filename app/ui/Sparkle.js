/**
 * Vector AI sparkle — the single source of truth for the gradient
 * 4-point star used everywhere Vector "speaks". Every surface that
 * renders an AI-attribution sparkle (insight cards, draft cards, task
 * drawer follow-up button, follow-up modal, inline generating
 * indicator) MUST import this component so the gradient stays
 * identical across the app.
 *
 * The gradient mirrors `aiGradientFrom` / `aiGradientTo` in DESIGN.md
 * and runs vertically across the bounding box (top tip = pure lilac,
 * bottom tip = pure peach). SVG `<stop>` doesn't reliably resolve CSS
 * custom properties across all browsers, so the values are inlined.
 *
 * `size` defaults to 16; pass smaller values for compact contexts
 * (e.g. inline-text indicators). The viewBox is fixed at 14×14, so
 * the gradient maps consistently regardless of render size.
 */
export default function Sparkle({ size = 16, className, style }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 14 14"
      fill="none"
      aria-hidden="true"
      className={className}
      style={style}
    >
      <defs>
        <linearGradient
          id="vector-sparkle-gradient"
          x1="7"
          y1="-3"
          x2="7"
          y2="15"
          gradientUnits="userSpaceOnUse"
        >
          <stop offset="0" stopColor="#C098FF" />
          <stop offset="1" stopColor="#FF9C7D" />
        </linearGradient>
      </defs>
      <path
        d="M7 1L8.5 5.5L13 7L8.5 8.5L7 13L5.5 8.5L1 7L5.5 5.5L7 1Z"
        fill="url(#vector-sparkle-gradient)"
      />
    </svg>
  );
}
