/**
 * Display helpers for renders.
 *
 * Titles used to be recovered by parsing the prompt slug back out of a job id, because the id was
 * the only thing the history listing had. The database stores a real title now, so the parsing is
 * gone and what remains is deciding that title on write, formatting a timestamp on read, and
 * saying what a status looks like.
 */

import { RenderStatus } from "@/generated";

/**
 * One word each, and one colour each, shared by the renderer and the admin dashboard so a render
 * that reads "failed" in red on one screen cannot read as something else on the other.
 */
export const STATUS_TEXT: Record<RenderStatus, string> = {
  [RenderStatus.Queued]: "queued",
  [RenderStatus.Pending]: "rendering",
  [RenderStatus.Ok]: "done",
  [RenderStatus.Failed]: "failed",
};

export const STATUS_COLOR: Record<RenderStatus, string> = {
  // Deliberately not the yellow of "rendering": queued means nothing is happening yet, and the
  // two states are a second apart on screen when a burst arrives.
  [RenderStatus.Queued]: "text-blue-d",
  [RenderStatus.Pending]: "text-yellow-e",
  [RenderStatus.Ok]: "text-green-c",
  [RenderStatus.Failed]: "text-red-c",
};

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

/**
 * How many renders an account gets a day, and when the day turns over.
 *
 * Mirrors the startRender resolver in durslel-service, which is what actually enforces this —
 * these two constants exist here only so the UI can say what the server is about to do rather
 * than letting someone find out by being refused. The server stays the authority; if the two ever
 * disagree, the worst case is a count that reads wrong, not a limit that can be walked past.
 *
 * The day ends at midnight GMT+8 (16:00 UTC), not at the viewer's local midnight, so the number
 * shown here is the same one the server will apply.
 */
/**
 * What an account with no subscription gets, and the only limit this app knows on its own.
 *
 * Every other tier's number lives in the service (common/subscription.ts) and arrives on
 * User.dailyLimit — a per-tier table cannot be kept in step by copying it here, which is what
 * the old flat constant did. This is the fallback for the moment before that query answers.
 */
export const FREE_DAILY_LIMIT = 3;
const RESET_OFFSET_MS = 8 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

/** The instant the current quota day began, as epoch ms. */
export function dayStart(now: number = Date.now()): number {
  return Math.floor((now + RESET_OFFSET_MS) / DAY_MS) * DAY_MS - RESET_OFFSET_MS;
}

/**
 * Renders still available today, from the history query the sidebar already made — no extra
 * request, and it re-counts on its own every time that query refetches.
 *
 * `limit` comes from User.dailyLimit rather than a constant here, because how many an account
 * gets depends on what it pays for.
 *
 * Clamped at zero: the server counts failed renders too, and a limit lowered later — or a
 * subscription ending mid-day — would otherwise show a negative.
 */
export function rendersLeftToday(
  createdAt: number[],
  limit: number = FREE_DAILY_LIMIT,
  now: number = Date.now(),
): number {
  const since = dayStart(now);
  return Math.max(0, limit - createdAt.filter((ms) => ms >= since).length);
}
