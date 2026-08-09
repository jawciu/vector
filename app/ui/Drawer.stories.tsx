import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import type { ComponentType, ReactNode } from "react";
import { useState } from "react";
import { expect, fn, userEvent, within } from "storybook/test";
import DrawerJs from "./Drawer";
import Button from "./Button";
import { dsMetaDescription } from "./ds-meta";
import { meta as dsMeta } from "./Drawer.meta";

/**
 * Drawer stays .js this phase, so TS infers its destructured props as
 * required `any`s. This interface restates the REAL API (from the component's
 * JSDoc) purely for story typing; delete it when Drawer converts to TSX.
 */
interface DrawerProps {
  open?: boolean;
  onClose?: () => void;
  /** px, default 520 */
  width?: number;
  /** px from viewport top, default 44 (clears the global nav) */
  topOffset?: number;
  /** default true; pass false when the parent owns outside-click logic */
  useClickOutside?: boolean;
  /** default true — the built-in chevron-back close button */
  closeButton?: boolean;
  className?: string;
  /** default var(--deeper-bg) */
  background?: string;
  children?: ReactNode;
}
const Drawer = DrawerJs as unknown as ComponentType<DrawerProps>;

/** Realistic drawer contents — a TaskDrawer-shaped body, not a lorem block. */
function DrawerBody() {
  return (
    <div style={{ padding: "24px 24px 16px", overflowY: "auto" }}>
      <h2 style={{ margin: 0, fontSize: 18, fontWeight: 600, color: "var(--text)" }}>
        Configure SSO for pilot users
      </h2>
      <p style={{ marginTop: 12, fontSize: 14, lineHeight: 1.5, color: "var(--text-muted)" }}>
        The customer&apos;s IT team needs the SAML metadata and a test account
        before the pilot cohort can log in. Certificate exchange is done; the
        remaining step is mapping their AD groups to Vector roles.
      </p>
      <p style={{ marginTop: 8, fontSize: 14, lineHeight: 1.5, color: "var(--text-muted)" }}>
        Blocked on a reply from their identity admin since Tuesday. If nothing
        lands by Thursday, escalate through the champion.
      </p>
    </div>
  );
}

/**
 * Fixed-position shell (right edge, fills to the bottom) — stories run
 * fullscreen so the panel isn't fighting the centered-layout wrapper.
 * The component stays mounted while `open` toggles (the slide animation
 * needs DOM presence) — see ClosedChildrenStillMounted for the honest
 * consequence of that.
 */
const config: Meta<typeof Drawer> = {
  component: Drawer,
  tags: ["autodocs"],
  parameters: {
    layout: "fullscreen",
    docs: {
      description: { component: dsMetaDescription(dsMeta) },
      // position:fixed escapes inline docs blocks (six drawers would pile up
      // on the autodocs page) — render each docs preview in its own iframe.
      story: { inline: false, iframeHeight: 420 },
    },
    dsMeta,
  },
  args: {
    open: true,
    onClose: fn(),
    children: <DrawerBody />,
  },
};
export default config;

type Story = StoryObj<typeof Drawer>;

/** Default 520px width, default close button, default `--deeper-bg`. */
export const Open: Story = {};

/**
 * THE PLAYGROUND — a stateful wrapper so the full lifecycle is experienceable
 * by hand: open with the button, close via the chevron, ESC, or clicking
 * outside. The other stories are deliberately FROZEN single states (that's
 * what screenshot tests need); this one exists for humans. Excluded from
 * visual regression via the no-vrt tag.
 */
export const Interactive: Story = {
  tags: ["no-vrt"],
  render: () => {
    function DrawerPlayground() {
      const [open, setOpen] = useState(false);
      return (
        <div style={{ minHeight: 480, padding: 24 }}>
          <Button onClick={() => setOpen(true)}>Open task drawer</Button>
          <Drawer open={open} onClose={() => setOpen(false)}>
            <DrawerBody />
          </Drawer>
        </div>
      );
    }
    return <DrawerPlayground />;
  },
};

/** Narrower panel for lighter content (e.g. a meeting summary). */
export const Narrow: Story = {
  args: { width: 360 },
};

/**
 * `closeButton` defaults to TRUE — the built-in chevron-back button is the
 * standard chrome. Opting out is the rare case (a parent renders its own
 * header controls).
 */
export const WithoutCloseButton: Story = {
  args: { closeButton: false },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).queryByRole("button", { name: "Close" })).toBeNull();
  },
};

export const CloseButtonClick: Story = {
  play: async ({ args, canvasElement }) => {
    await userEvent.click(within(canvasElement).getByRole("button", { name: "Close" }));
    await expect(args.onClose).toHaveBeenCalledOnce();
  },
};

/** ESC always closes — the listener is attached (only) while open. */
export const EscapeCloses: Story = {
  play: async ({ args }) => {
    await userEvent.keyboard("{Escape}");
    await expect(args.onClose).toHaveBeenCalledOnce();
  },
};

/**
 * DOCUMENTED GAP (audit Lens 3): while closed, the panel is only translated
 * off-screen — children stay mounted and keyboard-reachable, so a closed
 * drawer leaks tab stops. This story pins that reality; if a focus-managed
 * Drawer ever lands, this play function is the one to update.
 */
export const ClosedChildrenStillMounted: Story = {
  args: { open: false },
  play: async ({ canvasElement }) => {
    const heading = within(canvasElement).getByText("Configure SSO for pilot users");
    await expect(heading).toBeInTheDocument();
    const panel = canvasElement.querySelector(".task-drawer");
    await expect(panel).not.toBeNull();
    await expect(panel!.classList.contains("task-drawer--open")).toBe(false);
  },
};
