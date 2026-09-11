import * as React from "react";
import type { Decorator, Preview } from "@storybook/nextjs-vite";
import { addons, useEffect } from "storybook/preview-api";
import { UPDATE_GLOBALS } from "storybook/internal/core-events";
// The app's real CSS: Tailwind + generated @theme tokens + component classes.
import "../app/globals.css";

/**
 * Pseudo-state leak guard (Caroline's review, 2026-08: "AllVariants is in
 * focus state", "IconButton default has a background").
 *
 * Root cause, in storybook-addon-pseudo-states@10.5.7 (dist/_browser-chunks/
 * chunk-HQKSJ4TK.js, `withPseudoState`): when a story declares
 * `parameters.pseudo`, the addon copies that config into Storybook GLOBALS
 * (`channel.emit(UPDATE_GLOBALS, { globals: { pseudo: config } })`) so its
 * toolbar reflects it — and `applyParameter` prefers `globals` over the
 * current story's parameter. Globals persist across story navigation and are
 * only cleared by the toolbar's "Reset pseudo states", so after viewing e.g.
 * Button/FocusVisible, EVERY later story of ANY component renders with
 * `pseudo-focus-visible-all` on the root: AllVariants grids show focus rings,
 * IconButton's Default shows a hover/active fill, and so on.
 *
 * The guard: remember (module flag) that the previous story put pseudo state
 * into globals via its parameters; when the next story has NO pseudo
 * parameter, reset globals.pseudo to `false` — the addon's own initialGlobals
 * value, which makes it fall back to per-story parameters everywhere
 * (including docs previews). A pseudo state picked manually from the toolbar
 * is NOT touched: the flag is only set by parameter-driven stories.
 */
let pseudoCameFromParameters = false;

const withPseudoGlobalsReset: Decorator = (Story, context) => {
  const pseudoParameter =
    (context.parameters.pseudo as Record<string, unknown> | undefined) ?? {};
  const hasPseudoParameter = Object.keys(pseudoParameter).some(
    (key) => key !== "rootSelector",
  );
  // Only emit while a pseudo global is actually set: on docs pages every story
  // renders together and an unconditional emit re-renders the page forever.
  const pseudoGlobalSet = Boolean(context.globals.pseudo);
  // eslint-disable-next-line react-hooks/rules-of-hooks -- storybook/preview-api's useEffect (Storybook's decorator hook system, the same pattern the addon itself uses), not React's; decorators aren't React components.
  useEffect(() => {
    if (hasPseudoParameter) {
      pseudoCameFromParameters = true;
    } else if (pseudoCameFromParameters && pseudoGlobalSet) {
      pseudoCameFromParameters = false;
      addons.getChannel().emit(UPDATE_GLOBALS, { globals: { pseudo: false } });
    }
  });
  return <Story />;
};

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
    options: {
      // Foundations (app/ui/docs/*.mdx) first, then the component entries in
      // alphabetical order. Without this the sidebar follows import order.
      storySort: {
        order: [
          "Foundations",
          ["Colours", "Typography", "Spacing & radius", "Motion", "Voice & copy"],
          "*",
        ],
      },
    },
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
    withPseudoGlobalsReset,
    (Story) => (
      <div style={{ ...fontVars, fontFamily: "var(--font-geist-sans)", color: "var(--text)" }}>
        <Story />
      </div>
    ),
  ],
};

export default preview;
