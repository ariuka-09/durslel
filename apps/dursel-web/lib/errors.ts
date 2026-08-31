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
  | "api_error"
  | "api_connection"
  | "blocked"
  | "truncated"
  | "no_code"
  | "no_scene_class"
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
  api_error: "Gemini API error",
  api_connection: "Could not reach Gemini",
  blocked: "Blocked by safety filters",
  truncated: "Ran out of output tokens",
  no_code: "Model returned no Python",
  no_scene_class: "No Scene subclass in generated file",
  manim_missing: "manim executable not found",
  manim_runtime: "Scene failed to render",
  timeout: "Render timed out",
  no_output: "manim exited cleanly but produced no video",
};
