import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { useEffect } from "react";
import { expect, fn, userEvent, waitFor, within } from "storybook/test";
import Toast, { ToastStack, useToasts } from "./Toast";
import { dsMetaDescription } from "./ds-meta";
import { meta as dsMeta } from "./Toast.meta";

/**
 * The corner confirmation. Replaces the full-width sticky banner the AI draft
 * inbox used to show on approve (Caroline's review, 2026-09-13: "that is not a
 * toast, it is a banner").
 *
 * Stories render the card in place, so it sits in the bottom-right of the
 * preview frame exactly as it does in the app.
 */
const config: Meta<typeof Toast> = {
  component: Toast,
  tags: ["autodocs"],
  parameters: {
    docs: { description: { component: dsMetaDescription(dsMeta) } },
    dsMeta,
    layout: "fullscreen",
  },
  args: {
    message: "Sent, comment posted on task",
    onDismiss: fn(),
  },
  decorators: [
    (Story) => (
      <div style={{ minHeight: 260 }}>
        <Story />
      </div>
    ),
  ],
};
export default config;

type Story = StoryObj<typeof Toast>;

/** Message only: success tick, one line, dismiss X. Auto-dismisses after 4s. */
export const Default: Story = {
  render: (args) => (
    <div className="toast-stack">
      <Toast {...args} />
    </div>
  ),
};

/** With an action link the card holds for 9s, and hovering pauses that timer. */
export const WithAction: Story = {
  args: {
    message: "Created RAY-40 in Training, Rollout & Go-live",
    action: { label: "View", href: "#" },
  },
  render: (args) => (
    <div className="toast-stack">
      <Toast {...args} />
    </div>
  ),
};

/** Three at once: newest at the bottom, 8px apart, older ones dropped past 3. */
export const Stacked: Story = {
  render: () => {
    function Demo() {
      const { toasts, push, dismiss } = useToasts();
      useEffect(() => {
        push("Sent, comment posted on task");
        push("Created RAY-41 in Content Build & Migration");
        push("Created RAY-42 in Security, Governance & Access", { label: "View", href: "#" });
      }, [push]);
      return <ToastStack toasts={toasts} onDismiss={dismiss} />;
    }
    return <Demo />;
  },
};

/**
 * Reduced motion: `@media (prefers-reduced-motion: reduce)` in globals.css
 * redefines the toast-in / toast-out keyframes to a plain opacity fade. The
 * test guards the precondition that makes that override possible: the
 * component sets no inline animation or transform of its own, so all motion
 * is CSS-owned and the media query can win.
 */
export const ReducedMotion: Story = {
  render: (args) => (
    <div className="toast-stack">
      <Toast {...args} />
    </div>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const status = canvas.getByRole("status");
    await expect(status).toBeInTheDocument();
    await expect(status).toHaveClass("toast");
    await expect(status.style.animation).toBe("");
    await expect(status.style.transform).toBe("");
  },
};

/** Dismiss: the X plays the exit animation, then reports to the parent. */
export const Dismiss: Story = {
  args: { message: "Created RAY-40 in Training, Rollout & Go-live" },
  render: (args) => (
    <div className="toast-stack">
      <Toast {...args} />
    </div>
  ),
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "Dismiss notification" }));
    // Exit animation first, then the parent is told to drop the card.
    await waitFor(() => expect(args.onDismiss).toHaveBeenCalled());
  },
};
