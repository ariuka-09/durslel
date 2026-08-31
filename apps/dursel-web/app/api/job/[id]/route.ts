import { auth } from "@clerk/nextjs/server";

import { graphql } from "@/lib/graphql";
import { getJobText } from "@/lib/storage";

interface RenderRow {
  id: string;
  title: string;
  prompt: string;
  sceneClass: string | null;
}

const GET_RENDER_BY_JOB_ID = `
  query GetRenderByJobId($jobId: String!) {
    getRenderByJobId(jobId: $jobId) { id title prompt sceneClass }
  }
`;

/**
 * Everything needed to put a finished job back on screen exactly as it looked when it was
 * rendered. The mp4 is not here — it stays on /api/video/[id], which is deliberately public so
 * a copied link plays for whoever it was sent to.
 *
 * The prompt now comes from the database rather than prompt.txt; the source and log are still
 * read from storage, because they are artifacts of the render rather than facts about it.
 */
export async function GET(request: Request, ctx: RouteContext<"/api/job/[id]">) {
  const { userId } = await auth();
  if (!userId) return new Response("unauthorized", { status: 401 });

  const { id } = await ctx.params;
  // id becomes an R2 key — allow only what makeJobId produces.
  if (!/^[A-Za-z0-9-]+$/.test(id)) return new Response("bad id", { status: 400 });

  // getRenderByJobId is scoped to the caller in the resolver, so this is the ownership check as
  // well as the lookup: another account's job is simply absent.
  const { getRenderByJobId: render } = await graphql<{
    getRenderByJobId: RenderRow | null;
  }>(GET_RENDER_BY_JOB_ID, { jobId: id });

  if (!render) return new Response("not found", { status: 404 });

  const [code, log] = await Promise.all([
    getJobText(id, "scene.py"),
    getJobText(id, "manim.log"),
  ]);

  return Response.json({
    prompt: render.prompt,
    title: render.title,
    code: code ?? "",
    sceneClass: render.sceneClass,
    // The live render streams one log line per event; replaying splits the saved file the
    // same way so the panel looks identical either way.
    log: log ? log.replace(/\n$/, "").split("\n") : [],
  });
}
