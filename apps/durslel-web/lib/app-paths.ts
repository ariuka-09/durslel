/**
 * First path segments the Next.js app actually serves: its pages, its API, Next's own assets, and
 * the files in public/ that something references. The Worker answers everything else with a 404
 * and never reaches the container.
 *
 * This is about the bill, not security. Every request that reaches the container wakes it or
 * resets its sleep timer, and memory bills for uptime. Scanners probing /wp-admin/install.php and
 * /.env every few minutes were enough to keep an 8 GiB instance up around the clock.
 *
 * An allowlist rather than a blocklist, because scanners try thousands of paths. The cost is that
 * a new top-level page or public/ folder 404s in production until it is added here.
 */
const APP_SEGMENTS = new Set([
  "",
  "admin",
  "pricing",
  "privacy",
  "api",
  "_next",
  "fonts",
  "icon.png",
  "robots.txt",
  "sitemap.xml",
]);

/** Dot-segments too: the app has none, and scanners hide /.env under allowed ones like /api. */
export const isAppPath = (pathname: string): boolean =>
  APP_SEGMENTS.has(pathname.split("/")[1]) && !pathname.includes("/.");
