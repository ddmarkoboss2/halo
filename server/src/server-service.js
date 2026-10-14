import { all, get } from './db.js';
import {
  lastRead,
  listServersForUser,
  serializeServer,
  serverChannels,
  serverMemberCount,
  unreadForChannel,
} from './store.js';

export function listUserServerIds(userId) {
  return listServersForUser(userId);
}

export function memberRow(serverId, userId) {
  return get('SELECT * FROM server_members WHERE server_id = ? AND user_id = ?', serverId, userId);
}

export function isMember(serverId, userId) {
  return Boolean(memberRow(serverId, userId));
}

export function serverAudience(serverId) {
  return all('SELECT user_id FROM server_members WHERE server_id = ?', serverId).map((r) => r.user_id);
}

/** Full server payload: channels with unread counts, member count and viewer role. */
export function serializeServerFull(row, viewerId) {
  if (!row) return null;
  const member = memberRow(row.id, viewerId);
  const channels = serverChannels(row.id).map((channel) => ({
    ...channel,
    unread: channel.type === 'text' ? unreadForChannel(viewerId, channel.id) : 0,
    lastReadAt: lastRead(viewerId, 'channel', channel.id),
  }));
  return serializeServer(row, {
    channels,
    memberCount: serverMemberCount(row.id),
    member: member ? { role: member.role, nickname: member.nickname } : null,
  });
}

export function serverAudienceFor(channelId) {
  const channel = get('SELECT * FROM channels WHERE id = ?', channelId);
  return channel ? serverAudience(channel.server_id) : [];
}
