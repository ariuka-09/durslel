/** Job ids are generated in app/api/render/route.ts and only ever contain these characters. */
const VIDEO_PATH = /^\/api\/video\/([A-Za-z0-9-]+)$/;

/**
 * Serves a finished video straight from R2, or returns null when the request is not for one or the
 * bucket has no such object — the caller decides what a miss falls through to.
 *
 * This is the whole point of persisting videos: coming back tomorrow to rewatch a render should
 * not boot a manim image, nor run the Next.js app.
 */
export async function serveVideo(bucket: R2Bucket, request: Request): Promise<Response | null> {
  const url = new URL(request.url);
  const match = url.pathname.match(VIDEO_PATH);
  if (!match || (request.method !== "GET" && request.method !== "HEAD")) return null;

  const object = await bucket.get(`jobs/${match[1]}/out.mp4`, {
    range: request.headers,
    onlyIf: request.headers,
  });
  if (!object) return null;

  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set("etag", object.httpEtag);
  // A render never changes once written.
  headers.set("Cache-Control", "public, max-age=31536000, immutable");
  headers.set("Accept-Ranges", "bytes");

  // ?download=1 turns the same URL into a file download with a sensible name, so the
  // link can be shared for viewing and used for saving without a second endpoint.
  if (url.searchParams.has("download")) {
    headers.set("Content-Disposition", `attachment; filename="${match[1]}.mp4"`);
  }

  const body = "body" in object ? object.body : null;
  const range = object.range as { offset?: number; length?: number } | undefined;
  // A 206 MUST carry Content-Range. Without it the browser aborts the response
  // (net::ERR_ABORTED) and <video> reports "no supported sources" — invisible to curl,
  // which never sends a Range header.
  const partial = Boolean(body && request.headers.has("range") && range);

  if (partial && range) {
    const offset = range.offset ?? 0;
    const length = range.length ?? object.size - offset;
    headers.set("Content-Range", `bytes ${offset}-${offset + length - 1}/${object.size}`);
    headers.set("Content-Length", String(length));
  } else if (body) {
    headers.set("Content-Length", String(object.size));
  }

  // No body means the precondition matched: 304.
  const status = body ? (partial ? 206 : 200) : 304;
  return new Response(request.method === "HEAD" ? null : body, { status, headers });
}
