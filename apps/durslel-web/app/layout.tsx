import { ClerkProvider } from "@clerk/nextjs";

import { ApolloClientProvider } from "@/shared/providers/ApolloProvider";
import type { Metadata } from "next";
import { EB_Garamond, JetBrains_Mono } from "next/font/google";
import "./globals.css";

// Garamond for display: the closest Google-hosted face to Computer Modern's lineage, which is
// what mathematical typesetting looks like. Mono everywhere else — this is a code tool.
const display = EB_Garamond({
  variable: "--font-display",
  subsets: ["latin"],
  weight: ["400", "500"],
});

const mono = JetBrains_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Durslel",
  description:
    "Durslel — \"depiction\" in Mongolian. Describe an animation, get a rendered manim scene.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    // Reads NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY from the environment, as clerkMiddleware() in
    // proxy.ts does — it only ever looks at that one name, so passing the key as a prop here
    // would leave the proxy throwing before any page rendered.
    <ClerkProvider>
      <html
        lang="en"
        className={`${display.variable} ${mono.variable} h-full antialiased`}
      >
        {/* Inside ClerkProvider: the Apollo auth link reads the session through useAuth, so it
            has to sit below the thing that supplies it. */}
        <body className="min-h-full flex flex-col">
          <ApolloClientProvider>{children}</ApolloClientProvider>
        </body>
      </html>
    </ClerkProvider>
  );
}
