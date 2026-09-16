import {
  FREE_DAILY_LIMIT,
  byMonth,
  dayStart,
  formatDate,
  makeTitle,
  monthKey,
  rendersLeftToday,
} from '@/lib/jobs';

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

describe('byMonth', () => {
  /** Local time, like the chart itself — built from local constructors so the zone cancels out. */
  const at = (year: number, month: number, day = 1) => +new Date(year, month - 1, day, 12);

  it('counts each series into the same months', () => {
    const rows = byMonth(
      [[at(2026, 7, 3), at(2026, 7, 20)], [at(2026, 7, 4), at(2026, 8, 9), at(2026, 8, 11)]],
      at(2026, 8, 28),
    );

    expect(rows).toEqual([
      { key: '2026-07', counts: [2, 1] },
      { key: '2026-08', counts: [0, 2] },
    ]);
  });

  /** The point of the range: a quiet month is a gap on the axis, not a month that never existed. */
  it('keeps the months where nothing happened', () => {
    const rows = byMonth([[at(2025, 11, 2)], [at(2026, 2, 6)]], at(2026, 2, 20));

    expect(rows.map((r) => r.key)).toEqual(['2025-11', '2025-12', '2026-01', '2026-02']);
    expect(rows[1].counts).toEqual([0, 0]);
  });

  it('draws nothing at all when no series has a point', () => {
    expect(byMonth([[], []], at(2026, 2, 20))).toEqual([]);
  });

  it('crosses a year end without a 13th month', () => {
    expect(monthKey(at(2025, 12, 31))).toBe('2025-12');
    expect(byMonth([[at(2025, 12, 31)]], at(2026, 1, 1)).map((r) => r.key)).toEqual([
      '2025-12',
      '2026-01',
    ]);
  });
});

describe('rendersLeftToday', () => {
  /** 16:00 UTC is midnight GMT+8, so this is the first instant of the 30th there. */
  const midnightGmt8 = Date.UTC(2026, 7, 29, 16, 0, 0);
  const noon = midnightGmt8 + 12 * 60 * 60 * 1000;

  it('starts the day at midnight GMT+8, not at UTC midnight', () => {
    expect(dayStart(noon)).toBe(midnightGmt8);
  });

  it('is the full limit when nothing was rendered today', () => {
    expect(rendersLeftToday([], FREE_DAILY_LIMIT, noon)).toBe(FREE_DAILY_LIMIT);
  });

  it('ignores renders from before the reset', () => {
    expect(rendersLeftToday([midnightGmt8 - 1], FREE_DAILY_LIMIT, noon)).toBe(FREE_DAILY_LIMIT);
  });

  it('counts a render made exactly at the reset', () => {
    expect(rendersLeftToday([midnightGmt8], FREE_DAILY_LIMIT, noon)).toBe(FREE_DAILY_LIMIT - 1);
  });

  /** What a subscription buys: the same history against a bigger ceiling leaves more. */
  it('counts against the limit it is given, not a constant', () => {
    expect(rendersLeftToday([noon, noon, noon], 30, noon)).toBe(27);
  });

  /** A subscription ending mid-day lowers the ceiling under renders already made. */
  it('never reads below zero', () => {
    expect(rendersLeftToday([noon, noon, noon, noon], FREE_DAILY_LIMIT, noon)).toBe(0);
  });

  /** The server counts failed renders too, so more rows than the limit is a reachable state. */
  it('never reads below zero', () => {
    expect(rendersLeftToday(Array(FREE_DAILY_LIMIT + 2).fill(noon), FREE_DAILY_LIMIT, noon)).toBe(0);
  });
});
