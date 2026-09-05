/**
 * Render slots.
 *
 * manim is single-threaded — measured at 1.09 CPU-seconds per wall-second across a sample of
 * generated scenes — so one render can only ever occupy one core. Admitting an extra one past the
 * slot count adds no throughput; it only takes time away from the renders already going, and
 * everyone finishes later. Anything past the limit waits here instead.
 *
 * In-process is the right scope. durslel-service dispatches over a service binding to a Worker
 * that routes every render to one named container, so this module's counters are the whole
 * system's state. Route to more than one container and each gets its own limit, making the real
 * ceiling LIMIT × containers.
 */

/** Renders allowed to run at once. */
const LIMIT = Number(process.env.MAX_CONCURRENT_RENDERS ?? 4);

/** How many may wait behind them before a job is turned away rather than queued indefinitely. */
const MAX_WAITING = Number(process.env.MAX_QUEUED_RENDERS ?? 20);

let active = 0;
const waiting: Array<() => void> = [];

/** Thrown by `acquire` when the queue is already at MAX_QUEUED_RENDERS. */
export class QueueFull extends Error {
  constructor() {
    super("render queue is full");
    this.name = "QueueFull";
  }
}

/** Live counts, for tests and for logging how deep the queue got. */
export function stats(): { active: number; waiting: number; limit: number } {
  return { active, waiting: waiting.length, limit: LIMIT };
}

/**
 * Wait for a slot, then return the function that gives it back. Call that in a `finally` — a slot
 * never released is one the process never gets back.
 *
 * The caller must not start its deadline before this resolves. A render that waited here for two
 * minutes would otherwise begin with most of its budget already spent.
 */
export async function acquire(): Promise<() => void> {
  if (active < LIMIT) {
    active++;
  } else {
    if (waiting.length >= MAX_WAITING) throw new QueueFull();
    await new Promise<void>((resolve) => waiting.push(resolve));
    // No active++ here: the releaser below hands its slot over rather than freeing it, so the
    // count is already correct by the time this resumes.
  }

  let released = false;
  return () => {
    // Idempotent on purpose. A double release would drop `active` below the number of renders
    // actually running and let an extra one through.
    if (released) return;
    released = true;

    const next = waiting.shift();
    // Transfer the slot instead of decrementing. Freeing it first opens a window in which a job
    // arriving off the event loop could take it ahead of one already in line.
    if (next) next();
    else active--;
  };
}
