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

  /** The signed-out landing page. See app/landing.tsx. */
  landing: {
    /** Short enough for the header, where the full "Sign in with Google" does not fit a phone. */
    signIn: "Sign in",
    headline1: "Write one sentence.",
    headline2: "Get the animation.",
    sub: "That sentence is the whole interface.",
    scrollHint: "Scroll to continue",
    /** Typed into the composer in scene one, and the render that plays is this prompt's own. */
    prompt: "explain the Pythagorean theorem proof geometrically",
    videoAlt:
      "A geometric proof of the Pythagorean theorem: four copies of the triangle are arranged two ways inside the same square of side a + b, leaving c² one way and a² + b² the other.",
    /** One per quarter of the render, in the order the video plays them. */
    caps: [
      "It draws itself, in order.",
      "The pieces move to make the point.",
      "And land on the line you were explaining.",
      "Every label in the language you teach in.",
    ],
    /** ── Scene two: the problem that was photographed rather than typed. ── */
    dropHead1: "Nothing to type?",
    dropHead2: "Drop the problem in.",
    /** Under the composer, where the scroll hint sits in scene one. */
    dropHint: "A photo or a PDF — Durslel reads it",
    /** On the page that is dragged in, and above the render it came back as. */
    problem: "∫ (4x⁶ − 2x³ + 7x − 4) dx",
    problemTask: "Find the indefinite integral.",
    file: "problem-3.jpg",
    videoAlt2:
      "The integral of 4x⁶ − 2x³ + 7x − 4 worked one term at a time with the power rule, ending on the boxed answer plus C.",
    /** One per quarter of the second render, in the order the video plays them. */
    caps2: [
      "It reads the problem off the page.",
      "Then works it, a step at a time.",
      "Naming the rule it used as it goes.",
      "And lands on the answer, boxed.",
    ],

    /** ── Scene three: the same sentence, rendered with the switch on each language. ── */
    langHead: "Same sentence. Your language.",
    /** One per render, in the order the switch plays them. */
    langCaps: [
      "Switch on EN: every label comes back in English.",
      "Switch on MN: the same sentence, labelled in Mongolian.",
    ],
    /** Under the captions: without it a reader expects a finished video to follow the switch. */
    langNote:
      "* Pick the language before you press Render. A finished video keeps its language.",
    langAltEn: "The Pythagorean theorem proof, with every label in English.",
    langAltMn:
      "The same Pythagorean theorem proof, with every label in Mongolian.",

    /** The closing pitch, after the render scene has played out. */
    better: "Better with Durslel.",
    signUp: "Sign up",
    /** The last line on the page, under the way in. */
    freeDaily: (n: number) => `Sign up and make ${n} videos free, every day`,
    photo:
      "Nothing to type? Photograph the problem or upload the PDF. Durslel reads it, solves it, and animates the solution.",
    privacy: "Privacy",
  },

  /** The chalkboard landing at /test-landing. See app/test-landing/. */
  chalk: {
    welcome: "Welcome to Durslel",
    scroll: "keep scrolling",
    letsLead: "Durslel lets you",
    verbs: ["create", "teach", "learn"],
    /** Empty in Mongolian, where the adverb sits in the lead instead. */
    letsTail: "easily.",
    benefits: [
      "Two hours of animating, gone.",
      "Your class watches the idea instead of picturing it.",
      "One sentence in. A finished mp4 out.",
      "Every label in it is written in the language you teach in.",
    ],
    /** Typed into the mock composer as the reader scrolls. */
    makePrompt: "explain the Pythagorean theorem",
    equation: "a² + b² = c²",
    figureAlt:
      "A right triangle with a square drawn on each of its three sides, the two smaller squares together matching the largest.",
    start: "Start now",
  },

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

  landing: {
    signIn: "Нэвтрэх",
    headline1: "Ганц өгүүлбэрээр",
    headline2: "Хичээлээ тайлбарла.",
    sub: "Тэр өгүүлбэр л бүх интерфейс.",
    scrollHint: "Доош гүйлгэнэ үү",
    prompt: "Пифагорын теоремын баталгааг геометрээр тайлбарла",
    videoAlt:
      "Пифагорын теоремын геометр баталгаа: a + b талтай квадрат дотор дөрвөн ижил гурвалжныг хоёр янзаар байрлуулахад үлдэх талбай нэг удаа c², нөгөө удаа a² + b² болно.",
    caps: [
      "Дарааллан өөрөө зурагдана.",
      "Хэсгүүд нь санааг харуулахаар шилжинэ.",
      "Бичлэг таны сонгосон хэлээр гарч ирнэ.",
      "Хүссэн хичээл хоромхон зуурт.",
    ],
    dropHead1: "Бодлого бодуулах уу?",
    dropHead2: "Файлаар оруулж болно.",
    dropHint: "Зураг эсвэл PDF — Durslel уншина",
    problem: "∫ (4x⁶ − 2x³ + 7x − 4) dx",
    problemTask: "Тодорхойгүй интегралыг ол.",
    file: "бодлого-3.jpg",
    videoAlt2:
      "4x⁶ − 2x³ + 7x − 4 илэрхийллийн интегралыг зэрэгтийн дүрмээр гишүүн тус бүрд бодож, хүрээлэгдсэн хариу болон + C-гээр төгсгөнө.",
    caps2: [
      "Хуудсан дээрх бодлогыг уншина.",
      "Дараа нь алхам алхамаар бодно.",
      "Хэрэглэсэн дүрэм бүрийг нэрлэнэ.",
      "Эцэст нь хариуг гарна.",
    ],

    langHead: "Бичлэг гаргах хэлээ ч өөрөө сонгоно.",
    langCaps: [
      "EN сонговол бүх бичиг англиар гарна.",
      "MN сонговол адилхан санааг монголоор дүрслэнэ.",
    ],
    langNote:
      "* Дүрслэх товчийг дарахаас өмнө хэлээ сонгоно уу. Гарсан бичлэгийн хэл дараа нь солигдохгүй.",
    langAltEn: "Пифагорын теоремын баталгаа, бүх бичиг нь англиар.",
    langAltMn: "Пифагорын теоремын мөн адил баталгаа, бүх бичиг нь монголоор.",

    better: "Durslel-тэй илүү дээр.",
    signUp: "Бүртгүүлэх",
    freeDaily: (n) => `Бүртгэл үүсгээд өдөр бүр ${n}н бичлэг үнэгүй гаргаж болно`,
    photo:
      "Бичих юмгүй юу? Бодлогоо зургаар нь авах эсвэл PDF-ээ оруулаарай. Durslel уншиж, бодож, хариуг нь хөдөлгөөнт дүрслэл болгоно.",
    privacy: "Нууцлал",
  },

  chalk: {
    welcome: "Durslel-д тавтай морил",
    scroll: "гүйлгээрэй",
    letsLead: "Durslel-ээр та амархан",
    verbs: ["бүтээнэ", "заана", "сурна"],
    letsTail: "",
    benefits: [
      "Бичлэг бүрт хоёр цаг хэмнэнэ.",
      "Сурагчид ойлголтыг төсөөлөхийн оронд харна.",
      "Нэг өгүүлбэр оруулна. Бэлэн бичлэг гарна.",
      "Доторх бичиг нь таны заадаг хэлээр.",
    ],
    makePrompt: "Пифагорын теоремыг тайлбарла",
    equation: "a² + b² = c²",
    figureAlt:
      "Тэгш өнцөгт гурвалжин, гурван тал бүр дээрээ квадраттай; бага хоёр нь томыгоо дүүрнэ.",
    start: "Дүрслэж эхлэх",
  },

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
