// The upload path spends a Gemini call on whatever it is handed, so what it refuses before making
// that call is the part worth pinning: an unsigned caller, an oversized file, a type Gemini cannot
// read inline — and a page that turned out to hold no problem at all.
import { POST } from '@/app/api/solve/route';
import { auth } from '@clerk/nextjs/server';
import { GoogleGenAI } from '@google/genai';

jest.mock('@clerk/nextjs/server', () => ({ auth: jest.fn(async () => ({ userId: 'user_1' })) }));

const generateContent = jest.fn();
jest.mock('@google/genai', () => ({
  ...jest.requireActual('@google/genai'),
  GoogleGenAI: jest.fn(() => ({ models: { generateContent } })),
}));

const post = (file: File) => {
  const body = new FormData();
  body.append('file', file);
  return POST(new Request('http://x/api/solve', { method: 'POST', body }));
};

const png = (bytes = 8) =>
  new File([new Uint8Array(bytes)], 'problem.png', { type: 'image/png' });

beforeEach(() => {
  process.env.GEMINI_API_KEY = 'test-key';
  jest.mocked(auth).mockResolvedValue({ userId: 'user_1' } as never);
  generateContent.mockReset().mockResolvedValue({ text: 'Animate ∫x·eˣ dx by parts.' });
});

it('answers with the brief, and sends the file to Gemini inline', async () => {
  const res = await post(png());

  expect(res.status).toBe(200);
  expect(await res.json()).toEqual({ prompt: 'Animate ∫x·eˣ dx by parts.' });
  expect(generateContent).toHaveBeenCalledWith(
    expect.objectContaining({
      contents: [
        expect.objectContaining({
          parts: [
            { inlineData: { mimeType: 'image/png', data: expect.any(String) } },
            expect.objectContaining({ text: expect.stringContaining('NO_PROBLEM') }),
          ],
        }),
      ],
    }),
  );
});

it('refuses a caller who is not signed in, without calling Gemini', async () => {
  jest.mocked(auth).mockResolvedValue({ userId: null } as never);

  expect((await post(png())).status).toBe(401);
  expect(generateContent).not.toHaveBeenCalled();
});

it('refuses a file over 10 MB before reading its bytes', async () => {
  expect((await post(png(11 * 1024 * 1024))).status).toBe(413);
  expect(generateContent).not.toHaveBeenCalled();
});

it('refuses a type Gemini cannot read inline', async () => {
  const doc = new File(['x'], 'problem.docx', {
    type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  });

  expect((await post(doc)).status).toBe(415);
  expect(generateContent).not.toHaveBeenCalled();
});

it('reports a page with no problem on it rather than rendering the sentinel', async () => {
  generateContent.mockResolvedValue({ text: 'NO_PROBLEM' });

  const res = await post(png());

  expect(res.status).toBe(422);
  expect(await res.json()).toMatchObject({ error: expect.stringContaining('No problem') });
});

it('says which call ran out of clock, not the render path\'s wording', async () => {
  const aborted = new Error('This operation was aborted');
  aborted.name = 'TimeoutError';
  generateContent.mockRejectedValue(aborted);

  const res = await post(png());

  expect(res.status).toBe(504);
  const { error } = (await res.json()) as { error: string };
  expect(error).toContain('read the problem');
  expect(error).not.toContain('render');
});

it('asks Gemini to think at the level the environment configures', async () => {
  await post(png());

  expect(generateContent).toHaveBeenCalledWith(
    expect.objectContaining({
      config: expect.objectContaining({
        thinkingConfig: { thinkingLevel: expect.any(String) },
      }),
    }),
  );
});

it('names the real reason when Gemini rejects the key', async () => {
  const { ApiError } = jest.requireActual('@google/genai');
  generateContent.mockRejectedValue(new ApiError({ message: 'API_KEY_INVALID', status: 400 }));

  const res = await post(png());

  expect(res.status).toBe(502);
  expect(await res.json()).toMatchObject({ error: expect.stringContaining('rejected the API key') });
});

it('does not reach Gemini at all when no key is configured', async () => {
  delete process.env.GEMINI_API_KEY;

  expect((await post(png())).status).toBe(500);
  expect(generateContent).not.toHaveBeenCalled();
});

// GoogleGenAI is constructed per request rather than at module load, so a key set after boot is
// still picked up — asserting the mock was used at all keeps that from silently regressing.
it('constructs the client with the configured key', async () => {
  await post(png());
  expect(GoogleGenAI).toHaveBeenCalledWith({ apiKey: 'test-key' });
});
