import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import vector from "./eslint-rules/index.mjs";

// Design-system enforcement (docs/DS-PLAN.md Phase 3).
// Severity strategy: WARN in feature code (the PostToolUse eslint hook shows
// warnings to agents on every edit, so they self-correct without a
// thousand-error CI wall while the retrofit is in flight), ERROR in the DS
// layer itself. Ratcheted to error per-directory as the retrofit lands
// (Phases 7-8); the audit script's --baseline mode is the repo-wide gate.
const eslintConfig = defineConfig([
  ...nextVitals,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Ignore generated Prisma files:
    "lib/generated/**",
  ]),

  // DS token rules — everywhere UI code lives.
  {
    files: ["app/**/*.{js,jsx,ts,tsx}"],
    ignores: ["app/api/**"],
    plugins: { vector },
    rules: {
      "vector/no-raw-color": "warn",
      "vector/no-arbitrary-tailwind": "warn",
    },
  },

  // The DS layer holds itself to error.
  {
    files: ["app/ui/**"],
    rules: {
      "vector/no-raw-color": "error",
      "vector/no-arbitrary-tailwind": "error",
    },
  },

  // Feature code should reach for the primitives, not raw elements.
  // app/ui is exempt (wrapping raw elements is a primitive's job), as is
  // Menu.js (a de-facto primitive; moves into app/ui in DS-PLAN Phase 5).
  {
    files: ["app/**/*.{js,jsx,ts,tsx}"],
    ignores: ["app/api/**", "app/ui/**", "app/components/Menu.js"],
    rules: {
      "no-restricted-syntax": [
        "warn",
        {
          selector: 'JSXOpeningElement[name.name="button"]',
          message:
            "Use <Button> or <IconButton> from app/ui instead of a raw <button> (eslint-disable with a reason if genuinely bespoke).",
        },
        {
          selector: 'JSXOpeningElement[name.name=/^(input|textarea|select)$/]',
          message:
            "Form controls should use the app/ui Field primitives once they exist (DS-PLAN Phase 5); until then, prefer the .search-input pattern and expect this call site to be retrofitted.",
        },
      ],
    },
  },
]);

export default eslintConfig;
