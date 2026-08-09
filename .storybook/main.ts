import type { StorybookConfig } from "@storybook/nextjs-vite";

/**
 * Storybook — the DS's contract surface (docs/DS-PLAN.md Phase 4).
 *
 * Doctrine: every officially supported state of a primitive is a NAMED STORY.
 * If the state you need has no story, you're off-road: add the story first.
 * Each component ships alongside a `<Component>.meta.ts` (status / use-when /
 * don't-use-when / a11y notes) rendered into its docs page and greppable by
 * agents as plain TS.
 *
 * `npm run storybook` (dev, port 6006) / `npm run build-storybook` — both
 * pre-run `build:ds` so theme.css always exists.
 */
const config: StorybookConfig = {
  framework: "@storybook/nextjs-vite",
  stories: ["../app/ui/**/*.mdx", "../app/ui/**/*.stories.@(ts|tsx)"],
  addons: [
    "@storybook/addon-docs",
    "@storybook/addon-a11y",
    "storybook-addon-pseudo-states",
  ],
  staticDirs: ["../public"],
};

export default config;
