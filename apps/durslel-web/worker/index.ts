import { Container } from "@cloudflare/containers";

import { isAppPath } from "../lib/app-paths";

/**
 * Bindings and secrets for the web deployable: the container, the video bucket, and what the
 * container needs to do its job. No D1 — the database belongs to durslel-service, which is its own
 * Worker, and this one no longer answers /graphql.
 */
interface Env {
  MANIM: DurableObjectNamespace<ManimContainer>;
  VIDEOS: R2Bucket;

  GEMINI_API_KEY: string;
  /** Both optional: lib/generate.ts owns the defaults, these only override them. */
  GEMINI_MODEL?: string;
  GEMINI_THINKING_LEVEL?: string;
  CLERK_SECRET_KEY: string;

  R2_ACCOUNT_ID: string;
  R2_ACCESS_KEY_ID: string;
  R2_SECRET_ACCESS_KEY: string;
  R2_BUCKET: string;

  /** Where the app's route handlers send GraphQL. Points at the durslel-service Worker. */
  GRAPHQL_URL?: string;

  /** Wire (payments). sk_test_ routes to the sandbox operator; sk_live_ needs WIRE_OPERATORS. */
  WIRE_API_KEY?: string;
  /** Opt-in for a live key, set per environment in wrangler.jsonc. See lib/wire.ts. */
  WIRE_ALLOW_LIVE?: string;
  WIRE_OPERATORS?: string;
  /** Public origin of this app, for the URL Wire returns the buyer to. */
  APP_ORIGIN?: string;
  /** Signing secret (whsec_…) for the endpoint registered with Wire. Shown once, at creation. */
  WIRE_WEBHOOK_SECRET?: string;
}

export class ManimContainer extends Container<Env> {
  defaultPort = 3000;

  // Memory bills for the whole time the instance is up, idle included, while CPU bills only on
  // use — so this idle tail is the largest single line on the bill. At 20 minutes it cost roughly
  // ten times the render that preceded it. Five still covers someone iterating, who watches a
  // render finish and then types the next prompt, without paying for a quarter hour of nothing.
  //
  // The trade is cold starts, and the image is large. With a queue in front, a cold start stalls
  // everyone waiting behind it — measure a real boot before shortening this any further.
  sleepAfter = "5m";

  // Secrets reach the container only through here. They are set with `wrangler secret put`,
  // never committed. `envVars` is a plain property on the base class, so it has to be assigned
  // after super() rather than declared as a getter.
  constructor(ctx: DurableObjectState<Env>, env: Env) {
    super(ctx, env);
    // Unset entries are dropped rather than forwarded. A missing secret otherwise reaches the
    // container as the string "undefined", which is truthy — and lib/storage.ts decides whether
    // R2 is configured by truthiness, so four "undefined"s look exactly like a working setup and
    // every video read fails as a 500 instead of a clean 404. It is the same reason the optional
    // vars below were already being omitted rather than passed empty: lib/graphql.ts and
    // lib/wire.ts fall back with `??`, which any non-undefined value defeats.
    //
    // GEMINI_MODEL carries no default here on purpose. lib/generate.ts owns it, and naming a
    // second default at this layer is how a container stays pinned to a model the app has left.
    this.envVars = Object.fromEntries(
      Object.entries({
        GEMINI_API_KEY: env.GEMINI_API_KEY,
        CLERK_SECRET_KEY: env.CLERK_SECRET_KEY,
        R2_ACCOUNT_ID: env.R2_ACCOUNT_ID,
        R2_ACCESS_KEY_ID: env.R2_ACCESS_KEY_ID,
        R2_SECRET_ACCESS_KEY: env.R2_SECRET_ACCESS_KEY,
        R2_BUCKET: env.R2_BUCKET,
        GEMINI_MODEL: env.GEMINI_MODEL,
        GEMINI_THINKING_LEVEL: env.GEMINI_THINKING_LEVEL,
        GRAPHQL_URL: env.GRAPHQL_URL,
        WIRE_API_KEY: env.WIRE_API_KEY,
        WIRE_ALLOW_LIVE: env.WIRE_ALLOW_LIVE,
        WIRE_OPERATORS: env.WIRE_OPERATORS,
        APP_ORIGIN: env.APP_ORIGIN,
        WIRE_WEBHOOK_SECRET: env.WIRE_WEBHOOK_SECRET,
      }).filter(([, value]) => value !== undefined),
    ) as Record<string, string>;
  }

  override onError(error: unknown) {
    console.error("container error:", error);
  }
}

/** Job ids are generated in app/api/render/route.ts and only ever contain these characters. */
const VIDEO_PATH = /^\/api\/video\/([A-Za-z0-9-]+)$/;

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // Serve finished videos from R2 without involving the container at all. This is the whole
    // point of persisting them: coming back tomorrow to rewatch a render should not boot a
    // manim image. Falls through to the container on a miss so a job whose upload failed can
    // still be served off the container's disk while it is awake.
    const match = url.pathname.match(VIDEO_PATH);
    if (match && (request.method === "GET" || request.method === "HEAD")) {
      const object = await env.VIDEOS.get(`jobs/${match[1]}/out.mp4`, {
        range: request.headers,
        onlyIf: request.headers,
      });

      if (object) {
        const headers = new Headers();
        object.writeHttpMetadata(headers);
        headers.set("etag", object.httpEtag);
        // A render never changes once written.
        headers.set("Cache-Control", "public, max-age=31536000, immutable");
        headers.set("Accept-Ranges", "bytes");

        // ?download=1 turns the same URL into a file download with a sensible name, so the
        // link can be shared for viewing and used for saving without a second endpoint.
        if (url.searchParams.has("download")) {
          headers.set(
            "Content-Disposition",
            `attachment; filename="${match[1]}.mp4"`,
          );
        }

        const body = "body" in object ? object.body : null;
        const range = object.range as
          | { offset?: number; length?: number }
          | undefined;
        // A 206 MUST carry Content-Range. Without it the browser aborts the response
        // (net::ERR_ABORTED) and <video> reports "no supported sources" — invisible to curl,
        // which never sends a Range header.
        const partial = Boolean(body && request.headers.has("range") && range);

        if (partial && range) {
          const offset = range.offset ?? 0;
          const length = range.length ?? object.size - offset;
          headers.set(
            "Content-Range",
            `bytes ${offset}-${offset + length - 1}/${object.size}`,
          );
          headers.set("Content-Length", String(length));
        } else if (body) {
          headers.set("Content-Length", String(object.size));
        }

        // No body means the precondition matched: 304.
        const status = body ? (partial ? 206 : 200) : 304;
        return new Response(request.method === "HEAD" ? null : body, {
          status,
          headers,
        });
      }
    }

    if (!isAppPath(url.pathname)) {
      return new Response("Not found", { status: 404 });
    }

    // One shared instance. Renders are CPU-bound and a single container serialises them, which
    // is the behaviour you want while this is a small tool — it also caps the bill. Route by a
    // per-user key instead if you later want concurrent renders.
    const container = env.MANIM.getByName("studio");
    return container.fetch(request);
  },
} satisfies ExportedHandler<Env>;
