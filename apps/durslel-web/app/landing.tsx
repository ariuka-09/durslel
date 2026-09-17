"use client";

import { SignInButton, SignUpButton } from "@clerk/nextjs";
import Link from "next/link";
import {
  useEffect,
  useRef,
  type CSSProperties,
  type SyntheticEvent,
} from "react";

import { FREE_DAILY_LIMIT } from "@/lib/jobs";
import { LangToggle, useLang, useT } from "@/shared/i18n";
import {
  easeOut,
  range,
  useIsoLayoutEffect,
  useScrollScenes,
} from "@/shared/scroll-scenes";
import { ThemeToggle } from "@/shared/theme";

/**
 * The signed-out page: the product doing its own job in front of the reader.
 *
 * It turns one sentence into an animation, so the page does that rather than describing it. One
 * pinned stage does the whole of it: the sentence types into the composer they will use, a
 * pointer presses Render, the night opens out of that button, and the render — a real mp4 off
 * the queue, scrubbed by scroll — fades up where the waiting was. It is one stage precisely so
 * that last step is a change of contents rather than a change of scenery: two pinned sections
 * can only hand over by sliding one out from under the other, and a render that scrolls in from
 * below is a render that came from somewhere else. Everything after it is calm: the way in.
 *
 * Nothing here is a mock-up except the waiting. A reader who asked for less motion, or whose
 * JavaScript never arrived, gets the composer as a still picture and the video with its own
 * controls, and the engine is enhancement on top of that. The shared defaults for that still
 * frame live in .landing in globals.css.
 */

/**
 * The two renders the page plays, both on black, which is why the night they play against is the
 * darkest thing on the page. Each is rendered once per language and scrubbed in the page's own, so
 * a reader who switched to Mongolian before scrolling watches the Mongolian render.
 *
 * The first is the prompt in scene one — 31s. The second is the photographed problem in scene two,
 * read and solved — 26.5s.
 *
 * Every seek decodes forward from the last keyframe, so a scrubbed video is only as smooth as its
 * keyframes are close. The manim 2160p60 masters, a keyframe every 1.4s, painted about 4 frames a
 * second under scroll, so the public/ copies are cut down for it (1080p30, keyframe every 0.5s):
 *   ffmpeg -i Pythagoras.mp4 -vf "scale=1920:1080,fps=30" -c:v libx264 -preset slow -crf 22 \
 *     -g 15 -keyint_min 15 -sc_threshold 0 -bf 0 -movflags +faststart -an pythagoras.mp4
 *
 * Scene three plays both of the first pair side by side, whichever language the page is in: one
 * sentence, with only the language switch changed in between.
 */
const VIDEO = { en: "/videos/pythagoras.mp4", mn: "/videos/pythagoras-mn.mp4" };
const VIDEO_PROBLEM = {
  en: "/videos/integral.mp4",
  mn: "/videos/integral-mn.mp4",
};
/**
 * Scene three's sentence, whichever language the page is in: it swaps on the switch along with
 * the render under it, so each render sits under the sentence it was made from. The English one
 * has its typo corrected from what was typed.
 */
const LANG_PROMPT = {
  en: "explain pythagorean theorem proof geometrically",
  mn: "Пифагорын теоремын баталгааг геометрээр тайлбарла",
};

/**
 * Scroll is the playhead: the video is seeked, never played. The reader owns the speed and the
 * direction, and the caption under it is always the one for the frame on screen.
 */
function playhead(
  p: number,
  from: number,
  to: number,
  scene: HTMLElement,
  v: HTMLVideoElement | null,
) {
  const play = range(p, from, to);
  scene.style.setProperty("--play", play.toFixed(4));
  seek(v, play);

  const caps = scene.querySelectorAll(".cap");
  const i = Math.min(caps.length - 1, Math.floor(play * caps.length));
  if (scene.dataset.cap !== String(i)) {
    scene.dataset.cap = String(i);
    caps.forEach((c, k) => c.classList.toggle("is-on", k === i));
  }
}

/**
 * The wait runs on the clock, not on scroll. Tied to scroll, a reader who stops sees a loading bar
 * that never finishes, and waits for it. So it holds for two seconds once the night is fully open,
 * then `data-film` fades the render in (globals.css) and scroll is the playhead again. Scrolling
 * back above the press takes it down, so the next pass waits again.
 */
function hold(open: number, scene: HTMLElement) {
  if (open < 1) {
    clearTimeout(Number(scene.dataset.wait));
    delete scene.dataset.wait;
    delete scene.dataset.film;
  } else if (!scene.dataset.wait) {
    scene.dataset.wait = String(
      setTimeout(() => (scene.dataset.film = "1"), 2000),
    );
  }
}

/** Puts the video at `play` of the way through. */
function seek(v: HTMLVideoElement | null, play: number) {
  // NaN until the metadata lands, and NaN fails this test, which is the guard.
  if (!v?.duration) return;
  const at = play * v.duration;
  // A seek costs a decode and scroll fires far more often than this has frames — 15 of them a
  // second, so anything under a frame's worth of travel is work nobody can see.
  if (Math.abs(v.currentTime - at) > 0.06) v.currentTime = at;
}

/**
 * iOS will not paint a seek on a video it has never played. Muted playback needs no gesture, so
 * starting and stopping it primes the decoder.
 */
function prime(e: SyntheticEvent<HTMLVideoElement>) {
  const v = e.currentTarget;
  void v
    .play()
    .then(() => v.pause())
    .catch(() => undefined);
}

/**
 * Wiggles the scroll hint. Restarted rather than re-triggered: an animation already running
 * ignores the class going back on, and every key or click should get its own wiggle.
 */
function wiggle(el: HTMLElement | null) {
  if (!el) return;
  el.classList.remove("is-keyed");
  void el.offsetWidth;
  el.classList.add("is-keyed");
}

export function Landing() {
  const t = useT();
  const lang = useLang();
  const root = useRef<HTMLDivElement>(null);
  const goButton = useRef<HTMLSpanElement>(null);
  const solveButton = useRef<HTMLSpanElement>(null);
  const video = useRef<HTMLVideoElement>(null);
  const videoProblem = useRef<HTMLVideoElement>(null);
  const videoEn = useRef<HTMLVideoElement>(null);
  const videoMn = useRef<HTMLVideoElement>(null);
  const hint = useRef<HTMLParagraphElement>(null);

  // The composer is a picture, so a reader who answers the page by typing into it gets nothing
  // back — the one interaction the page wants is the one they are not trying. The hint answers
  // for it: it wiggles off each key, and each click on the composer, the way a locked field does.
  useEffect(() => {
    const keyed = (e: KeyboardEvent) => {
      // Held keys and browser shortcuts are not someone trying to write a prompt.
      if (e.repeat || e.metaKey || e.ctrlKey || e.altKey) return;
      if (!["Backspace", "Enter", " "].includes(e.key) && e.key.length !== 1)
        return;
      // Typing inside the sign-in modal is a reader who found the real field. Leave them to it.
      if (
        e.target instanceof HTMLElement &&
        e.target.closest("input, textarea, [contenteditable]")
      )
        return;
      wiggle(hint.current);
    };
    addEventListener("keydown", keyed);
    return () => removeEventListener("keydown", keyed);
  }, []);

  // The night opens out of the button that was pressed — Render in scene one, Solve in scene two —
  // so each stage needs its own button's box measured into it. Measured rather than written into
  // the stylesheet: the composer wraps on a phone, which moves the button onto a row of its own,
  // and the house typeface landing moves it again.
  useIsoLayoutEffect(() => {
    const pairs = [goButton, solveButton]
      .map((btn) => ({
        btn,
        stage: btn.current?.closest<HTMLElement>(".stage"),
      }))
      .filter(
        (x): x is { btn: typeof goButton; stage: HTMLElement } => !!x.stage,
      );
    if (!pairs.length) return;
    const sync = () => {
      for (const { btn, stage } of pairs) {
        const b = btn.current?.getBoundingClientRect();
        if (!b) continue;
        const s = stage.getBoundingClientRect();
        stage.style.setProperty("--btn-t", `${b.top - s.top}px`);
        stage.style.setProperty("--btn-r", `${s.right - b.right}px`);
        stage.style.setProperty("--btn-b", `${s.bottom - b.bottom}px`);
        stage.style.setProperty("--btn-l", `${b.left - s.left}px`);
      }
    };
    sync();
    const resized = new ResizeObserver(sync);
    for (const { stage } of pairs) resized.observe(stage);
    return () => resized.disconnect();
  }, []);

  const motion = useScrollScenes(root, {
    // One scene, because the wait has to turn into the render where it stands. Two pinned
    // sections can only hand over by sliding one out from under the other, and a render that
    // scrolls in from below is a render that arrived from somewhere else.
    show(p, scene) {
      const set = (k: string, v: number) =>
        scene.style.setProperty(k, v.toFixed(4));

      // The prompt is revealed a whole character at a time: mono type means a clip at k/n of the
      // width lands between glyphs, and it changes n times over the scene rather than every frame.
      const chars = Math.max(1, t.landing.prompt.length);
      set("--type", Math.round(range(p, 0.03, 0.22) * chars) / chars);
      set("--go", range(p, 0.24, 0.29));
      // Typed, then pressed. The pointer eases in — a cursor that arrives at a constant speed
      // reads as a sprite being dragged — and stays down once it lands, because what it pressed
      // is already opening underneath it.
      set("--cursor", easeOut(range(p, 0.29, 0.37)));
      set("--press", range(p, 0.38, 0.41));
      // The night grows out of the button, the wait sits in it, and the render fades up in the
      // wait's place. Nothing moves between those three: it is one box, changing what it holds.
      const open = easeOut(range(p, 0.41, 0.5));
      set("--open", open);
      // hold(open, scene); // back on with the loading screen
      set("--film", open);
      playhead(p, 0.5, 0.97, scene, video.current);
    },

    // The same beat told about a problem nobody typed: the page is dragged in, dropped on the
    // composer, and read. Its own scene rather than a second half of the first one — the first
    // render has to be allowed to finish before the page asks a second question.
    drop(p, scene) {
      const set = (k: string, v: number) =>
        scene.style.setProperty(k, v.toFixed(4));

      // Flown in, dropped, read. The page eases towards the box for the same reason the pointer
      // does in scene one: a constant speed reads as a sprite on rails, not as a hand.
      set("--drag", easeOut(range(p, 0.02, 0.2)));
      set("--drop", range(p, 0.21, 0.26));
      // The box only says it has the file once the page is inside it.
      set("--file", range(p, 0.25, 0.3));
      set("--cursor", easeOut(range(p, 0.3, 0.38)));
      set("--press", range(p, 0.39, 0.42));
      const open = easeOut(range(p, 0.42, 0.5));
      set("--open", open);
      // hold(open, scene); // back on with the loading screen
      set("--film", open);
      playhead(p, 0.5, 0.97, scene, videoProblem.current);
    },

    // One sentence, both languages. The English render plays out, the pointer flips the switch,
    // and the Mongolian render of the same sentence plays in its place. The two are not the same
    // animation frame for frame — each is its own generation — so they hand over at a cut rather
    // than crossfading mid-play, and each gets scroll in proportion to its length (31s each).
    lang(p, scene) {
      const set = (k: string, v: number) =>
        scene.style.setProperty(k, v.toFixed(4));

      const en = range(p, 0.04, 0.43);
      // In, pressed, and back out once the switch has moved: a pointer parked on the switch
      // for the whole second render is something to read past.
      set(
        "--cursor",
        easeOut(range(p, 0.43, 0.5)) * (1 - easeOut(range(p, 0.59, 0.65))),
      );
      set("--press", range(p, 0.5, 0.53));
      const lang = range(p, 0.53, 0.58);
      set("--lang", lang);
      const mn = range(p, 0.58, 0.97);

      // The bar belongs to whichever render is showing, so it starts again with the second one.
      set("--play", lang < 0.5 ? en : mn);
      seek(videoEn.current, en);
      seek(videoMn.current, mn);
    },
  });

  // While scroll is the playhead, nothing else gets to move it. prime() only pauses the play() it
  // made when that play() resolves, and a browser can shelve it instead — a hidden tab, a muted
  // video out of view — then start it later with nothing left to stop it, and the render runs on
  // its own. A reader with controls is left to press play.
  const still = motion
    ? (e: SyntheticEvent<HTMLVideoElement>) => e.currentTarget.pause()
    : undefined;

  return (
    <div
      ref={root}
      className="landing relative flex-1"
      // The finished frame. The engine takes these back to zero only once it is allowed to run.
      style={
        {
          "--type": 1,
          "--go": 1,
          "--p": 1,
        } as CSSProperties
      }
    >
      {/* Scrolls away with the first scene rather than following the page: a fixed header would
          have to change colour halfway down, and the way in is repeated below anyway. */}
      <header className="absolute inset-x-0 top-0 z-10 flex items-center justify-between gap-3 px-5 py-4">
        <p className="text-xl font-extrabold tracking-tight">
          Dur<span className="text-accent">slel</span>
        </p>
        <div className="flex items-center gap-2">
          <LangToggle />
          <ThemeToggle />
          <SignInButton mode="modal">
            <button className="rounded-full bg-accent px-4 py-1.5 text-xs font-medium text-on-accent shadow-soft hover:bg-accent-strong">
              {t.landing.signIn}
            </button>
          </SignInButton>
        </div>
      </header>

      {/* ── The sentence, the wait, and the render ──────────────────────── */}
      {/* All three in one pinned stage: the night opens out of the Render button, the wait sits
          inside it, and the render fades up where the wait was. Nothing scrolls between them. */}
      <section
        className="scene"
        data-scene="show"
        style={{ "--length": 680 } as CSSProperties}
      >
        <div className="stage flex flex-col gap-12">
          {/* ── Paper: the composer, until the night takes it ──────────────── */}
          {/* Gone by the time the night is half open. The night grows out of the Render button at
              the card's right edge, so the far left of the card is the last thing it reaches —
              without this, the Solve chip sits there peeking out of the video for half the beat. */}
          <div
            className="ask-layer"
            style={{ opacity: "calc(1 - var(--open) * 2)" }}
          >
            <h1
              className="max-w-[16ch] text-center text-4xl font-extrabold leading-[1.02] tracking-tight sm:max-w-none sm:text-6xl"
              style={{ transform: "translateY(calc(var(--type) * -2svh))" }}
            >
              {t.landing.headline1}
              <br />
              {t.landing.headline2}
            </h1>

            {/* The composer, as a picture of itself — the same parts, in the same order, as the
                one waiting on the other side of the sign-in. */}
            <div
              aria-hidden
              onPointerDown={() => wiggle(hint.current)}
              className="flex w-full max-w-2xl flex-wrap items-center gap-2 rounded-card border border-rule bg-panel p-2 shadow-soft md:flex-nowrap"
            >
              <span className="shrink-0 rounded-full border border-accent bg-tint px-4 py-2 text-sm font-medium text-accent-ink">
                {t.problem}
              </span>
              <span className="order-first min-w-0 basis-full overflow-hidden rounded-full border border-rule px-4 py-2 md:order-none md:flex-1">
                <span className="typed font-mono text-[clamp(0.55rem,1.9vw,0.8rem)] leading-6">
                  <span>{t.landing.prompt}</span>
                </span>
              </span>
              <span
                ref={goButton}
                className="relative ml-auto shrink-0 rounded-full bg-accent px-5 py-2 text-sm font-medium text-on-accent md:ml-0"
                style={{
                  opacity: "var(--go)",
                  transform:
                    "translateY(calc((1 - var(--go)) * 0.5rem)) scale(calc(1 - var(--press) * 0.06))",
                }}
              >
                {t.render}
                {/* Drawn rather than borrowed from the system: the pointer has to read against
                    the accent fill it comes to rest on. */}
                <svg className="cursor" viewBox="0 0 24 24" aria-hidden>
                  <path d="M5 2.5 18.5 13l-6.1.6 3 6-2.7 1.3-3-6-4.7 4.4z" />
                </svg>
              </span>
            </div>

            {/* The one instruction the page gives, directly under the composer it is talking
                about rather than parked at the foot of the stage, where a line of small type is
                easy to read past. The arrow keeps moving in the direction the reader is being
                asked to go. It holds its place in the flow as it fades, so the composer above it
                does not step down the screen once the typing starts. */}
            <p
              ref={hint}
              className="hint -mt-2 flex flex-col items-center gap-1 text-base font-bold text-accent-ink sm:text-lg"
              style={{ opacity: "calc(1 - var(--type) * 4)" }}
            >
              <span>{t.landing.scrollHint}</span>
              <svg viewBox="0 0 24 24" aria-hidden>
                <path d="M6 9.5 12 15.5 18 9.5" />
              </svg>
            </p>
          </div>

          {/* ── Night: what the press opened ───────────────────────────────── */}
          <div className="morph" data-night="1">
            {/* The render takes minutes in the app and a scroll here, but a press that opens onto
                nothing is a press that did nothing. This is what the app would be showing, in the
                app's own words, and the render replaces it without either of them moving. */}
            {/* Commented out for now: the loading screen.
            <div
              className="wait"
              aria-hidden
              style={{
                opacity: "calc(min(var(--open) * 3 - 2, 1 - var(--film)))",
              }}
            >
              <p className="night-muted text-sm">{t.rendering}</p>
              <div className="h-1 w-full max-w-sm overflow-hidden rounded-full bg-[var(--stage-rule)]">
                <div className="h-full w-1/3 animate-[durslel-sweep_1.4s_ease-in-out_infinite] rounded-full bg-[var(--sweep-ink)]" />
              </div>
            </div> */}

            {/* Three rows: the sentence that was sent, the render it came back as, and how far
                through it the reader is. The video keeps its 16:9, so on a phone it is
                width-bound and the middle row centres it rather than stranding it at the top. */}
            <div className="film" style={{ opacity: "var(--film)" }}>
              <p aria-hidden className="night-muted font-mono text-xs">
                {t.landing.prompt}
              </p>

              <div className="flex min-h-0 flex-col items-center justify-center gap-5 md:gap-8">
                <video
                  ref={video}
                  src={VIDEO[lang]}
                  aria-label={t.landing.videoAlt}
                  muted
                  // Without this iOS Safari hijacks playback into fullscreen.
                  playsInline
                  // 2MB, and it has to be seekable the instant the wait ends.
                  preload="auto"
                  // Given to the reader the engine is not driving, who otherwise has a still
                  // frame and no way to play it.
                  controls={!motion}
                  onLoadedMetadata={prime}
                  onPlaying={still}
                  // Comes up a touch short of itself, so the render arrives rather than appears.
                  style={{
                    transform: "scale(calc(0.97 + var(--film) * 0.03))",
                  }}
                  className="aspect-video max-h-full w-full max-w-4xl rounded-card bg-black object-contain shadow-soft"
                />

                <div className="caps w-full max-w-3xl text-lg font-medium sm:text-2xl md:text-3xl">
                  {/* Keyed by position, not by text: switching language rewrites these in place,
                      and a fresh node would lose the class saying which one is showing. */}
                  {t.landing.caps.map((cap, i) => (
                    <p key={i} className="cap max-w-[28ch] text-balance">
                      {cap}
                    </p>
                  ))}
                </div>
              </div>

              {/* manim reports no percentage of its own. Scrolling knows exactly. */}
              <div className="progress" aria-hidden>
                <span style={{ transform: "scaleX(var(--play))" }} />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── The problem nobody typed ───────────────────────────────────── */}
      {/* The same beat as above, with the sentence taken away: a photographed page is dragged
          onto the composer, Solve reads it, and the night opens out of that chip instead. Told
          twice on purpose — the first scene is the claim, this one is the one every teacher
          actually has, a problem already printed on a page in front of them. */}
      <section
        className="scene"
        data-scene="drop"
        style={{ "--length": 900 } as CSSProperties}
      >
        <div className="stage flex flex-col gap-12">
          <div
            className="ask-layer"
            style={{ opacity: "calc(1 - var(--open) * 2)" }}
          >
            <h2 className="max-w-[16ch] text-center text-4xl font-extrabold leading-[1.02] tracking-tight sm:max-w-none sm:text-6xl">
              {t.landing.dropHead1}
              <br />
              {t.landing.dropHead2}
            </h2>

            {/* The page itself, carried in from off the stage. Its own paper and its own ink
                rather than the theme's: it is a photograph of something printed, so it stays
                white when the page around it is dark. */}
            <div className="shot" aria-hidden>
              <p className="shot-task">3. {t.landing.problemTask}</p>
              <p className="shot-sum">{t.landing.problem}</p>
            </div>

            {/* The same composer as scene one, answering the other way: nothing typed, so the
                blue button is the disabled one and Solve is what the file goes to. */}
            <div
              aria-hidden
              className="drop-box flex w-full max-w-2xl flex-wrap items-center gap-2 rounded-card border border-rule bg-panel p-2 shadow-soft md:flex-nowrap"
            >
              <span
                ref={solveButton}
                className="relative shrink-0 rounded-full border border-accent bg-tint px-4 py-2 text-sm font-medium text-accent-ink"
                style={{ transform: "scale(calc(1 - var(--press) * 0.06))" }}
              >
                {t.problem}
                <svg className="cursor" viewBox="0 0 24 24" aria-hidden>
                  <path d="M5 2.5 18.5 13l-6.1.6 3 6-2.7 1.3-3-6-4.7 4.4z" />
                </svg>
              </span>
              <span className="order-first flex min-w-0 basis-full items-center overflow-hidden rounded-full border border-rule px-4 py-2 md:order-none md:flex-1">
                {/* What the box has instead of a sentence. It holds its height empty, so the
                    composer does not grow a row when the file lands in it. */}
                <span
                  className="file-chip font-mono"
                  style={{
                    opacity: "var(--file)",
                    transform: "scale(calc(0.88 + var(--file) * 0.12))",
                  }}
                >
                  {t.landing.file}
                </span>
              </span>
              <span className="ml-auto shrink-0 rounded-full bg-tint px-5 py-2 text-sm font-medium text-muted md:ml-0">
                {t.render}
              </span>
            </div>

            <p className="hint flex flex-col items-center gap-2 text-sm font-medium text-muted">
              <span>{t.landing.dropHint}</span>
            </p>
          </div>

          {/* ── Night: what Solve opened ───────────────────────────────────── */}
          <div className="morph" data-night="1">
            {/* Reading the page is its own wait in the app, with its own words for it, and this
                is the one the reader would actually be looking at here. */}
            {/* Commented out for now: the loading screen.
            <div
              className="wait"
              aria-hidden
              style={{
                opacity: "calc(min(var(--open) * 3 - 2, 1 - var(--film)))",
              }}
            >
              <p className="night-muted text-sm">{t.readingProblem}</p>
              <div className="h-1 w-full max-w-sm overflow-hidden rounded-full bg-[var(--stage-rule)]">
                <div className="h-full w-1/3 animate-[durslel-sweep_1.4s_ease-in-out_infinite] rounded-full bg-[var(--sweep-ink)]" />
              </div>
            </div> */}

            {/* The top row is the problem it read off the photograph, which is the part a
                teacher is checking: a misread problem is a wrong video. */}
            <div className="film" style={{ opacity: "var(--film)" }}>
              <p aria-hidden className="night-muted font-mono text-xs">
                {t.landing.problem}
              </p>

              <div className="flex min-h-0 flex-col items-center justify-center gap-5 md:gap-8">
                <video
                  ref={videoProblem}
                  src={VIDEO_PROBLEM[lang]}
                  aria-label={t.landing.videoAlt2}
                  muted
                  playsInline
                  preload="auto"
                  controls={!motion}
                  onLoadedMetadata={prime}
                  onPlaying={still}
                  style={{
                    transform: "scale(calc(0.97 + var(--film) * 0.03))",
                  }}
                  className="aspect-video max-h-full w-full max-w-4xl rounded-card bg-black object-contain shadow-soft"
                />

                <div className="caps w-full max-w-3xl text-lg font-medium sm:text-2xl md:text-3xl">
                  {t.landing.caps2.map((cap, i) => (
                    <p key={i} className="cap max-w-[28ch] text-balance">
                      {cap}
                    </p>
                  ))}
                </div>
              </div>

              <div className="progress" aria-hidden>
                <span style={{ transform: "scaleX(var(--play))" }} />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── One sentence, both languages ───────────────────────────────── */}
      {/* Night for the whole track, not only the stage: it follows a render and hands straight
          on to the next, so there is no paper for it to open out of. */}
      <section
        className="scene"
        data-scene="lang"
        data-night="1"
        style={{ "--length": 740 } as CSSProperties}
      >
        <div className="stage">
          <div className="film">
            <div className="flex flex-col items-center gap-3 text-center">
              <h2 className="text-3xl font-extrabold tracking-tight sm:text-5xl">
                {t.landing.langHead}
              </h2>
              <p aria-hidden className="lang-pair night-muted font-mono text-xs">
                <span>{LANG_PROMPT.en}</span>
                <span>{LANG_PROMPT.mn}</span>
              </p>
            </div>

            <div className="flex min-h-0 flex-col items-center justify-center gap-5 md:gap-8">
              {/* The header's language switch, as a picture of itself at a size that reads from
                  across the room. */}
              <div className="lang-pill" aria-hidden>
                <span>EN</span>
                <span className="relative">
                  MN
                  <svg className="cursor" viewBox="0 0 24 24" aria-hidden>
                    <path d="M5 2.5 18.5 13l-6.1.6 3 6-2.7 1.3-3-6-4.7 4.4z" />
                  </svg>
                </span>
              </div>

              <div className="lang-pair w-full max-w-4xl">
                <video
                  ref={videoEn}
                  src={VIDEO.en}
                  aria-label={t.landing.langAltEn}
                  muted
                  playsInline
                  preload="auto"
                  controls={!motion}
                  onLoadedMetadata={prime}
                  onPlaying={still}
                  className="aspect-video max-h-[50svh] w-full rounded-card bg-black object-contain shadow-soft"
                />
                <video
                  ref={videoMn}
                  src={VIDEO.mn}
                  aria-label={t.landing.langAltMn}
                  muted
                  playsInline
                  preload="auto"
                  controls={!motion}
                  onLoadedMetadata={prime}
                  onPlaying={still}
                  className="aspect-video max-h-[50svh] w-full rounded-card bg-black object-contain shadow-soft"
                />
              </div>

              <div className="lang-pair w-full max-w-3xl text-center text-lg font-medium sm:text-2xl md:text-3xl">
                {t.landing.langCaps.map((cap, i) => (
                  <p key={i} className="mx-auto max-w-[28ch] text-balance">
                    {cap}
                  </p>
                ))}
              </div>

              {/* Outside the pair, so it holds for the whole scene rather than one render. */}
              <p className="max-w-[48ch] text-balance text-center text-sm font-medium text-[var(--sweep-ink)] sm:text-base">
                {t.landing.langNote}
              </p>
            </div>

            <div className="progress" aria-hidden>
              <span style={{ transform: "scaleX(var(--play))" }} />
            </div>
          </div>
        </div>
      </section>

      {/* ── The way in ───────────────────────────────────────────────────── */}
      {/* Scrolled out from under the render, on paper again: the video has made the argument, so
          this is only the sentence it leaves behind and the button that starts one. A full screen
          with the footer, so the page ends on it alone rather than with the bottom of the last
          render still showing above it. */}
      <div className="flex min-h-svh flex-col">
        <section className="mx-auto flex w-full max-w-2xl flex-1 flex-col items-center justify-center gap-6 px-5 py-16 text-center">
          <h2 className="text-4xl font-extrabold tracking-tight sm:text-5xl">
            {t.landing.better}
          </h2>
          {/* <p className="max-w-[52ch] leading-relaxed text-muted">
          {t.landing.photo}
        </p> */}
          <SignUpButton mode="modal">
            <button className="rounded-full bg-accent px-7 py-3 text-base font-medium text-on-accent shadow-soft hover:bg-accent-strong">
              {t.landing.signUp}
            </button>
          </SignUpButton>
        </section>

        <p className="free-daily px-5 pb-8 text-center text-base font-bold text-accent-ink sm:text-lg">
          <SignInButton mode="modal">
            <button className="hover:underline">
              {t.landing.freeDaily(FREE_DAILY_LIMIT)}
            </button>
          </SignInButton>
        </p>

        <footer className="flex items-center justify-between gap-4 border-t border-rule px-5 py-6 text-xs text-muted">
          <Link href="/privacy" className="hover:text-ink">
            {t.landing.privacy}
          </Link>
          <span>Durslel</span>
        </footer>
      </div>
    </div>
  );
}
