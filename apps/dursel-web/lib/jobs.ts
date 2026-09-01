/**
 * Display helpers for renders.
 *
 * Titles used to be recovered by parsing the prompt slug back out of a job id, because the id was
 * the only thing the history listing had. The database stores a real title now, so the parsing is
 * gone and what remains is deciding that title on write and formatting a timestamp on read.
 */

/**
 * A render's display title: the prompt as typed, trimmed to a line's worth. The full prompt is
 * stored alongside it, so shortening here loses nothing.
 */
export function makeTitle(prompt: string): string {
  const line = prompt.trim().replace(/\s+/g, " ");
  return line.length > 80 ? `${line.slice(0, 79)}…` : line;
}

/**
 * Empty string for a timestamp that does not parse — a sidebar row is not worth throwing over.
 *
 * `locale` and `timeZone` both default to the viewer's own, which is what a reader wants and what
 * makes the output untestable unless they can be pinned. Passing them is how a test gets a fixed
 * answer; the app passes neither.
 */
export function formatDate(
  ms: number,
  locale?: string,
  timeZone?: string,
): string {
  const d = new Date(ms);
  return Number.isNaN(+d)
    ? ""
    : d.toLocaleString(locale, {
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        timeZone,
      });
}
