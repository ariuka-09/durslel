import { ApiError, FinishReason, GoogleGenAI, ThinkingLevel } from "@google/genai";
import { readFile } from "node:fs/promises";
import path from "node:path";

import { renderError, type RenderError } from "./errors";

// Swap this in .env.local to A/B a different model — nothing else in the app cares.
//
// This is a preview model, which can be withdrawn without notice. It stays the default anyway
// because the GA alternatives were measured against this system prompt and are worse here:
// gemini-3.8-flash returned 503 "experiencing high demand" on three of four calls, and
// gemini-3.5-flash spent 3.1k thinking tokens and 28s on a scene this one writes in 5s.
const MODEL = process.env.GEMINI_MODEL ?? "gemini-3-flash-preview";

// Left unset, a Gemini 3 model chooses its own thinking effort, and that was where nearly all of
// a render's wall time went. Measured on this system prompt, same scene:
//
//   default effort   22.8s   3324 thinking tokens
//   LOW               5-9s      0 thinking tokens
//
// This prompt is prescriptive enough that there is little left to reason about, and a scene that
// still fails gets rerolled with the verbatim traceback. MINIMAL was measured too and is not an
// improvement: same token counts, but one call in three ran 34s, trading a consistent five
// seconds for an unpredictable half-minute.
//
// Watch the reroll rate before lowering this. A second attempt costs another Gemini call AND
// another render, so a cheaper thinking level that fails more often is a net loss. Set
// GEMINI_THINKING_LEVEL to MINIMAL, LOW, MEDIUM or HIGH to A/B it; the enum lookup is what
// validates it, so an unrecognised value falls back to LOW rather than reaching the API.
const THINKING_LEVEL: ThinkingLevel =
  ThinkingLevel[
    (process.env.GEMINI_THINKING_LEVEL ?? "LOW").toUpperCase() as keyof typeof ThinkingLevel
  ] ?? ThinkingLevel.LOW;

// Thinking tokens are drawn from this same budget, so leave generous headroom: a scene is
// ~1.5k tokens of Python but the model may reason for a while about the manim API first.
const MAX_OUTPUT_TOKENS = 32000;

let systemPrompt: string | null = null;

async function loadSystemPrompt(): Promise<string> {
  if (systemPrompt === null) {
    systemPrompt = await readFile(
      path.join(process.cwd(), "prompts", "system.md"),
      "utf8",
    );
  }
  return systemPrompt;
}

/**
 * Remove indentation the whole block shares.
 *
 * The model sometimes emits the fence indented (inside a list item, say). A plain trim() only
 * cleans the first line, leaving every later line indented — which makes `class Foo(Scene):`
 * no longer match at line start and gets a perfectly good file rejected as `no_scene_class`.
 */
function dedent(code: string): string {
  const lines = code.split("\n");
  let min = Infinity;
  for (const line of lines) {
    if (!line.trim()) continue;
    min = Math.min(min, line.length - line.trimStart().length);
  }
  if (!Number.isFinite(min) || min === 0) return code;
  return lines.map((l) => (l.trim() ? l.slice(min) : l)).join("\n");
}

/** Pull the Python out of the model's reply. */
function extractCode(text: string): string | null {
  // Tolerate ```python, ```py, a bare ```, and any indentation before the fence.
  const fenced = text.match(/```[ \t]*(?:python|py)?[^\n]*\n([\s\S]*?)```/i);
  if (fenced) return dedent(fenced[1]).trim();
  // The model occasionally answers with a bare file and no fence.
  if (text.trimStart().startsWith("from manim")) return dedent(text).trim();
  return null;
}

export interface Attempt {
  code: string;
  error: string;
}

/**
 * One Gemini call. `previous` is set on the repair attempt and carries the failed code plus
 * its verbatim traceback, so the model fixes that specific error rather than starting over.
 */
export async function generateScene(
  prompt: string,
  attempt: number,
  previous?: Attempt,
): Promise<{ code: string } | { error: RenderError }> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return {
      error: renderError(
        "auth",
        "GEMINI_API_KEY is not set.",
        "Read from process.env.GEMINI_API_KEY — add it to .env.local in the project root and restart `npm run dev`. Get a key at https://aistudio.google.com/apikey",
        attempt,
      ),
    };
  }

  const ai = new GoogleGenAI({ apiKey });
  const system = await loadSystemPrompt();

  const userContent = previous
    ? [
        `Animate this: ${prompt}`,
        "",
        "Your previous attempt did not render. Here is the file you wrote:",
        "",
        "```python",
        previous.code,
        "```",
        "",
        "And here is exactly why it was rejected:",
        "",
        "```",
        previous.error,
        "```",
        "",
        "Fix that specific error and return the complete corrected file.",
      ].join("\n")
    : `Animate this: ${prompt}`;

  let response;
  try {
    response = await ai.models.generateContent({
      model: MODEL,
      contents: userContent,
      config: {
        systemInstruction: system,
        maxOutputTokens: MAX_OUTPUT_TOKENS,
        thinkingConfig: { thinkingLevel: THINKING_LEVEL },
      },
    });
  } catch (e) {
    return { error: classify(e, attempt) };
  }

  // A prompt rejected before generation reports the reason here, with no candidates at all.
  const blockReason = response.promptFeedback?.blockReason;
  if (blockReason) {
    return {
      error: renderError(
        "blocked",
        `Gemini blocked the prompt (${blockReason}).`,
        JSON.stringify(response.promptFeedback, null, 2),
        attempt,
      ),
    };
  }

  const candidate = response.candidates?.[0];
  const finish = candidate?.finishReason;

  if (finish === FinishReason.MAX_TOKENS) {
    return {
      error: renderError(
        "truncated",
        `The reply hit the ${MAX_OUTPUT_TOKENS}-token output cap and was cut off mid-file.`,
        `finishReason: MAX_TOKENS\nusage: ${JSON.stringify(response.usageMetadata ?? {}, null, 2)}\n\n--- partial reply ---\n${response.text ?? "(none)"}`,
        attempt,
      ),
    };
  }

  if (finish && finish !== FinishReason.STOP) {
    return {
      error: renderError(
        finish === FinishReason.SAFETY ||
          finish === FinishReason.PROHIBITED_CONTENT
          ? "blocked"
          : "api_error",
        `Generation stopped early (${finish}).`,
        JSON.stringify(candidate, null, 2),
        attempt,
      ),
    };
  }

  const text = response.text ?? "";
  const code = extractCode(text);
  if (!code) {
    return {
      error: renderError(
        "no_code",
        "The model's reply contained no Python block.",
        text || "(the response had no text content at all)",
        attempt,
      ),
    };
  }

  return { code };
}

function classify(e: unknown, attempt: number): RenderError {
  if (e instanceof ApiError) {
    const raw = `status: ${e.status}\nmessage: ${e.message}`;
    // Google answers a bad key with 400 API_KEY_INVALID, not 401, so status alone would file the
    // single most likely misconfiguration under "unexpected API error" and send the loop off to
    // retry it three more times.
    if (e.status === 401 || e.status === 403 || /API_KEY_INVALID/.test(e.message)) {
      return renderError(
        "auth",
        `Google rejected the API key (${e.status}).`,
        `${raw}\n\nCheck GEMINI_API_KEY in .env.local, and that the Generative Language API is enabled for that key.`,
        attempt,
      );
    }
    if (e.status === 429) {
      // Two very different 429s wear the same status code. A per-minute limit clears itself in
      // under a minute and is worth waiting out; a per-day one does not clear until tomorrow, and
      // retrying it only spends the render's budget confirming that. The free tier's daily cap on
      // gemini-3-flash is twenty requests for the whole project, so this is not a rare corner.
      if (/PerDay|RequestsPerDay/i.test(e.message)) {
        return renderError(
          "quota_exhausted",
          "The Gemini project has used up its quota for today.",
          `${raw}\n\nThe free tier allows 20 generate-content requests per day per model. Enable billing on the Google Cloud project behind GEMINI_API_KEY, or switch GEMINI_MODEL to a model whose quota is not spent.`,
          attempt,
        );
      }
      return renderError(
        "rate_limit",
        "Rate limited (429) — the per-minute quota.",
        `${raw}\n\nWait a minute, or switch GEMINI_MODEL to a model with a higher quota.`,
        attempt,
      );
    }
    return renderError(
      "api_error",
      `Gemini returned ${e.status}.`,
      raw,
      attempt,
    );
  }
  // Network-level failures surface as plain TypeError from fetch.
  if (e instanceof TypeError) {
    return renderError(
      "api_connection",
      "Could not reach the Gemini API.",
      e.stack ?? e.message,
      attempt,
    );
  }
  return renderError(
    "api_error",
    "Unexpected error while calling Gemini.",
    e instanceof Error ? (e.stack ?? e.message) : String(e),
    attempt,
  );
}
