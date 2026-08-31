import { formatDate, makeTitle } from '@/lib/jobs';

describe('makeTitle', () => {
  it('is the prompt, whitespace collapsed', () => {
    expect(makeTitle('  plot   sin(x)\nand its derivative ')).toBe('plot sin(x) and its derivative');
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

describe('formatDate', () => {
  /** Locale and zone are pinned, so this asserts the same thing on any machine. */
  it('formats an instant in the given zone', () => {
    expect(formatDate(Date.UTC(2026, 7, 29, 3, 21, 25), 'en-US', 'UTC')).toBe('Aug 29, 03:21 AM');
  });

  /** The zone is a real offset, not decoration — the same instant reads differently elsewhere. */
  it('renders the same instant according to the viewer’s zone', () => {
    const instant = Date.UTC(2026, 7, 29, 3, 21, 25);

    expect(formatDate(instant, 'en-US', 'Asia/Ulaanbaatar')).toBe('Aug 29, 11:21 AM');
  });

  it('yields no date for a nonsense timestamp rather than Invalid Date', () => {
    expect(formatDate(Number.NaN, 'en-US', 'UTC')).toBe('');
  });
});
