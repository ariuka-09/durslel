import { servePublicVideo } from "../../worker/public-video";

const bytes = Uint8Array.from({ length: 1000 }, (_, i) => i % 256);
const assets = {
  fetch: async (request: Request) =>
    new URL(request.url).pathname === "/videos/clip.mp4"
      ? new Response(bytes, { headers: { "Content-Type": "video/mp4" } })
      : new Response("not found", { status: 404 }),
};

const get = (range?: string, path = "/videos/clip.mp4", method = "GET") =>
  servePublicVideo(
    assets,
    new Request(`https://durslel.com${path}`, {
      method,
      headers: range ? { Range: range } : {},
    }),
  );

describe("servePublicVideo", () => {
  it("leaves every other path to the app", async () => {
    expect(await get(undefined, "/api/video/abc")).toBeNull();
    expect(await get(undefined, "/videos/missing.mp4")).toBeNull();
  });

  it("serves the whole file without a range, saying ranges are accepted", async () => {
    const res = (await get())!;
    expect(res.status).toBe(200);
    expect(res.headers.get("accept-ranges")).toBe("bytes");
    expect(res.headers.get("content-type")).toBe("video/mp4");
    expect((await res.arrayBuffer()).byteLength).toBe(1000);
  });

  it("answers the ranges a browser sends", async () => {
    const open = (await get("bytes=0-"))!;
    expect(open.status).toBe(206);
    expect(open.headers.get("content-range")).toBe("bytes 0-999/1000");

    const mid = (await get("bytes=100-199"))!;
    expect(mid.headers.get("content-range")).toBe("bytes 100-199/1000");
    expect(mid.headers.get("content-length")).toBe("100");
    expect([...new Uint8Array(await mid.arrayBuffer())]).toEqual([...bytes.slice(100, 200)]);

    const suffix = (await get("bytes=-10"))!;
    expect(suffix.headers.get("content-range")).toBe("bytes 990-999/1000");

    const past = (await get("bytes=900-5000"))!;
    expect(past.headers.get("content-range")).toBe("bytes 900-999/1000");
  });

  it("refuses a range past the end", async () => {
    const res = (await get("bytes=1000-"))!;
    expect(res.status).toBe(416);
    expect(res.headers.get("content-range")).toBe("bytes */1000");
  });

  it("sends no body for HEAD", async () => {
    const res = (await get("bytes=0-9", "/videos/clip.mp4", "HEAD"))!;
    expect(res.status).toBe(206);
    expect(res.body).toBeNull();
  });
});
