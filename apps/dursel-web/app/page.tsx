"use client";

import { SignInButton, UserButton, useAuth } from "@clerk/nextjs";
import { useCallback, useEffect, useRef, useState } from "react";

import { ERROR_LABELS, type RenderError } from "@/lib/errors";
import { formatDate, type RenderSummary } from "@/lib/jobs";

type Status = "idle" | "generating" | "rendering" | "done" | "failed";

const STATUS_TEXT: Record<Status, string> = {
  idle: "ready",
  generating: "writing scene",
  rendering: "rendering",
  done: "done",
  failed: "failed",
};

const STATUS_COLOR: Record<Status, string> = {
  idle: "text-blue-d",
  generating: "text-yellow-e",
  rendering: "text-yellow-e",
  done: "text-green-c",
  failed: "text-red-c",
};

export default function Home() {
  const [prompt, setPrompt] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [attempt, setAttempt] = useState(0);
  const [code, setCode] = useState("");
  const [sceneClass, setSceneClass] = useState<string | null>(null);
  const [log, setLog] = useState<string[]>([]);
  const [errors, setErrors] = useState<RenderError[]>([]);
  const [warnings, setWarnings] = useState<{ message: string; raw: string }[]>(
    [],
  );
  const [video, setVideo] = useState<string | null>(null);
  const [jobId, setJobId] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [renders, setRenders] = useState<RenderSummary[]>([]);
  const [historyOpen, setHistoryOpen] = useState(false);

  const { isLoaded, isSignedIn } = useAuth();

  // Fetches without storing, so the callers decide when state changes. An empty list on failure:
  // a sidebar that could not load is not worth interrupting the page for.
  const fetchHistory = useCallback(async (): Promise<RenderSummary[]> => {
    try {
      const res = await fetch("/api/history");
      return res.ok ? (((await res.json()).renders ?? []) as RenderSummary[]) : [];
    } catch {
      return [];
    }
  }, []);

  // The sidebar is the user's own render list, so it can only be loaded once there is a user.
  // A stale list from a previous user is never shown: signing out swaps the whole tree for the
  // sign-in screen, and signing back in refetches before anything is rendered again.
  useEffect(() => {
    if (!isSignedIn) return;
    fetchHistory().then(setRenders);
  }, [isSignedIn, fetchHistory]);

  // Two clicks in a row must not let the slower response overwrite the newer selection.
  const opening = useRef<string | null>(null);

  // Reopening a past render is not a re-render. The mp4 already sits at a permanent URL, and
  // the prompt, source and log were saved alongside it, so the whole session is restored from
  // storage — no manim run, and nothing that only a live render could show.
  const open = useCallback(async (id: string) => {
    opening.current = id;
    setVideo(`/api/video/${id}`);
    setJobId(id);
    setStatus("done");
    setErrors([]);
    setWarnings([]);
    setCopied(false);
    setHistoryOpen(false);
    // Cleared rather than left stale: these belong to whichever job was on screen before.
    setCode("");
    setSceneClass(null);
    setLog([]);

    let data;
    try {
      const res = await fetch(`/api/job/${id}`);
      if (!res.ok) throw new Error(await res.text());
      data = await res.json();
    } catch (err) {
      if (opening.current !== id) return;
      // The video is already playing, so this is not a failed open — say what is missing and
      // leave the rest of the panel usable.
      setWarnings([
        {
          message: "Video loaded, but this render's prompt and source could not be read.",
          raw: String(err),
        },
      ]);
      return;
    }

    if (opening.current !== id) return;
    setPrompt(data.prompt);
    setCode(data.code);
    setSceneClass(data.sceneClass);
    setLog(data.log);
  }, []);

  const logRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight });
  }, [log]);

  const busy = status === "generating" || status === "rendering";

  async function run(e?: { preventDefault?: () => void }) {
    e?.preventDefault?.();
    if (!prompt.trim() || busy) return;

    setStatus("generating");
    setAttempt(1);
    setCode("");
    setSceneClass(null);
    setLog([]);
    setErrors([]);
    setWarnings([]);
    setVideo(null);
    setJobId(null);
    setCopied(false);

    let response: Response;
    try {
      response = await fetch("/api/render", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt }),
      });
    } catch (err) {
      setErrors([
        {
          kind: "api_connection",
          message: "Could not reach the local server.",
          raw: String(err),
          attempt: 1,
        },
      ]);
      setStatus("failed");
      return;
    }

    if (!response.ok || !response.body) {
      setErrors([
        {
          kind: "api_connection",
          message:
            response.status === 401
              ? "Your session expired — sign in again."
              : `Server returned ${response.status}.`,
          raw: await response.text().catch(() => ""),
          attempt: 1,
        },
      ]);
      setStatus("failed");
      return;
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      // SSE frames are separated by a blank line.
      const frames = buffer.split("\n\n");
      buffer = frames.pop() ?? "";

      for (const frame of frames) {
        const name = frame.match(/^event: (.+)$/m)?.[1];
        const raw = frame.match(/^data: ([\s\S]*)$/m)?.[1];
        if (!name || raw === undefined) continue;
        const data = JSON.parse(raw);

        switch (name) {
          case "attempt":
            setAttempt(data.n);
            setStatus("generating");
            if (data.n > 1) setLog([]);
            break;
          case "code":
            setCode(data.python);
            setSceneClass(data.sceneClass);
            setStatus("rendering");
            break;
          case "log":
            setLog((prev) => [...prev, data]);
            break;
          case "error":
            setErrors((prev) => [...prev, data]);
            break;
          case "warning":
            setWarnings((prev) => [...prev, data]);
            break;
          case "done":
            setVideo(data.video);
            setJobId(data.jobId);
            setStatus("done");
            // Refetched rather than prepended locally: the row the server just wrote carries the
            // id and title it decided on, and guessing them here would drift from the database.
            void fetchHistory().then(setRenders);
            break;
          case "failed":
            setStatus("failed");
            break;
        }
      }
    }

    setStatus((s) => (s === "done" ? s : "failed"));
  }

  // Clerk resolves the session on the client; rendering the signed-out screen before it has
  // would flash a sign-in prompt at someone who is already signed in.
  if (!isLoaded) return <main className="flex-1" />;

  if (!isSignedIn) {
    return (
      <main className="flex flex-1 flex-col items-center justify-center gap-6 p-8 text-center">
        <h1 className="font-display text-4xl tracking-tight">
          Dur<span className="text-blue-d">sel</span>
        </h1>
        <p className="max-w-sm text-sm text-muted">
          Describe an animation, get a rendered manim scene. Sign in to render and to keep
          your renders.
        </p>
        <SignInButton mode="modal">
          <button className="border border-yellow-e px-6 py-2.5 text-sm uppercase tracking-widest text-yellow-e">
            Sign in with Google
          </button>
        </SignInButton>
      </main>
    );
  }

  return (
    <div className="flex min-h-full flex-1">
      <History renders={renders} current={jobId} open={open} shown={historyOpen} />

      <main className="flex min-w-0 flex-1 flex-col">
      <header className="flex items-baseline justify-between gap-4 border-b border-rule px-5 py-3">
        <div className="flex items-baseline gap-3">
          <button
            type="button"
            onClick={() => setHistoryOpen((v) => !v)}
            className="border border-rule px-2 py-1 text-[10px] uppercase tracking-[0.15em] text-muted md:hidden"
          >
            {historyOpen ? "Close" : "History"}
          </button>
          <h1 className="font-display text-2xl tracking-tight">
            Dur<span className="text-blue-d">sel</span>
          </h1>
        </div>
        <div className="flex items-center gap-4">
          <p className={`text-xs uppercase tracking-[0.2em] ${STATUS_COLOR[status]}`}>
            {STATUS_TEXT[status]}
            {busy && attempt > 1 ? ` · attempt ${attempt}/2` : ""}
          </p>
          <UserButton />
        </div>
      </header>

      <form onSubmit={run} className="flex gap-2 border-b border-rule px-5 py-4">
        <input
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          disabled={busy}
          // Don't rely on the browser's implicit form submission — it does not fire reliably
          // here, which left Enter doing nothing and the status stuck on "ready".
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              void run();
            }
          }}
          placeholder="plot sin(x) and sweep a vertical line across it"
          className="flex-1 bg-panel border border-rule px-3 py-2 text-sm text-ink placeholder:text-muted disabled:opacity-50"
        />
        <button
          type="submit"
          disabled={busy || !prompt.trim()}
          className="border border-yellow-e px-5 py-2 text-sm text-yellow-e uppercase tracking-widest disabled:opacity-30 disabled:border-rule disabled:text-muted"
        >
          {busy ? "…" : "Render"}
        </button>
      </form>

      <div className="grid flex-1 gap-px bg-rule md:grid-cols-2">
        {/* Left: the result, then the live log. */}
        <section className="flex flex-col gap-4 bg-ground p-5 min-w-0">
          {/* Failures come first — when something broke, that is the thing to read. */}
          {errors.map((err, i) => (
            <ErrorPanel key={i} error={err} />
          ))}

          {/* The render succeeded but something downstream did not — say so without
              pretending the whole job failed. */}
          {warnings.map((w, i) => (
            <div key={i} className="border border-yellow-e/60">
              <p className="border-b border-yellow-e/40 px-3 py-2 text-[10px] uppercase tracking-[0.2em] text-yellow-e">
                not saved
              </p>
              <p className="px-3 pt-2 text-xs text-ink">{w.message}</p>
              <pre className="max-h-48 overflow-auto px-3 py-2 text-[11px] leading-relaxed text-muted whitespace-pre-wrap break-all">
                {w.raw}
              </pre>
            </div>
          ))}

          {video ? (
            <video
              // Remount per render: a <video> that failed to load once stays in its error
              // state, so swapping only the src can leave a dead element behind.
              key={video}
              src={video}
              controls
              autoPlay
              loop
              // Browsers refuse to autoplay unmuted video. manim output has no audio track,
              // so muting costs nothing and is what actually makes autoPlay work.
              // React renders `muted` as a property but not as an HTML attribute, so the
              // autoplay policy can be evaluated before it applies — set it on the element
              // itself as well.
              muted
              ref={(el) => {
                if (el) el.muted = true;
              }}
              // Without this iOS Safari hijacks playback into fullscreen.
              playsInline
              preload="metadata"
              className="w-full border border-rule bg-black"
            />
          ) : null}

          {video ? (
            <div className="flex flex-wrap items-center gap-2">
              <a
                href={`${video}?download=1`}
                download={`${jobId ?? "manim"}.mp4`}
                className="border border-rule px-3 py-1.5 text-[11px] uppercase tracking-[0.15em] text-ink hover:border-green-c hover:text-green-c"
              >
                Download mp4
              </a>
              <button
                type="button"
                onClick={async () => {
                  const absolute = new URL(video, window.location.origin).href;
                  try {
                    await navigator.clipboard.writeText(absolute);
                  } catch {
                    // Clipboard API needs a secure context and permission; fall back to a
                    // selection-based copy rather than silently doing nothing.
                    const ta = document.createElement("textarea");
                    ta.value = absolute;
                    document.body.appendChild(ta);
                    ta.select();
                    document.execCommand("copy");
                    ta.remove();
                  }
                  setCopied(true);
                  setTimeout(() => setCopied(false), 1800);
                }}
                className={`border px-3 py-1.5 text-[11px] uppercase tracking-[0.15em] ${
                  copied
                    ? "border-green-c text-green-c"
                    : "border-rule text-ink hover:border-blue-d hover:text-blue-d"
                }`}
              >
                {copied ? "Copied" : "Copy link"}
              </button>
              {/* The shareable URL, visible so it can be read or hand-copied too. */}
              <code className="min-w-0 flex-1 truncate text-[11px] text-muted">
                {typeof window === "undefined"
                  ? video
                  : new URL(video, window.location.origin).href}
              </code>
            </div>
          ) : null}

          {!video ? (
            <div className="flex aspect-video items-center justify-center border border-rule text-xs uppercase tracking-[0.2em] text-muted">
              {busy ? "rendering…" : "no video yet"}
            </div>
          ) : null}

          <div>
            <Label>render log</Label>
            <div
              ref={logRef}
              className="h-56 overflow-auto border border-rule bg-panel p-3 text-[11px] leading-relaxed text-muted"
            >
              {log.length === 0 ? (
                <span className="text-rule">—</span>
              ) : (
                log.map((line, i) => (
                  <div key={i} className="stroke-on whitespace-pre-wrap break-all">
                    {line}
                  </div>
                ))
              )}
              {/* A hairline that extends like an axis while manim works. */}
              <div
                className="mt-2 h-px bg-yellow-e transition-all duration-500"
                style={{ width: busy ? `${Math.min(log.length * 4, 100)}%` : "0%" }}
              />
            </div>
          </div>
        </section>

        {/* Right: exactly what was sent to manim. */}
        <section className="flex flex-col bg-ground p-5 min-w-0">
          <Label>
            scene.py{sceneClass ? ` · ${sceneClass}` : ""}
          </Label>
          <pre className="flex-1 overflow-auto border border-rule bg-panel p-3 text-[11px] leading-relaxed">
            {code || <span className="text-rule">—</span>}
          </pre>
        </section>
      </div>
      </main>
    </div>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <p className="mb-2 text-[10px] uppercase tracking-[0.25em] text-muted">
      {children}
    </p>
  );
}

/**
 * Errors are never collapsed behind a toggle — the verbatim payload is the reason this app
 * exists. Kind tag, one sentence, then the raw traceback exactly as it came back.
 */
function ErrorPanel({ error }: { error: RenderError }) {
  return (
    <div className="border border-red-c/60">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 border-b border-red-c/40 px-3 py-2">
        <span className="text-[10px] uppercase tracking-[0.2em] text-red-c">
          attempt {error.attempt} · {error.kind}
        </span>
        <span className="text-xs text-ink">{ERROR_LABELS[error.kind]}</span>
      </div>
      <p className="px-3 pt-2 text-xs text-ink">{error.message}</p>
      <pre className="max-h-72 overflow-auto px-3 py-2 text-[11px] leading-relaxed text-muted whitespace-pre-wrap break-all">
        {error.raw}
      </pre>
    </div>
  );
}

/**
 * Past renders. Picking one swaps the player's source — the mp4 already lives at a permanent
 * URL, so watching, copying the link and downloading all work exactly as they do for a render
 * that just finished, with no manim run involved.
 */
function History({
  renders,
  current,
  open,
  shown,
}: {
  renders: RenderSummary[];
  current: string | null;
  open: (id: string) => void | Promise<void>;
  shown: boolean;
}) {
  return (
    <aside
      className={`${
        shown ? "flex" : "hidden"
      } w-64 shrink-0 flex-col border-r border-rule bg-panel md:flex`}
    >
      <p className="border-b border-rule px-4 py-3 text-[10px] uppercase tracking-[0.25em] text-muted">
        history
      </p>
      <div className="flex-1 overflow-auto">
        {renders.length === 0 ? (
          <p className="px-4 py-3 text-[11px] text-rule">no renders yet</p>
        ) : (
          renders.map(({ id, jobId, title, createdAt }) => (
            <button
              key={id}
              type="button"
              onClick={() => void open(jobId)}
              className={`block w-full border-b border-rule/50 px-4 py-2.5 text-left hover:bg-ground ${
                jobId === current ? "bg-ground" : ""
              }`}
            >
              <span
                className={`block truncate text-xs ${
                  jobId === current ? "text-blue-d" : "text-ink"
                }`}
              >
                {title}
              </span>
              <span className="block text-[10px] text-muted">{formatDate(createdAt)}</span>
            </button>
          ))
        )}
      </div>
    </aside>
  );
}
