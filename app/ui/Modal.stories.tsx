import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { useState } from "react";
import { expect, fn, userEvent, within } from "storybook/test";
import Modal from "./Modal";
import Button from "./Button";
import { dsMetaDescription } from "./ds-meta";
import { meta as dsMeta } from "./Modal.meta";

/**
 * NOTE (Caroline's review, pending): this is a NEW primitive — nothing in the
 * app renders it yet. The 12px radius follows the documented rounded.xl scale;
 * the legacy modals it replaces are 20px and converge in Phase 7.
 */
const config: Meta<typeof Modal> = {
  component: Modal,
  tags: ["autodocs"],
  parameters: {
    layout: "fullscreen",
    docs: {
      description: { component: dsMetaDescription(dsMeta) },
      // <dialog> renders in the top layer — give each docs preview its own iframe.
      story: { inline: false, iframeHeight: 420 },
    },
    dsMeta,
  },
  args: {
    open: true,
    onClose: fn(),
    title: "Add team member",
    children: (
      <p>
        New members can sign in with the same email later — their account links
        automatically. They&apos;ll see every onboarding in this workspace.
      </p>
    ),
  },
};
export default config;

type Story = StoryObj<typeof Modal>;

/** Default md (520px). The scrim behind is the ::backdrop + scrim token. */
export const Open: Story = {};

export const SizeSM: Story = { args: { size: "sm", title: "Remove member?" } };
export const SizeLG: Story = { args: { size: "lg", title: "Create onboarding" } };

export const WithFooter: Story = {
  args: {
    footer: (
      <>
        <Button variant="tertiary">Cancel</Button>
        <Button>Add member</Button>
      </>
    ),
  },
};

export const DestructiveConfirm: Story = {
  args: {
    size: "sm",
    title: "Delete task?",
    children: <p>This removes the task and its activity for everyone. It cannot be undone.</p>,
    footer: (
      <>
        <Button variant="tertiary">Cancel</Button>
        <Button variant="destructive">Delete task</Button>
      </>
    ),
  },
};

export const LongContent: Story = {
  args: {
    children: (
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {Array.from({ length: 12 }, (_, i) => (
          <p key={i}>
            Paragraph {i + 1}: the dialog scrolls its own content once it
            outgrows the viewport; the page behind stays locked.
          </p>
        ))}
      </div>
    ),
  },
};

/** ESC reports through onClose — the parent stays the source of truth. */
export const EscapeCloses: Story = {
  play: async ({ args }) => {
    await userEvent.keyboard("{Escape}");
    await expect(args.onClose).toHaveBeenCalledOnce();
  },
};

/** Native focus trap: Tab from the last control wraps back inside the dialog. */
export const FocusContainment: Story = {
  args: {
    footer: (
      <>
        <Button variant="tertiary">Cancel</Button>
        <Button>Add member</Button>
      </>
    ),
  },
  play: async ({ canvasElement }) => {
    const dialog = canvasElement.ownerDocument.querySelector("dialog");
    await expect(dialog).not.toBeNull();
    for (let i = 0; i < 4; i++) await userEvent.tab();
    await expect(dialog!.contains(canvasElement.ownerDocument.activeElement)).toBe(true);
  },
};

/**
 * THE PLAYGROUND — full lifecycle by hand: open with the button; close via
 * ESC, scrim click, or the footer actions. no-vrt.
 */
export const Interactive: Story = {
  tags: ["no-vrt"],
  render: () => {
    function ModalPlayground() {
      const [open, setOpen] = useState(false);
      return (
        <div style={{ minHeight: 420, padding: 24 }}>
          <Button onClick={() => setOpen(true)}>Add member</Button>
          <Modal
            open={open}
            onClose={() => setOpen(false)}
            title="Add team member"
            footer={
              <>
                <Button variant="tertiary" onClick={() => setOpen(false)}>Cancel</Button>
                <Button onClick={() => setOpen(false)}>Add member</Button>
              </>
            }
          >
            <p>
              New members can sign in with the same email later — their account
              links automatically.
            </p>
          </Modal>
        </div>
      );
    }
    return <ModalPlayground />;
  },
};
