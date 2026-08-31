import { config } from 'dotenv';
import { defineConfig } from 'drizzle-kit';
import { resolve } from 'path';

config({ path: resolve(__dirname, '.dev.vars') });

export default defineConfig({
  dialect: 'sqlite',
  driver: 'd1-http',
  verbose: true,
  schema: 'apps/dursel-service/src/drizzle-config/index.ts',
  out: 'apps/dursel-service/drizzle',
  breakpoints: false,
  // Only `push`/`migrate` reach the network. `generate` diffs the schema offline, which is how
  // migrations are produced here — they are applied with `wrangler d1 migrations apply`, using
  // wrangler's own login rather than a second API token to manage.
  dbCredentials: {
    accountId: process.env.CLOUDFLARE_ACCOUNT_ID as string,
    databaseId: 'f2c1d8e4-71cc-4c7a-854e-2cde86fcf32d',
    token: process.env.CLOUDFLARE_API_TOKEN as string,
  },
});
