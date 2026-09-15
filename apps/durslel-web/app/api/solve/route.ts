import { auth } from "@clerk/nextjs/server";
import { GoogleGenAI } from "@google/genai";

import { summarize } from "@/lib/errors";
import { classify, MODEL, THINKING_LEVEL } from "@/lib/generate";

/**
 * Turn a problem — typed, photographed or scanned — into a prompt the renderer can animate.
 *
 *   POST /api/solve   multipart/form-data, one `text` or `file` field
 *   => 200 { "prompt": "Walk through ∫x·eˣ dx by parts: …" }
 *
 * This does not render anything. It reads the problem, solves it, and hands back the brief; the
 * browser then starts a render with that brief exactly as if it had been typed. Keeping the two
 * apart is what makes the whole existing path — queue, daily limit, history, repair loop — apply
 * to a photographed problem without knowing that it was one.
 *
 * The model is the same one that writes the scenes, so the brief is phrased for the reader it
 * actually has: prose, Unicode maths, no LaTeX (which is not installed in the render image).
 *
 * ponytail: signed-in is the only gate, so this call is not counted against anyone's daily
 * renders — the limit lives on startRender. Add a count here if the Gemini bill says people are
 * uploading files they never render.
 */

/** What Gemini accepts inline, narrowed to what someone would actually photograph a problem as. */
const ACCEPTED = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/heic",
  "image/heif",
  "application/pdf",
]);

/**
 * Inline data is capped at 20 MB for the whole request, and base64 costs a third on top of the
 * file's own size. Ten leaves room for that and for the instruction.
 */
const MAX_BYTES = 10 * 1024 * 1024;

/** A typed problem is a question, not an essay; the cap only keeps a pasted book off the bill. */
const MAX_TEXT = 4000;

/**
 * Reading a page and solving what is on it is slower than writing a scene, and unlike a scene
 * there is no second attempt behind it — a timeout here is the whole feature failing, so the
 * leash is longer than the 90s a render attempt gets.
 */
const TIMEOUT_MS = 120_000;

/** The model says this rather than inventing a problem out of a page that has none on it. */
const NOTHING = "NO_PROBLEM";

const INSTRUCTION = [
  "The attached file or text holds a problem — most likely maths or physics.",
  "",
  "Read it, solve it, and reply with a brief for an animator: one paragraph of plain prose",
  "describing an animation that walks a student through the solution. Name the quantities, give",
  "the steps in order, and state the final answer, so the animator never has to solve anything",
  "itself.",
  "",
  "- Write maths as Unicode (∫x·eˣ dx, x², √2, θ, ≤). Never LaTeX, never a fenced code block.",
  "- Under 150 words. No headings, no lists, no preamble — your reply is used verbatim as the",
  "  prompt, so anything that is not the brief ends up in the animation.",
  "- If it holds several problems, take the first one.",
  `- If you cannot read a problem in it, reply with exactly: ${NOTHING}`,
].join("\n");

export async function POST(request: Request) {
  const { userId } = await auth();
  if (!userId) return Response.json({ error: "not signed in" }, { status: 401 });

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return Response.json({ error: "GEMINI_API_KEY is not set." }, { status: 500 });
  }

  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  const text = form?.get("text");

  let problem;
  if (typeof text === "string" && text.trim()) {
    if (text.length > MAX_TEXT) {
      return Response.json(
        { error: `The problem must be under ${MAX_TEXT} characters.` },
        { status: 413 },
      );
    }
    problem = { text: text.trim() };
  } else if (file instanceof File) {
    // Checked before the bytes are read, so an oversized upload is refused rather than buffered.
    if (file.size > MAX_BYTES) {
      return Response.json({ error: "The file must be under 10 MB." }, { status: 413 });
    }
    if (!ACCEPTED.has(file.type)) {
      return Response.json(
        { error: `${file.type || "That file"} is not a PDF or an image.` },
        { status: 415 },
      );
    }
    const data = Buffer.from(await file.arrayBuffer()).toString("base64");
    problem = { inlineData: { mimeType: file.type, data } };
  } else {
    return Response.json(
      { error: "send the problem as `text`, or attach one file as `file`" },
      { status: 400 },
    );
  }

  let response;
  try {
    response = await new GoogleGenAI({ apiKey }).models.generateContent({
      model: MODEL,
      contents: [
        {
          role: "user",
          parts: [
            problem,
            { text: INSTRUCTION },
          ],
        },
      ],
      // The same level the scene path uses — MEDIUM in both deployed environments. Left unset,
      // a Gemini 3 model picks its own effort, and that is measured at 22.8s on a scene with
      // nothing to reason about; on a problem read off a photograph it ran past this timeout,
      // which is the whole request failing rather than one attempt of four.
      config: {
        thinkingConfig: { thinkingLevel: THINKING_LEVEL },
        abortSignal: AbortSignal.timeout(TIMEOUT_MS),
      },
    });
  } catch (e) {
    // Same classifier the render path uses, so a bad key, a spent quota and a 429 read the same
    // way here as they do on a render instead of collapsing into "something went wrong".
    const error = classify(e, 1);
    console.error(`solve failed (${error.kind}):`, error.raw);
    // classify's timeout wording belongs to the render path — "the time left for this render" —
    // and nothing is rendering yet here. Saying which of the two calls ran out of clock is the
    // difference between a one-line diagnosis and guessing.
    if (error.kind === "timeout") {
      return Response.json(
        {
          error:
            "Gemini took too long to solve the problem. Try again, or cut it down to the one question.",
        },
        { status: 504 },
      );
    }
    return Response.json({ error: summarize(error) }, { status: 502 });
  }

  const brief = response.text?.trim();
  if (!brief || brief === NOTHING) {
    return Response.json(
      {
        error:
          "inlineData" in problem
            ? "No problem could be read out of that file. Try a clearer photo."
            : "No problem could be found in that text.",
      },
      { status: 422 },
    );
  }

  return Response.json({ prompt: brief });
}
