"use client";

import { SignInButton, UserButton, useAuth } from "@clerk/nextjs";
import Link from "next/link";
import { useState } from "react";

import {
  RenderStatus,
  useGetRendersQuery,
  useUsersQuery,
  type GetRendersQuery,
  type UsersQuery,
  Role,
} from "@/generated";
import { useIsAdmin } from "@/lib/admin";
import { STATUS_COLOR, STATUS_TEXT, formatDate } from "@/lib/jobs";

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
        <header className="flex items-baseline justify-between gap-4 border-b border-rule px-5 py-3">
          <div className="flex items-baseline gap-3">
            <button
              type="button"
              onClick={() => setRosterOpen((v) => !v)}
              className="border border-rule px-2 py-1 text-[10px] uppercase tracking-[0.15em] text-muted md:hidden"
            >
              {rosterOpen ? "Close" : "Roster"}
            </button>
            <h1 className="font-display text-2xl tracking-tight">
              Dur<span className="text-blue-d">slel</span>
            </h1>
            <span className="text-[10px] uppercase tracking-[0.25em] text-yellow-e">
              admin
            </span>
          </div>
          <div className="flex items-center gap-4">
            <Link
              href="/"
              className="text-xs uppercase tracking-[0.2em] text-muted hover:text-ink"
            >
              Render
            </Link>
            <UserButton />
          </div>
        </header>

        {current ? (
          <section className="flex min-w-0 flex-1 flex-col gap-5 bg-ground p-5">
            {/* The page's one large piece of type: whose work you are looking at. */}
            <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 border-b border-rule pb-4">
              <h2 className="font-display text-3xl tracking-tight">{nameOf(current)}</h2>
              {current.email ? (
                <p className="text-xs text-muted">{current.email}</p>
              ) : null}
              {current.role === Role.Admin ? (
                <span className="border border-yellow-e px-1.5 py-0.5 text-[10px] uppercase tracking-[0.15em] text-yellow-e">
                  admin
                </span>
              ) : null}
              <p className="ml-auto text-[10px] uppercase tracking-[0.2em] text-muted">
                {loading ? "loading" : `${renders.length} render${renders.length === 1 ? "" : "s"}`}
              </p>
            </div>

            {renders.length === 0 ? (
              <p className={`text-xs ${error ? "text-red-c" : "text-muted"}`}>
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
          <section className="flex flex-1 items-center justify-center bg-ground p-5">
            {/* An empty roster and a refused one look identical from here, so say which. */}
            <p className={`max-w-sm text-center text-xs ${rosterError ? "text-red-c" : "text-muted"}`}>
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
    <article className="flex flex-col border border-rule bg-panel">
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
        <div className="flex aspect-video flex-col items-center justify-center gap-2 bg-black px-6 text-center">
          <p className={`text-[10px] uppercase tracking-[0.2em] ${STATUS_COLOR[status]}`}>
            {STATUS_TEXT[status]}
          </p>
          {status === RenderStatus.Failed ? (
            <p className="line-clamp-3 text-[11px] leading-relaxed text-muted">
              {error ?? "No reason was recorded."}
            </p>
          ) : null}
        </div>
      )}

      <div className="flex flex-col gap-2 border-t border-rule px-4 py-3">
        {/* manim's Write, borrowed: the line strokes itself on left to right, staggered down the
            grid. Disabled under prefers-reduced-motion by the rule in globals.css. */}
        <p
          className="stroke-on flex flex-wrap items-baseline gap-x-3 gap-y-1 text-[10px] uppercase tracking-[0.18em] text-muted"
          style={{ animationDelay: `${Math.min(index, 11) * 45}ms` }}
        >
          <time>{formatDate(createdAt)}</time>
          {sceneClass ? <span className="text-blue-d">{sceneClass}</span> : null}
          {durationMs ? <span>{(durationMs / 1000).toFixed(1)}s</span> : null}
          {attempts > 1 ? <span className="text-yellow-e">{attempts} tries</span> : null}
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

/** Everyone who has signed in, newest first. */
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
  return (
    <aside
      className={`${
        shown ? "flex" : "hidden"
      } w-64 shrink-0 flex-col border-r border-rule bg-panel md:flex`}
    >
      <p className="border-b border-rule px-4 py-3 text-[10px] uppercase tracking-[0.25em] text-muted">
        roster
      </p>
      <div className="flex-1 overflow-auto">
        {people.length === 0 ? (
          <p className="px-4 py-3 text-[11px] text-rule">nobody yet</p>
        ) : (
          people.map((person) => (
            <button
              key={person.id}
              type="button"
              onClick={() => pick(person.id)}
              className={`block w-full border-b border-rule/50 px-4 py-2.5 text-left hover:bg-ground ${
                person.id === current ? "bg-ground" : ""
              }`}
            >
              <span
                className={`block truncate text-xs ${
                  person.id === current ? "text-blue-d" : "text-ink"
                }`}
              >
                {nameOf(person)}
              </span>
              <span className="flex items-center gap-2 text-[10px] text-muted">
                <span className="min-w-0 truncate">{person.email ?? "no email"}</span>
                {person.role === Role.Admin ? (
                  <span className="shrink-0 text-yellow-e">admin</span>
                ) : null}
              </span>
            </button>
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
      <h1 className="font-display text-4xl tracking-tight">{title}</h1>
      <p className="max-w-sm text-sm text-muted">{body}</p>
      {signIn ? (
        <SignInButton mode="modal">
          <button className="border border-yellow-e px-6 py-2.5 text-sm uppercase tracking-widest text-yellow-e">
            Sign in with Google
          </button>
        </SignInButton>
      ) : (
        <Link
          href="/"
          className="border border-rule px-6 py-2.5 text-sm uppercase tracking-widest text-ink hover:border-blue-d hover:text-blue-d"
        >
          Back to rendering
        </Link>
      )}
    </main>
  );
}
