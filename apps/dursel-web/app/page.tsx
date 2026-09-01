"use client";

import { SignInButton, UserButton, useAuth, useUser } from "@clerk/nextjs";
import { useEffect, useState } from "react";

import {
  RenderStatus,
  useGetRenderQuery,
  useGetRendersQuery,
  useStartRenderMutation,
  useUpsertUserMutation,
  type GetRendersQuery,
} from "@/generated";
import { formatDate } from "@/lib/jobs";

type RenderSummary = GetRendersQuery["getRenders"][number];

const STATUS_TEXT: Record<RenderStatus, string> = {
  [RenderStatus.Pending]: "rendering",
  [RenderStatus.Ok]: "done",
  [RenderStatus.Failed]: "failed",
};

const STATUS_COLOR: Record<RenderStatus, string> = {
  [RenderStatus.Pending]: "text-yellow-e",
  [RenderStatus.Ok]: "text-green-c",
  [RenderStatus.Failed]: "text-red-c",
};

export default function Home() {
  const [prompt, setPrompt] = useState("");
  const [activeId, setActiveId] = useState<string | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  const { isLoaded, isSignedIn } = useAuth();
  const { user } = useUser();

  const { data: history, refetch: refetchHistory } = useGetRendersQuery({
    skip: !isSignedIn,
  });
  const renders: RenderSummary[] = history?.getRenders ?? [];

  const [startRender, { loading: starting }] = useStartRenderMutation();

  // The render being watched. Polled only while it is still running — Apollo stops when the
  // interval is 0, so a finished render costs nothing to keep on screen.
  const { data: activeData } = useGetRenderQuery({
    variables: { id: activeId ?? "" },
    skip: !activeId,
    pollInterval: 1500,
    // Without this the poll would keep serving the first cached answer and the bar never moves.
    fetchPolicy: "network-only",
  });
  const active = activeData?.getRender ?? null;
  const pending = active?.status === RenderStatus.Pending;

  // Stop polling and refresh the sidebar the moment a render settles.
  useEffect(() => {
    if (active && active.status !== RenderStatus.Pending) void refetchHistory();
  }, [active, refetchHistory]);

  // Mirrors the Clerk profile into the users table. Taken from the browser's already-loaded user
  // rather than a server-side lookup, so keeping the row fresh costs no extra Clerk API call.
  const [upsertUser] = useUpsertUserMutation();
  useEffect(() => {
    if (!isSignedIn || !user) return;
    void upsertUser({
      variables: {
        input: {
          email: user.primaryEmailAddress?.emailAddress ?? null,
          firstName: user.firstName ?? null,
          lastName: user.lastName ?? null,
        },
      },
    }).catch(() => undefined);
  }, [isSignedIn, user, upsertUser]);

  async function run(e?: { preventDefault?: () => void }) {
    e?.preventDefault?.();
    if (!prompt.trim() || starting || pending) return;

    setCopied(false);
    const { data } = await startRender({ variables: { prompt } });
    // The row exists as PENDING before this resolves, so there is something to watch immediately.
    if (data?.startRender) {
      setActiveId(data.startRender.id);
      void refetchHistory();
    }
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

  const busy = starting || pending;

  return (
    <div className="flex min-h-full flex-1">
      <History
        renders={renders}
        current={activeId}
        open={(id) => {
          setActiveId(id);
          setHistoryOpen(false);
          setCopied(false);
        }}
        shown={historyOpen}
      />

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
            <p
              className={`text-xs uppercase tracking-[0.2em] ${
                active ? STATUS_COLOR[active.status] : "text-blue-d"
              }`}
            >
              {starting ? "starting" : active ? STATUS_TEXT[active.status] : "ready"}
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

        <section className="flex flex-1 flex-col gap-4 bg-ground p-5 min-w-0">
          {active?.status === RenderStatus.Failed ? (
            <div className="border border-red-c/60">
              <p className="border-b border-red-c/40 px-3 py-2 text-[10px] uppercase tracking-[0.2em] text-red-c">
                render failed
              </p>
              <pre className="max-h-72 overflow-auto px-3 py-2 text-[11px] leading-relaxed text-muted whitespace-pre-wrap break-all">
                {active.error ?? "No reason was recorded."}
              </pre>
            </div>
          ) : null}

          {active?.url && active.status === RenderStatus.Ok ? (
            <>
              <video
                // Remount per render: a <video> that failed to load once stays in its error
                // state, so swapping only the src can leave a dead element behind.
                key={active.url}
                src={active.url}
                controls
                autoPlay
                loop
                // Browsers refuse to autoplay unmuted video. manim output has no audio track,
                // so muting costs nothing and is what actually makes autoPlay work.
                muted
                ref={(el) => {
                  if (el) el.muted = true;
                }}
                // Without this iOS Safari hijacks playback into fullscreen.
                playsInline
                preload="metadata"
                className="w-full border border-rule bg-black"
              />
              <VideoActions
                url={active.url}
                jobId={active.jobId}
                copied={copied}
                setCopied={setCopied}
              />
            </>
          ) : (
            <div className="flex aspect-video flex-col items-center justify-center gap-4 border border-rule px-8">
              <p className="text-xs uppercase tracking-[0.2em] text-muted">
                {busy ? "rendering…" : "no video yet"}
              </p>
              {busy ? <ProgressBar /> : null}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}

/**
 * Indeterminate on purpose. manim reports no percentage, and inventing one would be a lie that
 * stalls at 90%; a moving bar says "still working" without claiming to know how much is left.
 */
function ProgressBar() {
  return (
    <div className="h-px w-full max-w-sm overflow-hidden bg-rule">
      <div className="h-full w-1/3 animate-[dursel-sweep_1.4s_ease-in-out_infinite] bg-yellow-e" />
    </div>
  );
}

function VideoActions({
  url,
  jobId,
  copied,
  setCopied,
}: {
  url: string;
  jobId: string;
  copied: boolean;
  setCopied: (v: boolean) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <a
        href={`${url}?download=1`}
        download={`${jobId}.mp4`}
        className="border border-rule px-3 py-1.5 text-[11px] uppercase tracking-[0.15em] text-ink hover:border-green-c hover:text-green-c"
      >
        Download mp4
      </a>
      <button
        type="button"
        onClick={async () => {
          const absolute = new URL(url, window.location.origin).href;
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
        {typeof window === "undefined" ? url : new URL(url, window.location.origin).href}
      </code>
    </div>
  );
}

/**
 * Past renders. Picking one swaps the player's source — the mp4 already lives at a permanent URL,
 * so watching, copying the link and downloading all work exactly as they do for a render that
 * just finished, with no manim run involved.
 */
function History({
  renders,
  current,
  open,
  shown,
}: {
  renders: RenderSummary[];
  current: string | null;
  open: (id: string) => void;
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
          renders.map(({ id, title, status, createdAt }) => (
            <button
              key={id}
              type="button"
              onClick={() => open(id)}
              className={`block w-full border-b border-rule/50 px-4 py-2.5 text-left hover:bg-ground ${
                id === current ? "bg-ground" : ""
              }`}
            >
              <span
                className={`block truncate text-xs ${
                  id === current ? "text-blue-d" : "text-ink"
                }`}
              >
                {title}
              </span>
              <span className="flex items-center gap-2 text-[10px] text-muted">
                {formatDate(createdAt)}
                {status !== RenderStatus.Ok ? (
                  <span className={STATUS_COLOR[status]}>{STATUS_TEXT[status]}</span>
                ) : null}
              </span>
            </button>
          ))
        )}
      </div>
    </aside>
  );
}
