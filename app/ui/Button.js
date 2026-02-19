"use client";

/**
 * Button — DS primitive
 *
 * Variants:
 *   primary  — solid purple action button
 *
 * Sizes:
 *   xs  — compact inline (py-0.5 px-2 text-xs)
 *   sm  — default (py-1 px-2 text-sm)
 */
const SIZE_CLASSES = {
  xs: "py-0.5 px-2 text-xs",
  sm: "py-1 px-2 text-sm",
};

export default function Button({
  variant = "primary",
  size = "sm",
  children,
  className = "",
  ...props
}) {
  if (variant === "primary") {
    return (
      <button
        type="button"
        className={`btn-primary flex items-center gap-2 rounded-lg font-semibold ${SIZE_CLASSES[size]} ${className}`}
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
