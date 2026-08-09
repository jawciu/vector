import * as React from "react";
import type { Preview } from "@storybook/nextjs-vite";
// The app's real CSS: Tailwind + generated @theme tokens + component classes.
import "../app/globals.css";

/**
 * Stories render on Vector's real dark background with the real token CSS.
 * The app's Geist fonts load via next/font in app/layout.js, which Storybook
 * doesn't run — so the --font-geist-sans/mono variables are mapped to local
 * Geist (if installed) with the same fallback stack the app uses.
 */
const fontVars: React.CSSProperties = {
  ["--font-geist-sans" as string]: "Geist, 'Geist Fallback', system-ui, sans-serif",
  ["--font-geist-mono" as string]: "'Geist Mono', ui-monospace, monospace",
};

const preview: Preview = {
  parameters: {
    backgrounds: {
      options: {
        bg: { name: "bg (app background)", value: "#18181e" },
        bgElevated: { name: "bg-elevated (cards)", value: "#1d1c24" },
      },
    },
    a11y: {
      // Fail stories on serious/critical violations in the a11y panel.
      test: "error",
    },
    docs: { toc: true },
    layout: "centered",
  },
  initialGlobals: {
    backgrounds: { value: "bg" },
  },
  decorators: [
    (Story) => (
      <div style={{ ...fontVars, fontFamily: "var(--font-geist-sans)", color: "var(--text)" }}>
        <Story />
      </div>
    ),
  ],
};

export default preview;
