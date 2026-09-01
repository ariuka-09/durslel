'use client';

import { ApolloClient, ApolloProvider, InMemoryCache, createHttpLink } from '@apollo/client';
import { setContext } from '@apollo/client/link/context';
import { useAuth } from '@clerk/nextjs';
import { useMemo, type ReactNode } from 'react';

/**
 * dursel-service is a separate Worker on its own hostname, so every call from here is
 * cross-origin. The service replies with `Access-Control-Allow-Origin: *`, which browsers refuse
 * to combine with credentials — the session cookie therefore never travels, and the token has to
 * go in a header instead.
 *
 * The reference client is a bare `uri` because its service authenticates nobody. Ours does, so
 * this adds an auth link and nothing else.
 */
const SERVICE_URL =
  process.env.NEXT_PUBLIC_SERVICE_URL ?? 'https://dursel-service.ariuntuguldur3.workers.dev/graphql';

export const ApolloClientProvider = ({ children }: { children: ReactNode }) => {
  const { getToken } = useAuth();

  const client = useMemo(() => {
    // Resolved per request rather than once: Clerk session tokens are short-lived, so a token
    // captured when the client was built would stop working a minute into the session.
    const authLink = setContext(async (_, { headers }) => {
      const token = await getToken();

      return { headers: token ? { ...headers, Authorization: `Bearer ${token}` } : headers };
    });

    return new ApolloClient({
      link: authLink.concat(createHttpLink({ uri: SERVICE_URL })),
      cache: new InMemoryCache(),
    });
  }, [getToken]);

  return <ApolloProvider client={client}>{children}</ApolloProvider>;
};
