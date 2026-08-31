import { clerkMiddleware } from "@clerk/nextjs/server";
import { NextResponse, type NextFetchEvent, type NextRequest } from "next/server";

/**
 * Attaches the Clerk session to every request. Nothing is blocked here on purpose:
 * `/api/video/[id]` has to stay open so a copied link works for whoever it was sent to,
 * and the routes that do need a user check it themselves with `auth()`.
 */
const clerk = clerkMiddleware();

/** Clerk appends this to the URL when it hands a session back after sign-in. */
const HANDSHAKE = "__clerk_handshake";
/** One bounded retry, tracked out-of-band so the recovered URL stays clean. */
const RETRIED = "__clerk_hs_retried";

export default async function proxy(request: NextRequest, event: NextFetchEvent) {
  try {
    return await clerk(request, event);
  } catch (error) {
    // A handshake token that is malformed, expired, or already spent makes Clerk throw. Left
    // alone that is a trap rather than an error: the bad token stays in the address bar, so
    // reloading fails exactly the same way and the user cannot get back to a working page.
    // Strip it and start over.
    const spent =
      request.nextUrl.searchParams.has(HANDSHAKE) &&
      request.cookies.get(RETRIED)?.value !== "1";
    if (!spent) throw error;

    // Recovering silently would hide a handshake that fails every time, which looks identical
    // to one stale token from the outside. This is the only trace of why it failed.
    console.error(
      "clerk handshake failed, retrying clean:",
      error instanceof Error ? error.message : String(error),
    );

    const url = request.nextUrl.clone();
    url.searchParams.delete(HANDSHAKE);
    url.searchParams.delete("__clerk_handshake_nonce");
    const response = NextResponse.redirect(url);
    // Bounds this to a single retry. If the clean URL starts another handshake that fails the
    // same way, the error surfaces instead of bouncing the browser round a redirect loop.
    response.cookies.set(RETRIED, "1", { maxAge: 10, httpOnly: true, path: "/" });
    return response;
  }
}

export const config = {
  matcher: [
    // Everything except Next's own static output and file-looking paths.
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/api/(.*)",
  ],
};
