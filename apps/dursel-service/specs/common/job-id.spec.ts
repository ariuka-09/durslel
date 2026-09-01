import { makeJobId, makeTitle } from '@/common/job-id';

describe('makeJobId', () => {
  /** The id is a path segment and an R2 key, so anything outside [A-Za-z0-9-] would break both. */
  it('produces only characters that are safe in a path and a key', () => {
    expect(makeJobId('Plot sin(x) — and its derivative!')).toMatch(/^[A-Za-z0-9-]+$/);
  });

  it('leads with a sortable UTC timestamp so ids order chronologically', () => {
    expect(makeJobId('anything')).toMatch(/^\d{14}-/);
  });

  it('slugs the prompt after the timestamp', () => {
    expect(makeJobId('Plot sin(x)').slice(15)).toBe('plot-sin-x');
  });

  /** A prompt with nothing sluggable still needs an id. */
  it('falls back to "scene" when the prompt slugs to nothing', () => {
    expect(makeJobId('!!!').slice(15)).toBe('scene');
  });

  it('caps the slug so the id cannot grow without bound', () => {
    expect(makeJobId('x'.repeat(200)).slice(15)).toHaveLength(40);
  });
});

describe('makeTitle', () => {
  it('is the prompt, whitespace collapsed', () => {
    expect(makeTitle('  plot   sin(x)\nand more ')).toBe('plot sin(x) and more');
  });

  it('truncates a long prompt with an ellipsis rather than cutting mid-stream', () => {
    const title = makeTitle('x'.repeat(200));

    expect(title).toHaveLength(80);
    expect(title.endsWith('…')).toBe(true);
  });

  it('leaves a prompt exactly at the limit alone', () => {
    const exact = 'y'.repeat(80);

    expect(makeTitle(exact)).toBe(exact);
  });
});
