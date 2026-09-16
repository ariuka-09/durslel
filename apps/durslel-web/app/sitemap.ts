import type { MetadataRoute } from "next";

// Same host robots.ts advertises: crawlers ignore sitemap entries on a different host than the
// sitemap itself, so the host is pinned here rather than read from the environment.
const ORIGIN = "https://durslel.com";

/** Public pages only. /admin stays out: listing it would only invite crawlers to a locked door. */
export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: `${ORIGIN}/`, changeFrequency: "weekly", priority: 1 },
    { url: `${ORIGIN}/pricing`, changeFrequency: "monthly", priority: 0.8 },
  ];
}
