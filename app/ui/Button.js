"use client";

/**
 * Button — DS primitive
 *
 * Variants:
 *   primary     — solid purple action button
 *   secondary   — bordered surface button
 *   tertiary    — bare label, no fill or border (dismiss, cancel, edit)
 *   destructive — solid danger button (delete, revoke)
 *   text        — inline text-only button (use with `tone`)
 *
 * Sizes (primary | secondary | destructive only):
 *   xs  — compact inline (py-0.5 px-2 text-xs)
 *   sm  — default (py-1 px-2 text-sm)
 *
 * Tone (text variant only):
 *   action  — purple (default)
 *   danger  — red/pink
 */
const SIZE_CLASSES = {
  xs: "py-0.5 px-2 text-xs",
  sm: "py-1 px-2 text-sm",
};

const SOLID_BASE = "flex items-center gap-2 rounded-lg";

export default function Button({
  variant = "primary",
  size = "sm",
  tone = "action",
  children,
  className = "",
  ...props
}) {
  if (variant === "primary") {
    return (
      <button
        type="button"
        className={`btn-primary ${SOLID_BASE} font-semibold ${SIZE_CLASSES[size]} ${className}`}
        {...props}
      >
        {children}
      </button>
    );
  }

  if (variant === "secondary") {
    return (
      <button
        type="button"
        className={`btn-secondary ${SOLID_BASE} font-normal ${SIZE_CLASSES[size]} ${className}`}
        {...props}
      >
        {children}
      </button>
    );
  }

  if (variant === "tertiary") {
    return (
      <button
        type="button"
        className={`btn-tertiary ${SOLID_BASE} font-normal ${SIZE_CLASSES[size]} ${className}`}
        {...props}
      >
        {children}
      </button>
    );
  }

  if (variant === "destructive") {
    return (
      <button
        type="button"
        className={`btn-destructive ${SOLID_BASE} font-semibold ${SIZE_CLASSES[size]} ${className}`}
        {...props}
      >
        {children}
      </button>
    );
  }

  if (variant === "text") {
    const toneClass = tone === "danger" ? "text-btn-danger" : "text-btn-action";
    return (
      <button
        type="button"
        className={`text-btn ${toneClass} ${className}`}
        {...props}
      >
        {children}
      </button>
    );
  }

  return (
    <button type="button" className={className} {...props}>
      {children}
    </button>
  );
}
