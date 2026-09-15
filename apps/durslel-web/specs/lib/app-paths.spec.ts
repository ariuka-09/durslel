// The paths below are real: the app's own routes, and what scanners sent to production on
// 2026-09-14 while keeping the container awake.
import { isAppPath } from '@/lib/app-paths';

describe('isAppPath', () => {
  it.each([
    '/',
    '/admin',
    '/pricing',
    '/privacy',
    '/api/render',
    '/api/pay/confirm',
    '/api/webhooks/wire',
    '/_next/static/chunks/main.js',
    '/fonts/gip/GIP-Regular.woff2',
    '/icon.png',
    '/robots.txt',
    '/sitemap.xml',
  ])('lets %s through to the container', (path) => {
    expect(isAppPath(path)).toBe(true);
  });

  it.each(['/wp-admin/install.php', '/.env', '/api/.env', '/core/.env', '/sw.js', '/xmlrpc.php'])(
    'turns %s away',
    (path) => {
      expect(isAppPath(path)).toBe(false);
    },
  );
});
