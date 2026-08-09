import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect } from "storybook/test";
import InlineProse from "./InlineProse";
import { dsMetaDescription } from "./ds-meta";
import { meta as dsMeta } from "./InlineProse.meta";

const config: Meta<typeof InlineProse> = {
  component: InlineProse,
  tags: ["autodocs"],
  parameters: {
    docs: { description: { component: dsMetaDescription(dsMeta) } },
    dsMeta,
  },
  decorators: [
    (Story) => (
      <p style={{ maxWidth: 420, fontSize: 14, lineHeight: 1.5 }}>
        <Story />
      </p>
    ),
  ],
};
export default config;

type Story = StoryObj<typeof InlineProse>;

/** Prose without backticks passes through as plain spans. */
export const Plain: Story = {
  args: {
    text: "Kickoff went well and the team is aligned on the integration timeline.",
  },
};

/** Backtick-wrapped task titles become `.task-ref` chips, wrapping mid-title as pills. */
export const WithTaskRefs: Story = {
  args: {
    text: "Blocked on `Provision sandbox environment` — consider bumping `Security review for SSO configuration` to this week.",
  },
  play: async ({ canvasElement }) => {
    const refs = canvasElement.querySelectorAll(".task-ref");
    await expect(refs).toHaveLength(2);
    await expect(refs[0]).toHaveTextContent("Provision sandbox environment");
  },
};

/** Empty/missing text renders NOTHING (null) — callers don't need to guard. */
export const Empty: Story = {
  args: { text: "" },
  play: async ({ canvasElement }) => {
    const wrapper = canvasElement.querySelector("p");
    await expect(wrapper).not.toBeNull();
    await expect(wrapper).toBeEmptyDOMElement();
  },
};
