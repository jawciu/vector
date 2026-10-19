import { afterEach, describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import UnmatchedEvents from "./UnmatchedEvents";

const originalFormat = Date.prototype.toLocaleString;
const events = [{ id: 1, payload: { meeting: {
  title: "Timezone review", date: "2026-08-07T18:12:00Z", action_items: ["Review the draft"],
} } }];

function initialMarkup(defaultTimeZone: string) {
  // Emulate the actual Intl defaults of the server and browser while keeping
  // an explicit timezone supplied by the component authoritative.
  const format = vi.spyOn(Date.prototype, "toLocaleString").mockImplementation(function (this: Date, locales, options) {
    return originalFormat.call(this, locales, { timeZone: defaultTimeZone, ...options });
  });
  try {
    return renderToStaticMarkup(createElement(UnmatchedEvents, { initialEvents: events, onboardings: [] }));
  } finally { format.mockRestore(); }
}

afterEach(() => vi.restoreAllMocks());

describe("unmatched meeting initial render", () => {
  it("produces the same initial date text across server and browser timezones", () => {
    expect(initialMarkup("UTC")).toEqual(initialMarkup("Europe/London"));
  });
});
