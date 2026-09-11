"use client";

import { cloneElement, useId, type ReactElement, type ReactNode } from "react";

/**
 * Field — DS primitive, the form-row wrapper.
 *
 * Owns the label / help / error copy AND their wiring to exactly one control
 * child (TextField / Textarea): useId generates the control id, and
 * cloneElement injects id + aria-describedby (help) + aria-invalid /
 * aria-errormessage (error). cloneElement was chosen over context or a
 * render-prop because it keeps the call site to the bare minimum:
 *
 *   <Field label="Email" help="Used for the invite.">
 *     <TextField type="email" />
 *   </Field>
 *
 * A child's own `id` wins over the generated one; a child's own `required`
 * wins over Field's. The error id also rides along in aria-describedby as a
 * fallback for the patchy aria-errormessage screen-reader support.
 *
 * Label = the `smallLabel` token (the Settings NAME/EMAIL idiom).
 */

/** The props Field may inject into its control child. */
interface ControlProps {
  id?: string;
  required?: boolean;
  "aria-describedby"?: string;
  "aria-invalid"?: boolean | "true" | "false" | "grammar" | "spelling";
  "aria-errormessage"?: string;
}

export interface FieldProps {
  label: ReactNode;
  /** Exactly one form control (TextField / Textarea). */
  children: ReactElement<ControlProps>;
  /** Persistent hint below the control (aria-describedby). */
  help?: ReactNode;
  /** Error copy below the control; also flips the control invalid. */
  error?: ReactNode;
  /** Marks the label and sets `required` on the control. */
  required?: boolean;
}

export default function Field({
  label,
  children,
  help,
  error,
  required,
}: FieldProps) {
  const autoId = useId();
  const controlId = children.props.id ?? autoId;
  const helpId = `${autoId}-help`;
  const errorId = `${autoId}-error`;

  const describedBy =
    [children.props["aria-describedby"], help ? helpId : null, error ? errorId : null]
      .filter(Boolean)
      .join(" ") || undefined;

  const control = cloneElement(children, {
    id: controlId,
    required: children.props.required ?? required,
    "aria-describedby": describedBy,
    ...(error ? { "aria-invalid": true as const, "aria-errormessage": errorId } : {}),
  });

  return (
    <div className="field">
      <label htmlFor={controlId} className="field-label">
        {label}
        {required && <span aria-hidden="true"> *</span>}
      </label>
      {control}
      {help && (
        <div id={helpId} className="field-help">
          {help}
        </div>
      )}
      {error && (
        <div id={errorId} className="field-error">
          {error}
        </div>
      )}
    </div>
  );
}
