import { copyFile, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { generateScene, type Attempt } from "@/lib/generate";
import { graphqlAsService } from "@/lib/graphql";
import { extractSceneClass, renderScene } from "@/lib/render";
import { publishJob, RENDERS_DIR } from "@/lib/storage";

const MAX_ATTEMPTS = 2;

const COMPLETE_RENDER = `
  mutation CompleteRender($jobId: String!, $input: CompleteRenderInput!) {
    completeRender(jobId: $jobId, input: $input) { id }
  }
`;

/**
 * The renderer. Not a browser endpoint.
 *
 * manim needs a subprocess, a filesystem and up to three minutes, none of which a Worker has — so
 * it runs here, in the container, and dursel-service hands it work. Nothing in the browser calls
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
  void run(jobId, prompt, userId).catch(() => undefined);

  return new Response(null, { status: 202 });
}

async function run(jobId: string, prompt: string, userId: string): Promise<void> {
  const startedAt = Date.now();
  const jobDir = path.join(RENDERS_DIR, jobId);
  await mkdir(jobDir, { recursive: true });
  await writeFile(path.join(jobDir, "prompt.txt"), prompt, "utf8");

  let previous: Attempt | undefined;
  let lastError = "";

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const generated = await generateScene(prompt, attempt, previous);
    if ("error" in generated) {
      // An API-level failure will not fix itself on a retry.
      await complete(jobId, userId, {
        status: "FAILED",
        error: generated.error.message,
        attempts: attempt,
        durationMs: Date.now() - startedAt,
      });
      return;
    }

    const { code } = generated;
    const attemptDir = path.join(jobDir, `attempt-${attempt}`);
    await mkdir(attemptDir, { recursive: true });

    const outcome = await renderScene(attemptDir, code, attempt, () => undefined);

    if (outcome.ok) {
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

    lastError = outcome.error.message;
    previous = { code, error: outcome.error.raw };
  }

  await complete(jobId, userId, {
    status: "FAILED",
    error: lastError,
    attempts: MAX_ATTEMPTS,
    durationMs: Date.now() - startedAt,
  });
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
