import { ClerkProvider } from "@clerk/nextjs";

import { LangProvider } from "@/shared/i18n";
import { ApolloClientProvider } from "@/shared/providers/ApolloProvider";
import type { Metadata, Viewport } from "next";
import { JetBrains_Mono } from "next/font/google";
import { cookies } from "next/headers";
import "./globals.css";

// Mono for code and links; everything else, headings included, is GIP from globals.css.
const mono = JetBrains_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
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
    <ClerkProvider
      appearance={{
        variables: {
          colorPrimary: "var(--accent)",
          colorPrimaryForeground: "var(--on-accent)",
          colorBackground: "var(--panel)",
          colorForeground: "var(--ink)",
          colorMutedForeground: "var(--muted)",
          colorNeutral: "var(--ink)",
          colorInput: "var(--panel)",
          colorInputForeground: "var(--ink)",
          colorBorder: "var(--rule)",
          colorDanger: "var(--bad)",
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
