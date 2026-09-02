import type { ApolloServerPlugin } from '@apollo/server';

export const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

export const corsPlugin: ApolloServerPlugin<Context> = {
  requestDidStart: async () => ({
    willSendResponse: async ({ response }) => {
      Object.entries(CORS_HEADERS).forEach(([header, value]) => response.http.headers.set(header, value));
    },
  }),
};

export const preflightResponse = (request: Request) => (request.method === 'OPTIONS' ? new Response(null, { status: 204, headers: CORS_HEADERS }) : null);
