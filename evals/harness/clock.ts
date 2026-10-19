/**
 * Clock shift for replaying old meetings.
 *
 * In production a meeting is processed minutes after it ends, so the
 * pipeline's "today" (buildOrchestratorContext's `today`, which both prompts
 * use to resolve "by Friday" or "early next week") is the meeting day. The
 * golden meetings are dated May to July 2026; replayed in October without a
 * shift, every relative date would resolve against the wrong week and the
 * due-date metric would measure the harness, not the AI.
 *
 * `setClock(iso)` replaces the global Date with a subclass whose "now" runs
 * at real speed from `iso`. A constant offset keeps durations (timeouts,
 * durationMs) correct. Explicit dates (`new Date(x)`) are untouched.
 * `resetClock()` restores real time.
 */

const RealDate = Date;
let offsetMs = 0;
let installed = false;

function install() {
  if (installed) return;
  installed = true;
  class ShiftedDate extends RealDate {
    constructor(...args: unknown[]) {
      if (args.length === 0) super(RealDate.now() + offsetMs);
      else super(...(args as [string | number | Date]));
    }
    static now() {
      return RealDate.now() + offsetMs;
    }
  }
  globalThis.Date = ShiftedDate as unknown as DateConstructor;
}

export function setClock(iso: string) {
  install();
  offsetMs = new RealDate(iso).getTime() - RealDate.now();
}

export function resetClock() {
  offsetMs = 0;
}
