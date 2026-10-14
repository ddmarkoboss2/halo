import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(here, '..', '..');

loadDotEnv(path.join(ROOT, '.env'));

function loadDotEnv(file) {
  if (!fs.existsSync(file)) return;
  for (const rawLine of fs.readFileSync(file, 'utf8').split('\n')) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

function resolveFromRoot(value) {
  return path.isAbsolute(value) ? value : path.join(ROOT, value);
}

export const config = {
  port: Number(process.env.PORT ?? 4000),
  dbPath: resolveFromRoot(process.env.HALO_DB ?? 'server/data/halo.db'),
  uploadsDir: resolveFromRoot(process.env.HALO_UPLOADS ?? 'server/uploads'),
  secret: process.env.HALO_SECRET ?? 'halo-development-secret',
  isProduction: process.env.NODE_ENV === 'production',
  cookieName: 'halo_session',
  sessionDays: 30,
  maxUploadBytes: 8 * 1024 * 1024,
};

fs.mkdirSync(path.dirname(config.dbPath), { recursive: true });
fs.mkdirSync(config.uploadsDir, { recursive: true });
