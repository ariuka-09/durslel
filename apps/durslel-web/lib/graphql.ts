/**
 * Talks to the Worker's GraphQL endpoint.
 *
 * The app calls GraphQL from its route handlers rather than from the browser. D1 lives behind the
 * Worker and the Next app runs in a container, so there is a network hop either way; doing it
 * server-side keeps the session token off the client and keeps `npm run dev` working without a
 * Worker running alongside it.
 *
 * Two ways to prove who is calling, because the app makes two very different kinds of call:
 *
 *   `graphql`          – inside a request, forwarding the caller's own Clerk session.
 *   `graphqlAsService` – after the response has been sent, when there is no session left to
 *                        forward. See its comment for why that case exists at all.
 */
/**
 * durslel-service is a separate Worker with its own hostname, so this is a plain cross-service
 * call rather than the app reaching back into its own edge Worker.
 */
const ENDPOINT =
  process.env.GRAPHQL_URL ??
  "https://dursel-service.ariuntuguldur3.workers.dev/graphql";

export class GraphQLRequestError extends Error {}

/**
 * Imported at the point of use rather than at module scope: Clerk is server-only, and a static
 * import would drag it in for anything that merely touches this module — including a caller that
 * supplies its own token.
 */
const sessionToken = async (): Promise<string | null> => {
  const { auth } = await import("@clerk/nextjs/server");
  const { getToken } = await auth();
  return getToken();
};

async function send<T>(
  query: string,
  variables: Record<string, unknown> | undefined,
  headers: Record<string, string>,
): Promise<T> {
  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify({ query, variables }),
    // Every one of these is per-user and changes as renders are made.
    cache: "no-store",
  });

  if (!res.ok) {
    throw new GraphQLRequestError(
      `GraphQL ${res.status} ${res.statusText}: ${await res.text()}`,
    );
  }

  // GraphQL reports failures inside a 200 body, so the status alone never means success.
  const body = (await res.json()) as {
    data?: T;
    errors?: { message: string }[];
  };
  if (body.errors?.length) {
    throw new GraphQLRequestError(body.errors.map((e) => e.message).join("; "));
  }
  if (!body.data) throw new GraphQLRequestError("GraphQL returned no data");

  return body.data;
}

/**
 * Acts as the signed-in caller, forwarding their Clerk session. The Worker verifies the token and
 * derives the user id from the signature, so nothing here asserts an identity.
 *
 * Only usable while the request scope is alive: resolving the token reads request headers, which
 * throw once the response has been returned.
 */
export async function graphql<T>(
  query: string,
  variables?: Record<string, unknown>,
  // Defaults to the caller's Clerk session. Explicit so the request handling above can be
  // exercised without a session to stand up.
  token?: string,
): Promise<T> {
  const bearer = token ?? (await sessionToken());
  if (!bearer) throw new GraphQLRequestError("not signed in");

  return send<T>(query, variables, { Authorization: `Bearer ${bearer}` });
}

/**
 * Acts on a user's behalf from work that outlives their request.
 *
 * A render streams for up to three minutes. By the time it finishes, two things are true: the
 * Next request scope is gone, so no session token can be minted; and the token it started with
 * would have expired anyway, since Clerk sessions last about a minute. Carrying a token captured
 * at the start would fail for exactly the long renders most worth recording.
 *
 * So the container authenticates as itself and names the user. The credential is the Clerk secret
 * key both it and the Worker already hold — it never reaches a browser, and anyone holding it can
 * already impersonate any user through Clerk's own API.
 */
export async function graphqlAsService<T>(
  query: string,
  variables: Record<string, unknown> | undefined,
  userId: string,
): Promise<T> {
  const secret = process.env.CLERK_SECRET_KEY;
  if (!secret) throw new GraphQLRequestError("CLERK_SECRET_KEY is not set");

  return send<T>(query, variables, {
    "X-Dursel-Service": secret,
    "X-Dursel-User": userId,
  });
}
