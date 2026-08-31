import { auth, currentUser } from "@clerk/nextjs/server";

import { graphql } from "@/lib/graphql";

export interface HistoryRender {
  id: string;
  jobId: string;
  title: string;
  url: string;
  createdAt: number;
}

const GET_RENDERS = `
  query GetRenders {
    getRenders { id jobId title url createdAt }
  }
`;

const UPSERT_USER = `
  mutation UpsertUser($input: UpsertUserInput!) {
    upsertUser(input: $input) { id }
  }
`;

/**
 * The sidebar's data, straight from the database.
 *
 * This is also where the users table gets filled in. There is no webhook and no sign-in hook, so
 * the profile is refreshed on app load — an idempotent upsert, cheap enough to repeat, and it
 * means a user exists with a name from their first visit rather than their first render.
 */
export async function GET() {
  const { userId } = await auth();
  if (!userId) return new Response("unauthorized", { status: 401 });

  const user = await currentUser();

  const [renders] = await Promise.all([
    graphql<{ getRenders: HistoryRender[] }>(GET_RENDERS),
    // Fire-and-forget relative to the listing: a profile that fails to sync must not stop the
    // sidebar from rendering, and the next load will try again.
    graphql(UPSERT_USER, {
      input: {
        email: user?.primaryEmailAddress?.emailAddress ?? null,
        firstName: user?.firstName ?? null,
        lastName: user?.lastName ?? null,
      },
    }).catch(() => undefined),
  ]);

  return Response.json({ renders: renders.getRenders });
}
