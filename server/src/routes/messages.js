import express from 'express';
import { requireAuth } from '../auth.js';
import { canAccessScope, scopeAudience } from '../access.js';
import { all, get, run } from '../db.js';
import { bad, stringField, wrap } from '../http.js';
import { emitToScope, notifyState } from '../events.js';
import {
  channelById,
  dmParticipants,
  lastRead,
  loadMessages,
  messageById,
  messagePage,
  newId,
  now,
  publicUser,
  serializeMessage,
} from '../store.js';

export const messageRoutes = express.Router();
messageRoutes.use(requireAuth);

messageRoutes.get(
  '/',
  wrap((req, res) => {
    const scope = req.query.scope === 'dm' ? 'dm' : 'channel';
    const scopeId = String(req.query.scopeId ?? '');
    if (!canAccessScope(req.user.id, scope, scopeId)) return bad(res, 'Not allowed to read this conversation', 403);
    const limit = Math.min(Number(req.query.limit ?? 60) || 60, 100);
    const before = req.query.before ? Number(req.query.before) : null;
    const rows = messagePage({ scope, scopeId, before, limit: limit + 1 });
    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(rows.length - limit) : rows;
    res.json({ messages: loadMessages(page, req.user.id), hasMore });
  }),
);

messageRoutes.post(
  '/',
  wrap((req, res) => {
    const scope = req.body?.scope === 'dm' ? 'dm' : 'channel';
    const scopeId = String(req.body?.scopeId ?? '');
    if (!canAccessScope(req.user.id, scope, scopeId)) return bad(res, 'Not allowed to post here', 403);

    const content = typeof req.body?.content === 'string' ? req.body.content.slice(0, 4000) : '';
    const attachments = Array.isArray(req.body?.attachments) ? req.body.attachments.slice(0, 8) : [];
    if (!content.trim() && attachments.length === 0) return bad(res, 'Write something first');

    let replyToId = req.body?.replyToId ? String(req.body.replyToId) : null;
    if (replyToId) {
      const parent = messageById(replyToId);
      if (!parent || parent.scope !== scope || parent.scope_id !== scopeId) replyToId = null;
    }

    const id = newId();
    const createdAt = now();
    run(
      `INSERT INTO messages (id, scope, scope_id, author_id, content, reply_to_id, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      id,
      scope,
      scopeId,
      req.user.id,
      content,
      replyToId,
      createdAt,
    );

    for (const file of attachments) {
      if (typeof file?.url !== 'string' || !file.url.startsWith('/uploads/')) continue;
      run(
        `INSERT INTO attachments (id, message_id, url, filename, mime, size, width, height)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        newId(),
        id,
        file.url.slice(0, 400),
        String(file.filename ?? 'file').slice(0, 200),
        String(file.mime ?? 'application/octet-stream').slice(0, 120),
        Number(file.size ?? 0) || 0,
        file.width ? Number(file.width) : null,
        file.height ? Number(file.height) : null,
      );
    }

    if (scope === 'dm') run('UPDATE dms SET last_message_at = ? WHERE id = ?', createdAt, scopeId);

    const message = loadMessages([messageById(id)], req.user.id)[0];
    emitToScope(scope, scopeId, 'message:new', message);
    if (scope === 'dm') notifyState(scopeAudience(scope, scopeId), 'dm-activity');
    res.status(201).json({ message });
  }),
);

messageRoutes.patch(
  '/:messageId',
  wrap((req, res) => {
    const message = messageById(req.params.messageId);
    if (!message) return bad(res, 'Message not found', 404);
    if (message.author_id !== req.user.id) return bad(res, 'You can only edit your own messages', 403);
    if (message.deleted_at) return bad(res, 'Message was deleted');

    const content = typeof req.body?.content === 'string' ? req.body.content.slice(0, 4000) : '';
    if (!content.trim()) return bad(res, 'Message cannot be empty');
    run('UPDATE messages SET content = ?, edited_at = ? WHERE id = ?', content, now(), message.id);

    const updated = loadMessages([messageById(message.id)], req.user.id)[0];
    emitToScope(message.scope, message.scope_id, 'message:update', updated);
    res.json({ message: updated });
  }),
);

messageRoutes.delete(
  '/:messageId',
  wrap((req, res) => {
    const message = messageById(req.params.messageId);
    if (!message) return bad(res, 'Message not found', 404);

    let allowed = message.author_id === req.user.id;
    if (!allowed && message.scope === 'channel') {
      const channel = channelById(message.scope_id);
      const membership = channel
        ? get('SELECT role FROM server_members WHERE server_id = ? AND user_id = ?', channel.server_id, req.user.id)
        : null;
      allowed = Boolean(membership && ['owner', 'admin'].includes(membership.role));
    }
    if (!allowed) return bad(res, 'You cannot delete this message', 403);

    run('DELETE FROM messages WHERE id = ?', message.id);
    emitToScope(message.scope, message.scope_id, 'message:delete', {
      id: message.id,
      scope: message.scope,
      scopeId: message.scope_id,
    });
    res.json({ ok: true });
  }),
);

/** Toggle a reaction; the payload carries user ids so each viewer can compute "me". */
messageRoutes.post(
  '/:messageId/reactions',
  wrap((req, res) => {
    const message = messageById(req.params.messageId);
    if (!message) return bad(res, 'Message not found', 404);
    if (!canAccessScope(req.user.id, message.scope, message.scope_id)) return bad(res, 'Not allowed', 403);

    const emoji = stringField(req.body?.emoji, { min: 1, max: 24, field: 'emoji' });
    const existing = get(
      'SELECT 1 AS ok FROM reactions WHERE message_id = ? AND user_id = ? AND emoji = ?',
      message.id,
      req.user.id,
      emoji,
    );
    if (existing) {
      run('DELETE FROM reactions WHERE message_id = ? AND user_id = ? AND emoji = ?', message.id, req.user.id, emoji);
    } else {
      run(
        'INSERT INTO reactions (message_id, user_id, emoji, created_at) VALUES (?, ?, ?, ?)',
        message.id,
        req.user.id,
        emoji,
        now(),
      );
    }
    const serialized = serializeMessage(message, req.user.id, {
      reactionMap: new Map([
        [
          message.id,
          all('SELECT * FROM reactions WHERE message_id = ?', message.id),
        ],
      ]),
    });
    emitToScope(message.scope, message.scope_id, 'reaction:update', {
      messageId: message.id,
      scope: message.scope,
      scopeId: message.scope_id,
      reactions: serialized.reactions,
    });
    res.json({ reactions: serialized.reactions });
  }),
);

messageRoutes.post(
  '/read',
  wrap((req, res) => {
    const scope = req.body?.scope === 'dm' ? 'dm' : 'channel';
    const scopeId = String(req.body?.scopeId ?? '');
    if (!canAccessScope(req.user.id, scope, scopeId)) return bad(res, 'Not allowed', 403);
    const timestamp = Number(req.body?.timestamp) || now();
    run(
      `INSERT INTO reads (user_id, scope, scope_id, last_read_at) VALUES (?, ?, ?, ?)
       ON CONFLICT (user_id, scope, scope_id) DO UPDATE SET last_read_at = MAX(last_read_at, excluded.last_read_at)`,
      req.user.id,
      scope,
      scopeId,
      timestamp,
    );
    res.json({ ok: true, lastReadAt: Math.max(timestamp, lastRead(req.user.id, scope, scopeId)) });
  }),
);

messageRoutes.get(
  '/search',
  wrap((req, res) => {
    const term = String(req.query.q ?? '').trim();
    if (term.length < 2) return res.json({ results: [] });
    const like = `%${term.toLowerCase()}%`;
    const rows = all(
      `SELECT m.* FROM messages m
        WHERE m.deleted_at IS NULL AND lower(m.content) LIKE ?
          AND (
            (m.scope = 'channel' AND m.scope_id IN (
              SELECT c.id FROM channels c
                JOIN server_members sm ON sm.server_id = c.server_id
               WHERE sm.user_id = ?))
            OR
            (m.scope = 'dm' AND m.scope_id IN (
              SELECT id FROM dms WHERE user_a = ? OR user_b = ?))
          )
        ORDER BY m.created_at DESC LIMIT 40`,
      like,
      req.user.id,
      req.user.id,
      req.user.id,
    );

    const results = rows.map((row) => {
      const message = serializeMessage(row, req.user.id);
      let context;
      if (row.scope === 'channel') {
        const channel = channelById(row.scope_id);
        const server = channel ? get('SELECT * FROM servers WHERE id = ?', channel.server_id) : null;
        context = { label: `#${channel?.name ?? 'channel'}`, serverId: server?.id ?? null, serverName: server?.name ?? 'Server' };
      } else {
        const dm = get('SELECT * FROM dms WHERE id = ?', row.scope_id);
        const otherId = dm ? dmParticipants(dm).find((p) => p !== req.user.id) : null;
        const other = otherId ? publicUser(get('SELECT * FROM users WHERE id = ?', otherId)) : null;
        context = { label: other?.displayName ?? 'Direct message', serverId: null, serverName: null };
      }
      return { message, context };
    });

    res.json({ results });
  }),
);

