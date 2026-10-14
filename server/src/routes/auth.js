import express from 'express';
import {
  clearSessionCookie,
  destroySession,
  hashPassword,
  readToken,
  requireAuth,
  setSessionCookie,
  startSession,
  verifyPassword,
} from '../auth.js';
import { bootstrap } from '../bootstrap.js';
import { run } from '../db.js';
import { bad, optionalString, stringField, wrap, HttpError } from '../http.js';
import { provisionNewUser } from '../provision.js';
import { broadcastPresence } from '../presence.js';
import { emitToUsers } from '../events.js';
import { getUserByEmail, getUserById, getUserByUsername, newId, now, selfUser } from '../store.js';

export const authRoutes = express.Router();

const ACCENTS = ['#7c5cff', '#22d3ee', '#f472b6', '#34d399', '#fbbf24', '#f87171', '#60a5fa', '#c084fc'];
const USERNAME_RE = /^[a-z0-9_.]{3,20}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

authRoutes.post(
  '/register',
  wrap((req, res) => {
    const email = stringField(req.body?.email, { min: 3, max: 200, field: 'email' }).toLowerCase();
    const username = stringField(req.body?.username, { min: 3, max: 20, field: 'username' }).toLowerCase();
    const password = stringField(req.body?.password, { min: 8, max: 200, field: 'password', trim: false });
    const displayName =
      optionalString(req.body?.displayName, { min: 1, max: 40, field: 'display name' }) ?? username;

    if (!EMAIL_RE.test(email)) return bad(res, 'Enter a valid email address');
    if (!USERNAME_RE.test(username)) {
      return bad(res, 'Username may use a-z, 0-9, "_" and "." (3-20 characters)');
    }
    if (getUserByEmail(email)) return bad(res, 'An account with that email already exists');
    if (getUserByUsername(username)) return bad(res, 'That username is taken');

    const id = newId();
    const accent = ACCENTS[Math.floor(Math.random() * ACCENTS.length)];
    run(
      `INSERT INTO users (id, email, username, display_name, password_hash, accent, presence, created_at)
       VALUES (?, ?, ?, ?, ?, ?, 'online', ?)`,
      id,
      email,
      username,
      displayName,
      hashPassword(password),
      accent,
      now(),
    );

    const token = startSession(id);
    setSessionCookie(res, token);
    provisionNewUser(id);
    res.status(201).json(bootstrap(id));
  }),
);

authRoutes.post(
  '/login',
  wrap((req, res) => {
    const identifier = stringField(req.body?.identifier ?? req.body?.email, {
      min: 1,
      max: 200,
      field: 'email or username',
    }).toLowerCase();
    const password = stringField(req.body?.password, { min: 1, max: 200, field: 'password', trim: false });

    const user = identifier.includes('@') ? getUserByEmail(identifier) : getUserByUsername(identifier);
    if (!user || !verifyPassword(password, user.password_hash)) {
      return bad(res, 'Incorrect email or password', 401);
    }
    const token = startSession(user.id);
    setSessionCookie(res, token);
    res.json(bootstrap(user.id));
  }),
);

authRoutes.post(
  '/logout',
  wrap((req, res) => {
    destroySession(readToken(req));
    clearSessionCookie(res);
    res.json({ ok: true });
  }),
);

authRoutes.get(
  '/me',
  requireAuth,
  wrap((req, res) => {
    res.json(bootstrap(req.user.id));
  }),
);

authRoutes.patch(
  '/me',
  requireAuth,
  wrap((req, res) => {
    const fields = [];
    const values = [];

    const displayName = optionalString(req.body?.displayName, { min: 1, max: 40, field: 'display name' });
    const bio = optionalString(req.body?.bio, { min: 0, max: 190, field: 'bio' });
    const customStatus = optionalString(req.body?.customStatus, { min: 0, max: 80, field: 'status' });
    const accent = optionalString(req.body?.accent, { min: 0, max: 32, field: 'accent' });
    const avatarUrl = req.body?.avatarUrl;

    if (displayName !== undefined) {
      fields.push('display_name = ?');
      values.push(displayName);
    }
    if (bio !== undefined) {
      fields.push('bio = ?');
      values.push(bio);
    }
    if (customStatus !== undefined) {
      fields.push('custom_status = ?');
      values.push(customStatus);
    }
    if (accent !== undefined) {
      fields.push('accent = ?');
      values.push(accent);
    }
    if (avatarUrl !== undefined) {
      if (avatarUrl !== null && typeof avatarUrl !== 'string') throw new HttpError(400, 'avatarUrl must be a string');
      if (typeof avatarUrl === 'string' && !avatarUrl.startsWith('/uploads/')) {
        throw new HttpError(400, 'avatarUrl must point at an uploaded file');
      }
      fields.push('avatar_url = ?');
      values.push(avatarUrl);
    }
    if (req.body?.password !== undefined) {
      const next = stringField(req.body.password, { min: 8, max: 200, field: 'password', trim: false });
      const current = stringField(req.body.currentPassword, {
        min: 1,
        max: 200,
        field: 'current password',
        trim: false,
      });
      if (!verifyPassword(current, req.user.password_hash)) return bad(res, 'Current password is incorrect', 403);
      fields.push('password_hash = ?');
      values.push(hashPassword(next));
    }
    if (fields.length === 0) return bad(res, 'Nothing to update');

    values.push(req.user.id);
    run(`UPDATE users SET ${fields.join(', ')} WHERE id = ?`, ...values);

    const user = selfUser(getUserById(req.user.id));
    emitToUsers([user.id], 'user:update', user);
    res.json({ user });
  }),
);

authRoutes.post(
  '/presence',
  requireAuth,
  wrap((req, res) => {
    const presence = req.body?.presence;
    if (!['online', 'idle', 'dnd', 'offline'].includes(presence)) return bad(res, 'Unknown presence');
    run('UPDATE users SET presence = ? WHERE id = ?', presence, req.user.id);
    broadcastPresence(req.user.id, presence);
    res.json({ ok: true });
  }),
);

