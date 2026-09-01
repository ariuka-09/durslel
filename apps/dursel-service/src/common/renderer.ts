/** The renderer's path on dursel-web. The host is immaterial — the binding decides the target. */
const RENDERER_PATH = 'https://renderer.internal/api/render';

/**
 * Hands a job to the renderer.
 *
 * The renderer is dursel-web's container: manim needs a real filesystem and a subprocess, neither
 * of which exists in a Worker. Nothing is awaited by the caller — a render takes minutes, and the
 * mutation that starts one returns as soon as the row is written.
 *
 * Sent over a service binding rather than a URL. Both Workers are on workers.dev, and Cloudflare
 * rejects a Worker fetching another Worker on the same zone with error 1042; the binding routes
 * the request internally and never leaves the edge.
 *
 * Authenticated with the same Clerk secret both services already hold, so the endpoint cannot be
 * driven by anyone who reaches it another way.
 */
export const startRendering = async (
  env: Env,
  job: { jobId: string; prompt: string; userId: string },
): Promise<void> => {
  const res = await env.RENDERER.fetch(RENDERER_PATH, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Dursel-Service': env.CLERK_SECRET_KEY,
    },
    body: JSON.stringify(job),
  });

  if (!res.ok) throw new Error(`renderer ${res.status}: ${await res.text()}`);
};
