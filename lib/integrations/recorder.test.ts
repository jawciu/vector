import { describe, it, expect } from "vitest";
import { canOwnWork, readRecorderId, settleRecorderOwner, transcriptLine } from "./recorder";

describe("readRecorderId", () => {
  it("reads a positive integer id, as a number or a numeric string", () => {
    expect(readRecorderId({ recorderVendorUserId: 4 })).toBe(4);
    expect(readRecorderId({ recorderVendorUserId: "12" })).toBe(12);
  });
  it("is null when unset or malformed", () => {
    for (const config of [null, undefined, {}, [], "4", { recorderVendorUserId: null }, { recorderVendorUserId: 0 },
      { recorderVendorUserId: 1.5 }, { recorderVendorUserId: "abc" }, { recorderVendorUserId: "" }]) {
      expect(readRecorderId(config)).toBe(null);
    }
  });
});

describe("canOwnWork", () => {
  it("admins and members can, viewers and unknown roles cannot", () => {
    expect(canOwnWork("admin")).toBe(true);
    expect(canOwnWork("member")).toBe(true);
    expect(canOwnWork("viewer")).toBe(false);
    expect(canOwnWork(null)).toBe(false);
  });
});

describe("settleRecorderOwner", () => {
  it("recorder known: a flagged draft without an owner becomes theirs, and the flag goes", () => {
    expect(settleRecorderOwner({ ownerFromRecorder: true }, 4)).toEqual({ ownerId: 4 });
  });
  it("recorder known: an owner the model already chose stands", () => {
    expect(settleRecorderOwner({ ownerFromRecorder: true, ownerId: 7 }, 4)).toEqual({ ownerId: 7 });
  });
  it("recorder unknown: the owner is emptied and the flag kept", () => {
    expect(settleRecorderOwner({ ownerFromRecorder: true, ownerId: 7 }, null)).toEqual({ ownerFromRecorder: true });
  });
  it("leaves unflagged drafts alone, and removes a flag that is not true", () => {
    expect(settleRecorderOwner({ ownerId: 7 }, null)).toEqual({ ownerId: 7 });
    expect(settleRecorderOwner({ ownerId: 7, ownerFromRecorder: false }, 4)).toEqual({ ownerId: 7 });
  });
});

describe("transcriptLine", () => {
  it("prefixes the speaker, skips empty turns", () => {
    expect(transcriptLine({ speaker: "You", text: "Hi." })).toBe("You: Hi.");
    expect(transcriptLine({ text: "Hi." })).toBe("Hi.");
    expect(transcriptLine({ speaker: "You", text: "" })).toBe(null);
    expect(transcriptLine(null)).toBe(null);
  });
});
