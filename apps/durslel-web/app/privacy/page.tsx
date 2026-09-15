import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Privacy — Durslel" };

const CONTACT = "ariuntuguldur3@gmail.com";

/**
 * The privacy policy Google's consent screen links to. Publishing the Google sign-in app requires
 * one, and without publishing only listed test users can sign in with Google.
 *
 * Keep it true to what the code does: if a new processor or a new kind of stored data is added,
 * this page is part of that change.
 */
export default function Privacy() {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 px-5 py-10 text-sm leading-relaxed">
      <div className="flex items-baseline justify-between gap-4">
        <h1 className="text-3xl font-extrabold tracking-tight">Privacy</h1>
        <Link href="/" className="font-medium text-muted hover:text-ink">
          Back
        </Link>
      </div>
      <p className="text-muted">Last updated September 15, 2026</p>

      <section className="flex flex-col gap-2">
        <h2 className="text-lg font-bold">What we collect</h2>
        <ul className="list-disc space-y-1 pl-5">
          <li>
            Your name and email address, when you sign in. Sign-in is handled by Clerk; if you use
            Google, we receive only your name, email address and profile picture.
          </li>
          <li>
            The prompts you write, the animation code generated from them, and the rendered videos.
          </li>
          <li>
            Your plan and when it expires. Payments are processed by Wire; we never see your card or
            bank details.
          </li>
        </ul>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-lg font-bold">How it is used</h2>
        <p>
          Only to run Durslel: to sign you in, turn your prompts into videos, show you your past
          renders, and apply your plan. Prompts are sent to Google Gemini to generate the animation
          code. We do not sell your data or use it for advertising.
        </p>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-lg font-bold">Where it is stored</h2>
        <p>
          On Cloudflare (the app, database and videos), Clerk (your account) and Wire (payments).
          Anyone you share a video link with can watch that video.
        </p>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-lg font-bold">Deleting your data</h2>
        <p>
          Email{" "}
          <a href={`mailto:${CONTACT}`} className="font-mono text-accent hover:text-accent-ink">
            {CONTACT}
          </a>{" "}
          from the address you sign in with, and we will delete your account, prompts and videos.
        </p>
      </section>
    </main>
  );
}
