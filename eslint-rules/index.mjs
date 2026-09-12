/**
 * Vector's design-system lint rules (inline flat-config plugin — imported by
 * eslint.config.mjs as `plugins: { vector }`, no published package).
 *
 * These are Layer-3 enforcement in the DS's four-layer model (see
 * docs/DS-PLAN.md): a broken rule should be a red squiggle, not a doc an
 * agent may or may not have read. The PostToolUse hook runs eslint on every
 * agent edit, so violations surface immediately and agents self-correct.
 *
 * Escape hatch: `// eslint-disable-next-line vector/<rule> -- <reason>` with
 * a real reason (see app/ui/Sparkle.js for the pattern).
 */

const HEX_OR_RGB = /#[0-9a-fA-F]{3,8}\b|rgba?\(/;

function checkText(context, node, text) {
  if (HEX_OR_RGB.test(text)) {
    context.report({
      node,
      messageId: "rawColor",
    });
  }
}

const noRawColor = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Colours come from DESIGN.md tokens: use a utility class (bg-action, text-muted) or var(--token). Raw hex / rgb() literals bypass the design system.",
    },
    messages: {
      rawColor:
        "Raw colour literal. Use a token utility (bg-action, text-muted, …) or var(--token) from DESIGN.md. If this colour genuinely cannot be a token, eslint-disable with a reason.",
    },
    schema: [],
  },
  create(context) {
    return {
      Literal(node) {
        if (typeof node.value === "string") checkText(context, node, node.value);
      },
      TemplateElement(node) {
        checkText(context, node, node.value.raw);
      },
    };
  },
};

// Arbitrary Tailwind values like p-[13px], bg-[#fff], w-[437px]: off-scale
// one-offs that dodge both the spacing scale and the colour tokens.
const ARBITRARY = /[\w-]-\[(#[0-9a-fA-F]{3,8}|\d[\d.]*(px|rem|vh|vw|%))\]/;

const noArbitraryTailwind = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Arbitrary Tailwind values ([13px], [#fff]) bypass the token scales. Use scale utilities or a DESIGN.md token.",
    },
    messages: {
      arbitrary:
        "Arbitrary Tailwind value bypasses the token scales. Use a scale utility (p-3, rounded-lg) or a DESIGN.md token; eslint-disable with a reason if the value is genuinely one-off.",
    },
    schema: [],
  },
  create(context) {
    return {
      Literal(node) {
        if (typeof node.value === "string" && ARBITRARY.test(node.value)) {
          context.report({ node, messageId: "arbitrary" });
        }
      },
      TemplateElement(node) {
        if (ARBITRARY.test(node.value.raw)) {
          context.report({ node, messageId: "arbitrary" });
        }
      },
    };
  },
};

// Any HOST element (lowercase tag) that hand-copies the `.icon-btn` skin.
// The raw-<button> rule in eslint.config.mjs never saw the icon-only LINKS
// (an <a className="icon-btn …">), which is how two download links drifted
// out of the DS. IconButton renders `href` as an <a> itself, so a call site
// never needs the class string. Only DIRECT string/template className values
// are inspected, so IconButton's own cn(...) call is untouched.
const ICON_BTN = /(^|\s)icon-btn(\s|$|--)/;

function classNameText(value) {
  if (!value) return null;
  if (value.type === "Literal") return typeof value.value === "string" ? value.value : null;
  if (value.type === "JSXExpressionContainer" && value.expression.type === "TemplateLiteral") {
    return value.expression.quasis.map((q) => q.value.raw).join(" ");
  }
  return null;
}

const noRawIconButton = {
  meta: {
    type: "problem",
    docs: {
      description:
        "The .icon-btn skin belongs to app/ui/IconButton. Use the primitive (pass `href` for an icon-only link) instead of copying its classes onto a raw element.",
    },
    messages: {
      rawIconButton:
        "Element hand-copies the .icon-btn skin. Use <IconButton> from app/ui — pass `href` for an icon-only link or download; eslint-disable with a reason if genuinely bespoke.",
    },
    schema: [],
  },
  create(context) {
    return {
      JSXOpeningElement(node) {
        // Host elements only: <IconButton> and friends are components.
        if (node.name.type !== "JSXIdentifier") return;
        if (!/^[a-z]/.test(node.name.name)) return;
        for (const attr of node.attributes) {
          if (attr.type !== "JSXAttribute" || attr.name.name !== "className") continue;
          const text = classNameText(attr.value);
          if (text && ICON_BTN.test(text)) {
            context.report({ node: attr, messageId: "rawIconButton" });
          }
        }
      },
    };
  },
};

const vector = {
  rules: {
    "no-raw-color": noRawColor,
    "no-arbitrary-tailwind": noArbitraryTailwind,
    "no-raw-icon-button": noRawIconButton,
  },
};

export default vector;
