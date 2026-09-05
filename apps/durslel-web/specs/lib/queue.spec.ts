/**
 * The queue reads its limits once, at import, so they are set before the module is loaded rather
 * than at the top of the file — an ES import would hoist above the assignment.
 */
let acquire: typeof import('@/lib/queue').acquire;
let QueueFull: typeof import('@/lib/queue').QueueFull;
let stats: typeof import('@/lib/queue').stats;

const settle = () => new Promise((r) => setTimeout(r, 5));

beforeAll(async () => {
  process.env.MAX_CONCURRENT_RENDERS = '2';
  process.env.MAX_QUEUED_RENDERS = '2';
  ({ acquire, QueueFull, stats } = await import('@/lib/queue'));
});

describe('acquire', () => {
  it('hands out slots up to the limit without anyone waiting', async () => {
    const a = await acquire();
    const b = await acquire();

    expect(stats()).toEqual({ active: 2, waiting: 0, limit: 2 });

    a();
    b();
    expect(stats().active).toBe(0);
  });

  it('makes the render past the limit wait until a slot is released', async () => {
    const a = await acquire();
    const b = await acquire();

    let running = false;
    const third = acquire().then((release) => {
      running = true;
      return release;
    });

    await settle();
    expect(running).toBe(false);
    expect(stats()).toEqual({ active: 2, waiting: 1, limit: 2 });

    a();
    const release = await third;
    expect(running).toBe(true);
    expect(stats()).toEqual({ active: 2, waiting: 0, limit: 2 });

    b();
    release();
    expect(stats().active).toBe(0);
  });

  it('serves waiters in the order they arrived', async () => {
    const a = await acquire();
    const b = await acquire();

    const order: string[] = [];
    const first = acquire().then((r) => (order.push('first'), r));
    const second = acquire().then((r) => (order.push('second'), r));

    await settle();
    expect(order).toEqual([]);

    a();
    await settle();
    expect(order).toEqual(['first']);

    b();
    await settle();
    expect(order).toEqual(['first', 'second']);

    (await first)();
    (await second)();
    expect(stats().active).toBe(0);
  });

  /** A double release would drop the count below the number actually running. */
  it('ignores a slot released twice', async () => {
    const a = await acquire();
    const b = await acquire();

    a();
    a();
    a();
    expect(stats().active).toBe(1);

    b();
    expect(stats().active).toBe(0);
  });

  it('turns callers away past the queue depth rather than letting it grow', async () => {
    const held = [await acquire(), await acquire()];
    const queued = [acquire(), acquire()];
    await settle();

    await expect(acquire()).rejects.toBeInstanceOf(QueueFull);
    expect(stats()).toEqual({ active: 2, waiting: 2, limit: 2 });

    for (const release of held) release();
    for (const q of queued) (await q)();
    expect(stats().active).toBe(0);
  });
});
