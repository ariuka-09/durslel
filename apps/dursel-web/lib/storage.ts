import { AwsClient } from "aws4fetch";
import { readFile } from "node:fs/promises";
import path from "node:path";

/**
 * Where finished renders live.
 *
 * In the container, disk is ephemeral — a sleeping instance wakes with a fresh disk from the
 * image — so anything that must outlive the render goes to R2. Locally, with no R2 configured,
 * it falls back to the `renders/` folder so `npm run dev` needs no Cloudflare account.
 *
 * manim always writes to local disk first (it needs a real filesystem); this module is about
 * what happens to the artifacts afterwards.
 */

const ACCOUNT_ID = process.env.R2_ACCOUNT_ID;
const ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID;
const SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY;
const BUCKET = process.env.R2_BUCKET;

export const usingR2 = Boolean(
  ACCOUNT_ID && ACCESS_KEY_ID && SECRET_ACCESS_KEY && BUCKET,
);

export const RENDERS_DIR = path.join(process.cwd(), "renders");

let client: AwsClient | null = null;
function aws(): AwsClient {
  client ??= new AwsClient({
    accessKeyId: ACCESS_KEY_ID!,
    secretAccessKey: SECRET_ACCESS_KEY!,
    region: "auto",
    service: "s3",
  });
  return client;
}

function url(key: string): string {
  return `https://${ACCOUNT_ID}.r2.cloudflarestorage.com/${BUCKET}/${key}`;
}

/** Everything for one job lives under this prefix — same shape as the local folder. */
export function jobKey(jobId: string, name: string): string {
  return `jobs/${jobId}/${name}`;
}

async function put(
  key: string,
  body: Uint8Array | string,
  contentType: string,
): Promise<void> {
  // R2's S3 API rejects a PUT without an explicit Content-Length (411 MissingContentLength);
  // fetch would otherwise send it chunked.
  const bytes =
    typeof body === "string" ? new TextEncoder().encode(body) : body;

  const res = await aws().fetch(url(key), {
    method: "PUT",
    body: bytes as BodyInit,
    headers: {
      "Content-Type": contentType,
      "Content-Length": String(bytes.byteLength),
    },
  });
  if (!res.ok) {
    throw new Error(
      `R2 PUT ${key} failed: ${res.status} ${res.statusText}\n${await res.text()}`,
    );
  }
}

/**
 * Copy a finished job's artifacts to R2. The mp4 is what the user comes back for; scene.py,
 * the log and meta.json ride along so a job stays diagnosable after the container is gone.
 */
export async function publishJob(
  jobId: string,
  jobDir: string,
  files: { name: string; contentType: string }[],
): Promise<void> {
  if (!usingR2) return;
  for (const { name, contentType } of files) {
    const local = path.join(jobDir, name);
    try {
      await put(jobKey(jobId, path.basename(name)), await readFile(local), contentType);
    } catch (e) {
      // A missing optional artifact must not fail a render that already succeeded.
      if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
    }
  }
}
