import { all, get, run } from './db.js';

export const now = () => Date.now();
export const newId = () => crypto.randomUUID();

export function slugify(value) {
  return String(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 32);
}
export const newToken = () => crypto.randomUUID() + crypto.randomUUID().replace(/-/g, '');

/* ------------------------------------------------------------------ users */

export function publicUser(row) {
  if (!row) return null;
  return {
    id: row.id,
    username: row.username,
    displayName: row.display_name,
    bio: row.bio,
    customStatus: row.custom_status,
    accent: row.accent,
    avatarUrl: row.avatar_url ?? null,
    presence: row.presence,
    lastSeen: row.last_seen,
    createdAt: row.created_at,
  };
}

export function selfUser(row) {
  return row ? { ...publicUser(row), email: row.email } : null;
}

export function getUserById(id) {
  return get('SELECT * FROM users WHERE id = ?', id);
}

export function getUserByUsername(username) {
  return get('SELECT * FROM users WHERE username = ?', String(username).toLowerCase());
}

export function getUserByEmail(email) {
  return get('SELECT * FROM users WHERE email = ?', String(email).toLowerCase());
}

export function searchUsers(query, excludeId, limit = 20) {
  const term = `%${String(query).toLowerCase()}%`;
  return all(
    `SELECT * FROM users
      WHERE id != ? AND (username LIKE ? OR lower(display_name) LIKE ?)
      ORDER BY username LIMIT ?`,
    excludeId,
    term,
    term,
    limit,
  ).map(publicUser);
}

/* --------------------------------------------------------------- sessions */

export function createSession(userId) {
  const token = newToken();
  const createdAt = now();
  run(
    'INSERT INTO sessions (token, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)',
    token,
    userId,
    createdAt,
    createdAt + 1000 * 60 * 60 * 24 * 30,
  );
  return token;
}

export function sessionUser(token) {
  if (!token) return null;
  const row = get(
    'SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token = ? AND s.expires_at > ?',
    token,
    now(),
  );
  return row ?? null;
}

export function destroySession(token) {
  if (token) run('DELETE FROM sessions WHERE token = ?', token);
}

/* ---------------------------------------------------------------- servers */

export function listServersForUser(userId) {
  return all(
    `SELECT s.* FROM servers s
       JOIN server_members m ON m.server_id = s.id
      WHERE m.user_id = ?
      ORDER BY s.created_at ASC`,
    userId,
  );
}

export function serverChannels(serverId) {
  return all(
    "SELECT * FROM channels WHERE server_id = ? ORDER BY (type = 'voice') ASC, position ASC, created_at ASC",
    serverId,
  ).map(serializeChannel);
}

export function serializeChannel(row) {
  if (!row) return null;
  return {
    id: row.id,
    serverId: row.server_id,
    name: row.name,
    topic: row.topic,
    type: row.type,
    position: row.position,
    createdAt: row.created_at,
  };
}

export function serializeServer(row, { channels = [], memberCount = 0, member = null } = {}) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    ownerId: row.owner_id,
    accent: row.accent,
    iconUrl: row.icon_url ?? null,
    inviteCode: row.invite_code,
    createdAt: row.created_at,
    channels,
    memberCount,
    member,
  };
}

export function isServerMember(serverId, userId) {
  return Boolean(
    get('SELECT 1 AS ok FROM server_members WHERE server_id = ? AND user_id = ?', serverId, userId),
  );
}

export function serverMemberCount(serverId) {
  return get('SELECT COUNT(*) AS n FROM server_members WHERE server_id = ?', serverId)?.n ?? 0;
}

export function channelById(channelId) {
  return get('SELECT * FROM channels WHERE id = ?', channelId);
}

export function serverMembers(serverId) {
  return all(
    `SELECT u.*, m.nickname AS nickname, m.role AS role, m.joined_at AS joined_at
       FROM server_members m JOIN users u ON u.id = m.user_id
      WHERE m.server_id = ?
      ORDER BY (m.role = 'owner') DESC, lower(u.display_name) ASC`,
    serverId,
  ).map((row) => ({ ...publicUser(row), nickname: row.nickname, role: row.role, joinedAt: row.joined_at }));
}

/** Every user id that should receive realtime events for a server. */
export function serverAudience(serverId) {
  return all('SELECT user_id FROM server_members WHERE server_id = ?', serverId).map((r) => r.user_id);
}

/* -------------------------------------------------------------------- DMs */

export function findDm(userA, userB) {
  const [a, b] = [userA, userB].sort();
  return get('SELECT * FROM dms WHERE user_a = ? AND user_b = ?', a, b);
}

export function createDm(userA, userB) {
  const [a, b] = [userA, userB].sort();
  const id = newId();
  run(
    'INSERT INTO dms (id, user_a, user_b, created_at, last_message_at) VALUES (?, ?, ?, ?, ?)',
    id,
    a,
    b,
    now(),
    now(),
  );
  return get('SELECT * FROM dms WHERE id = ?', id);
}

export function serializeDm(row, viewerId) {
  if (!row) return null;
  const otherId = row.user_a === viewerId ? row.user_b : row.user_a;
  const other = getUserById(otherId);
  const lastMessage = get(
    `SELECT m.*, u.username AS author_username
       FROM messages m JOIN users u ON u.id = m.author_id
      WHERE m.scope = 'dm' AND m.scope_id = ?
      ORDER BY m.created_at DESC LIMIT 1`,
    row.id,
  );
  const lastRead = get(
    "SELECT last_read_at FROM reads WHERE user_id = ? AND scope = 'dm' AND scope_id = ?",
    viewerId,
    row.id,
  );
  const unread = lastMessage
    ? countMessages(
        "scope = 'dm' AND scope_id = ? AND created_at > ? AND author_id != ? AND deleted_at IS NULL",
        [row.id, lastRead?.last_read_at ?? 0, viewerId],
      )
    : 0;
  return {
    id: row.id,
    other: publicUser(other),
    lastMessageAt: row.last_message_at,
    lastMessage: lastMessage
      ? {
          id: lastMessage.id,
          content: lastMessage.deleted_at ? '' : lastMessage.content.slice(0, 140),
          authorId: lastMessage.author_id,
          createdAt: lastMessage.created_at,
          deleted: Boolean(lastMessage.deleted_at),
        }
      : null,
    unread,
  };
}

export function dmParticipants(row) {
  return row ? [row.user_a, row.user_b] : [];
}

/** Every user id that should receive realtime events for a DM. */
export function dmAudience(dmId) {
  const row = get('SELECT * FROM dms WHERE id = ?', dmId);
  return dmParticipants(row);
}

/* --------------------------------------------------------------- messages */

export function countMessages(where, params) {
  return get(`SELECT COUNT(*) AS n FROM messages WHERE ${where}`, ...params)?.n ?? 0;
}

/**
 * Load a page of messages with author, attachments, reactions and reply previews
 * resolved in a handful of bulk queries.
 */
export function loadMessages(rows, viewerId) {
  if (rows.length === 0) return [];
  const ids = rows.map((r) => r.id);
  const placeholders = ids.map(() => '?').join(',');

  const attachments = all(
    `SELECT * FROM attachments WHERE message_id IN (${placeholders})`,
    ...ids,
  );
  const reactions = all(
    `SELECT * FROM reactions WHERE message_id IN (${placeholders})`,
    ...ids,
  );
  const replyIds = [...new Set(rows.map((r) => r.reply_to_id).filter(Boolean))];
  const replies = replyIds.length
    ? all(
        `SELECT m.id, m.author_id, m.content, m.deleted_at, m.scope, m.scope_id, u.display_name, u.username
           FROM messages m JOIN users u ON u.id = m.author_id
          WHERE m.id IN (${replyIds.map(() => '?').join(',')})`,
        ...replyIds,
      )
    : [];

  const attachmentMap = groupBy(attachments, 'message_id');
  const reactionMap = new Map();
  for (const reaction of reactions) {
    const list = reactionMap.get(reaction.message_id) ?? [];
    list.push(reaction);
    reactionMap.set(reaction.message_id, list);
  }
  const replyMap = new Map(replies.map((r) => [r.id, r]));

  return rows.map((row) => serializeMessage(row, viewerId, { attachmentMap, reactionMap, replyMap }));
}

function groupBy(list, key) {
  const map = new Map();
  for (const item of list) {
    const list2 = map.get(item[key]) ?? [];
    list2.push(item);
    map.set(item[key], list2);
  }
  return map;
}

export function serializeMessage(
  row,
  viewerId,
  { attachmentMap = new Map(), reactionMap = new Map(), replyMap = new Map() } = {},
) {
  const author = getUserById(row.author_id);
  const deleted = Boolean(row.deleted_at);

  const rawReactions = reactionMap.get(row.id) ?? [];
  const grouped = new Map();
  for (const reaction of rawReactions) {
    const entry = grouped.get(reaction.emoji) ?? { emoji: reaction.emoji, count: 0, userIds: [] };
    entry.count += 1;
    entry.userIds.push(reaction.user_id);
    grouped.set(reaction.emoji, entry);
  }

  const reply = row.reply_to_id ? replyMap.get(row.reply_to_id) : null;

  return {
    id: row.id,
    scope: row.scope,
    scopeId: row.scope_id,
    authorId: row.author_id,
    author: publicUser(author),
    content: deleted ? '' : row.content,
    createdAt: row.created_at,
    editedAt: row.edited_at ?? null,
    deleted,
    pending: false,
    replyTo: reply
      ? {
          id: reply.id,
          authorId: reply.author_id,
          authorName: reply.display_name ?? reply.username,
          content: reply.deleted_at ? '' : reply.content.slice(0, 200),
          deleted: Boolean(reply.deleted_at),
        }
      : null,
    attachments: (attachmentMap.get(row.id) ?? []).map((a) => ({
      id: a.id,
      url: a.url,
      filename: a.filename,
      mime: a.mime,
      size: a.size,
      width: a.width ?? null,
      height: a.height ?? null,
    })),
    reactions: [...grouped.values()].map((entry) => ({
      emoji: entry.emoji,
      count: entry.count,
      me: viewerId ? entry.userIds.includes(viewerId) : false,
      userIds: entry.userIds,
    })),
  };
}

/** Messages for a scope, newest-last, one page. */
export function messagePage({ scope, scopeId, before, after, limit = 60 }) {
  const params = [scope, scopeId];
  let where = 'scope = ? AND scope_id = ?';
  if (before) {
    where += ' AND created_at < ?';
    params.push(Number(before));
  }
  if (after) {
    where += ' AND created_at > ?';
    params.push(Number(after));
  }
  const rows = all(
    `SELECT * FROM messages WHERE ${where} ORDER BY created_at DESC LIMIT ?`,
    ...params,
    limit,
  );
  return rows.reverse();
}

export function messageById(id) {
  return get('SELECT * FROM messages WHERE id = ?', id);
}

export function attachmentsFor(messageId) {
  return all('SELECT * FROM attachments WHERE message_id = ?', messageId);
}

/* ----------------------------------------------------------------- friends */

export function friendshipBetween(a, b) {
  return get(
    'SELECT * FROM friendships WHERE (requester_id = ? AND addressee_id = ?) OR (requester_id = ? AND addressee_id = ?)',
    a,
    b,
    b,
    a,
  );
}

export function friendshipById(id) {
  return get('SELECT * FROM friendships WHERE id = ?', id);
}

export function serializeFriendship(row, viewerId) {
  const otherId = row.requester_id === viewerId ? row.addressee_id : row.requester_id;
  return {
    id: row.id,
    user: publicUser(getUserById(otherId)),
    direction: row.requester_id === viewerId ? 'outgoing' : 'incoming',
    status: row.status,
    createdAt: row.created_at,
  };
}

export function friendIds(userId) {
  return all(
    `SELECT CASE WHEN requester_id = ? THEN addressee_id ELSE requester_id END AS friend_id
       FROM friendships
      WHERE status = 'accepted' AND (requester_id = ? OR addressee_id = ?)`,
    userId,
    userId,
    userId,
  ).map((r) => r.friend_id);
}

export function listFriendships(userId) {
  return all(
    `SELECT * FROM friendships WHERE requester_id = ? OR addressee_id = ? ORDER BY created_at DESC`,
    userId,
    userId,
  ).map((row) => serializeFriendship(row, userId));
}

export function areFriends(a, b) {
  const row = friendshipBetween(a, b);
  return Boolean(row && row.status === 'accepted');
}

/* ------------------------------------------------------------------- reads */

export function markRead(userId, scope, scopeId, timestamp = now()) {
  run(
    `INSERT INTO reads (user_id, scope, scope_id, last_read_at) VALUES (?, ?, ?, ?)
     ON CONFLICT (user_id, scope, scope_id) DO UPDATE SET last_read_at = MAX(last_read_at, excluded.last_read_at)`,
    userId,
    scope,
    scopeId,
    timestamp,
  );
}

export function lastRead(userId, scope, scopeId) {
  return (
    get(
      'SELECT last_read_at FROM reads WHERE user_id = ? AND scope = ? AND scope_id = ?',
      userId,
      scope,
      scopeId,
    )?.last_read_at ?? 0
  );
}

export function unreadForChannel(userId, channelId) {
  return countMessages(
    "scope = 'channel' AND scope_id = ? AND created_at > ? AND author_id != ? AND deleted_at IS NULL",
    [channelId, lastRead(userId, 'channel', channelId), userId],
  );
}
