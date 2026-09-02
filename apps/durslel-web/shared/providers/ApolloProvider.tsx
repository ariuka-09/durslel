'use client';

import { ApolloClient, ApolloProvider, InMemoryCache, createHttpLink } from '@apollo/client';
import { setContext } from '@apollo/client/link/context';
import { useAuth } from '@clerk/nextjs';
import { useMemo, type ReactNode } from 'react';

/**
 * durslel-service is a separate Worker on its own hostname, so every call from here is
 * cross-origin. The service replies with `Access-Control-Allow-Origin: *`, which browsers refuse
 * to combine with credentials — the session cookie therefore never travels, and the token has to
 * go in a header instead.
 *
 * The reference client is a bare `uri` because its service authenticates nobody. Ours does, so
 * this adds an auth link and nothing else.
 */
const FALLBACK_SERVICE_URL = 'https://dursel-service.ariuntuguldur3.workers.dev/graphql';

/**
 * Which durslel-service this page talks to.
 *
 * Derived from the page's own hostname rather than fixed at build time. `NEXT_PUBLIC_*` is inlined
 * by `next build`, and both environments deploy the same container image — so a baked-in value
 * would have the test app's browser writing renders into the production database.
 *
 * ponytail: couples to the Worker naming convention (dursel-web / dursel-web-test against
 * dursel-service / dursel-service-test). Cheaper than a second image per environment; if the
 * names ever stop matching, set NEXT_PUBLIC_SERVICE_URL, which still wins outright.
 */
const serviceUrl = (): string => {
  if (process.env.NEXT_PUBLIC_SERVICE_URL) return process.env.NEXT_PUBLIC_SERVICE_URL;

  // Absent during SSR, and on any host that is not one of the deployed Workers — localhost falls
  // through to the deployed production service, which is what it talked to before.
  const host = typeof window === 'undefined' ? '' : window.location.hostname;

  return host.startsWith('dursel-web') ? `https://${host.replace('dursel-web', 'dursel-service')}/graphql` : FALLBACK_SERVICE_URL;
};

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
      link: authLink.concat(createHttpLink({ uri: serviceUrl() })),
      cache: new InMemoryCache(),
    });
  }, [getToken]);

  return <ApolloProvider client={client}>{children}</ApolloProvider>;
};
