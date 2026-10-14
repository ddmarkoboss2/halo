import crypto from 'node:crypto';
import { parse as parseCookie } from 'cookie';
import { config } from './config.js';
import { createSession, destroySession, sessionUser } from './store.js';

const SCRYPT_KEYLEN = 64;

export function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, SCRYPT_KEYLEN).toString('hex');
  return `scrypt$${salt}$${hash}`;
}

export function verifyPassword(password, stored) {
  if (typeof stored !== 'string') return false;
  const [scheme, salt, hash] = stored.split('$');
  if (scheme !== 'scrypt' || !salt || !hash) return false;
  const expected = Buffer.from(hash, 'hex');
  const actual = crypto.scryptSync(password, salt, expected.length);
  return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
}

export function readToken(req) {
  const cookies = parseCookie(req.headers.cookie ?? '');
  const fromCookie = cookies[config.cookieName];
  if (fromCookie) return fromCookie;
  const header = req.headers.authorization;
  if (header?.startsWith('Bearer ')) return header.slice(7);
  return null;
}

export function setSessionCookie(res, token) {
  const parts = [
    `${config.cookieName}=${token}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${60 * 60 * 24 * config.sessionDays}`,
  ];
  if (config.isProduction) parts.push('Secure');
  res.append('Set-Cookie', parts.join('; '));
}

export function clearSessionCookie(res) {
  res.append('Set-Cookie', `${config.cookieName}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`);
}

/** Express middleware: resolves the session user when present. */
export function attachUser(req, _res, next) {
  const token = readToken(req);
  req.sessionToken = token ?? null;
  req.user = token ? sessionUser(token) : null;
  next();
}

export function requireAuth(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'Not authenticated' });
  next();
}

export function startSession(userId) {
  return createSession(userId);
}

export { destroySession };
