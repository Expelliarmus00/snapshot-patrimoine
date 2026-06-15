import { z } from 'zod';
import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// .env à la racine du repo (src/ -> ..)
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const ConfigSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('production'),
  PORT: z.coerce.number().int().positive().default(4101),

  // URL publique de cette app (utilisée pour CORS)
  APP_URL: z.string().url(),

  // URL du dashboard pour valider les sessions cross-origin
  DASHBOARD_URL: z.string().url().default('https://dashboard.snapshotmedia.ch'),

  DATABASE_URL: z.string().min(1).default('file:./data/patrimoine.db'),
});

const parsed = ConfigSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('❌ Invalid environment configuration:');
  for (const issue of parsed.error.issues) {
    console.error(`  - ${issue.path.join('.')}: ${issue.message}`);
  }
  process.exit(1);
}

export const config = parsed.data;
export type Config = typeof config;
