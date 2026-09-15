"use client";

import { createContext, useContext, useState, type ReactNode } from "react";
import { flushSync } from "react-dom";

import { RenderStatus, SubscriptionTier } from "@/generated";
import { STATUS_TEXT } from "@/lib/jobs";

/**
 * English and Mongolian for the renderer and the pricing page.
 *
 * The choice lives in a cookie rather than the URL, so every existing link — Wire's return URL,
 * a shared video, Clerk's redirects — keeps working unchanged. The root layout reads the cookie
 * on the server, so a Mongolian page is Mongolian from the first byte instead of flashing English.
 *
 * The admin dashboard and messages written by the server stay English.
 */
export type Lang = "en" | "mn";

/** Also read by name in app/layout.tsx. */
const LANG_COOKIE = "lang";

const en = {
  pitch:
    "Describe an animation, get a rendered manim scene. Sign in to render and to keep your renders.",
  signIn: "Sign in with Google",
  close: "Close",
  history: "History",
  plans: "Plans",
  until: (date: string) => `Until ${date}`,
  activating: "Activating…",
  resetsAt: "Renders reset at midnight GMT+8",
  today: (left: number, limit: number) => `${left}/${limit} today`,
  status: STATUS_TEXT,
  admin: "Admin",
  problemHint:
    "Solves the problem typed in the box and animates the solution — with the box empty, pick a photo or PDF of one",
  reading: "Solving…",
  problem: "Solve",
  placeholder: "plot sin(x) and sweep a vertical line across it",
  noneLeft: "No renders left",
  render: "Render",
  lostTitle: "Render lost",
  lostBody:
    "Nothing has reported back on this render in five minutes, so it is almost certainly gone. Try the prompt again.",
  unreadTitle: "Problem not read",
  unreadFile: "Could not read that file.",
  unreachable: "Could not reach the server.",
  notStarted: "Not started",
  failed: "Render failed",
  noReason: "No reason was recorded.",
  readingProblem: "Solving the problem…",
  rendering: "Rendering…",
  waiting: "Waiting for a render slot…",
  noVideo: "No video yet",
  download: "Download mp4",
  copied: "Copied",
  copyLink: "Copy link",
  noRenders: "No renders yet",
  theme: "Light / dark",

  back: "Back",
  plansIntro: (free: number) =>
    `Each plan is 30 days, paid once — nothing renews on its own. A free account gets ${free} renders a day; the count resets at midnight GMT+8. Payment goes through Wire: scan the QR with your bank app, or open the app straight from the checkout page.`,
  signInToSubscribe: "Sign in to subscribe",
  /** Empty in English: the blurbs in lib/plans.ts are the English ones. */
  blurb: {} as Partial<Record<SubscriptionTier, string>>,
  per30Days: " / 30 days",
  rendersADay: " renders a day",
  redirecting: "Redirecting…",
  extend: "Extend 30 days",
  pay: (price: string) => `Pay ${price}`,
  tierUntil: (tier: string, date: string) => `${tier} until ${date}`,
};

// Typed as `typeof en`, so a string added to one language and not the other fails to compile.
const mn: typeof en = {
  pitch:
    "Хөдөлгөөнт дүрсээ тайлбарлаад manim-ээр бүтээсэн бичлэг аваарай. Бичлэг бүтээж, хадгалахын тулд нэвтэрнэ үү.",
  signIn: "Google-ээр нэвтрэх",
  close: "Хаах",
  history: "Түүх",
  plans: "Багцууд",
  until: (date) => `${date} хүртэл`,
  activating: "Идэвхжүүлж байна…",
  resetsAt: "Эрх GMT+8 цагаар шөнө 00:00-д шинэчлэгдэнэ",
  today: (left, limit) => `Өнөөдөр ${left}/${limit}`,
  status: {
    [RenderStatus.Queued]: "дараалалд",
    [RenderStatus.Pending]: "бүтээж байна",
    [RenderStatus.Ok]: "дууссан",
    [RenderStatus.Failed]: "амжилтгүй",
  },
  admin: "Админ",
  problemHint:
    "Хайрцагт бичсэн бодлогыг бодоод хөдөлгөөнт дүрс болгоно — хайрцаг хоосон бол бодлогын зураг эсвэл PDF сонгоно уу",
  reading: "Бодож байна…",
  problem: "Бодох",
  placeholder: "sin(x)-ийн график зурж, дээгүүр нь босоо шугам гүйлгэ",
  noneLeft: "Эрх дууссан",
  render: "Дүрслэх",
  lostTitle: "Бичлэг алдагдлаа",
  lostBody:
    "Энэ бичлэгээс таван минутын турш хариу ирсэнгүй, алдагдсан байх магадлалтай. Дахин оролдоно уу.",
  unreadTitle: "Бодлогыг уншиж чадсангүй",
  unreadFile: "Энэ файлыг уншиж чадсангүй.",
  unreachable: "Сервертэй холбогдож чадсангүй.",
  notStarted: "Эхэлсэнгүй",
  failed: "Бүтээж чадсангүй",
  noReason: "Шалтгаан бүртгэгдээгүй.",
  readingProblem: "Бодлогыг бодож байна…",
  rendering: "Бүтээж байна…",
  waiting: "Дараалалд хүлээж байна…",
  noVideo: "Бичлэг алга",
  download: "mp4 татах",
  copied: "Хуулсан",
  copyLink: "Холбоос хуулах",
  noRenders: "Одоогоор бичлэг алга",
  theme: "Цайвар / бараан горим",

  back: "Буцах",
  plansIntro: (free) =>
    `Багц бүр 30 хоног хүчинтэй, нэг удаа төлнө — автоматаар сунгагдахгүй. Үнэгүй бүртгэл өдөрт ${free} бичлэг бүтээх эрхтэй; эрх GMT+8 цагаар шөнө 00:00-д шинэчлэгдэнэ. Төлбөрийг Wire-аар хийнэ: банкны аппаараа QR кодыг уншуулах эсвэл төлбөрийн хуудаснаас аппаа шууд нээнэ үү.`,
  signInToSubscribe: "Захиалахын тулд нэвтэрнэ үү",
  blurb: {
    [SubscriptionTier.Basic]: "Хааяа нэг бичлэг хийхэд.",
    [SubscriptionTier.Pro]: "Тогтмол ажилд.",
    [SubscriptionTier.Studio]: "Нэг бүртгэл хуваалцдаг багт.",
  },
  per30Days: " / 30 хоног",
  rendersADay: " бичлэг өдөрт",
  redirecting: "Шилжүүлж байна…",
  extend: "30 хоногоор сунгах",
  pay: (price) => `${price} төлөх`,
  tierUntil: (tier, date) => `${date} хүртэл ${tier}`,
};

const LangContext = createContext<{
  lang: Lang;
  setLang: (lang: Lang) => void;
}>({
  lang: "en",
  setLang: () => undefined,
});

export function LangProvider({
  initial,
  children,
}: {
  initial: Lang;
  children: ReactNode;
}) {
  const [lang, setLang] = useState(initial);

  return (
    <LangContext
      value={{
        lang,
        setLang: (next) => {
          document.cookie = `${LANG_COOKIE}=${next}; path=/; max-age=31536000; samesite=lax`;
          document.documentElement.lang = next;
          // Crossfade the page between languages, as ThemeToggle does between schemes. The view
          // transition snapshots the page once its callback returns, so the render must be flushed
          // inside it.
          if (
            document.startViewTransition &&
            !matchMedia("(prefers-reduced-motion: reduce)").matches
          ) {
            document.startViewTransition(() => flushSync(() => setLang(next)));
          } else {
            setLang(next);
          }
        },
      }}
    >
      {children}
    </LangContext>
  );
}

/** The language itself, for what is sent to the server rather than drawn. */
export function useLang(): Lang {
  return useContext(LangContext).lang;
}

export function useT() {
  return useContext(LangContext).lang === "mn" ? mn : en;
}

/** Shows both languages; a pill slides under the one in use. The label names the other, in that language. */
export function LangToggle() {
  const { lang, setLang } = useContext(LangContext);
  const next = lang === "mn" ? "en" : "mn";
  const label = next === "mn" ? "Монгол хэл" : "English";

  return (
    <button
      type="button"
      onClick={() => setLang(next)}
      title={label}
      aria-label={label}
      lang={next}
      className="group relative grid h-7 shrink-0 grid-cols-2 items-center rounded-full border border-rule bg-panel p-0.5 text-xs font-medium [view-transition-name:lang-toggle]"
    >
      <span
        aria-hidden
        className={`absolute inset-y-0.5 left-0.5 w-[calc(50%-2px)] rounded-full bg-accent transition-transform duration-300 ease-in-out motion-reduce:transition-none ${lang === "mn" ? "translate-x-full" : ""}`}
      />
      {(["en", "mn"] as const).map((l) => (
        <span
          key={l}
          aria-hidden
          className={`relative px-2 text-center transition-colors duration-300 ${lang === l ? "text-on-accent" : "text-muted group-hover:text-accent-ink"}`}
        >
          {l.toUpperCase()}
        </span>
      ))}
    </button>
  );
}
