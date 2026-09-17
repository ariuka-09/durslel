"use client";

import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type RefObject,
} from "react";

/**
 * The scroll engine behind the pinned pages: one normalized progress per scene, and every
 * property derived from it by the page's own handlers.
 *
 * Progress is always recomputed from the scroll position and the scene's measured box — never
 * accumulated from scroll deltas, which drift on a fast flick and are wrong after a reload
 * halfway down the page.
 */

export const clamp = (v: number, a = 0, b = 1) => Math.min(b, Math.max(a, v));
/** Remaps t from [a, b] onto 0..1, which is how a scene gives one beat its own timeline. */
export const range = (t: number, a: number, b: number) =>
  clamp((t - a) / (b - a));
export const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** Called with the scene's progress, 0 where it pins and 1 where it unpins. */
export type SceneHandler = (p: number, scene: HTMLElement) => void;

// Styles are written before the browser paints, so a page whose markup is the finished state
// never flashes that state on its way to zero. On the server there is no layout to run.
export const useIsoLayoutEffect =
  typeof window === "undefined" ? useEffect : useLayoutEffect;

/**
 * Drives every `[data-scene]` inside `rootRef`, and marks the root `data-motion="1"` so the CSS
 * can switch from the plain stacked layout to the pinned one.
 *
 * Nothing happens at all when the reader has asked for less motion: the markup they get is the
 * finished frame, which is the whole reason the pages are written that way round. Returns whether
 * it is driving anything, so a page can hand a reader who is getting no playhead the controls to
 * play the thing themselves.
 */
export function useScrollScenes(
  rootRef: RefObject<HTMLElement | null>,
  handlers: Record<string, SceneHandler>,
) {
  const live = useRef(handlers);
  const [motion, setMotion] = useState(false);

  // Refreshed on every commit rather than restarting the engine, because the handlers close over
  // translated copy and that changes whenever the language does.
  useIsoLayoutEffect(() => {
    live.current = handlers;
  });

  useIsoLayoutEffect(() => {
    const mq = matchMedia("(prefers-reduced-motion: no-preference)");
    const sync = () => setMotion(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  useIsoLayoutEffect(() => {
    const el = rootRef.current;
    if (!motion || !el) return;

    el.dataset.motion = "1";
    const scenes = [...el.querySelectorAll<HTMLElement>("[data-scene]")].map(
      (node) => ({ node, top: 0, h: 0, p: -1 }),
    );
    let vh = innerHeight;
    let queued = false;

    function update() {
      queued = false;
      const y = scrollY; // read everything first...
      for (const s of scenes) {
        const p = clamp((y - s.top) / Math.max(1, s.h - vh));
        if (p === s.p) continue;
        s.p = p;
        s.node.style.setProperty("--p", p.toFixed(4)); // ...then write
        live.current[s.node.dataset.scene ?? ""]?.(p, s.node);
      }
    }

    function measure() {
      vh = innerHeight;
      for (const s of scenes) {
        const r = s.node.getBoundingClientRect();
        s.top = r.top + scrollY;
        s.h = r.height;
        s.p = -1;
      }
      update();
    }

    const onScroll = () => {
      if (queued) return;
      queued = true;
      requestAnimationFrame(update);
    };

    measure();
    addEventListener("scroll", onScroll, { passive: true });
    addEventListener("resize", measure);
    // Scene offsets are cached, so anything that changes the page's height has to invalidate
    // them: the stylesheet arriving, the house typeface landing, Clerk's button appearing. An
    // observer catches all of it, where a one-off measurement on load catches whichever of them
    // happened to have finished first — and a scene measured at its unpinned height reports a
    // progress of 1 from the moment it is reached.
    const resized = new ResizeObserver(measure);
    resized.observe(el);

    return () => {
      removeEventListener("scroll", onScroll);
      removeEventListener("resize", measure);
      resized.disconnect();
      delete el.dataset.motion;
    };
  }, [motion, rootRef]);

  return motion;
}
