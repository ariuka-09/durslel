"use client";

import { UserButton, useAuth, useUser } from "@clerk/nextjs";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";

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
import { Landing } from "./landing";
import { useIsAdmin } from "@/lib/admin";
import { tierLabel } from "@/lib/plans";
import {
  FREE_DAILY_LIMIT,
  STATUS_COLOR,
  formatDate,
  rendersLeftToday,
} from "@/lib/jobs";
import { LangToggle, useLang, useT } from "@/shared/i18n";
import { ThemeToggle } from "@/shared/theme";

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

/** What /api/solve can read: a photograph of the problem, a scan, or the PDF itself. */
const ACCEPTS =
  "image/png,image/jpeg,image/webp,image/heic,image/heif,application/pdf";

export default function Home() {
  const [prompt, setPrompt] = useState("");
  const [activeId, setActiveId] = useState<string | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  // Reading an uploaded problem. Its own flag rather than a spinner on the render, because
  // nothing is rendering yet and the daily limit has not been touched.
  const [reading, setReading] = useState(false);
  // A file being dragged over the composer. Only for the highlight that says it will be caught.
  const [dragging, setDragging] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const { isLoaded, isSignedIn } = useAuth();
  const { user } = useUser();
  const isAdmin = useIsAdmin();
  const t = useT();
  const lang = useLang();

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
    if (
      active &&
      active.status !== RenderStatus.Pending &&
      active.status !== RenderStatus.Queued
    ) {
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

  // Keeps the video in view while typing on a phone. iOS lays its keyboard over the page and then
  // pans up to reveal the focused box, taking the header and video off the top. The app is fixed
  // and sized to the part of the screen the keyboard leaves, and its top follows that pan, so the
  // flex column puts the composer just above the keyboard with everything else still showing.
  // Following the pan rather than scrolling it back: iOS can pan the visual viewport of a page
  // that has no scroll of its own, which window.scrollTo cannot undo. Measured in layout pixels
  // (height × scale) so pinch-zooming does not shrink the app, and the top is left at 0 while
  // zoomed so panning still moves across it.
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const root = document.documentElement.style;
    const sync = () => {
      root.setProperty("--app-height", `${vv.height * vv.scale}px`);
      root.setProperty("--app-top", `${vv.scale === 1 ? vv.offsetTop : 0}px`);
    };
    sync();
    vv.addEventListener("resize", sync);
    vv.addEventListener("scroll", sync);
    return () => {
      vv.removeEventListener("resize", sync);
      vv.removeEventListener("scroll", sync);
    };
  }, []);

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

  /**
   * `text` is passed explicitly by the upload path, which starts a render in the same tick that
   * it fills the box — `prompt` still holds the old value at that point, so reading state here
   * would render whatever was typed before the file was picked.
   */
  async function run(text: string = prompt) {
    if (!text.trim() || starting || pending) return;

    setCopied(false);
    setStalled(false);
    setUploadError(null);
    // Apollo rejects on a GraphQL error; the hook's `error` is what renders it, and an
    // unhandled rejection here would take the whole handler down instead.
    // The site's language is the video's language: its on-screen text is written in it.
    const { data } = await startRender({ variables: { prompt: text, lang } }).catch(() => ({
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

  /**
   * A problem — typed into the box, or photographed or scanned — solved and animated.
   *
   * /api/solve solves it and answers with a brief; that brief is then started exactly like a
   * typed prompt, so the queue, the daily limit, the repair loop and the history all apply to it
   * without knowing a problem was involved. It is also written into the box, so a misread problem
   * is visible and can be corrected and rerun rather than only explaining itself four minutes later.
   */
  async function solve(field: "text" | "file", value: string | File) {
    setUploadError(null);
    setReading(true);
    try {
      const body = new FormData();
      body.append(field, value);
      const res = await fetch("/api/solve", { method: "POST", body });
      const json = (await res.json().catch(() => ({}))) as {
        prompt?: string;
        error?: string;
      };
      if (!res.ok || !json.prompt) {
        setUploadError(json.error ?? t.unreadFile);
        return;
      }
      setPrompt(json.prompt);
      await run(json.prompt);
    } catch {
      setUploadError(t.unreachable);
    } finally {
      setReading(false);
    }
  }

  // Clerk resolves the session on the client; rendering the signed-out screen before it has
  // would flash a sign-in prompt at someone who is already signed in.
  if (!isLoaded) return <main className="flex-1" />;

  // Everyone else gets the landing page, which is the pitch and the way in.
  if (!isSignedIn) return <Landing />;

  const busy = starting || pending || reading;
  // Counted off the history the sidebar already loaded, so it costs no request and refreshes
  // whenever that does — which includes right after a render is started.
  //
  // Null for an admin, who the service does not count at all: a number would have to be either
  // wrong or infinite, and neither is worth a line of header.
  //
  // A render that never reached an attempt spent no renderer time and the service does not count
  // it, so neither does this — otherwise a job killed before it started would show as used here
  // and not there.
  const limit = me?.me?.dailyLimit ?? FREE_DAILY_LIMIT;
  const left = isAdmin
    ? null
    : rendersLeftToday(
        renders.filter((r) => r.attempts !== 0).map((r) => r.createdAt),
        limit,
      );

  return (
    <div className="fixed inset-x-0 top-[var(--app-top,0px)] flex h-[var(--app-height,100dvh)]">
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
        close={() => setHistoryOpen(false)}
        shown={historyOpen}
      />

      {/* On a phone the history slides over the whole screen; inert keeps the page it covers out
          of the tab order meanwhile. */}
      <main inert={historyOpen} className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between gap-2 border-b border-rule px-3 py-3 md:gap-4 md:px-5">
          <div className="flex min-w-0 items-center gap-2 md:gap-3">
            <button
              type="button"
              onClick={() => setHistoryOpen(true)}
              aria-label={t.history}
              title={t.history}
              className="grid size-9 shrink-0 place-items-center rounded-full text-ink hover:bg-tint md:hidden"
            >
              <svg viewBox="0 0 16 16" className="size-4" aria-hidden>
                <path
                  d="M2 4h12M2 8h12M2 12h8"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                />
              </svg>
            </button>
            <h1 className="text-2xl font-extrabold tracking-tight">
              Dur<span className="text-accent">slel</span>
            </h1>
          </div>
          <div className="flex shrink-0 items-center gap-2 md:gap-4">
            {/* Says what is in force and goes where it can be changed — the same button whether
                it reads Free or Studio, so there is one place to look either way. */}
            {/* <Link
              href="/pricing"
              title={
                me?.me?.subscriptionUntil
                  ? t.until(new Date(me.me.subscriptionUntil).toLocaleDateString())
                  : t.plans
              }
              className={`rounded-full px-3 py-1 text-xs font-medium ${
                awaitingTier
                  ? "bg-tint text-warn"
                  : tier === SubscriptionTier.Free
                    ? "border border-rule text-muted hover:text-accent-ink"
                    : "bg-tint text-accent-ink"
              }`}
            >
              {awaitingTier ? t.activating : tierLabel(tier)}
            </Link> */}
            {left !== null ? (
              <p
                className={`text-xs font-medium ${
                  left === 0 ? "text-bad" : "text-muted"
                }`}
                title={t.resetsAt}
              >
                {t.today(left, limit)}
              </p>
            ) : null}
            {/* The dashboard refuses anyone else anyway; not offering the link keeps a non-admin
                from walking into a wall. On a phone it lives in the history drawer instead. */}
            {isAdmin ? (
              <Link
                href="/admin"
                className="hidden text-xs font-medium text-muted hover:text-ink md:block"
              >
                {t.admin}
              </Link>
            ) : null}
            <LangToggle />
            <ThemeToggle />
            <UserButton />
          </div>
        </header>

        {/* On a phone the composer sits under the video, as one card holding the box on top and
            its two buttons below; from md up it is the row above the video. */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void run();
          }}
          // The composer takes a dragged-in photo or scan as well as a picked one: a problem
          // already open in another window is dragged here rather than saved and found again.
          // The page has to refuse the drag for the drop to fire at all — without this the
          // browser navigates away to the file instead.
          onDragOver={(e) => {
            if (!e.dataTransfer.types.includes("Files")) return;
            e.preventDefault();
            if (!busy && left !== 0) setDragging(true);
          }}
          onDragLeave={(e) => {
            // Fires for every child the pointer crosses on its way in, so only the one that
            // leaves the form itself counts.
            if (!e.currentTarget.contains(e.relatedTarget as Node | null))
              setDragging(false);
          }}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            if (busy || left === 0) return;
            const file = e.dataTransfer.files[0];
            if (file) void solve("file", file);
          }}
          data-dragging={dragging || undefined}
          className="order-last m-3 flex flex-wrap items-center gap-2 rounded-card border border-rule bg-panel p-2 shadow-soft has-[input:focus-visible]:border-accent data-dragging:outline-2 data-dragging:outline-dashed data-dragging:outline-accent data-dragging:outline-offset-4 md:order-none md:m-0 md:flex-nowrap md:rounded-none md:border-0 md:bg-transparent md:px-5 md:py-4 md:shadow-none"
        >
          {/* Solves what is typed in the box beside it; with the box empty, asks for a photo or
              scan of the problem instead. Filled and bold so it never reads as another input. */}
          <button
            type="button"
            title={t.problemHint}
            disabled={busy || left === 0}
            onClick={() =>
              prompt.trim()
                ? void solve("text", prompt)
                : fileInput.current?.click()
            }
            className="shrink-0 cursor-pointer rounded-full border border-accent bg-tint px-4 py-2 text-sm font-medium text-accent-ink shadow-soft transition hover:bg-accent hover:text-on-accent active:scale-95 disabled:cursor-default disabled:border-rule disabled:bg-panel disabled:text-muted disabled:opacity-40 disabled:active:scale-100"
          >
            {reading ? t.reading : t.problem}
          </button>
          <input
            ref={fileInput}
            type="file"
            accept={ACCEPTS}
            onChange={(e) => {
              const file = e.target.files?.[0];
              // Cleared immediately: without this, picking the same file again fires no change
              // event, so a failed read could not be retried without choosing a different file.
              e.target.value = "";
              if (file) void solve("file", file);
            }}
            className="hidden"
          />
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
            placeholder={t.placeholder}
            className="order-first min-w-0 flex-1 basis-full bg-transparent px-3 py-2 text-base text-ink placeholder:text-muted focus-visible:outline-none disabled:opacity-50 md:order-none md:basis-auto md:rounded-full md:border md:border-rule md:bg-panel md:px-4 md:text-sm md:shadow-soft md:focus-visible:border-accent"
          />
          <button
            type="submit"
            disabled={busy || !prompt.trim() || left === 0}
            className="ml-auto shrink-0 rounded-full md:ml-0 bg-accent px-5 py-2 text-sm font-medium text-on-accent hover:bg-accent-strong disabled:bg-tint disabled:text-muted"
          >
            {busy ? "…" : left === 0 ? t.noneLeft : t.render}
          </button>
        </form>

        <section className="flex min-h-0 min-w-0 flex-1 flex-col gap-4 overflow-y-auto px-3 pt-3 md:px-5 md:pb-5 md:pt-0">
          {stalled ? (
            <div className="rounded-card border border-bad/25 bg-bad/5">
              <p className="px-4 pt-3 text-xs font-medium text-bad">
                {t.lostTitle}
              </p>
              <p className="px-4 pb-3 pt-1 text-xs leading-relaxed text-muted">
                {t.lostBody}
              </p>
            </div>
          ) : null}

          {uploadError ? (
            <div className="rounded-card border border-bad/25 bg-bad/5">
              <p className="px-4 pt-3 text-xs font-medium text-bad">
                {t.unreadTitle}
              </p>
              <p className="px-4 pb-3 pt-1 text-xs leading-relaxed text-muted">
                {uploadError}
              </p>
            </div>
          ) : null}

          {startError ? (
            <div className="rounded-card border border-bad/25 bg-bad/5">
              <p className="px-4 pt-3 text-xs font-medium text-bad">
                {t.notStarted}
              </p>
              <p className="px-4 pb-3 pt-1 text-xs leading-relaxed text-muted">
                {startError.message}
              </p>
            </div>
          ) : null}

          {active?.status === RenderStatus.Failed ? (
            <div className="rounded-card border border-bad/25 bg-bad/5">
              <p className="px-4 pt-3 text-xs font-medium text-bad">
                {t.failed}
              </p>
              <pre className="max-h-72 overflow-auto px-4 pb-3 pt-1 text-[11px] leading-relaxed text-muted whitespace-pre-wrap break-all">
                {active.error ?? t.noReason}
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
                className="w-full rounded-card bg-black shadow-soft"
              />
              <VideoActions
                url={active.url}
                jobId={active.jobId}
                copied={copied}
                setCopied={setCopied}
              />
            </>
          ) : (
            <div className="flex aspect-video flex-col items-center justify-center gap-4 rounded-card bg-panel px-8 shadow-soft">
              <p className="text-sm text-muted">
                {reading
                  ? t.readingProblem
                  : queued
                    ? t.waiting
                    : busy
                      ? t.rendering
                      : t.noVideo}
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
    <div className="h-1 w-full max-w-sm overflow-hidden rounded-full bg-tint">
      <div className="h-full w-1/3 animate-[durslel-sweep_1.4s_ease-in-out_infinite] rounded-full bg-accent" />
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
  const t = useT();

  return (
    <div className="flex flex-wrap items-center gap-2">
      <a
        href={`${url}?download=1`}
        download={`${jobId}.mp4`}
        className="rounded-full border border-rule bg-panel px-3 py-1.5 text-xs text-ink hover:text-accent-ink"
      >
        {t.download}
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
        className={`rounded-full px-3 py-1.5 text-xs ${
          copied ? "bg-ok/10 text-ok" : "bg-tint text-accent-ink hover:bg-rule"
        }`}
      >
        {copied ? t.copied : t.copyLink}
      </button>
      {/* The shareable URL, visible so it can be read or hand-copied too. */}
      <code className="min-w-0 flex-1 truncate text-[11px] text-muted">
        {typeof window === "undefined"
          ? url
          : new URL(url, window.location.origin).href}
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
  close,
  shown,
}: {
  renders: RenderSummary[];
  current: string | null;
  open: (id: string, status: RenderStatus) => void;
  close: () => void;
  shown: boolean;
}) {
  const t = useT();
  const isAdmin = useIsAdmin();

  return (
    // Off-canvas on a phone, a plain column from md up. Visibility rides along with the slide so
    // a closed drawer is out of the tab order, but only flips once it has finished sliding away.
    <aside
      className={`${
        shown ? "visible translate-x-0" : "invisible -translate-x-full"
      } fixed inset-y-0 left-0 z-30 flex h-dvh w-full shrink-0 flex-col border-r border-rule bg-panel transition-[translate,visibility] duration-300 ease-out motion-reduce:transition-none md:visible md:static md:z-auto md:w-64 md:translate-x-0 md:transition-none`}
    >
      {/* Pinned to the viewport height, so a long history scrolls inside the sidebar instead of
          stretching the whole page. */}
      <div className="flex items-center justify-between pl-5 pr-3 pt-3 md:pb-2 md:pr-5 md:pt-4">
        <p className="text-xs font-medium text-muted">{t.history}</p>
        {/* The page behind a phone's drawer is not drawn, so the way back has to be in here. */}
        <button
          type="button"
          onClick={close}
          aria-label={t.close}
          title={t.close}
          className="grid size-9 place-items-center rounded-full text-ink hover:bg-tint md:hidden"
        >
          <svg viewBox="0 0 16 16" className="size-4" aria-hidden>
            <path
              d="M3.5 3.5l9 9M12.5 3.5l-9 9"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
          </svg>
        </button>
      </div>
      <div className="flex flex-1 flex-col gap-0.5 overflow-auto px-2 pb-2">
        {renders.length === 0 ? (
          <p className="px-3 py-2 text-xs text-muted">{t.noRenders}</p>
        ) : (
          renders.map(({ id, title, status, createdAt }) => (
            <button
              key={id}
              type="button"
              onClick={() => open(id, status)}
              className={`block w-full rounded-full px-3 py-2 text-left ${
                id === current ? "bg-tint" : "hover:bg-ground"
              }`}
            >
              <span
                className={`block truncate text-xs ${
                  id === current ? "font-medium text-accent-ink" : "text-ink"
                }`}
              >
                {title}
              </span>
              <span className="flex items-center gap-2 text-[11px] text-muted">
                {formatDate(createdAt)}
                {status !== RenderStatus.Ok ? (
                  <span className={STATUS_COLOR[status]}>
                    {t.status[status]}
                  </span>
                ) : null}
              </span>
            </button>
          ))
        )}
      </div>
      {isAdmin ? (
        <Link
          href="/admin"
          className="border-t border-rule px-5 py-3 text-xs font-medium text-muted hover:text-ink md:hidden"
        >
          {t.admin}
        </Link>
      ) : null}
    </aside>
  );
}
