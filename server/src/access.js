import { all, get } from './db.js';
import { channelById, dmParticipants, isServerMember } from './store.js';

export function canAccessScope(userId, scope, scopeId) {
  if (!scope || !scopeId) return false;
  if (scope === 'channel') {
    const channel = channelById(scopeId);
    return channel ? isServerMember(channel.server_id, userId) : false;
  }
  if (scope === 'dm') {
    const dm = get('SELECT * FROM dms WHERE id = ?', scopeId);
    return dm ? dmParticipants(dm).includes(userId) : false;
  }
  return false;
}

/** Every user id that should receive realtime events for this scope. */
export function scopeAudience(scope, scopeId) {
  if (scope === 'channel') {
    const channel = channelById(scopeId);
    if (!channel) return [];
    return all('SELECT user_id FROM server_members WHERE server_id = ?', channel.server_id).map((r) => r.user_id);
  }
  if (scope === 'dm') {
    const dm = get('SELECT * FROM dms WHERE id = ?', scopeId);
    return dmParticipants(dm);
  }
  return [];
}
