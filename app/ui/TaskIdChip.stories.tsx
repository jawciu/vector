import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect } from "storybook/test";
import TaskIdChip from "./TaskIdChip";
import { dsMetaDescription } from "./ds-meta";
import { meta as dsMeta } from "./TaskIdChip.meta";

const config: Meta<typeof TaskIdChip> = {
  component: TaskIdChip,
  tags: ["autodocs"],
  parameters: {
    docs: { description: { component: dsMetaDescription(dsMeta) } },
    dsMeta,
  },
  args: { task: { taskId: "AC-12" } },
};
export default config;

type Story = StoryObj<typeof TaskIdChip>;

/** As used everywhere: the chip prefixing a task title. */
export const Default: Story = {
  render: (args) => (
    <span style={{ fontSize: 14 }}>
      <TaskIdChip {...args} />
      Send kickoff agenda to stakeholders
    </span>
  ),
};

/**
 * A task without a `taskId` renders NOTHING (null) — the defensive guard
 * for surfaces Phase 4a/Phase 0 hasn't covered, or stub objects in tests.
 * The title below sits flush left because no chip (and no margin) exists.
 */
export const NoTaskId: Story = {
  args: { task: {} },
  render: (args) => (
    <span style={{ fontSize: 14 }}>
      <TaskIdChip {...args} />
      Send kickoff agenda to stakeholders
    </span>
  ),
  play: async ({ canvasElement }) => {
    await expect(canvasElement.querySelector(".task-id")).toBeNull();
  },
};
