import { all, run } from './db.js';
import { emitToUsers, getIo, isUserOnline, onlineUserIds, userRoom } from './events.js';
import { friendIds } from './store.js';

/** Everyone who should see this user's presence dot: friends, server co-members and DM partners. */
export function presenceAudience(userId) {
  const ids = new Set(friendIds(userId));
  for (const row of all(
    `SELECT DISTINCT m2.user_id AS user_id
       FROM server_members m1
       JOIN server_members m2 ON m2.server_id = m1.server_id
      WHERE m1.user_id = ?`,
    userId,
  )) {
    ids.add(row.user_id);
  }
  for (const row of all('SELECT user_a, user_b FROM dms WHERE user_a = ? OR user_b = ?', userId, userId)) {
    ids.add(row.user_a);
    ids.add(row.user_b);
  }
  ids.delete(userId);
  return [...ids];
}

export function broadcastPresence(userId, presence) {
  emitToUsers(presenceAudience(userId), 'presence:update', { userId, presence });
}

export function markOffline(userId) {
  run('UPDATE users SET presence = ?, last_seen = ? WHERE id = ?', 'offline', Date.now(), userId);
  broadcastPresence(userId, 'offline');
}

export function watchRoomsFor(userId) {
  // Sockets of this user always join their personal room; peers watch it for presence.
  return userRoom(userId);
}

export { isUserOnline, onlineUserIds, getIo };
