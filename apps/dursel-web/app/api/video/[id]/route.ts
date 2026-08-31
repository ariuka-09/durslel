import { getVideo } from "@/lib/storage";

export async function GET(
  request: Request,
  ctx: RouteContext<"/api/video/[id]">,
) {
  const { id } = await ctx.params;

  // id becomes a filesystem path and an R2 key — allow only what makeJobId produces.
  if (!/^[A-Za-z0-9-]+$/.test(id)) {
    return new Response("bad id", { status: 400 });
  }

  const video = await getVideo(id);
  if (!video) return new Response("not found", { status: 404 });

  const headers: Record<string, string> = {
    "Content-Type": "video/mp4",
    // Renders are immutable once written, so let the browser keep them.
    "Cache-Control": "public, max-age=31536000, immutable",
  };
  if (video.size !== null) headers["Content-Length"] = String(video.size);

  // Same URL, but ?download=1 saves it instead of playing it.
  if (new URL(request.url).searchParams.has("download")) {
    headers["Content-Disposition"] = `attachment; filename="${id}.mp4"`;
  }

  return new Response(video.stream, { headers });
}
