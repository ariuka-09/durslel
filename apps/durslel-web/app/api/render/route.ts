import { copyFile, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { generateScene, type Attempt } from "@/lib/generate";
import { summarize, type RenderError } from "@/lib/errors";
import { graphqlAsService } from "@/lib/graphql";
import { precheck } from "@/lib/precheck";
import { extractSceneClass, renderScene } from "@/lib/render";
import { publishJob, RENDERS_DIR } from "@/lib/storage";

/**
 * How hard to try, and for how long.
 *
 * Attempt one succeeds a bit over half the time and the repair attempt recovers most of the rest,
 * so the ceiling is a wall clock rather than a count: keep rerolling until the scene renders or
 * the budget is gone. The gate in lib/precheck.ts makes a doomed attempt cost a second instead of
 * a minute, which is what makes four attempts fit inside four minutes at all.
 */
const MAX_ATTEMPTS = Number(process.env.MAX_ATTEMPTS ?? 4);
const BUDGET_MS = Number(process.env.RENDER_BUDGET_MS ?? 240_000);
/** Below this there is not enough clock left for an attempt to finish, so don't start one. */
const MIN_ATTEMPT_MS = 25_000;

/**
 * Nothing a retry can fix inside this render: the key is wrong, Gemini refused the prompt itself,
 * or the project's daily quota is gone until tomorrow. Retrying any of these only spends the
 * budget on the same answer and buries the real reason under "the render budget ran out".
 */
const FATAL = new Set(["auth", "blocked", "quota_exhausted"]);

/**
 * How long to wait out a 429 before asking again.
 *
 * The free tier's quota is per minute, so retrying a rate limit immediately just spends the whole
 * attempt budget inside one second and fails a render that would have gone through on its own a
 * moment later — which is exactly what a benchmark run did, twelve times out of twenty.
 */
const RATE_LIMIT_BACKOFF_MS = 20_000;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const COMPLETE_RENDER = `
  mutation CompleteRender($jobId: String!, $input: CompleteRenderInput!) {
    completeRender(jobId: $jobId, input: $input) { id }
  }
`;

/**
 * The renderer. Not a browser endpoint.
 *
 * manim needs a subprocess, a filesystem and up to three minutes, none of which a Worker has — so
 * it runs here, in the container, and durslel-service hands it work. Nothing in the browser calls
 * this: the app talks only to GraphQL, and the row this job belongs to already exists as PENDING
 * before the request arrives.
 *
 * Authenticated with the Clerk secret both services hold. Without that check this would be an
 * open "execute model-written Python" endpoint on the public internet.
 */
export async function POST(request: Request) {
  const secret = process.env.CLERK_SECRET_KEY;
  if (!secret || request.headers.get("X-Dursel-Service") !== secret) {
    return new Response("unauthorized", { status: 401 });
  }

  const { jobId, prompt, userId } = (await request.json()) as {
    jobId?: string;
    prompt?: string;
    userId?: string;
  };
  if (!jobId || !prompt || !userId) {
    return new Response("jobId, prompt and userId are required", { status: 400 });
  }
  // jobId becomes a path segment and an R2 key.
  if (!/^[A-Za-z0-9-]+$/.test(jobId)) {
    return new Response("bad jobId", { status: 400 });
  }

  // Accepted, not awaited. The container is a long-lived Node process, so the work outlives this
  // response — which is the point: the caller is a Worker that must not sit open for minutes.
  //
  // The catch marks the row rather than swallowing: anything thrown out here — a full disk, a
  // bug in the loop — used to leave the row PENDING forever with the browser polling it every
  // 1.5 seconds and nothing on its way to ever answer.
  void run(jobId, prompt, userId).catch(async (e: unknown) => {
    console.error(`render crashed for ${jobId}:`, e);
    await complete(jobId, userId, {
      status: "FAILED",
      error: `The renderer crashed: ${e instanceof Error ? e.message : String(e)}`,
    });
  });

  return new Response(null, { status: 202 });
}

async function run(jobId: string, prompt: string, userId: string): Promise<void> {
  const startedAt = Date.now();
  const jobDir = path.join(RENDERS_DIR, jobId);
  await mkdir(jobDir, { recursive: true });
  await writeFile(path.join(jobDir, "prompt.txt"), prompt, "utf8");

  let previous: Attempt | undefined;
  let lastError = "";
  let attempt = 0;

  while (attempt < MAX_ATTEMPTS && BUDGET_MS - (Date.now() - startedAt) > MIN_ATTEMPT_MS) {
    attempt++;
    const attemptDir = path.join(jobDir, `attempt-${attempt}`);
    await mkdir(attemptDir, { recursive: true });

    const generated = await generateScene(prompt, attempt, previous);
    if ("error" in generated) {
      await keepEvidence(jobId, jobDir, attempt, generated.error);
      lastError = summarize(generated.error);
      // A rejected key or a refused prompt answers the same way every time.
      if (FATAL.has(generated.error.kind)) break;
      if (generated.error.kind === "rate_limit") {
        const left = BUDGET_MS - (Date.now() - startedAt) - MIN_ATTEMPT_MS;
        if (left <= 0) break;
        await sleep(Math.min(RATE_LIMIT_BACKOFF_MS, left));
        // Waiting out a quota is not an attempt at writing the scene, so it does not cost one.
        attempt--;
      }
      // A truncated reply or a dropped connection is worth asking again, but not worth asking to
      // "fix" a file the model never managed to produce.
      previous = undefined;
      continue;
    }

    const { code } = generated;

    // A second here, or a minute finding the same thing out from manim.
    const rejected = await precheck(attemptDir, code);
    if (rejected) {
      const error: RenderError = {
        kind: "precheck",
        message: "The generated scene was rejected before rendering.",
        raw: rejected,
        attempt,
      };
      await keepEvidence(jobId, jobDir, attempt, error);
      lastError = summarize(error);
      previous = { code, error: rejected };
      continue;
    }

    const remaining = BUDGET_MS - (Date.now() - startedAt);
    const outcome = await renderScene(attemptDir, code, attempt, () => undefined, remaining);

    if (!outcome.ok) {
      await keepEvidence(jobId, jobDir, attempt, outcome.error);
      lastError = summarize(outcome.error);
      previous = { code, error: outcome.error.raw };
      continue;
    }

    await writeFile(path.join(attemptDir, "manim.log"), outcome.result.log, "utf8");
    // The winning attempt's artifacts are copied up to the job root, so nothing downstream has
    // to know which attempt succeeded.
    await copyFile(outcome.result.video, path.join(jobDir, "out.mp4"));
    await copyFile(path.join(attemptDir, "scene.py"), path.join(jobDir, "scene.py"));
    await copyFile(path.join(attemptDir, "manim.log"), path.join(jobDir, "manim.log"));

    // Container disk is ephemeral — the video only outlives this render if it reaches R2, so a
    // publish that fails is a failed render rather than a success with no video behind it.
    try {
      await publishJob(jobId, jobDir, [
        { name: "out.mp4", contentType: "video/mp4" },
        { name: "prompt.txt", contentType: "text/plain; charset=utf-8" },
        { name: "scene.py", contentType: "text/x-python; charset=utf-8" },
        { name: "manim.log", contentType: "text/plain; charset=utf-8" },
      ]);
    } catch (e) {
      await complete(jobId, userId, {
        status: "FAILED",
        error: `Rendered, but could not be saved: ${e instanceof Error ? e.message : String(e)}`,
        attempts: attempt,
        durationMs: Date.now() - startedAt,
      });
      return;
    }

    await complete(jobId, userId, {
      status: "OK",
      url: `/api/video/${jobId}`,
      sceneClass: extractSceneClass(code),
      attempts: attempt,
      durationMs: Date.now() - startedAt,
    });
    return;
  }

  await complete(jobId, userId, {
    status: "FAILED",
    error: lastError || "The render budget ran out before a scene could be produced.",
    // A job that only ever waited out a rate limit has decremented its way back to zero.
    attempts: Math.max(attempt, 1),
    durationMs: Date.now() - startedAt,
  });
}

/**
 * Put a failed attempt somewhere it can still be read tomorrow.
 *
 * publishJob only ever ran on the winning path, so the code and the traceback of every failure
 * died with the container's disk and the row kept nothing but "manim exited with code 1". That
 * made each failure unlearnable, which is the actual reason the success rate sat still. Each
 * attempt gets its own folder under the job prefix, so a job that took four tries reads as four.
 *
 * Best-effort on purpose: losing the evidence is bad, but failing the render because the evidence
 * could not be filed would be worse.
 */
async function keepEvidence(
  jobId: string,
  jobDir: string,
  attempt: number,
  error: RenderError,
): Promise<void> {
  // publishJob resolves `name` against this directory and uses the same string as the R2 key, so
  // the job directory is what has to be passed here — not the attempt's own.
  try {
    await writeFile(
      path.join(jobDir, `attempt-${attempt}`, "error.txt"),
      `kind: ${error.kind}\nmessage: ${error.message}\n\n${error.raw}\n`,
      "utf8",
    );
    await publishJob(jobId, jobDir, [
      // scene.py is absent when generation itself failed; publishJob skips what is not there.
      { name: `attempt-${attempt}/scene.py`, contentType: "text/x-python; charset=utf-8" },
      { name: `attempt-${attempt}/error.txt`, contentType: "text/plain; charset=utf-8" },
    ]);
  } catch (e) {
    console.error(`could not keep evidence for ${jobId} attempt ${attempt}:`, e);
  }
}

async function complete(
  jobId: string,
  userId: string,
  input: Record<string, unknown>,
): Promise<void> {
  // Nothing to report the failure to if this is what failed — the row stays PENDING and the
  // client keeps polling, which is the one outcome worth logging loudly.
  try {
    await graphqlAsService(COMPLETE_RENDER, { jobId, input }, userId);
  } catch (e) {
    console.error(`completeRender failed for ${jobId}:`, e);
  }
}
