import express from 'express';
import { requireAuth } from '../auth.js';
import { all, get, run } from '../db.js';
import { bad, optionalString, stringField, wrap } from '../http.js';
import { notifyState } from '../events.js';
import { announceJoin } from '../provision.js';
import { listUserServerIds, memberRow, serializeServerFull, serverAudience } from '../server-service.js';
import { newId, now, serializeChannel, serverChannels, serverMembers, slugify } from '../store.js';

export const serverRoutes = express.Router();
serverRoutes.use(requireAuth);

serverRoutes.get(
  '/',
  wrap((req, res) => {
    res.json({ servers: listUserServerIds(req.user.id).map((row) => serializeServerFull(row, req.user.id)) });
  }),
);

serverRoutes.get(
  '/discover',
  wrap((req, res) => {
    const rows = all('SELECT * FROM servers WHERE is_public = 1 ORDER BY created_at ASC LIMIT 30');
    res.json({
      servers: rows.map((row) => ({
        ...serializeServerFull(row, req.user.id),
        joined: Boolean(memberRow(row.id, req.user.id)),
      })),
    });
  }),
);

serverRoutes.post(
  '/',
  wrap((req, res) => {
    const name = stringField(req.body?.name, { min: 2, max: 60, field: 'server name' });
    const description = optionalString(req.body?.description, { min: 0, max: 300, field: 'description' }) ?? '';
    const accent = optionalString(req.body?.accent, { min: 0, max: 32, field: 'accent' }) ?? '#7c5cff';
    const isPublic = Boolean(req.body?.isPublic);

    const id = newId();
    run(
      `INSERT INTO servers (id, name, description, owner_id, accent, invite_code, is_public, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      id,
      name,
      description,
      req.user.id,
      accent,
      uniqueInviteCode(name),
      isPublic ? 1 : 0,
      now(),
    );
    run(
      'INSERT INTO server_members (server_id, user_id, role, joined_at) VALUES (?, ?, ?, ?)',
      id,
      req.user.id,
      'owner',
      now(),
    );
    createChannel(id, 'general', 'The beginning of something good.', 'text', 0);
    createChannel(id, 'Lounge', 'Voice and video hangout.', 'voice', 1);

    const server = serializeServerFull(get('SELECT * FROM servers WHERE id = ?', id), req.user.id);
    notifyState([req.user.id], 'server-created');
    res.status(201).json({ server });
  }),
);

serverRoutes.post(
  '/join',
  wrap((req, res) => {
    const code = stringField(req.body?.code ?? '', { min: 1, max: 80, field: 'invite code' }).toLowerCase();
    const row = get('SELECT * FROM servers WHERE lower(invite_code) = ? OR id = ?', code, code);
    if (!row) return bad(res, 'That invite code does not match any server', 404);
    if (!memberRow(row.id, req.user.id)) {
      run(
        'INSERT INTO server_members (server_id, user_id, role, joined_at) VALUES (?, ?, ?, ?)',
        row.id,
        req.user.id,
        'member',
        now(),
      );
      announceJoin(row.id, req.user.id);
    }
    notifyState(serverAudience(row.id), 'member-joined');
    res.json({ server: serializeServerFull(row, req.user.id) });
  }),
);

serverRoutes.get(
  '/:serverId',
  wrap((req, res) => {
    if (!memberRow(req.params.serverId, req.user.id)) return bad(res, 'Server not found', 404);
    const row = get('SELECT * FROM servers WHERE id = ?', req.params.serverId);
    if (!row) return bad(res, 'Server not found', 404);
    res.json({ server: serializeServerFull(row, req.user.id), members: serverMembers(row.id) });
  }),
);

serverRoutes.get(
  '/:serverId/members',
  wrap((req, res) => {
    if (!memberRow(req.params.serverId, req.user.id)) return bad(res, 'Server not found', 404);
    res.json({ members: serverMembers(req.params.serverId) });
  }),
);

serverRoutes.patch(
  '/:serverId',
  wrap((req, res) => {
    const member = memberRow(req.params.serverId, req.user.id);
    if (!member) return bad(res, 'Server not found', 404);
    if (!['owner', 'admin'].includes(member.role)) return bad(res, 'Only the owner can edit this server', 403);

    const fields = [];
    const values = [];
    const name = optionalString(req.body?.name, { min: 2, max: 60, field: 'server name' });
    const description = optionalString(req.body?.description, { min: 0, max: 300, field: 'description' });
    const accent = optionalString(req.body?.accent, { min: 0, max: 32, field: 'accent' });
    if (name !== undefined) {
      fields.push('name = ?');
      values.push(name);
    }
    if (description !== undefined) {
      fields.push('description = ?');
      values.push(description);
    }
    if (accent !== undefined) {
      fields.push('accent = ?');
      values.push(accent);
    }
    if (req.body?.isPublic !== undefined) {
      fields.push('is_public = ?');
      values.push(req.body.isPublic ? 1 : 0);
    }
    if (fields.length === 0) return bad(res, 'Nothing to update');
    values.push(req.params.serverId);
    run(`UPDATE servers SET ${fields.join(', ')} WHERE id = ?`, ...values);

    notifyState(serverAudience(req.params.serverId), 'server-updated');
    res.json({
      server: serializeServerFull(get('SELECT * FROM servers WHERE id = ?', req.params.serverId), req.user.id),
    });
  }),
);

serverRoutes.delete(
  '/:serverId',
  wrap((req, res) => {
    const row = get('SELECT * FROM servers WHERE id = ?', req.params.serverId);
    if (!row) return bad(res, 'Server not found', 404);
    if (row.owner_id !== req.user.id) return bad(res, 'Only the owner can delete this server', 403);
    const audience = serverAudience(row.id);
    run('DELETE FROM servers WHERE id = ?', row.id);
    notifyState(audience, 'server-deleted');
    res.json({ ok: true });
  }),
);

serverRoutes.post(
  '/:serverId/leave',
  wrap((req, res) => {
    const row = get('SELECT * FROM servers WHERE id = ?', req.params.serverId);
    if (!row) return bad(res, 'Server not found', 404);
    if (row.owner_id === req.user.id) {
      run('DELETE FROM servers WHERE id = ?', row.id);
      notifyState(serverAudience(row.id), 'server-deleted');
      return res.json({ ok: true, deleted: true });
    }
    run('DELETE FROM server_members WHERE server_id = ? AND user_id = ?', row.id, req.user.id);
    notifyState(serverAudience(row.id), 'member-left');
    res.json({ ok: true });
  }),
);

serverRoutes.post(
  '/:serverId/channels',
  wrap((req, res) => {
    const member = memberRow(req.params.serverId, req.user.id);
    if (!member) return bad(res, 'Server not found', 404);
    if (!['owner', 'admin'].includes(member.role)) return bad(res, 'Only the owner can add channels', 403);

    const name = stringField(req.body?.name, { min: 1, max: 40, field: 'channel name' });
    const type = req.body?.type === 'voice' ? 'voice' : 'text';
    const topic = optionalString(req.body?.topic, { min: 0, max: 200, field: 'topic' }) ?? '';
    const position = serverChannels(req.params.serverId).length;
    const id = createChannel(req.params.serverId, slugify(name) || 'channel', topic, type, position);
    notifyState(serverAudience(req.params.serverId), 'channel-created');
    res.status(201).json({ channel: serializeChannel(get('SELECT * FROM channels WHERE id = ?', id)) });
  }),
);

/** Channel routes live under the same router but ignore the server id in the path. */
serverRoutes.patch(
  '/channels/:channelId',
  wrap((req, res) => {
    const channel = get('SELECT * FROM channels WHERE id = ?', req.params.channelId);
    if (!channel) return bad(res, 'Channel not found', 404);
    const member = memberRow(channel.server_id, req.user.id);
    if (!member) return bad(res, 'Channel not found', 404);
    if (!['owner', 'admin'].includes(member.role)) return bad(res, 'Only the owner can edit channels', 403);

    const fields = [];
    const values = [];
    const name = optionalString(req.body?.name, { min: 1, max: 40, field: 'channel name' });
    const topic = optionalString(req.body?.topic, { min: 0, max: 200, field: 'topic' });
    if (name !== undefined) {
      fields.push('name = ?');
      values.push(slugify(name) || 'channel');
    }
    if (topic !== undefined) {
      fields.push('topic = ?');
      values.push(topic);
    }
    if (fields.length === 0) return bad(res, 'Nothing to update');
    values.push(channel.id);
    run(`UPDATE channels SET ${fields.join(', ')} WHERE id = ?`, ...values);
    notifyState(serverAudience(channel.server_id), 'channel-updated');
    res.json({ channel: serializeChannel(get('SELECT * FROM channels WHERE id = ?', channel.id)) });
  }),
);

serverRoutes.delete(
  '/channels/:channelId',
  wrap((req, res) => {
    const channel = get('SELECT * FROM channels WHERE id = ?', req.params.channelId);
    if (!channel) return bad(res, 'Channel not found', 404);
    const member = memberRow(channel.server_id, req.user.id);
    if (!member) return bad(res, 'Channel not found', 404);
    if (!['owner', 'admin'].includes(member.role)) return bad(res, 'Only the owner can delete channels', 403);
    run('DELETE FROM channels WHERE id = ?', channel.id);
    notifyState(serverAudience(channel.server_id), 'channel-deleted');
    res.json({ ok: true });
  }),
);

function createChannel(serverId, name, topic, type, position) {
  const id = newId();
  run(
    'INSERT INTO channels (id, server_id, name, topic, type, position, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
    id,
    serverId,
    name,
    topic,
    type,
    position,
    now(),
  );
  return id;
}

/** Adds a short random suffix so display names stay unique-ish. */
function uniqueInviteCode(name) {
  const base = slugify(name) || 'halo';
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const suffix = Math.random().toString(36).slice(2, 6);
    const code = `${base}-${suffix}`;
    if (!get('SELECT 1 AS ok FROM servers WHERE invite_code = ?', code)) return code;
  }
  return `${base}-${newId().slice(0, 8)}`;
}
