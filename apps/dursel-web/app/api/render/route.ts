import { auth } from "@clerk/nextjs/server";
import { copyFile, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import type { RenderError } from "@/lib/errors";
import { generateScene, type Attempt } from "@/lib/generate";
import { extractSceneClass, renderScene } from "@/lib/render";
import { graphqlAsService } from "@/lib/graphql";
import { makeTitle } from "@/lib/jobs";
import { publishJob, RENDERS_DIR } from "@/lib/storage";

const MAX_ATTEMPTS = 2;

const CREATE_RENDER = `
  mutation CreateRender($input: CreateRenderInput!) {
    createRender(input: $input) { id }
  }
`;

export async function POST(request: Request) {
  // Renders cost real CPU and land in this user's history — signed in or nothing.
  const { userId } = await auth();
  if (!userId) return new Response("unauthorized", { status: 401 });

  const { prompt } = (await request.json()) as { prompt?: string };
  if (!prompt?.trim()) {
    return Response.json({ error: "prompt is required" }, { status: 400 });
  }

  const startedAt = Date.now();
  const jobId = makeJobId(prompt);
  const jobDir = path.join(RENDERS_DIR, jobId);
  await mkdir(jobDir, { recursive: true });
  await writeFile(path.join(jobDir, "prompt.txt"), prompt, "utf8");

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      let open = true;
      const send = (event: string, data: unknown) => {
        if (!open) return;
        try {
          controller.enqueue(
            encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`),
          );
        } catch {
          open = false;
        }
      };

      const errors: RenderError[] = [];
      let previous: Attempt | undefined;

      for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
        send("attempt", { n: attempt, of: MAX_ATTEMPTS });

        const generated = await generateScene(prompt, attempt, previous);
        if ("error" in generated) {
          // An API-level failure won't fix itself on a retry — stop and show it.
          errors.push(generated.error);
          send("error", generated.error);
          // Record it too: a job that dies here still has to leave a trace on disk, or it
          // looks like it is running forever.
          await writeMeta(jobDir, {
            jobId,
            prompt,
            status: "failed",
            attempts: attempt,
            errors,
          });
          send("failed", { jobId, attempts: attempt });
          break;
        }

        const { code } = generated;
        send("code", { python: code, sceneClass: extractSceneClass(code) });

        const attemptDir = path.join(jobDir, `attempt-${attempt}`);
        await mkdir(attemptDir, { recursive: true });

        const outcome = await renderScene(attemptDir, code, attempt, (line) =>
          send("log", line),
        );

        if (outcome.ok) {
          await writeFile(
            path.join(attemptDir, "manim.log"),
            outcome.result.log,
            "utf8",
          );
          // The winning attempt's artifacts are copied up to the job root, so reopening a job
          // never has to know which attempt succeeded. The per-attempt copies stay put — they
          // are what makes a retry diagnosable.
          await copyFile(outcome.result.video, path.join(jobDir, "out.mp4"));
          await copyFile(
            path.join(attemptDir, "scene.py"),
            path.join(jobDir, "scene.py"),
          );
          await copyFile(
            path.join(attemptDir, "manim.log"),
            path.join(jobDir, "manim.log"),
          );
          await writeMeta(jobDir, {
            jobId,
            prompt,
            status: "ok",
            attempts: attempt,
            errors,
          });

          // Container disk is ephemeral — the video only outlives this render if it reaches R2.
          // A publish failure must not present as a failed render: the video exists and the
          // user is watching it, so surface the problem without discarding the result.
          try {
            await publishJob(jobId, jobDir, [
              { name: "out.mp4", contentType: "video/mp4" },
              { name: "meta.json", contentType: "application/json" },
              { name: "prompt.txt", contentType: "text/plain; charset=utf-8" },
              { name: "scene.py", contentType: "text/x-python; charset=utf-8" },
              { name: "manim.log", contentType: "text/plain; charset=utf-8" },
            ]);
          } catch (e) {
            send("warning", {
              message: "Rendered fine, but saving to R2 failed — this video is not persisted.",
              raw: e instanceof Error ? (e.stack ?? e.message) : String(e),
            });
          }

          // Only finished renders are recorded — a failed job has no video to reopen. Same
          // reasoning as the publish above: a bookkeeping failure must not present as a failed
          // render, so this reports and moves on rather than throwing.
          // Authenticated as the service, not as the user: this runs from inside the response
          // stream, long after the request scope that could mint a session token has gone.
          try {
            await graphqlAsService(
              CREATE_RENDER,
              {
                input: {
                  jobId,
                  title: makeTitle(prompt),
                  url: `/api/video/${jobId}`,
                  prompt,
                  sceneClass: extractSceneClass(code),
                  attempts: attempt,
                  durationMs: Date.now() - startedAt,
                },
              },
              userId,
            );
          } catch (e) {
            send("warning", {
              message: "Rendered fine, but this job could not be added to your history.",
              raw: e instanceof Error ? (e.stack ?? e.message) : String(e),
            });
          }

          send("done", { jobId, video: `/api/video/${jobId}` });
          break;
        }

        await writeFile(
          path.join(attemptDir, "error.json"),
          JSON.stringify(outcome.error, null, 2),
          "utf8",
        );
        errors.push(outcome.error);
        send("error", outcome.error);

        previous = { code, error: outcome.error.raw };

        if (attempt === MAX_ATTEMPTS) {
          await writeMeta(jobDir, {
            jobId,
            prompt,
            status: "failed",
            attempts: attempt,
            errors,
          });
          send("failed", { jobId, attempts: attempt });
        }
      }

      if (open) controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}

function makeJobId(prompt: string): string {
  // YYYYMMDDHHMMSS — 14 chars. Stop before the millisecond dot: the id becomes a path segment
  // and /api/video/[id] only accepts [A-Za-z0-9-].
  const stamp = new Date().toISOString().replace(/[-:T]/g, "").slice(0, 14);
  const slug =
    prompt
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 40) || "scene";
  return `${stamp}-${slug}`;
}

async function writeMeta(dir: string, meta: unknown) {
  await writeFile(
    path.join(dir, "meta.json"),
    JSON.stringify({ ...(meta as object), finishedAt: new Date().toISOString() }, null, 2),
    "utf8",
  );
}
