import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { useState } from "react";
import { expect, userEvent, within } from "storybook/test";
import Field from "./Field";
import Input from "./Input";
import Select from "./Select";
import Textarea from "./Textarea";
import Button from "./Button";
import { dsMetaDescription } from "./ds-meta";
import { meta as dsMeta } from "./Field.meta";

/**
 * NOTE (Caroline's review, pending): the ERROR treatment is a NEW design
 * decision — inline `danger` copy under the control plus a `danger` border
 * that holds through hover/focus. Today's app shows errors as a single red
 * banner at the top of a form; nothing renders per-field errors yet.
 * The label itself is the existing Settings NAME/EMAIL idiom (smallLabel:
 * 11px uppercase textMuted), not new.
 */
const config: Meta<typeof Field> = {
  component: Field,
  tags: ["autodocs"],
  parameters: {
    docs: { description: { component: dsMetaDescription(dsMeta) } },
    dsMeta,
  },
  args: {
    label: "Email",
    children: <Input type="email" placeholder="tom@vector.example" />,
  },
  decorators: [
    (Story) => (
      <div style={{ width: 320 }}>
        <Story />
      </div>
    ),
  ],
};
export default config;

type Story = StoryObj<typeof Field>;

/** Label (smallLabel idiom) + control, wired via useId → htmlFor/id. */
export const Default: Story = {};

/** `help` renders below the control and reaches it via aria-describedby. */
export const WithHelp: Story = {
  args: {
    help: "They can sign in with this address later — the account links automatically.",
  },
};

/** Aria-hidden asterisk on the label; native `required` set on the control. */
export const Required: Story = {
  args: { required: true },
  play: async ({ canvasElement }) => {
    const input = within(canvasElement).getByLabelText(/email/i);
    await expect(input).toBeRequired();
  },
};

/**
 * NEW — pending Caroline's review: per-field error copy in `danger` + the
 * `danger` border on the control. Field wires aria-invalid + aria-errormessage
 * (with an aria-describedby fallback) onto the child automatically.
 */
export const InvalidWithError: Story = {
  args: {
    children: <Input type="email" defaultValue="tom@" />,
    error: "Enter a full email address.",
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const input = canvas.getByLabelText(/email/i);
    await expect(input).toHaveAttribute("aria-invalid", "true");
    const errorId = input.getAttribute("aria-errormessage");
    await expect(errorId).not.toBeNull();
    const error = canvasElement.ownerDocument.getElementById(errorId!);
    await expect(error).toHaveTextContent("Enter a full email address.");
    await expect(input.getAttribute("aria-describedby")).toContain(errorId!);
  },
};

export const Disabled: Story = {
  args: {
    label: "Workspace",
    children: <Input disabled defaultValue="Vector HQ" />,
    help: "Contact an admin to rename the workspace.",
  },
};

export const SelectControl: Story = {
  args: {
    label: "Owner",
    children: (
      <Select defaultValue="tom">
        <option value="tom">Tom Okafor</option>
        <option value="ada">Ada Nwosu</option>
        <option value="mia">Mia Feldt</option>
      </Select>
    ),
  },
};

export const TextareaControl: Story = {
  args: {
    label: "Description",
    children: (
      <Textarea
        rows={4}
        defaultValue={
          "Walk the customer through SSO setup.\nCollect their IdP metadata first."
        }
      />
    ),
  },
};

/** htmlFor/id wiring: clicking the label focuses the control. */
export const LabelClickFocuses: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByText("Email"));
    await expect(canvas.getByLabelText(/email/i)).toHaveFocus();
  },
};

/** The whole family in every state — the visual-regression money shot. */
export const AllStates: Story = {
  render: () => (
    <div style={{ display: "flex", flexDirection: "column", gap: 20, width: 320 }}>
      <Field label="Name">
        <Input placeholder="e.g. Tom Okafor" />
      </Field>
      <Field label="Email" required help="Used for the portal invite.">
        <Input type="email" defaultValue="tom@vector.example" />
      </Field>
      <Field label="Email" error="Enter a full email address.">
        <Input type="email" defaultValue="tom@" />
      </Field>
      <Field label="Workspace" help="Contact an admin to rename.">
        <Input disabled defaultValue="Vector HQ" />
      </Field>
      <Field label="Owner">
        <Select defaultValue="tom">
          <option value="tom">Tom Okafor</option>
          <option value="ada">Ada Nwosu</option>
        </Select>
      </Field>
      <Field label="Description">
        <Textarea rows={3} defaultValue="Walk the customer through SSO setup." />
      </Field>
    </div>
  ),
};

/**
 * THE PLAYGROUND — a live mini-form: typing clears the error, submitting an
 * incomplete email brings it back. no-vrt.
 */
export const Interactive: Story = {
  tags: ["no-vrt"],
  render: () => {
    function FieldPlayground() {
      const [email, setEmail] = useState("");
      const [error, setError] = useState<string | undefined>(undefined);
      return (
        <form
          style={{ display: "flex", flexDirection: "column", gap: 16, width: 320 }}
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            setError(
              /^\S+@\S+\.\S+$/.test(email)
                ? undefined
                : "Enter a full email address."
            );
          }}
        >
          <Field
            label="Email"
            required
            help={error ? undefined : "They can sign in with this address later."}
            error={error}
          >
            <Input
              type="email"
              placeholder="tom@vector.example"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                if (error) setError(undefined);
              }}
            />
          </Field>
          <div style={{ display: "flex", justifyContent: "flex-end" }}>
            <Button type="submit">Add member</Button>
          </div>
        </form>
      );
    }
    return <FieldPlayground />;
  },
};
