import { ApolloServer } from '@apollo/server';
import { buildSubgraphSchema } from '@apollo/subgraph';
import { startServerAndCreateCloudflareWorkersHandler } from '@as-integrations/cloudflare-workers';
import { authenticate } from '../common/auth';
import { corsPlugin, preflightResponse } from '../common/cors';
import { resolvers } from '../resolvers';
import { typeDefs } from '../schemas';

const server = new ApolloServer<Context>({
  schema: buildSubgraphSchema([{ typeDefs, resolvers }]),
  introspection: true,
  plugins: [corsPlugin],
});

const apolloHandler = startServerAndCreateCloudflareWorkersHandler<Env, Context>(server, {
  // The session is verified once per request and handed to every resolver, rather than each one
  // re-parsing the token.
  context: async ({ request, env, ctx }) => ({
    env,
    userId: await authenticate(request, env),
    // startRender hands work off and returns; this is what keeps that work alive past the response.
    waitUntil: (promise: Promise<unknown>) => ctx.waitUntil(promise),
  }),
});

export const workersHandler = async (request: Request, env: Env, ctx: ExecutionContext) => preflightResponse(request) ?? apolloHandler(request, env, ctx);
