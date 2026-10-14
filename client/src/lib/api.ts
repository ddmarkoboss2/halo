import type { Attachment, Bootstrap, Dm, Friendship, Message, PublicProfile, SearchHit, SelfUser, Server, User } from '../types';

export class ApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
    this.name = 'ApiError';
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`/api${path}`, {
    credentials: 'same-origin',
    ...init,
    headers: {
      ...(init.body instanceof FormData ? {} : init.body ? { 'content-type': 'application/json' } : {}),
      ...(init.headers ?? {}),
    },
  });
  const text = await response.text();
  let payload: unknown = null;
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = text;
    }
  }
  if (!response.ok) {
    const message =
      payload && typeof payload === 'object' && 'error' in payload
        ? String((payload as { error: unknown }).error)
        : `Request failed (${response.status})`;
    throw new ApiError(response.status, message);
  }
  return payload as T;
}

const json = (body: unknown): RequestInit => ({ body: JSON.stringify(body) });

export const api = {
  /* ------------------------------------------------------------- auth */
  register: (input: { email: string; username: string; password: string; displayName?: string }) =>
    request<Bootstrap>('/auth/register', { method: 'POST', ...json(input) }),
  login: (input: { identifier: string; password: string }) =>
    request<Bootstrap>('/auth/login', { method: 'POST', ...json(input) }),
  logout: () => request<{ ok: boolean }>('/auth/logout', { method: 'POST' }),
  bootstrap: () => request<Bootstrap>('/auth/me'),
  updateProfile: (input: Partial<{ displayName: string; bio: string; customStatus: string; accent: string; avatarUrl: string | null }>) =>
    request<{ user: SelfUser }>('/auth/me', { method: 'PATCH', ...json(input) }),
  changePassword: (input: { currentPassword: string; password: string }) =>
    request<{ user: SelfUser }>('/auth/me', { method: 'PATCH', ...json(input) }),
  setPresence: (presence: string) => request<{ ok: boolean }>('/auth/presence', { method: 'POST', ...json({ presence }) }),

  /* ---------------------------------------------------------- servers */
  servers: () => request<{ servers: Server[] }>('/servers'),
  createServer: (input: { name: string; description?: string; accent?: string; isPublic?: boolean }) =>
    request<{ server: Server }>('/servers', { method: 'POST', ...json(input) }),
  joinServer: (code: string) => request<{ server: Server }>('/servers/join', { method: 'POST', ...json({ code }) }),
  discoverServers: () => request<{ servers: (Server & { joined: boolean })[] }>('/servers/discover'),
  server: (serverId: string) => request<{ server: Server; members: User[] }>(`/servers/${serverId}`),
  updateServer: (serverId: string, input: Partial<{ name: string; description: string; accent: string; isPublic: boolean }>) =>
    request<{ server: Server }>(`/servers/${serverId}`, { method: 'PATCH', ...json(input) }),
  deleteServer: (serverId: string) => request<{ ok: boolean }>(`/servers/${serverId}`, { method: 'DELETE' }),
  leaveServer: (serverId: string) => request<{ ok: boolean; deleted?: boolean }>(`/servers/${serverId}/leave`, { method: 'POST' }),
  members: (serverId: string) => request<{ members: User[] }>(`/servers/${serverId}/members`),
  createChannel: (serverId: string, input: { name: string; type: 'text' | 'voice'; topic?: string }) =>
    request<{ channel: Server['channels'][number] }>(`/servers/${serverId}/channels`, { method: 'POST', ...json(input) }),
  updateChannel: (channelId: string, input: Partial<{ name: string; topic: string }>) =>
    request<{ channel: Server['channels'][number] }>(`/servers/channels/${channelId}`, { method: 'PATCH', ...json(input) }),
  deleteChannel: (channelId: string) => request<{ ok: boolean }>(`/servers/channels/${channelId}`, { method: 'DELETE' }),

  /* ---------------------------------------------------------- messages */
  messages: (scope: 'channel' | 'dm', scopeId: string, options: { before?: number; limit?: number } = {}) => {
    const params = new URLSearchParams({ scope, scopeId, limit: String(options.limit ?? 60) });
    if (options.before) params.set('before', String(options.before));
    return request<{ messages: Message[]; hasMore: boolean }>(`/messages?${params.toString()}`);
  },
  sendMessage: (input: {
    scope: 'channel' | 'dm';
    scopeId: string;
    content: string;
    replyToId?: string | null;
    attachments?: Attachment[];
  }) => request<{ message: Message }>('/messages', { method: 'POST', ...json(input) }),
  editMessage: (messageId: string, content: string) =>
    request<{ message: Message }>(`/messages/${messageId}`, { method: 'PATCH', ...json({ content }) }),
  deleteMessage: (messageId: string) => request<{ ok: boolean }>(`/messages/${messageId}`, { method: 'DELETE' }),
  toggleReaction: (messageId: string, emoji: string) =>
    request<{ reactions: Message['reactions'] }>(`/messages/${messageId}/reactions`, { method: 'POST', ...json({ emoji }) }),
  markRead: (scope: 'channel' | 'dm', scopeId: string, timestamp?: number) =>
    request<{ ok: boolean; lastReadAt: number }>('/messages/read', { method: 'POST', ...json({ scope, scopeId, timestamp }) }),
  searchMessages: (q: string) => request<{ results: SearchHit[] }>(`/messages/search?q=${encodeURIComponent(q)}`),

  /* --------------------------------------------------------------- dms */
  dms: () => request<{ dms: Dm[] }>('/dms'),
  openDm: (userId: string) => request<{ dm: Dm }>('/dms', { method: 'POST', ...json({ userId }) }),

  /* ----------------------------------------------------------- friends */
  friendships: () => request<{ friendships: Friendship[] }>('/friends'),
  addFriend: (username: string) =>
    request<{ friendship: Friendship; accepted?: boolean }>('/friends/requests', { method: 'POST', ...json({ username }) }),
  acceptFriend: (id: string) => request<{ friendship: Friendship }>(`/friends/requests/${id}/accept`, { method: 'POST' }),
  removeFriendRequest: (id: string) => request<{ ok: boolean }>(`/friends/requests/${id}`, { method: 'DELETE' }),
  removeFriend: (userId: string) => request<{ ok: boolean }>(`/friends/${userId}`, { method: 'DELETE' }),

  /* ------------------------------------------------------------- users */
  searchUsers: (q: string) =>
    request<{ users: (User & { friendship: PublicProfile['friendship'] })[] }>(`/users/search?q=${encodeURIComponent(q)}`),
  user: (userId: string) => request<{ user: PublicProfile }>(`/users/${userId}`),

  /* ----------------------------------------------------------- uploads */
  upload: async (file: File) => {
    const form = new FormData();
    form.append('file', file);
    return request<{ attachment: Attachment }>('/upload', { method: 'POST', body: form });
  },
};

export type Api = typeof api;
