/**
 * Hands a job to the renderer.
 *
 * The renderer is dursel-web's container: manim needs a real filesystem and a subprocess, neither
 * of which exists in a Worker. Nothing is awaited by the caller — a render takes minutes, and the
 * mutation that starts one returns as soon as the row is written.
 *
 * Authenticated with the same Clerk secret both services already hold, so the endpoint cannot be
 * driven by anyone who happens to find it.
 */
export const startRendering = async (
  env: Env,
  job: { jobId: string; prompt: string; userId: string },
): Promise<void> => {
  const res = await fetch(env.RENDERER_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Dursel-Service': env.CLERK_SECRET_KEY,
    },
    body: JSON.stringify(job),
  });

  if (!res.ok) throw new Error(`renderer ${res.status}: ${await res.text()}`);
};
