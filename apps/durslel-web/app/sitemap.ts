import type { MetadataRoute } from "next";

// Same host robots.ts advertises: crawlers ignore sitemap entries on a different host than the
// sitemap itself, so this cannot follow APP_ORIGIN (still the workers.dev address).
const ORIGIN = "https://durslel.com";

/** Public pages only. /admin stays out: listing it would only invite crawlers to a locked door. */
export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: `${ORIGIN}/`, changeFrequency: "weekly", priority: 1 },
    { url: `${ORIGIN}/pricing`, changeFrequency: "monthly", priority: 0.8 },
  ];
}
