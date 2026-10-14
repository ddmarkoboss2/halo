import { all, get } from './db.js';
import { isUserOnline } from './events.js';
import { listUserServerIds, serializeServerFull } from './server-service.js';
import { listFriendships, selfUser, serializeDm } from './store.js';

/** DM list for the sidebar, newest activity first. */
export function listDmsForUser(userId) {
  return all(
    'SELECT * FROM dms WHERE user_a = ? OR user_b = ? ORDER BY last_message_at DESC',
    userId,
    userId,
  )
    .map((row) => serializeDm(row, userId))
    .map((dm) => ({
      ...dm,
      other: dm.other
        ? { ...dm.other, presence: isUserOnline(dm.other.id) ? 'online' : dm.other.presence }
        : null,
    }));
}

/** Everything the client needs after signing in or reconnecting. */
export function bootstrap(userId) {
  const me = selfUser(get('SELECT * FROM users WHERE id = ?', userId));
  const servers = listUserServerIds(userId).map((row) => serializeServerFull(row, userId));
  const friendships = listFriendships(userId);
  const friends = friendships
    .filter((f) => f.status === 'accepted')
    .map((f) => ({ ...f.user, presence: isUserOnline(f.user.id) ? 'online' : f.user.presence }));

  return {
    me,
    servers,
    dms: listDmsForUser(userId),
    friendships,
    friends,
    online: friends.filter((f) => f.presence !== 'offline').map((f) => f.id),
  };
}
