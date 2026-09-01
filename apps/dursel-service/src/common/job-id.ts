/**
 * A render's identity and display name, both derived from the prompt.
 *
 * The id doubles as the storage prefix its artifacts live under, so it has to survive being a path
 * segment and an object key: timestamp first so ids sort chronologically, then a slug of the
 * prompt, and nothing outside [A-Za-z0-9-].
 */
export const makeJobId = (prompt: string): string => {
  // YYYYMMDDHHMMSS — stop before the millisecond dot, which is not allowed in the id.
  const stamp = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14);
  const slug =
    prompt
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 40) || 'scene';

  return `${stamp}-${slug}`;
};

/**
 * The prompt as typed, trimmed to a line's worth. The full prompt is stored alongside it, so
 * shortening here loses nothing.
 */
export const makeTitle = (prompt: string): string => {
  const line = prompt.trim().replace(/\s+/g, ' ');

  return line.length > 80 ? `${line.slice(0, 79)}…` : line;
};
