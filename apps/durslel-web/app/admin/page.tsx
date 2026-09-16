"use client";

import { SignInButton, UserButton, useAuth } from "@clerk/nextjs";
import Link from "next/link";
import { useState } from "react";

import {
  RenderStatus,
  useAllRendersQuery,
  useGetRendersQuery,
  useUsersQuery,
  type GetRendersQuery,
  type UsersQuery,
  Role,
} from "@/generated";
import { useIsAdmin } from "@/lib/admin";
import { STATUS_COLOR, STATUS_TEXT, formatDate, monthKey, monthLabel } from "@/lib/jobs";

import { Chart } from "./chart";

type Person = UsersQuery["users"][number];
type Render = GetRendersQuery["getRenders"][number];

/** Falls back to the email, then the raw Clerk id — a row always has something to be called. */
const nameOf = (person: Person) =>
  [person.firstName, person.lastName].filter(Boolean).join(" ") ||
  person.email ||
  person.id;

export default function Admin() {
  const { isLoaded, isSignedIn } = useAuth();
  const isAdmin = useIsAdmin();
  const [picked, setPicked] = useState<string | null>(null);
  const [rosterOpen, setRosterOpen] = useState(false);

  const { data: roster, error: rosterError } = useUsersQuery({ skip: !isAdmin });
  const people = roster?.users ?? [];

  // Every render by everyone, for the chart's second series. Separate from the per-person query
  // below because they answer different questions: this one is the whole service over time, that
  // one is one person's work.
  const { data: all } = useAllRendersQuery({ skip: !isAdmin });
  // Land on someone rather than on an instruction: the first row is the newest signup, and one
  // person's work is the thing this page is for.
  const current = people.find((p) => p.id === picked) ?? people[0] ?? null;

  const { data, loading, error } = useGetRendersQuery({
    variables: { creatorId: current?.id ?? "" },
    skip: !current,
  });
  const renders = data?.getRenders ?? [];

  // Clerk resolves the session on the client; deciding before it has would flash a refusal at
  // someone who is in fact an admin.
  if (!isLoaded) return <main className="flex-1" />;

  if (!isSignedIn) return <Gate title="Sign in first" body="The dashboard reads other people's renders, so it needs to know who is asking." signIn />;

  if (!isAdmin)
    return (
      <Gate
        title="Not your dashboard"
        body="Your session doesn't carry the admin role. If that's wrong, it's granted in Clerk and picked up the next time your session refreshes."
      />
    );

  return (
    <div className="flex min-h-full flex-1">
      <Roster
        people={people}
        current={current?.id ?? null}
        pick={(id) => {
          setPicked(id);
          setRosterOpen(false);
        }}
        shown={rosterOpen}
      />

      <main className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between gap-4 border-b border-rule px-5 py-3">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setRosterOpen((v) => !v)}
              className="rounded-full border border-rule bg-panel px-3 py-1 text-xs font-medium text-muted md:hidden"
            >
              {rosterOpen ? "Close" : "Roster"}
            </button>
            <h1 className="text-2xl font-extrabold tracking-tight">
              Dur<span className="text-accent">slel</span>
            </h1>
            <span className="rounded-full bg-tint px-2.5 py-0.5 text-xs font-medium text-accent-ink">
              Admin
            </span>
          </div>
          <div className="flex items-center gap-4">
            <Link
              href="/"
              className="text-sm font-medium text-muted hover:text-ink"
            >
              Render
            </Link>
            <UserButton />
          </div>
        </header>

        {/* The service as a whole, above whoever is selected: the dashboard opens on how much is
            happening, and a person's cards answer the next question rather than the first. */}
        <section className="min-w-0 px-5 pt-5">
          <Chart
            signups={people.map((person) => person.createdAt)}
            renders={(all?.allRenders ?? []).map((render) => render.createdAt)}
          />
        </section>

        {current ? (
          <section className="flex min-w-0 flex-1 flex-col gap-5 p-5">
            {/* The page's one large piece of type: whose work you are looking at. */}
            <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 border-b border-rule pb-4">
              <h2 className="text-3xl font-bold tracking-tight">{nameOf(current)}</h2>
              {current.email ? (
                <p className="text-xs text-muted">{current.email}</p>
              ) : null}
              {current.role === Role.Admin ? (
                <span className="rounded-full bg-tint px-2.5 py-0.5 text-xs font-medium text-accent-ink">
                  Admin
                </span>
              ) : null}
              <p className="ml-auto text-xs font-medium text-muted">
                {loading ? "loading" : `${renders.length} render${renders.length === 1 ? "" : "s"}`}
              </p>
            </div>

            {renders.length === 0 ? (
              <p className={`text-xs ${error ? "text-bad" : "text-muted"}`}>
                {error
                  ? `These renders didn't load: ${error.message}`
                  : loading
                    ? "…"
                    : "Nothing rendered yet."}
              </p>
            ) : (
              // Two up on a desktop, one on a phone — a manim scene is 16:9 and stops being
              // readable much narrower than half a screen.
              <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
                {renders.map((render, i) => (
                  <Card key={render.id} render={render} index={i} />
                ))}
              </div>
            )}
          </section>
        ) : (
          <section className="flex flex-1 items-center justify-center p-5">
            {/* An empty roster and a refused one look identical from here, so say which. */}
            <p className={`max-w-sm text-center text-xs ${rosterError ? "text-bad" : "text-muted"}`}>
              {rosterError
                ? `The roster didn't load: ${rosterError.message}`
                : "Nobody has signed in yet."}
            </p>
          </section>
        )}
      </main>
    </div>
  );
}

/**
 * One render: what was asked for, and what came back.
 *
 * The facts above the prompt are the render's own — when, which Scene class, how long, how many
 * generation attempts — which are the first things looked at when output disappoints. They earn
 * the position an eyebrow usually wastes on decoration.
 */
function Card({ render, index }: { render: Render; index: number }) {
  const { url, status, prompt, sceneClass, durationMs, attempts, error, createdAt } = render;

  return (
    <article className="flex flex-col overflow-hidden rounded-card bg-panel shadow-soft">
      {url && status === RenderStatus.Ok ? (
        <video
          src={url}
          controls
          // No autoplay: a screen of these would all start at once. Metadata only, so a person
          // with fifty renders does not download fifty videos to look at the list.
          preload="metadata"
          playsInline
          className="aspect-video w-full bg-black"
        />
      ) : (
        <div className="flex aspect-video flex-col items-center justify-center gap-2 bg-tint px-6 text-center">
          <p className={`text-xs font-medium ${STATUS_COLOR[status]}`}>
            {STATUS_TEXT[status]}
          </p>
          {status === RenderStatus.Failed ? (
            <p className="line-clamp-3 text-[11px] leading-relaxed text-muted">
              {error ?? "No reason was recorded."}
            </p>
          ) : null}
        </div>
      )}

      <div className="flex flex-col gap-2 px-4 py-3">
        {/* manim's Write, borrowed: the line strokes itself on left to right, staggered down the
            grid. Disabled under prefers-reduced-motion by the rule in globals.css. */}
        <p
          className="stroke-on flex flex-wrap items-baseline gap-x-3 gap-y-1 text-[11px] text-muted"
          style={{ animationDelay: `${Math.min(index, 11) * 45}ms` }}
        >
          <time>{formatDate(createdAt)}</time>
          {sceneClass ? <span className="text-accent-ink">{sceneClass}</span> : null}
          {durationMs ? <span>{(durationMs / 1000).toFixed(1)}s</span> : null}
          {attempts > 1 ? <span className="text-warn">{attempts} tries</span> : null}
          {status === RenderStatus.Ok ? null : (
            <span className={STATUS_COLOR[status]}>{STATUS_TEXT[status]}</span>
          )}
        </p>
        {/* Clamped so a long prompt cannot stretch one card past its neighbour; the full text is
            still there on hover. */}
        <p className="line-clamp-3 text-sm leading-relaxed text-ink" title={prompt}>
          {prompt}
        </p>
      </div>
    </article>
  );
}

/** Everyone who has signed in, newest first, under the month they arrived in. */
function Roster({
  people,
  current,
  pick,
  shown,
}: {
  people: Person[];
  current: string | null;
  pick: (id: string) => void;
  shown: boolean;
}) {
  // The query already returns newest first, so walking it in order puts the months in order and
  // nothing needs sorting — a run of rows with the same month key is that month's group.
  const months = people.reduce<{ key: string; members: Person[] }[]>((groups, person) => {
    const key = monthKey(person.createdAt);
    const open = groups[groups.length - 1];

    if (open?.key === key) open.members.push(person);
    else groups.push({ key, members: [person] });

    return groups;
  }, []);

  return (
    <aside
      className={`${
        shown ? "flex" : "hidden"
      } sticky top-0 h-dvh w-64 shrink-0 flex-col border-r border-rule bg-panel md:flex`}
    >
      {/* Pinned to the viewport height, so a long roster scrolls inside the sidebar instead of
          stretching the whole page. */}
      <p className="px-5 pb-2 pt-4 text-xs font-medium text-muted">Roster</p>
      <div className="flex flex-1 flex-col gap-0.5 overflow-auto px-2 pb-2">
        {people.length === 0 ? (
          <p className="px-3 py-2 text-xs text-muted">Nobody yet</p>
        ) : (
          months.map(({ key, members }) => (
            <section key={key} className="flex flex-col gap-0.5">
              {/* Stuck to the top of the scroller, so scrolling into 2025 never leaves you
                  looking at names with no idea when they arrived. */}
              <h3 className="sticky top-0 z-10 bg-panel px-3 pb-1 pt-3 text-[11px] font-medium text-muted">
                {monthLabel(key)}
                <span className="pl-1.5 text-accent-ink">{members.length}</span>
              </h3>
              {members.map((person) => (
                <button
                  key={person.id}
                  type="button"
                  onClick={() => pick(person.id)}
                  className={`block w-full rounded-full px-3 py-2 text-left ${
                    person.id === current ? "bg-tint" : "hover:bg-ground"
                  }`}
                >
                  <span
                    className={`block truncate text-xs ${
                      person.id === current ? "font-medium text-accent-ink" : "text-ink"
                    }`}
                  >
                    {nameOf(person)}
                  </span>
                  <span className="flex items-center gap-2 text-[11px] text-muted">
                    <span className="min-w-0 truncate">{person.email ?? "no email"}</span>
                    {person.role === Role.Admin ? (
                      <span className="shrink-0 text-accent-ink">admin</span>
                    ) : null}
                  </span>
                </button>
              ))}
            </section>
          ))
        )}
      </div>
    </aside>
  );
}

/** The two ways in that are closed, said plainly rather than shown as an empty dashboard. */
function Gate({ title, body, signIn }: { title: string; body: string; signIn?: boolean }) {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-6 p-8 text-center">
      <h1 className="text-4xl font-extrabold tracking-tight">{title}</h1>
      <p className="max-w-sm text-sm text-muted">{body}</p>
      {signIn ? (
        <SignInButton mode="modal">
          <button className="rounded-full bg-accent px-6 py-2.5 text-sm font-medium text-on-accent shadow-soft hover:bg-accent-strong">
            Sign in with Google
          </button>
        </SignInButton>
      ) : (
        <Link
          href="/"
          className="rounded-full border border-rule bg-panel px-6 py-2.5 text-sm font-medium text-ink hover:text-accent-ink"
        >
          Back to rendering
        </Link>
      )}
    </main>
  );
}
