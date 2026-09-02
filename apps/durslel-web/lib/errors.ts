/**
 * The no-blackhole contract.
 *
 * Every failure in this app carries a `kind`, a plain-English `message`, and `raw` — the
 * verbatim upstream text (Gemini error body, Python traceback, manim log). `raw` is never
 * summarized and never truncated: diagnosing a broken scene means reading the actual traceback.
 */

export type ErrorKind =
  | "auth"
  | "rate_limit"
  | "quota_exhausted"
  | "api_error"
  | "api_connection"
  | "blocked"
  | "truncated"
  | "no_code"
  | "no_scene_class"
  | "precheck"
  | "manim_missing"
  | "manim_runtime"
  | "timeout"
  | "no_output";

export interface RenderError {
  kind: ErrorKind;
  message: string;
  raw: string;
  attempt: number;
}

export function renderError(
  kind: ErrorKind,
  message: string,
  raw: string,
  attempt: number,
): RenderError {
  return { kind, message, raw, attempt };
}

/** Human-readable tag shown next to the traceback in the UI. */
export const ERROR_LABELS: Record<ErrorKind, string> = {
  auth: "API key rejected",
  rate_limit: "Rate limited",
  quota_exhausted: "Daily quota used up",
  api_error: "Gemini API error",
  api_connection: "Could not reach Gemini",
  blocked: "Blocked by safety filters",
  truncated: "Ran out of output tokens",
  no_code: "Model returned no Python",
  no_scene_class: "No Scene subclass in generated file",
  precheck: "Rejected before rendering",
  manim_missing: "manim executable not found",
  manim_runtime: "Scene failed to render",
  timeout: "Render timed out",
  no_output: "manim exited cleanly but produced no video",
};

/**
 * The one line of a failure worth storing on the render row.
 *
 * `raw` is a whole traceback and belongs in R2, not in a database column the UI prints back at
 * the user. Python puts the thing that actually went wrong on the last `SomeError: ...` line, so
 * that line plus the message is enough to tell one failure from another — "manim exited with code
 * 1" on its own, which is all a row used to keep, is enough to tell nothing from anything.
 */
export function summarize(error: RenderError): string {
  const last = [...error.raw.matchAll(/^\s*(\w*(?:Error|Exception)):\s*(.+)$/gm)].at(-1);
  const detail = last ? ` ${last[1]}: ${last[2]}` : "";
  return `${error.message}${detail}`.slice(0, 500);
}
