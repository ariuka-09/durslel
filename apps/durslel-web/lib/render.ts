import { spawn } from "node:child_process";
import { access, constants, readdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { renderError, type RenderError } from "./errors";

const MANIM_BIN =
  process.env.MANIM_BIN ?? `${process.env.HOME}/.local/bin/manim`;
const TIMEOUT_MS = Number(process.env.RENDER_TIMEOUT_MS ?? 180_000);

/**
 * Name of the single Scene subclass in the file. manim needs it explicitly — invoked without a
 * scene name on a file with zero or several, it prompts interactively and the child hangs.
 */
export function extractSceneClass(code: string): string | null {
  for (const m of code.matchAll(/^class\s+(\w+)\s*\(([^)]*)\)\s*:/gm)) {
    if (m[2].includes("Scene")) return m[1];
  }
  return null;
}

export interface RenderResult {
  video: string;
  log: string;
}

/**
 * manim colours its output via `rich` even when stdout is a pipe. Left in, the log reaches the
 * browser as escape-code soup — the exact opposite of the point. Strips SGR colour codes and
 * OSC-8 hyperlink wrappers, keeping the link text.
 */
function stripAnsi(s: string): string {
  // Matching escape sequences is the whole job here, so the control characters are the point
  // rather than a mistake the rule should catch.
  /* eslint-disable no-control-regex */
  return s
    .replace(/\x1b\]8;[^;]*;[^\x07\x1b]*(?:\x07|\x1b\\)/g, "")
    .replace(/\x1b\[[0-9;]*[a-zA-Z]/g, "");
  /* eslint-enable no-control-regex */
}

/**
 * Write the scene and render it. Streams every manim log line to `onLog` as it arrives — that
 * live output is the whole point of the SSE transport.
 */
export async function renderScene(
  dir: string,
  code: string,
  attempt: number,
  onLog: (line: string) => void,
  // The whole job has a deadline, so an attempt that starts late gets less than the full slot.
  // Capped at RENDER_TIMEOUT_MS below: a caller can shorten an attempt, never lengthen it.
  timeoutMs: number = TIMEOUT_MS,
): Promise<{ ok: true; result: RenderResult } | { ok: false; error: RenderError }> {
  const sceneClass = extractSceneClass(code);
  if (!sceneClass) {
    return {
      ok: false,
      error: renderError(
        "no_scene_class",
        "The generated file has no Scene subclass, so there is nothing to render.",
        code,
        attempt,
      ),
    };
  }

  try {
    await access(MANIM_BIN, constants.X_OK);
  } catch {
    return {
      ok: false,
      error: renderError(
        "manim_missing",
        "The manim executable is missing or not executable.",
        `Tried: ${MANIM_BIN}\nSet MANIM_BIN in .env.local to the correct path.`,
        attempt,
      ),
    };
  }

  const scenePath = path.join(dir, "scene.py");
  const mediaDir = path.join(dir, "media");
  await writeFile(scenePath, code, "utf8");

  // The child runs LLM-written Python with this user's permissions. Don't hand it the API key.
  const env = { ...process.env };
  delete env.GEMINI_API_KEY;
  // manim logs through `rich`, which wraps to 80 columns when there's no TTY. Give it room so
  // log lines and tracebacks arrive whole instead of hard-wrapped mid-path.
  env.COLUMNS = "200";

  const args = [
    "render",
    "-q",
    "l",
    "--format",
    "mp4",
    "--disable_caching",
    "--media_dir",
    mediaDir,
    "-o",
    "out",
    "--progress_bar",
    "none",
    "-v",
    "INFO",
    scenePath,
    sceneClass,
  ];

  const budget = Math.min(timeoutMs, TIMEOUT_MS);
  const lines: string[] = [];
  const child = spawn(MANIM_BIN, args, { cwd: dir, env });

  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    child.kill("SIGKILL");
  }, budget);

  const collect = (chunk: Buffer) => {
    for (const raw of chunk.toString().split("\n")) {
      const line = stripAnsi(raw).trimEnd();
      if (!line.trim()) continue;
      lines.push(line);
      onLog(line);
    }
  };
  child.stdout.on("data", collect);
  child.stderr.on("data", collect);

  const exitCode = await new Promise<number>((resolve) => {
    child.on("error", (e) => {
      lines.push(String(e));
      resolve(-1);
    });
    child.on("close", (code) => resolve(code ?? -1));
  });
  clearTimeout(timer);

  const log = lines.join("\n");

  if (timedOut) {
    return {
      ok: false,
      error: renderError(
        "timeout",
        // Says what to change, not just that time ran out. The old wording — "loops forever or is
        // far too long" — sent the repair attempt off shortening the animation, which cannot help
        // when the cost is per-frame mesh rasterization: three rerolls of a sphere scene each cut
        // the ring count and each died the same way.
        `Killed after ${Math.round(budget / 1000)}s. The scene renders too slowly — usually a 3D mesh at too fine a resolution, not a scene that is too long.`,
        lines.slice(-50).join("\n") || "(no output before the kill)",
        attempt,
      ),
    };
  }

  if (exitCode !== 0) {
    return {
      ok: false,
      error: renderError(
        "manim_runtime",
        `manim exited with code ${exitCode}.`,
        log || "(manim produced no output at all)",
        attempt,
      ),
    };
  }

  const video = await findOutput(mediaDir);
  if (!video) {
    return {
      ok: false,
      error: renderError(
        "no_output",
        "manim exited cleanly but wrote no mp4.",
        `Searched ${mediaDir}:\n${(await tree(mediaDir)).join("\n") || "(empty)"}\n\n--- manim log ---\n${log}`,
        attempt,
      ),
    };
  }

  return { ok: true, result: { video, log } };
}

/**
 * manim writes to <media_dir>/videos/<script>/<resolution>/out.mp4. Glob for it rather than
 * reconstructing that path — the resolution segment changes with quality.
 */
async function findOutput(mediaDir: string): Promise<string | null> {
  for (const rel of await tree(mediaDir)) {
    if (rel.endsWith("out.mp4")) return path.join(mediaDir, rel);
  }
  return null;
}

async function tree(dir: string): Promise<string[]> {
  try {
    const entries = await readdir(dir, { recursive: true, withFileTypes: true });
    return entries
      .filter((e) => e.isFile())
      .map((e) => path.relative(dir, path.join(e.parentPath, e.name)));
  } catch {
    return [];
  }
}
