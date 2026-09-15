"use client";

import { useState } from "react";

import { useT } from "@/shared/i18n";

/**
 * Light or dark. With no cookie the system setting decides, through color-scheme in globals.css.
 * The toggle writes the cookie, and app/layout.tsx turns it into data-theme on <html> on the
 * server, so a page chosen dark is dark from the first byte instead of flashing light.
 */
export type Theme = "light" | "dark";

/** Also read by name in app/layout.tsx. */
const THEME_COOKIE = "theme";

export function ThemeToggle() {
  const t = useT();
  // Half turns, always the same way round; the half-filled icon lands flipped after each click.
  const [turns, setTurns] = useState(0);

  return (
    <button
      type="button"
      onClick={() => {
        const root = document.documentElement;
        // Without an explicit choice the page is showing whatever the system asked for, so the
        // opposite of that is what a click means.
        const dark = root.dataset.theme
          ? root.dataset.theme === "dark"
          : matchMedia("(prefers-color-scheme: dark)").matches;
        const next: Theme = dark ? "light" : "dark";
        document.cookie = `${THEME_COOKIE}=${next}; path=/; max-age=31536000; samesite=lax`;
        setTurns((n) => n + 1);
        const apply = () => {
          root.dataset.theme = next;
        };
        // A view transition crossfades the whole page between schemes. Browsers without one, and
        // anyone asking for less motion, get the plain switch. So do phones: iOS Safari recolours
        // its status bar and toolbar from the page at once, outside the snapshot, so the crossfade
        // showed as a grey flash boxed in by already-switched chrome, toggles floating on top.
        if (
          document.startViewTransition &&
          matchMedia("(hover: hover) and (prefers-reduced-motion: no-preference)").matches
        ) {
          document.startViewTransition(apply);
        } else {
          apply();
        }
      }}
      title={t.theme}
      aria-label={t.theme}
      // The transition name goes on the button, not the spinning icon. A named element's transform
      // is animated by the view transition itself, as a matrix, which takes the shortest way round:
      // from the second click on, the icon spun backwards for the crossfade and then snapped. The
      // button never transforms, so the icon keeps its own rotation inside it.
      className="grid size-7 shrink-0 place-items-center rounded-full border border-rule bg-panel text-muted hover:text-accent-ink [view-transition-name:theme-toggle]"
    >
      <svg
        viewBox="0 0 16 16"
        style={{ transform: `rotate(${turns * 180}deg)` }}
        className="size-3.5 transition-transform duration-500 ease-out motion-reduce:transition-none"
        aria-hidden
      >
        <circle cx="8" cy="8" r="6.25" fill="none" stroke="currentColor" strokeWidth="1.5" />
        <path d="M8 1.75a6.25 6.25 0 0 1 0 12.5z" fill="currentColor" />
      </svg>
    </button>
  );
}
