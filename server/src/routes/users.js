import express from 'express';
import { requireAuth } from '../auth.js';
import { all } from '../db.js';
import { bad, wrap } from '../http.js';
import { friendshipSummary } from './friends.js';
import { isUserOnline } from '../presence.js';
import { getUserById, publicUser, searchUsers } from '../store.js';

export const userRoutes = express.Router();
userRoutes.use(requireAuth);

userRoutes.get(
  '/search',
  wrap((req, res) => {
    const query = String(req.query.q ?? '').trim();
    if (query.length === 0) return res.json({ users: [] });
    const users = searchUsers(query, req.user.id, 15).map((user) => ({
      ...user,
      presence: isUserOnline(user.id) ? 'online' : user.presence,
      friendship: friendshipSummary(req.user.id, user.id),
    }));
    res.json({ users });
  }),
);

userRoutes.get(
  '/:userId',
  wrap((req, res) => {
    const row = getUserById(req.params.userId);
    if (!row) return bad(res, 'User not found', 404);
    const sharedServers = all(
      `SELECT s.id, s.name, s.accent FROM servers s
         JOIN server_members a ON a.server_id = s.id AND a.user_id = ?
         JOIN server_members b ON b.server_id = s.id AND b.user_id = ?`,
      req.user.id,
      req.params.userId,
    );
    res.json({
      user: {
        ...publicUser(row),
        presence: isUserOnline(row.id) ? 'online' : row.presence,
        friendship: friendshipSummary(req.user.id, row.id),
        mutualServers: sharedServers,
      },
    });
  }),
);
