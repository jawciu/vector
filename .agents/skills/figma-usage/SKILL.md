---
name: figma-usage
description: Fetch design context, icons, assets, and layout data from Figma using the Figma MCP server. Use when the user mentions Figma, shares a Figma link, asks to implement a design, extract an icon or asset from Figma, or convert a Figma frame to code.
---

# Figma MCP Usage

## Overview

The Figma remote MCP server connects Figma files to the agent via the Model Context Protocol. It is link-based — the user provides a Figma URL containing a `node-id` and the agent calls MCP tools to fetch structured design data, screenshots, and assets.

## Available MCP tools

| Tool | Purpose |
|------|---------|
| `get_design_context` | Fetch structured layout, styles, and code representation (default: React + Tailwind) for a Figma node |
| `get_screenshot` | Get a visual screenshot of a Figma node for reference |
| `get_metadata` | Get sparse XML with layer IDs, names, types, positions, sizes — useful for large designs |
| `get_variable_defs` | Get design tokens (colors, spacing, typography) used in the selection |
| `get_code_connect_map` | Get mappings between Figma node IDs and codebase components |
| `add_code_connect_map` | Add a mapping between a Figma node and a code component |
| `get_code_connect_suggestions` | Discover suggested Code Connect mappings |
| `send_code_connect_mappings` | Confirm suggested Code Connect mappings |
| `create_design_system_rules` | Generate a rule file for design-to-code translation |
| `whoami` | Check the authenticated Figma user |

## Required workflow for design-to-code

Follow these steps in order — do not skip:

1. **`get_design_context`** — fetch the structured representation for the Figma node URL the user provided
2. If the response is too large or truncated, use **`get_metadata`** first to get the node map, then re-fetch only the needed nodes with `get_design_context`
3. **`get_screenshot`** — get a visual reference to validate against
4. Download any assets returned (images, SVGs) before starting implementation
5. **Implement** — translate the output into this project's conventions (see below)
6. **Validate** against the Figma screenshot for 1:1 visual parity

## Extracting a single icon or SVG asset

When the user wants a specific icon from Figma:

1. Ask the user for the **Figma link** to the icon frame/component (they can right-click > Copy link, or select and press `Cmd+L` in Figma)
2. Call `get_design_context` with the provided Figma URL
3. The response will include SVG data or a localhost asset URL for the icon
4. **Use the SVG/asset directly** — do NOT install icon packages or create placeholders
5. Convert the SVG to JSX if embedding inline in a React component (rename attributes: `stroke-width` → `strokeWidth`, `fill-rule` → `fillRule`, etc.)

## Asset rules

- If the Figma MCP server returns a **localhost source** for an image or SVG, use that source directly
- Do **NOT** import or add new icon packages — all assets should come from the Figma payload
- Do **NOT** create placeholder images if a real source is provided

## Project conventions (this codebase)

When translating Figma output into code for this project:

- **Framework**: Next.js (App Router) with React
- **Styling**: Tailwind CSS v4 via `@import "tailwindcss"` in `app/globals.css`
- **Color tokens**: Use CSS custom properties from `globals.css` (e.g. `var(--text)`, `var(--surface)`, `var(--border)`)
- **Components**: placed in `app/components/`
- **Inline styles**: used for dynamic values and CSS variable references (e.g. `style={{ color: "var(--text)" }}`)
- Replace hardcoded colors with the closest project CSS variable
- Reuse existing components when possible
- Keep SVG icons inline in JSX (no separate icon files unless requested)

## Example prompts

| What you want | What to say |
|---|---|
| Implement a full frame | "Implement this Figma design: [paste Figma URL]" |
| Extract an icon | "Get the icon from this Figma frame and add it to the filter button: [paste Figma URL]" |
| Get design tokens | "What color and spacing variables are used in this Figma selection? [paste Figma URL]" |
| Check connection | "Run whoami on the Figma MCP to verify I'm connected" |

## Troubleshooting

- **MCP not connected**: Check Cursor Settings > MCP — Figma should show a green dot. If red, toggle it off/on and ensure you've authenticated via OAuth
- **"Node not found"**: The Figma URL must point to a specific frame or layer. Copy the link directly from Figma (right-click > Copy link)
- **Truncated output**: Use `get_metadata` first to get the node tree, then call `get_design_context` on individual sub-nodes
