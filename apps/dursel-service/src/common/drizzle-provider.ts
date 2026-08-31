import { drizzle } from 'drizzle-orm/d1';

import * as schema from '@/drizzle-config';

export const drizzleProvider = (env: Env) => drizzle(env.DB, { schema });

export type Db = ReturnType<typeof drizzleProvider>;
