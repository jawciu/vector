"use client";

import { useState, useRef, useEffect } from "react";

export default function PeoplePicker({ value, onChange, placeholder, people }) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState("");
  const containerRef = useRef(null);

  const filteredPeople = people.filter(person =>
    person.toLowerCase().includes(search.toLowerCase())
  );

  useEffect(() => {
    function handleClickOutside(event) {
      if (containerRef.current && !containerRef.current.contains(event.target)) {
        setIsOpen(false);
        setSearch("");
      }
    }

    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [isOpen]);

  function handleSelect(person) {
    onChange(person);
    setIsOpen(false);
    setSearch("");
  }

  return (
    <div ref={containerRef} className="relative">
      <input
        type="text"
        placeholder={placeholder}
        value={isOpen ? search : value}
        onChange={(e) => {
          setSearch(e.target.value);
          if (!isOpen) setIsOpen(true);
        }}
        onFocus={() => setIsOpen(true)}
        className="py-0 px-0 text-sm w-full outline-none transition-colors"
        style={{
          border: "none",
          background: "transparent",
          color: value ? "var(--text)" : "var(--text-muted)",
        }}
      />

      {isOpen && (
        <div
          className="absolute left-0 right-0 mt-1 rounded-lg overflow-hidden z-10"
          style={{
            background: "var(--bg-elevated)",
            border: "1px solid var(--border)",
            maxHeight: "200px",
            overflowY: "auto",
            boxShadow: "0 4px 12px rgba(0, 0, 0, 0.3)",
          }}
        >
          {filteredPeople.length > 0 ? (
            filteredPeople.map((person, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => handleSelect(person)}
                className="w-full text-left px-3 py-2 text-sm transition-colors"
                style={{
                  color: "var(--text)",
                  background: "transparent",
                  border: "none",
                }}
                onMouseEnter={(e) => e.target.style.background = "var(--surface)"}
                onMouseLeave={(e) => e.target.style.background = "transparent"}
              >
                {person}
              </button>
            ))
          ) : (
            <div className="px-3 py-2 text-sm" style={{ color: "var(--text-muted)" }}>
              {search ? `No matches. Press Enter to add "${search}"` : "Start typing..."}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
