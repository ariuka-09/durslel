import type { Metadata } from "next";
import { Caveat } from "next/font/google";

import { ChalkLanding } from "./chalk-landing";
import "./chalk.css";

/**
 * A second landing page, kept alongside the one on `/` rather than replacing it: the board is an
 * experiment and the two are meant to be looked at side by side.
 */
export const metadata: Metadata = {
  title: "Durslel",
  // An experiment shares a domain with the real site; it should not share its search results.
  robots: { index: false, follow: false },
};

// The hand on the board. Loaded here rather than in the client component so it is resolved at
// build time, and with the Cyrillic ranges because half the copy on this page is Mongolian.
const chalk = Caveat({
  variable: "--font-chalk",
  // cyrillic-ext is where ү and ө live, so Mongolian needs it as well as cyrillic.
  subsets: ["latin", "cyrillic", "cyrillic-ext"],
});

export default function TestLanding() {
  return <ChalkLanding fontClass={chalk.variable} />;
}
