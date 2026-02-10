"use client";

export function MenuTriggerButton({
  type = "button",
  className = "",
  style,
  children,
  ...rest
}) {
  const baseClassName =
    "flex items-center gap-2 rounded-lg border text-sm font-medium transition-colors";
  const baseStyle = {
    borderColor: "var(--border)",
    background: "var(--surface)",
    color: "var(--text)",
    width: "144px",
    minWidth: "144px",
    paddingLeft: "8px",
    paddingRight: "4px",
    paddingTop: "4px",
    paddingBottom: "4px",
  };

  return (
    <button
      type={type}
      className={`${baseClassName} ${className}`.trim()}
      style={{ ...baseStyle, ...style }}
      {...rest}
    >
      {children}
    </button>
  );
}

export function MenuList({
  role = "listbox",
  className = "",
  style,
  children,
  ...rest
}) {
  const baseClassName =
    "absolute left-0 z-10 rounded-lg border px-1 py-1 shadow-lg flex flex-col gap-1";
  const baseStyle = {
    top: "calc(100% + 4px)",
    background: "var(--bg)",
    borderColor: "var(--border)",
    width: "144px",
    padding: "4px",
  };

  return (
    <div
      role={role}
      className={`${baseClassName} ${className}`.trim()}
      style={{ ...baseStyle, ...style }}
      {...rest}
    >
      {children}
    </div>
  );
}

export function MenuOption({
  type = "button",
  active = false,
  className = "",
  style,
  children,
  ...rest
}) {
  const baseClassName =
    "flex w-full items-center rounded text-left text-sm transition-colors hover:bg-[#211F29]";
  const activeClassName = active ? "bg-[#26242F]" : "";
  const baseStyle = {
    color: active ? "var(--text)" : "var(--text-muted)",
    fontWeight: active ? 600 : 400,
    padding: "4px 8px",
  };

  return (
    <button
      type={type}
      role="option"
      aria-selected={active}
      className={`${baseClassName} ${activeClassName} ${className}`.trim()}
      style={{ ...baseStyle, ...style }}
      {...rest}
    >
      {children}
    </button>
  );
}

