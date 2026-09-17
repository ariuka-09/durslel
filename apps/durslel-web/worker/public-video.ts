/** The landing page's own renders, shipped in public/videos. */
const PUBLIC_VIDEO = /^\/videos\/[a-z0-9-]+\.mp4$/;

/**
 * Serves public/videos with byte ranges, or returns null when the request is not for one.
 *
 * Static assets alone answer a Range request with the whole file and a 200. Chrome then reports
 * the video as seekable only at 0, so every seek the landing page makes on scroll is dropped and
 * the scene sits on the first frame, which is black. `next dev` does ranges, so this only shows
 * once deployed. Requests reach here ahead of the assets through `run_worker_first` in
 * wrangler.jsonc.
 */
export async function servePublicVideo(
  assets: { fetch(request: Request): Promise<Response> },
  request: Request,
): Promise<Response | null> {
  const url = new URL(request.url);
  if (!PUBLIC_VIDEO.test(url.pathname)) return null;
  if (request.method !== "GET" && request.method !== "HEAD") return null;

  const file = await assets.fetch(new Request(url));
  if (!file.ok) return null;
  const body = await file.arrayBuffer();
  const size = body.byteLength;

  const headers = new Headers(file.headers);
  headers.set("Accept-Ranges", "bytes");

  let status = 200;
  let start = 0;
  let end = size - 1;
  // Browsers ask for one range, open-ended or suffix. Anything else gets the whole file.
  const range = /^bytes=(\d*)-(\d*)$/.exec(request.headers.get("range") ?? "");
  if (range && (range[1] || range[2])) {
    if (range[1]) {
      start = Number(range[1]);
      if (range[2]) end = Math.min(Number(range[2]), size - 1);
    } else {
      start = Math.max(0, size - Number(range[2]));
    }
    if (start > end) {
      headers.set("Content-Range", `bytes */${size}`);
      headers.delete("Content-Length");
      return new Response(null, { status: 416, headers });
    }
    status = 206;
    headers.set("Content-Range", `bytes ${start}-${end}/${size}`);
  }

  headers.set("Content-Length", String(end - start + 1));
  return new Response(
    request.method === "HEAD" ? null : body.slice(start, end + 1),
    { status, headers },
  );
}
