/**
 * A render's identity and display name, both derived from the prompt.
 *
 * The id doubles as the storage prefix its artifacts live under, so it has to survive being a path
 * segment and an object key: timestamp first so ids sort chronologically, then a slug of the
 * prompt, a random tail so two identical prompts cannot share an id, and nothing outside
 * [A-Za-z0-9-].
 */
/**
 * The random tail.
 *
 * Six characters of 36 is 2.2 billion, which is ample against two identical prompts landing in
 * the same second. The alphabet is spelled out rather than taken from nanoid for two reasons:
 * nanoid's default includes an underscore, which the id may not contain, and nanoid v5 is
 * ESM-only, so requiring it from the CommonJS the specs compile to yields undefined rather than
 * a function. `crypto` is a global in both the Workers runtime and Node.
 *
 * The modulo is very slightly biased — 256 is not a multiple of 36 — which does not matter for a
 * collision tiebreaker and would if this were ever used as a secret. It is not.
 */
const ALPHABET = '0123456789abcdefghijklmnopqrstuvwxyz';

const idSuffix = (): string =>
  Array.from(crypto.getRandomValues(new Uint8Array(6)), (b) => ALPHABET[b % ALPHABET.length]).join(
    '',
  );

export const makeJobId = (prompt: string): string => {
  // YYYYMMDDHHMMSS — stop before the millisecond dot, which is not allowed in the id.
  const stamp = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14);
  const slug =
    prompt
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 40) || 'scene';

  // The random tail is what keeps two renders apart. A timestamp and a slug alone collide
  // whenever two people submit the same prompt in the same second — which is what a class working
  // from one lesson plan does — and a collision means one job directory and one R2 prefix shared
  // by both, so one render silently overwrites the other's video.
  return `${stamp}-${slug}-${idSuffix()}`;
};

/**
 * The prompt as typed, trimmed to a line's worth. The full prompt is stored alongside it, so
 * shortening here loses nothing.
 */
export const makeTitle = (prompt: string): string => {
  const line = prompt.trim().replace(/\s+/g, ' ');

  return line.length > 80 ? `${line.slice(0, 79)}…` : line;
};
