"use client";

import { SignInButton, UserButton, useAuth, useUser } from "@clerk/nextjs";
import Link from "next/link";
import { useEffect, useState } from "react";

import {
  RenderStatus,
  SubscriptionTier,
  useGetRenderQuery,
  useGetRendersQuery,
  useMeQuery,
  useStartRenderMutation,
  useUpsertUserMutation,
  type GetRendersQuery,
} from "@/generated";
import { useIsAdmin } from "@/lib/admin";
import { tierLabel } from "@/lib/plans";
import {
  DAILY_LIMIT,
  STATUS_COLOR,
  STATUS_TEXT,
  formatDate,
  rendersLeftToday,
} from "@/lib/jobs";

type RenderSummary = GetRendersQuery["getRenders"][number];

/**
 * How long to keep polling a PENDING render before treating it as lost. The renderer's own budget
 * is four minutes; the extra minute is the container's cold start plus slack.
 *
 * This measures the render alone. Time spent QUEUED is exempt — see the effect that uses it —
 * because a queued job has not started its budget yet and there is no bound on how long a burst
 * can keep it waiting.
 */
const STALL_MS = 300_000;

export default function Home() {
  const [prompt, setPrompt] = useState("");
  const [activeId, setActiveId] = useState<string | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  const { isLoaded, isSignedIn } = useAuth();
  const { user } = useUser();
  const isAdmin = useIsAdmin();

  const { data: history, refetch: refetchHistory } = useGetRendersQuery({
    skip: !isSignedIn,
  });
  const renders: RenderSummary[] = history?.getRenders ?? [];

  // `error` is what the daily limit arrives as — there is no row to hang it on, so the
  // mutation itself is the only place it can be shown.
  const [startRender, { loading: starting, error: startError }] =
    useStartRenderMutation();

  // Whether the watched render is still running. Held in state rather than derived from the
  // query, because it decides that query's poll interval and so has to be known before it runs.
  const [pending, setPending] = useState(false);
  // Set when polling gives up on a PENDING row, so the UI can say so instead of showing
  // "rendering" forever at a render nothing is working on any more.
  const [stalled, setStalled] = useState(false);

  // Polled only while the render is actually running. A zero interval stops Apollo entirely, so a
  // finished render left on screen issues no requests at all.
  const { data: activeData } = useGetRenderQuery({
    variables: { id: activeId ?? "" },
    skip: !activeId,
    pollInterval: pending ? 1500 : 0,
    // Without this the poll would keep serving the first cached answer and the bar never moves.
    fetchPolicy: "network-only",
  });
  const active = activeData?.getRender ?? null;
  // Waiting for a render slot rather than being rendered. Kept apart from PENDING because the
  // two need opposite treatment below: both keep polling, only one is allowed to time out.
  const queued = active?.status === RenderStatus.Queued;

  // Stop polling and refresh the sidebar the moment a render settles.
  useEffect(() => {
    // QUEUED is still in flight, so it must not stop the poll — only OK and FAILED settle a row.
    if (active && active.status !== RenderStatus.Pending && active.status !== RenderStatus.Queued) {
      setPending(false);
      void refetchHistory();
    }
  }, [active, refetchHistory]);

  // Give up on a row nobody is ever going to answer.
  //
  // The renderer has a four-minute budget and writes the row either way, so a render still PENDING
  // well past that is one whose container died mid-job — and the browser would otherwise poll it
  // every 1.5 seconds for as long as the tab stayed open. Stopping only stops this client: the row
  // is still PENDING in the database, which is honest, because nobody knows that it failed.
  //
  // A QUEUED row is exempt, and that exemption is the whole point of the status existing. A job
  // behind a full queue has not been given its four minutes yet — up to MAX_QUEUED_RENDERS jobs
  // can sit in front of it — so counting the wait here would declare a perfectly healthy render
  // lost. `queued` in the dependencies restarts the clock when the slot is granted, which is the
  // moment the budget it is measuring actually begins.
  useEffect(() => {
    if (!pending || queued) return;
    const timer = setTimeout(() => {
      setPending(false);
      setStalled(true);
    }, STALL_MS);
    return () => clearTimeout(timer);
  }, [pending, queued, activeId]);

  // Set when the buyer comes back from Wire's checkout page, which returns to /?paid=<tier>.
  // The payment is confirmed to the webhook, not to the browser, so the tier can arrive a moment
  // after the buyer does — this is what keeps the pill polling until it does.
  const [awaitingTier, setAwaitingTier] = useState<string | null>(null);
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const paid = params.get("paid");
    const paymentIntentId = params.get("pi");
    if (!paid) return;

    setAwaitingTier(paid);

    // Ask our own server to check the payment with Wire, rather than waiting on a webhook that
    // may not be registered yet. It grants through the same mutation the webhook uses, keyed on
    // the intent, so the two cannot double-count.
    if (paymentIntentId) {
      void fetch("/api/pay/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ paymentIntentId }),
      }).catch(() => undefined);
    }

    // The tier is now in the URL of a page the buyer may bookmark or reload; it has served its
    // purpose the moment this effect has read it.
    window.history.replaceState(null, "", window.location.pathname);

    // A payment that never confirms must not leave the browser polling forever.
    const timer = setTimeout(() => setAwaitingTier(null), 60_000);

    return () => clearTimeout(timer);
  }, []);

  const { data: me } = useMeQuery({
    skip: !isSignedIn,
    pollInterval: awaitingTier ? 2000 : 0,
    fetchPolicy: "cache-and-network",
  });
  const tier = me?.me?.subscription ?? SubscriptionTier.Free;

  useEffect(() => {
    if (awaitingTier && tier === awaitingTier) setAwaitingTier(null);
  }, [awaitingTier, tier]);

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
    setStalled(false);
    // Apollo rejects on a GraphQL error; the hook's `error` is what renders it, and an
    // unhandled rejection here would take the whole handler down instead.
    const { data } = await startRender({ variables: { prompt } }).catch(() => ({
      data: null,
    }));
    // The row exists as PENDING before this resolves, so there is something to watch immediately.
    if (data?.startRender) {
      setActiveId(data.startRender.id);
      setStalled(false);
      setPending(data.startRender.status === RenderStatus.Pending);
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
          Dur<span className="text-blue-d">slel</span>
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
  // Counted off the history the sidebar already loaded, so it costs no request and refreshes
  // whenever that does — which includes right after a render is started.
  //
  // Null for an admin, who the service does not count at all: a number would have to be either
  // wrong or infinite, and neither is worth a line of header.
  const left = isAdmin
    ? null
    : rendersLeftToday(renders.map((r) => r.createdAt));

  return (
    <div className="flex min-h-full flex-1">
      <History
        renders={renders}
        current={activeId}
        open={(id, status) => {
          setActiveId(id);
          setStalled(false);
          setPending(status === RenderStatus.Pending);
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
              Dur<span className="text-blue-d">slel</span>
            </h1>
          </div>
          <div className="flex items-center gap-4">
            {/* Says what is in force and goes where it can be changed — the same button whether
                it reads Free or Studio, so there is one place to look either way. */}
            <Link
              href="/pricing"
              title={
                me?.me?.subscriptionUntil
                  ? `Until ${new Date(me.me.subscriptionUntil).toLocaleDateString()}`
                  : "Plans"
              }
              className={`rounded-full border px-3 py-1 text-[10px] uppercase tracking-[0.15em] ${
                awaitingTier
                  ? "border-yellow-e text-yellow-e"
                  : tier === SubscriptionTier.Free
                    ? "border-rule text-muted hover:border-yellow-e hover:text-yellow-e"
                    : "border-green-c text-green-c"
              }`}
            >
              {awaitingTier ? "Activating…" : tierLabel(tier)}
            </Link>
            {left !== null ? (
              <p
                className={`text-xs uppercase tracking-[0.2em] ${
                  left === 0 ? "text-red-c" : "text-muted"
                }`}
                title="Renders reset at midnight GMT+8"
              >
                {left}/{DAILY_LIMIT} today
              </p>
            ) : null}
            <p
              className={`text-xs uppercase tracking-[0.2em] ${
                stalled
                  ? "text-red-c"
                  : active
                    ? STATUS_COLOR[active.status]
                    : "text-blue-d"
              }`}
            >
              {starting
                ? "starting"
                : stalled
                  ? "lost"
                  : active
                    ? STATUS_TEXT[active.status]
                    : "ready"}
            </p>
            {/* The dashboard refuses anyone else anyway; not offering the link keeps a non-admin
                from walking into a wall. */}
            {isAdmin ? (
              <Link
                href="/admin"
                className="text-xs uppercase tracking-[0.2em] text-muted hover:text-ink"
              >
                Admin
              </Link>
            ) : null}
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
            disabled={busy || !prompt.trim() || left === 0}
            className="border border-yellow-e px-5 py-2 text-sm text-yellow-e uppercase tracking-widest disabled:opacity-30 disabled:border-rule disabled:text-muted"
          >
            {busy ? "…" : left === 0 ? "No renders left" : "Render"}
          </button>
        </form>

        <section className="flex flex-1 flex-col gap-4 bg-ground p-5 min-w-0">
          {stalled ? (
            <div className="border border-red-c/60">
              <p className="border-b border-red-c/40 px-3 py-2 text-[10px] uppercase tracking-[0.2em] text-red-c">
                render lost
              </p>
              <p className="px-3 py-2 text-[11px] leading-relaxed text-muted">
                Nothing has reported back on this render in five minutes, so it is almost
                certainly gone. Try the prompt again.
              </p>
            </div>
          ) : null}

          {startError ? (
            <div className="border border-red-c/60">
              <p className="border-b border-red-c/40 px-3 py-2 text-[10px] uppercase tracking-[0.2em] text-red-c">
                not started
              </p>
              <p className="px-3 py-2 text-[11px] leading-relaxed text-muted">
                {startError.message}
              </p>
            </div>
          ) : null}

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
      <div className="h-full w-1/3 animate-[durslel-sweep_1.4s_ease-in-out_infinite] bg-yellow-e" />
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
  open: (id: string, status: RenderStatus) => void;
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
              onClick={() => open(id, status)}
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
