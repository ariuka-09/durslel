import { CORS_HEADERS, corsPlugin, preflightResponse } from '@/common/cors';

describe('preflightResponse', () => {
  it('answers OPTIONS itself, so a preflight never reaches a resolver', () => {
    const response = preflightResponse(new Request('https://x/graphql', { method: 'OPTIONS' }));

    expect(response?.status).toBe(204);
    expect(response?.headers.get('Access-Control-Allow-Methods')).toBe(CORS_HEADERS['Access-Control-Allow-Methods']);
  });

  it('passes anything else through untouched', () => {
    expect(preflightResponse(new Request('https://x/graphql', { method: 'POST' }))).toBeNull();
  });
});

describe('corsPlugin', () => {
  it('adds the headers to a response on its way out', async () => {
    const headers = new Map<string, string>();
    const listener = await corsPlugin.requestDidStart!({} as never);

    await (listener as { willSendResponse: (_c: unknown) => Promise<void> }).willSendResponse({
      response: { http: { headers } },
    });

    expect(Object.fromEntries(headers)).toEqual(CORS_HEADERS);
  });
});
