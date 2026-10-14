import express from 'express';
import { requireAuth } from '../auth.js';
import { run } from '../db.js';
import { bad, stringField, wrap } from '../http.js';
import { emitToUsers, notifyState } from '../events.js';
import {
  friendshipBetween,
  friendshipById,
  getUserById,
  getUserByUsername,
  listFriendships,
  newId,
  now,
  serializeFriendship,
} from '../store.js';

export const friendRoutes = express.Router();
friendRoutes.use(requireAuth);

friendRoutes.get(
  '/',
  wrap((req, res) => {
    res.json({ friendships: listFriendships(req.user.id) });
  }),
);

friendRoutes.post(
  '/requests',
  wrap((req, res) => {
    const username = stringField(req.body?.username ?? '', { min: 1, max: 40, field: 'username' })
      .replace(/^@/, '')
      .toLowerCase();
    const target = getUserByUsername(username);
    if (!target) return bad(res, `No user named @${username}`, 404);
    if (target.id === req.user.id) return bad(res, 'You cannot add yourself');

    const existing = friendshipBetween(req.user.id, target.id);
    if (existing && existing.status === 'accepted') return bad(res, 'You are already friends');
    if (existing && existing.requester_id === req.user.id) return bad(res, 'Request already sent');

    if (existing) {
      // They already asked us — accept it instead of stacking requests.
      run('UPDATE friendships SET status = ?, responded_at = ? WHERE id = ?', 'accepted', now(), existing.id);
      const friendship = serializeFriendship(friendshipById(existing.id), req.user.id);
      notifyState([req.user.id, target.id], 'friend-accepted');
      emitToUsers([target.id], 'friend:accepted', serializeFriendship(friendshipById(existing.id), target.id));
      return res.json({ friendship, accepted: true });
    }

    const id = newId();
    run(
      'INSERT INTO friendships (id, requester_id, addressee_id, status, created_at) VALUES (?, ?, ?, ?, ?)',
      id,
      req.user.id,
      target.id,
      'pending',
      now(),
    );
    const friendship = serializeFriendship(friendshipById(id), req.user.id);
    emitToUsers([target.id], 'friend:request', serializeFriendship(friendshipById(id), target.id));
    notifyState([req.user.id], 'friend-request-sent');
    res.status(201).json({ friendship });
  }),
);

friendRoutes.post(
  '/requests/:id/accept',
  wrap((req, res) => {
    const row = friendshipById(req.params.id);
    if (!row || row.addressee_id !== req.user.id) return bad(res, 'Request not found', 404);
    run('UPDATE friendships SET status = ?, responded_at = ? WHERE id = ?', 'accepted', now(), row.id);
    emitToUsers([row.requester_id], 'friend:accepted', serializeFriendship(friendshipById(row.id), row.requester_id));
    notifyState([row.requester_id, row.addressee_id], 'friend-accepted');
    res.json({ friendship: serializeFriendship(friendshipById(row.id), req.user.id) });
  }),
);

friendRoutes.delete(
  '/requests/:id',
  wrap((req, res) => {
    const row = friendshipById(req.params.id);
    if (!row || (row.requester_id !== req.user.id && row.addressee_id !== req.user.id)) {
      return bad(res, 'Request not found', 404);
    }
    run('DELETE FROM friendships WHERE id = ?', row.id);
    notifyState([row.requester_id, row.addressee_id], 'friend-removed');
    res.json({ ok: true });
  }),
);

friendRoutes.delete(
  '/:userId',
  wrap((req, res) => {
    const row = friendshipBetween(req.user.id, req.params.userId);
    if (!row) return bad(res, 'You are not connected to that user', 404);
    run('DELETE FROM friendships WHERE id = ?', row.id);
    notifyState([req.user.id, req.params.userId], 'friend-removed');
    res.json({ ok: true });
  }),
);

export function friendshipSummary(viewerId, otherId) {
  const row = friendshipBetween(viewerId, otherId);
  if (!row) return { status: 'none' };
  return {
    status: row.status,
    direction: row.requester_id === viewerId ? 'outgoing' : 'incoming',
    id: row.id,
  };
}
