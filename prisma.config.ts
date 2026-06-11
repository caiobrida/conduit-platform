import 'dotenv/config';
import { defineConfig } from 'prisma/config';

// DIRECT_URL is only required for commands that talk to the database
// (migrate, db push/pull, studio). `prisma generate` must work without it
// (e.g. CI postinstall), so the datasource is only set when the var exists.
const directUrl = process.env.DIRECT_URL;

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  ...(directUrl ? { datasource: { url: directUrl } } : {}),
});
