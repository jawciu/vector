export default function IconButton({ onClick, isActive, disabled, "aria-label": ariaLabel, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={ariaLabel}
      className={`icon-btn flex items-center justify-center w-5 h-5 rounded${isActive ? " icon-btn--active" : ""}`}
    >
      {children}
    </button>
  );
}
