"use client";

import { SignInButton } from "@clerk/nextjs";
import Link from "next/link";
import { useRef, useState, type CSSProperties } from "react";

import { LangToggle, useT } from "@/shared/i18n";
import {
  clamp,
  easeOut,
  lerp,
  range,
  useScrollScenes,
} from "@/shared/scroll-scenes";

/**
 * The chalkboard landing.
 *
 * A lesson, in the order a lesson happens: the board is written on, the words on it change, the
 * class is shown a finished animation, and then the thing that made it is taken apart in front of
 * them — the prompt typed, the button clicked, the render drawn — before the board comes back
 * with the way in.
 *
 * Scroll drives all of it except the demo, which plays on its own. A demo the reader has to
 * operate is not a demo, and it is the one place on the page where they are meant to just watch.
 *
 * Every variable starts at its finished value (see chalk.css) and the engine only takes them back
 * to zero when motion is allowed, so the reduced-motion and no-JS page is a written-out board.
 */

/**
 * The demo scene plays a real render if there is one to play. Put an mp4 in `public/` — any
 * finished Durslel render will do — and name it here; the drawn figure below stands in until
 * then, and also takes over if the file turns out to be missing or unplayable.
 */
const DEMO_VIDEO = "";

// ── The figure: a² + b² = c², drawn the way it would be drawn on a board ──────────────────────
// Right angle at O, legs of 90 and 120, so the hypotenuse is a clean 150 and the three squares
// are visibly 8100 + 14400 = 22500.
const O = [170, 250];
const B = [290, 250];
const C = [170, 160];
const TRIANGLE = `M${O[0]} ${O[1]}L${B[0]} ${B[1]}L${C[0]} ${C[1]}Z`;
const RIGHT_ANGLE = `M${O[0]} ${O[1] - 18}h18v18`;
const SQUARES = [
  // On the short leg, on the long leg, and on the hypotenuse — each one outward from the triangle.
  { d: "M170 160H80v90h90Z", color: "var(--chalk-blue)", label: [122, 212] },
  {
    d: "M170 250h120v120H170Z",
    color: "var(--chalk-green)",
    label: [227, 318],
  },
  {
    d: "M290 250L170 160l90-120l120 90Z",
    color: "var(--chalk-yellow)",
    label: [274, 152],
  },
];
const LABELS = ["a²", "b²", "c²"];

function Figure({ label, className }: { label: string; className?: string }) {
  return (
    <svg
      viewBox="50 10 360 390"
      preserveAspectRatio="xMidYMid meet"
      role="img"
      aria-label={label}
      className={className}
    >
      {SQUARES.map((sq, k) => (
        <path
          key={k}
          d={sq.d}
          className="square"
          style={{ "--k": k } as CSSProperties}
          fill={sq.color}
          stroke={sq.color}
          strokeWidth={3}
          strokeLinejoin="round"
          pathLength={1}
        />
      ))}
      <path
        d={TRIANGLE}
        className="stroke-draw"
        fill="none"
        stroke="var(--chalk)"
        strokeWidth={3.5}
        strokeLinejoin="round"
        pathLength={1}
      />
      <path
        d={RIGHT_ANGLE}
        className="stroke-draw"
        fill="none"
        stroke="var(--chalk-soft)"
        strokeWidth={2}
        pathLength={1}
      />
      <g
        className="chalk-text"
        fontSize={30}
        textAnchor="middle"
        style={{ opacity: "calc((var(--sq) - 0.55) * 3)" }}
      >
        {SQUARES.map((sq, k) => (
          <text key={k} x={sq.label[0]} y={sq.label[1]} fill={sq.color}>
            {LABELS[k]}
          </text>
        ))}
      </g>
    </svg>
  );
}

/** The arrow that types nothing and clicks once. */
function Pointer() {
  return (
    <span className="pointer" aria-hidden>
      <span className="click-ring" />
      <svg viewBox="0 0 24 24" className="size-6 drop-shadow">
        <path
          d="M5 2.5l14.5 8.2-6.4 1.6L9.8 19.5z"
          fill="var(--ink)"
          stroke="var(--panel)"
          strokeWidth={1.4}
          strokeLinejoin="round"
        />
      </svg>
    </span>
  );
}

export function ChalkLanding({ fontClass }: { fontClass: string }) {
  const t = useT();
  const root = useRef<HTMLDivElement>(null);
  // Cleared if the file named above cannot be played, so a wrong path shows the figure rather
  // than an empty black box.
  const [hasVideo, setHasVideo] = useState(true);

  // Where the last word stops: far enough into its own turn to be fully written, not far enough
  // to be erased again.
  const verbEnd = t.chalk.verbs.length - 1 + 0.6;

  useScrollScenes(root, {
    welcome(p, s) {
      // --write belongs to the load animation in chalk.css; scroll only wipes the board.
      s.style.setProperty("--erase", range(p, 0.72, 0.95).toFixed(3));
    },

    verbs(p, s) {
      // One continuous position along the list. Which word is showing, how far it is written and
      // whether it is being erased all fall out of this one number in CSS.
      const seg = range(p, 0.05, 0.95) * verbEnd;
      s.style.setProperty("--seg", seg.toFixed(4));
      s.style.setProperty("--local", (seg - Math.floor(seg)).toFixed(4));
    },

    demo(p, s) {
      // The list fills in rather than swapping: it is an argument, not a sequence.
      s.style.setProperty(
        "--seg",
        (range(p, 0.1, 0.9) * t.chalk.benefits.length).toFixed(3),
      );
    },

    make(p, s) {
      s.style.setProperty("--in", easeOut(range(p, 0, 0.1)).toFixed(3));
      // In on the composer while it is being typed into, back out once the button is clicked.
      // How far in is the stylesheet's business — it depends on how much room the panel has.
      s.style.setProperty(
        "--zoomp",
        (range(p, 0.1, 0.2) - range(p, 0.6, 0.7)).toFixed(4),
      );

      const chars = Math.max(1, t.chalk.makePrompt.length);
      s.style.setProperty(
        "--type",
        (Math.round(range(p, 0.2, 0.46) * chars) / chars).toFixed(4),
      );

      // Arrives when the typing stops, crosses to the button, clicks, and leaves.
      s.style.setProperty(
        "--cursor",
        clamp(range(p, 0.44, 0.48) - range(p, 0.66, 0.72)).toFixed(3),
      );
      s.style.setProperty(
        "--cx",
        lerp(56, 88, easeOut(range(p, 0.46, 0.58))).toFixed(2),
      );
      s.style.setProperty("--cy", lerp(-4, 0, range(p, 0.46, 0.58)).toFixed(2));
      s.style.setProperty("--click", range(p, 0.57, 0.64).toFixed(3));

      // Then the wait, then the render, drawn in the order a manim scene builds itself.
      s.style.setProperty("--load", range(p, 0.6, 0.75).toFixed(3));
      s.style.setProperty("--tri", easeOut(range(p, 0.77, 0.85)).toFixed(3));
      s.style.setProperty("--sq", range(p, 0.83, 0.95).toFixed(3));
      s.style.setProperty("--eq", range(p, 0.9, 0.97).toFixed(3));
    },

    cta(p, s) {
      s.style.setProperty("--write", easeOut(range(p, 0.08, 0.5)).toFixed(3));
      s.style.setProperty("--in", range(p, 0.5, 0.72).toFixed(3));
    },
  });

  return (
    <div ref={root} className={`board ${fontClass} relative flex-1`}>
      <header className="absolute inset-x-0 top-0 z-10 flex items-center justify-between gap-3 px-5 py-4">
        <p className="chalk-text text-2xl font-bold">Durslel</p>
        <div className="flex items-center gap-3">
          <LangToggle />
          <SignInButton mode="modal">
            <button className="chalk-text border-b border-[var(--chalk-faint)] text-lg hover:border-[var(--chalk)]">
              {t.landing.signIn}
            </button>
          </SignInButton>
        </div>
      </header>

      {/* ── Welcome, written and then wiped ──────────────────────────────── */}
      <section
        className="scene"
        data-scene="welcome"
        style={{ "--length": 160, "--write": 1, "--erase": 0 } as CSSProperties}
      >
        <div className="stage flex flex-col items-center justify-center gap-6 px-5 text-center">
          <h1 className="chalk-text written hello text-[clamp(2.75rem,10vw,7.5rem)] font-bold leading-[1.05]">
            {t.chalk.welcome}
          </h1>
          <p
            className="chalk-text text-xl text-[var(--chalk-soft)]"
            style={{ opacity: "calc(1 - var(--p) * 2.5)" }}
          >
            {t.chalk.scroll}
          </p>
        </div>
      </section>

      {/* ── One line, three verbs, erased and rewritten ───────────────────── */}
      <section
        className="scene"
        data-scene="verbs"
        style={
          {
            "--length": 260,
            "--seg": verbEnd,
            "--local": 0.6,
          } as CSSProperties
        }
      >
        <div className="stage flex flex-col items-center justify-center gap-2 px-5 text-center">
          <p className="chalk-text text-[clamp(1.5rem,4vw,2.75rem)] text-[var(--chalk-soft)]">
            {t.chalk.letsLead}
          </p>
          <span className="grid">
            {t.chalk.verbs.map((verb, i) => (
              <span
                key={i}
                className="chalk-text verb written text-[clamp(3rem,11vw,8rem)] font-bold leading-[1.1] text-[var(--chalk-yellow)]"
                style={{ "--i": i } as CSSProperties}
              >
                {verb}
              </span>
            ))}
          </span>
          <span
            aria-hidden
            className="verb-rule h-[3px] w-[min(70vw,22rem)] rounded-full bg-[var(--chalk-faint)]"
          />
          {t.chalk.letsTail ? (
            <p className="chalk-text text-[clamp(1.5rem,4vw,2.75rem)] text-[var(--chalk-soft)]">
              {t.chalk.letsTail}
            </p>
          ) : null}
        </div>
      </section>

      {/* ── The demo: it plays, the reasons arrive ────────────────────────── */}
      <section
        className="scene"
        data-scene="demo"
        style={
          { "--length": 300, "--seg": t.chalk.benefits.length } as CSSProperties
        }
      >
        <div className="stage grid content-center items-center gap-6 px-5 md:grid-cols-[1.15fr_1fr] md:gap-12 md:px-10">
          <div className="aspect-video w-full overflow-hidden rounded-[18px] border border-[var(--chalk-faint)] bg-black/25">
            {DEMO_VIDEO.length > 0 && hasVideo ? (
              <video
                src={DEMO_VIDEO}
                autoPlay
                loop
                muted
                // Browsers refuse to autoplay unmuted video, and the attribute alone is not
                // always enough — the renderer's own player sets it the same way.
                ref={(el) => {
                  if (el) el.muted = true;
                }}
                playsInline
                preload="metadata"
                onError={() => setHasVideo(false)}
                className="size-full object-cover"
              />
            ) : (
              <Figure
                label={t.chalk.figureAlt}
                className="figure-loop size-full"
              />
            )}
          </div>

          <ul className="flex flex-col gap-5">
            {t.chalk.benefits.map((line, i) => (
              <li
                key={i}
                className="benefit chalk-text text-[clamp(1.35rem,3.2vw,2.1rem)] leading-tight"
                style={{ "--i": i } as CSSProperties}
              >
                {line}
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* ── How it is made, at the speed the reader scrolls ───────────────── */}
      <section
        className="scene"
        data-scene="make"
        style={
          {
            "--length": 420,
            "--in": 1,
            "--zoomp": 0,
            "--type": 1,
            "--cursor": 0,
            "--click": 0,
            "--load": 1,
            "--tri": 1,
            "--sq": 1,
            "--eq": 1,
          } as CSSProperties
        }
      >
        <div className="stage relative grid place-items-center px-4 md:px-10">
          {/* The board darkens around the app while it has the reader's attention. */}
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 bg-black"
            style={{ opacity: "calc(var(--in) * 0.32)" }}
          />
          <div
            className="app-panel relative w-full max-w-3xl rounded-card border border-rule bg-panel p-3 text-ink shadow-soft md:p-4"
            style={{
              opacity: "var(--in)",
              transform:
                "scale(calc(0.96 + var(--in) * 0.04)) scale(calc(1 + var(--zoomp) * var(--zoom-amt))) translateY(calc((1 - var(--in)) * 2rem))",
              transformOrigin: "50% 24%",
            }}
          >
            <div className="flex items-center justify-between px-1 pb-3 text-xs text-muted">
              <span className="font-sans text-sm font-extrabold tracking-tight text-ink">
                Dur<span className="text-accent">slel</span>
              </span>
              <span>{t.today(3, 3)}</span>
            </div>

            {/* One row at every width: it is a picture of the composer, not a composer, and the
                cursor below crosses it in the row's own units. */}
            <div className="composer-row flex items-center gap-1.5 md:gap-2">
              <span className="shrink-0 rounded-full border border-accent bg-tint px-2.5 py-1.5 text-[11px] font-medium text-accent-ink md:px-3 md:text-xs">
                {t.problem}
              </span>
              <span className="min-w-0 flex-1 overflow-hidden rounded-full border border-rule px-3 py-1.5">
                <span className="typed font-mono text-[clamp(0.55rem,1.6vw,0.8rem)] leading-6">
                  <span>{t.chalk.makePrompt}</span>
                </span>
              </span>
              <span
                className="shrink-0 rounded-full bg-accent px-3 py-1.5 text-[11px] font-medium text-on-accent md:px-4 md:text-xs"
                style={{
                  transform: "scale(calc(1 - var(--click) * 0.04))",
                }}
              >
                {t.render}
              </span>
              <Pointer />
            </div>

            <div className="relative mt-3 grid aspect-video place-items-center overflow-hidden rounded-[14px] bg-ground">
              <p
                className="absolute text-xs text-muted"
                style={{ opacity: "calc(1 - var(--load) * 5)" }}
              >
                {t.noVideo}
              </p>
              <div
                className="absolute flex w-2/3 flex-col items-center gap-3"
                style={{
                  opacity:
                    "calc(clamp(0, var(--load) * 5, 1) - clamp(0, var(--tri) * 5, 1))",
                }}
              >
                <p className="text-xs text-muted">{t.rendering}</p>
                <div className="load-bar h-1 w-full overflow-hidden rounded-full bg-tint">
                  <span />
                </div>
              </div>
              <Figure
                label={t.chalk.figureAlt}
                className="figure-app size-full p-2"
              />
            </div>
          </div>

          <p
            className="chalk-text written absolute bottom-5 text-[clamp(1.5rem,3vw,2.5rem)] text-[var(--chalk)]"
            style={{ "--write": "var(--eq)" } as CSSProperties}
          >
            {t.chalk.equation}
          </p>
        </div>
      </section>

      {/* ── The way in ───────────────────────────────────────────────────── */}
      <section
        className="scene"
        data-scene="cta"
        style={{ "--length": 180, "--write": 1, "--in": 1 } as CSSProperties}
      >
        <div className="stage flex flex-col items-center justify-center gap-8 px-5 text-center">
          <h2 className="chalk-text written text-[clamp(2.5rem,9vw,6.5rem)] font-bold leading-[1.05]">
            {t.chalk.start}
          </h2>
          <SignInButton mode="modal">
            <button
              className="rounded-full bg-accent px-7 py-3 text-sm font-medium text-on-accent shadow-soft hover:bg-accent-strong"
              style={{
                opacity: "var(--in)",
                transform: "translateY(calc((1 - var(--in)) * 0.75rem))",
              }}
            >
              {t.signIn}
            </button>
          </SignInButton>
        </div>
      </section>

      <footer className="flex items-center justify-between gap-4 border-t border-[var(--chalk-faint)] px-5 py-6 text-sm text-[var(--chalk-soft)]">
        <Link href="/" className="hover:text-[var(--chalk)]">
          {t.back}
        </Link>
        <Link href="/privacy" className="hover:text-[var(--chalk)]">
          {t.landing.privacy}
        </Link>
      </footer>
    </div>
  );
}
