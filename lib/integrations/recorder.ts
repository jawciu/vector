/**
 * The meeting recorder: Miniti labels whoever recorded a call as speaker -1,
 * "You", and sends no attendee for them. A workspace says who that is in the
 * Miniti integration's config (`recorderVendorUserId`), set from /settings.
 *
 * Pure helpers only (no DB), so lib/db, the settings route and the pipeline
 * share one reading of the config and one rule for who may be the recorder.
 */

export const MINITI_SOURCE = "miniti";
export const RECORDER_CONFIG_KEY = "recorderVendorUserId";

/** Miniti's label for the local microphone (speaker id -1). */
export const RECORDER_SPEAKER_LABEL = "You";

/** The recorder id stored in an integration config, or null if unset / malformed. */
export function readRecorderId(config: unknown): number | null {
  if (!config || typeof config !== "object" || Array.isArray(config)) return null;
  const raw = (config as Record<string, unknown>)[RECORDER_CONFIG_KEY];
  const id = typeof raw === "number" ? raw : typeof raw === "string" && raw.trim() !== "" ? Number(raw) : NaN;
  return Number.isInteger(id) && id > 0 ? id : null;
}

/** Same rule as the pipeline's owner list: viewers are never assigned work. */
export function canOwnWork(role: string | null | undefined): boolean {
  return role === "admin" || role === "member";
}

/**
 * Settle a create draft's owner against the recorder, after the model has
 * spoken. The model sets `ownerFromRecorder` when the commitment was made by
 * the recorder ("You"):
 *   - recorder known: the draft is theirs (an owner the model already chose
 *     stands); the flag is dropped, there is nothing left to explain;
 *   - recorder unknown: the owner stays empty and the flag stays, so the
 *     inbox can say why and ask for one.
 * A flag that is anything but `true` is removed. Mutates and returns `payload`.
 */
export function settleRecorderOwner<P extends { ownerId?: unknown; ownerFromRecorder?: unknown }>(
  payload: P,
  recorderId: number | null
): P {
  if (payload.ownerFromRecorder !== true) {
    delete payload.ownerFromRecorder;
    return payload;
  }
  if (recorderId != null) {
    if (payload.ownerId == null) payload.ownerId = recorderId;
    delete payload.ownerFromRecorder;
  } else {
    delete payload.ownerId;
  }
  return payload;
}

/** One transcript turn as the model reads it: "<speaker>: <words>". */
export function transcriptLine(turn: { speaker?: unknown; text?: unknown } | null | undefined): string | null {
  const text = typeof turn?.text === "string" ? turn.text : "";
  if (!text) return null;
  const speaker = typeof turn?.speaker === "string" ? turn.speaker.trim() : "";
  return speaker ? `${speaker}: ${text}` : text;
}
