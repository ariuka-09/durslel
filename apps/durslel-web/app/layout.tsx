import { ClerkProvider } from "@clerk/nextjs";

import { LangProvider } from "@/shared/i18n";
import { ApolloClientProvider } from "@/shared/providers/ApolloProvider";
import type { Metadata, Viewport } from "next";
import { JetBrains_Mono } from "next/font/google";
import { cookies } from "next/headers";
import "./globals.css";

// Mono for code and links; everything else, headings included, is GIP from globals.css.
// Cyrillic too: the landing page types a Mongolian prompt in mono, and a fallback face there
// would not be monospaced — which is what keeps the caret between characters rather than through
// one. cyrillic-ext is where ү and ө live.
const mono = JetBrains_Mono({
  variable: "--font-mono",
  subsets: ["latin", "cyrillic", "cyrillic-ext"],
});

export const metadata: Metadata = {
  title: "Durslel",
  description:
    "Durslel — \"depiction\" in Mongolian. Describe an animation, get a rendered manim scene.",
};

// An on-screen keyboard shrinks the page instead of sliding over it, so the renderer's composer
// rides up on top of the keyboard while the video stays where it is. Chrome and Firefox on Android
// honour this; iOS Safari ignores it and is handled by the visualViewport effect in app/page.tsx.
export const viewport: Viewport = {
  interactiveWidget: "resizes-content",
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  // Set by LangToggle in shared/i18n.tsx. The name is repeated rather than imported: a constant
  // imported from a "use client" module reaches a server component as a reference, not a string.
  const jar = await cookies();
  const lang = jar.get("lang")?.value === "mn" ? "mn" : "en";
  // Set by ThemeToggle in shared/theme.tsx, named here for the same reason. Absent means "follow
  // the system", which needs no attribute at all.
  const theme = jar.get("theme")?.value;

  return (
    // Reads NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY from the environment, as clerkMiddleware() in
    // proxy.ts does — it only ever looks at that one name, so passing the key as a prop here
    // would leave the proxy throwing before any page rendered.
    //
    // Clerk's modal and user menu take the page's own tokens, so they follow light and dark too.
    // The primary colour is the one exception — it is set in globals.css, which says why. The
    // elements dress the modal like the rest of the site: pills, a round card, a soft shadow in
    // place of hairlines. They are Tailwind classes, and win only because of the `clerk` layer.
    <ClerkProvider
      appearance={{
        cssLayerName: "clerk",
        variables: {
          colorPrimaryForeground: "var(--on-accent)",
          colorBackground: "var(--panel)",
          colorForeground: "var(--ink)",
          colorMutedForeground: "var(--muted)",
          colorNeutral: "var(--ink)",
          colorInput: "var(--panel)",
          colorInputForeground: "var(--ink)",
          colorBorder: "var(--rule)",
          colorDanger: "var(--bad)",
          colorModalBackdrop: "light-dark(rgb(46 39 53 / 0.3), rgb(6 5 10 / 0.6))",
        },
        elements: {
          modalBackdrop: "backdrop-blur-sm",
          // Clerk focuses the dialog when it opens, and the site's :focus-visible outline in
          // globals.css outranks Clerk's layered `outline: 0` — rounded, so the ring hugs the card.
          modalContent: "rounded-card",
          cardBox: "rounded-card shadow-soft",
          footer: "bg-none bg-panel",
          headerTitle: "text-xl font-extrabold tracking-tight",
          socialButtonsBlockButton: "rounded-full border border-rule shadow-none hover:bg-tint",
          lastAuthenticationStrategyBadge:
            "-top-2.5 right-5 rounded-full bg-tint px-2 text-accent-ink shadow-none",
          dividerLine: "bg-rule",
          formFieldInput: "rounded-full border border-rule px-4 shadow-none focus:border-accent",
          formButtonPrimary:
            "rounded-full bg-accent py-2.5 text-on-accent shadow-none after:hidden hover:bg-accent-strong",
          footerActionLink: "font-medium text-accent-ink hover:text-accent",
        },
      }}
    >
      <html
        lang={lang}
        data-theme={theme === "dark" || theme === "light" ? theme : undefined}
        className={`${mono.variable} h-full antialiased`}
      >
        {/* Inside ClerkProvider: the Apollo auth link reads the session through useAuth, so it
            has to sit below the thing that supplies it. */}
        <body className="min-h-full flex flex-col">
          <LangProvider initial={lang}>
            <ApolloClientProvider>{children}</ApolloClientProvider>
          </LangProvider>
        </body>
      </html>
    </ClerkProvider>
  );
}
