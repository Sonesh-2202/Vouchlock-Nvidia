import fs from 'node:fs';
import path from 'node:path';
import { defineConfig } from 'drizzle-kit';

const candidates = [
  path.resolve(process.cwd(), '.env'),
  path.resolve(process.cwd(), '../../.env'),
  path.resolve(process.cwd(), '../.env'),
];
for (const candidate of candidates) {
  if (fs.existsSync(candidate)) {
    try {
      if (typeof process.loadEnvFile === 'function') {
        process.loadEnvFile(candidate);
        break;
      }
    } catch {
      // ignore
    }
  }
}

export default defineConfig({
  schema: './src/db/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url:
      process.env['DATABASE_URL'] ??
      'postgresql://projectpilot:projectpilot@localhost:5432/projectpilot',
  },
});
