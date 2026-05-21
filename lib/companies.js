// Pure logic for deriving and validating company task-ID prefixes.
// No DB calls live here — callers pass in the set of already-taken prefixes
// and the module returns a candidate. Validation mirrors the regex enforced
// at the database level: 2-5 chars, first must be a letter, rest letters or
// digits, uppercase only.

const PREFIX_REGEX = /^[A-Z][A-Z0-9]{1,4}$/;

export class PrefixExhaustedError extends Error {
  constructor(message) {
    super(message);
    this.name = "PrefixExhaustedError";
  }
}

/**
 * Derive a unique 2-char base prefix for a company name, falling back to
 * numeric suffixes if collisions occur.
 *
 * @param {string} name - the company name
 * @param {Set<string>} taken - already-used prefixes (uppercase)
 * @returns {string} a prefix matching /^[A-Z][A-Z0-9]{1,4}$/
 */
export function derivePrefix(name, taken) {
  const letters = String(name ?? "").replace(/[^A-Za-z]/g, "");
  // For candidate 2, we want the first + last letter of the *first word*
  // — i.e. the first contiguous run of alphabetic chars. So "Acme Co" gives
  // first-word="Acme" → "AE", not "AO" (last char of all letters).
  const firstWordMatch = String(name ?? "").match(/[A-Za-z]+/);
  const firstWord = firstWordMatch ? firstWordMatch[0] : "";

  let base;
  if (letters.length === 0) {
    // Name had no letters (e.g. "123 LLC"). Fall through to numeric suffix
    // on a synthetic "XX" base.
    base = "XX";
  } else if (letters.length === 1) {
    base = (letters[0] + "X").toUpperCase();
  } else {
    base = (letters[0] + letters[1]).toUpperCase();
  }

  // Candidate 1: first 2 alphabetic chars (or padded).
  const candidate1 = base;
  if (!taken.has(candidate1)) return candidate1;

  // Candidate 2: first + last alphabetic char of the first word. Skip if
  // the first word has <2 letters (would equal candidate1 or be meaningless)
  // or if it collides with candidate1.
  if (firstWord.length >= 2) {
    const candidate2 = (firstWord[0] + firstWord[firstWord.length - 1]).toUpperCase();
    if (candidate2 !== candidate1 && !taken.has(candidate2)) {
      return candidate2;
    }
  }

  // Candidate 3+: append 1..99 to the 2-char base.
  for (let i = 1; i <= 99; i++) {
    const candidate = `${candidate1}${i}`;
    if (!taken.has(candidate)) return candidate;
  }

  const candidate2ForMessage =
    firstWord.length >= 2
      ? (firstWord[0] + firstWord[firstWord.length - 1]).toUpperCase()
      : "(no fallback)";
  throw new PrefixExhaustedError(
    `Could not derive a unique prefix from base "${base}" — tried ${candidate1}, ` +
      `${candidate2ForMessage}, and ${candidate1}1 through ${candidate1}99.`
  );
}

/**
 * Validate that a prefix conforms to the schema rules: 2-5 chars, first
 * must be a letter (A-Z), rest letters or digits, uppercase only.
 *
 * @param {string} prefix
 * @returns {{ ok: true } | { ok: false, error: string }}
 */
export function validatePrefix(prefix) {
  if (typeof prefix !== "string") {
    return { ok: false, error: "Prefix must be a string." };
  }
  if (prefix.length < 2 || prefix.length > 5) {
    return { ok: false, error: "Prefix must be 2-5 characters." };
  }
  if (!PREFIX_REGEX.test(prefix)) {
    return {
      ok: false,
      error:
        "Prefix must start with an uppercase letter (A-Z), followed by uppercase letters or digits.",
    };
  }
  return { ok: true };
}
