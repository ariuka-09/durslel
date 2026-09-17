"use client";

import { useState } from "react";

import { byDay, byMonth, monthLabel } from "@/lib/jobs";

/**
 * The service over time: people arriving and videos being made, per calendar month — or per day
 * of one month, once it is picked.
 *
 * Two series on one axis because they are the same unit — a count of things that happened in a
 * month — so the bars can be compared by height. Anything measured differently (minutes of
 * render time, say) belongs in its own chart rather than on a second y-axis here.
 *
 * Plain elements rather than a charting dependency: this is two rectangles per month, and the
 * grid it sits in is the same flexbox the rest of the page uses.
 */
export function Chart({ signups, renders }: { signups: number[]; renders: number[] }) {
  // null is the whole history by month; a month key zooms into that month's days.
  const [month, setMonth] = useState<string | null>(null);
  const months = byMonth([signups, renders]);
  const rows = month ? byDay([signups, renders], month) : months;
  // Bars are read against each other, so one scale for both, and never a zero one — an empty
  // month would divide by it.
  const max = Math.max(1, ...rows.flatMap((row) => row.counts));
  // What the bars on screen add up to, so the legend follows the picked month.
  const [ups, dones] = [0, 1].map((i) => rows.reduce((sum, row) => sum + row.counts[i], 0));

  if (months.length === 0)
    return (
      <p className="rounded-card bg-panel px-5 py-4 text-xs text-muted shadow-soft">
        Nothing to chart yet.
      </p>
    );

  return (
    <figure
      className="flex flex-col gap-4 rounded-card bg-panel p-5 shadow-soft"
      role="img"
      aria-label={`${month ? `Per day in ${monthLabel(month)}` : `Per month since ${monthLabel(rows[0].key)}`}: ${ups} sign-ups and ${dones} renders in total.`}
    >
      <figcaption className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <span className="flex items-baseline gap-3">
          <span className="text-sm font-medium text-ink">Sign-ups and renders</span>
          <select
            aria-label="Period"
            value={month ?? ""}
            onChange={(event) => setMonth(event.target.value || null)}
            className="rounded-full border border-rule bg-panel px-2 py-0.5 text-[11px] text-muted"
          >
            <option value="">By month</option>
            {/* Newest first, like the roster. */}
            {months.toReversed().map(({ key }) => (
              <option key={key} value={key}>
                {monthLabel(key)}
              </option>
            ))}
          </select>
        </span>
        {/* A legend, not colour alone — and the counts it carries are the totals the bars add up
            to, which is the number usually asked for next. */}
        <span className="flex items-center gap-4 text-[11px] text-muted">
          <span className="flex items-center gap-1.5">
            <span className="size-2.5 rounded-[3px] bg-series-signups" />
            {ups} sign-ups
          </span>
          <span className="flex items-center gap-1.5">
            <span className="size-2.5 rounded-[3px] bg-series-renders" />
            {dones} renders
          </span>
        </span>
      </figcaption>

      {/* The only gridline: what the tallest bar is worth. Everything else is read against it,
          and it sits outside the scroller below — inside, its label is clipped. */}
      <div className="flex items-center gap-2 text-[10px] text-muted">
        {max}
        <span className="flex-1 border-t border-dashed border-rule" />
      </div>

      {/* Scrolls sideways once a year or so of months no longer fits, rather than squeezing the
          bars to hairlines. */}
      <div className="-mt-3 overflow-x-auto">
        <div className="flex min-w-full items-end gap-1">
          {rows.map(({ key, counts: [up, done] }, i) => (
            <div
              key={key}
              // The hover layer, done by the browser: every month can be read exactly without a
              // tooltip of our own to position, dismiss and keep off the edge of the screen.
              title={`${month ? new Date(`${key}T00:00`).toLocaleDateString(undefined, { month: "short", day: "numeric" }) : monthLabel(key)} · ${up} sign-up${up === 1 ? "" : "s"} · ${done} render${done === 1 ? "" : "s"}`}
              // A month of days is 31 columns, so they get narrower than months do before the
              // row starts scrolling.
              className={`flex flex-1 flex-col items-center gap-1.5 ${month ? "min-w-[20px] px-0.5" : "min-w-[34px] px-2"}`}
            >
              {/* 2px of panel between the pair, so two tall bars read as two, not as one wide
                  one with a seam. */}
              <div className="flex h-40 w-full items-end justify-center gap-[2px] border-b border-rule">
                <Bar value={up} max={max} className="bg-series-signups" />
                <Bar value={done} max={max} className="bg-series-renders" />
              </div>
              {/* One line, always: a label that wraps makes its column taller, and the columns
                  are bottom-aligned, so one wrapped month lifts its baseline above the rest. */}
              <span className="whitespace-nowrap text-[10px] text-muted">
                {month
                  ? Number(key.slice(8))
                  : // The year appears where it changes, so a two-year axis is not "Jan" twice.
                    monthLabel(key).replace(/ \d{4}$/, key.endsWith("-01") || i === 0 ? " ’" + key.slice(2, 4) : "")}
              </span>
            </div>
          ))}
        </div>
      </div>
    </figure>
  );
}

/** One bar. A month with a single render still gets a visible stub rather than nothing. */
function Bar({ value, max, className }: { value: number; max: number; className: string }) {
  return (
    <span
      className={`w-full max-w-5 flex-1 rounded-t-[4px] ${className}`}
      style={{ height: value === 0 ? 0 : `max(3px, ${(value / max) * 100}%)` }}
    />
  );
}
