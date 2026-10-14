import { create } from 'zustand';
import type { Socket } from 'socket.io-client';
import { api, ApiError } from './lib/api';
import { createSocket } from './lib/socket';
import { groupKey } from './lib/format';
import { useVoiceStore, voiceEngine } from './lib/webrtc';
import type {
  Attachment,
  Bootstrap,
  CallSummary,
  Friendship,
  Message,
  Presence,
  PublicProfile,
  Server,
  User,
  View,
  VoiceParticipant,
} from './types';

export interface TypingEntry {
  userId: string;
  displayName: string;
  at: number;
}

export interface CallSession extends CallSummary {
  peerSocketIds: string[];
  startedAt: number | null;
}

interface MessageBucket {
  items: Message[];
  hasMore: boolean;
  loaded: boolean;
}

export interface Toast {
  id: string;
  title: string;
  body?: string;
  accent?: string;
  kind?: 'info' | 'error';
}

interface AppState {
  authState: 'loading' | 'signed-out' | 'signed-in';
  boot: Bootstrap | null;
  view: View;
  messages: Record<string, MessageBucket>;
  typing: Record<string, TypingEntry[]>;
  rosters: Record<string, VoiceParticipant[]>;
  members: Record<string, User[]>;
  call: CallSession | null;
  incoming: CallSummary | null;
  outgoing: CallSummary | null;
  toasts: Toast[];
  connection: 'connecting' | 'online' | 'offline';
  searchOpen: boolean;
  memberListOpen: boolean;
  activeProfileId: string | null;
  profile: PublicProfile | null;
  modal: 'create-server' | 'join-server' | 'settings' | 'profile' | 'add-friend' | 'server-settings' | null;
  socket: Socket | null;
  unreadPings: Record<string, number>;

  init: () => Promise<void>;
  signOut: () => Promise<void>;
  signIn: (boot: Bootstrap) => void;
  refresh: () => Promise<void>;
  setView: (view: View) => void;
  loadMessages: (scope: 'channel' | 'dm', scopeId: string, options?: { before?: number }) => Promise<void>;
  sendMessage: (input: {
    scope: 'channel' | 'dm';
    scopeId: string;
    content: string;
    replyToId?: string | null;
    attachments?: Attachment[];
  }) => Promise<void>;
  editMessage: (message: Message, content: string) => Promise<void>;
  deleteMessage: (message: Message) => Promise<void>;
  toggleReaction: (message: Message, emoji: string) => Promise<void>;
  notifyTyping: (scope: 'channel' | 'dm', scopeId: string) => void;
  markRead: (scope: 'channel' | 'dm', scopeId: string) => Promise<void>;
  openDm: (userId: string) => Promise<string | null>;
  openProfile: (userId: string) => Promise<void>;
  closeProfile: () => void;
  startCall: (user: User, dmId: string | null, video: boolean) => void;
  acceptCall: () => void;
  declineCall: () => void;
  endCall: () => void;
  joinVoiceChannel: (channel: Server['channels'][number], serverName: string, video?: boolean) => Promise<void>;
  leaveVoice: () => Promise<void>;
  setPresence: (presence: Presence) => void;
  setModal: (modal: AppState['modal']) => void;
  setSearchOpen: (open: boolean) => void;
  toggleMemberList: () => void;
  pushToast: (toast: Omit<Toast, 'id'>) => void;
  dismissToast: (id: string) => void;
  applyBootstrap: (boot: Bootstrap) => void;
  setMembers: (serverId: string, members: User[]) => void;
}

const emptyBucket = (): MessageBucket => ({ items: [], hasMore: false, loaded: false });

export const useApp = create<AppState>((set, get) => ({
  authState: 'loading',
  boot: null,
  view: { kind: 'home' },
  messages: {},
  typing: {},
  rosters: {},
  members: {},
  call: null,
  incoming: null,
  outgoing: null,
  toasts: [],
  connection: 'connecting',
  searchOpen: false,
  memberListOpen: true,
  activeProfileId: null,
  profile: null,
  modal: null,
  socket: null,
  unreadPings: {},

  init: async () => {
    try {
      const boot = await api.bootstrap();
      set({ boot, authState: 'signed-in' });
      connectRealtime(set, get);
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        set({ authState: 'signed-out' });
        return;
      }
      set({ authState: 'signed-out' });
    }
  },

  signIn: (boot) => {
    set({ boot, authState: 'signed-in' });
    connectRealtime(set, get);
  },

  signOut: async () => {
    await api.logout().catch(() => undefined);
    get().socket?.disconnect();
    await voiceEngine.leave();
    set({
      authState: 'signed-out',
      boot: null,
      socket: null,
      messages: {},
      typing: {},
      rosters: {},
      call: null,
      incoming: null,
      outgoing: null,
      view: { kind: 'home' },
    });
  },

  refresh: async () => {
    const boot = await api.bootstrap();
    set({ boot });
    const { view } = get();
    if (view.kind === 'channel') await loadMembers(get, view.serverId);
  },

  applyBootstrap: (boot) => set({ boot }),

  setView: (view) => {
    set({ view, activeProfileId: null, profile: null, searchOpen: false });
    if (view.kind === 'channel') {
      void loadMembers(get, view.serverId);
    }
  },

  loadMessages: async (scope, scopeId, options = {}) => {
    const key = groupKey(scope, scopeId);
    const bucket = get().messages[key] ?? emptyBucket();
    if (options.before === undefined && bucket.loaded) return;
    const result = await api.messages(scope, scopeId, { before: options.before, limit: 60 });
    set((state) => {
      const current = state.messages[key] ?? emptyBucket();
      const merged = options.before === undefined ? result.messages : [...result.messages, ...current.items];
      const deduped = dedupe(merged);
      return {
        messages: {
          ...state.messages,
          [key]: { items: deduped, hasMore: result.hasMore, loaded: true },
        },
      };
    });
  },

  sendMessage: async (input) => {
    const key = groupKey(input.scope, input.scopeId);
    const optimistic: Message = {
      id: `pending-${crypto.randomUUID()}`,
      scope: input.scope,
      scopeId: input.scopeId,
      authorId: get().boot?.me.id ?? '',
      author: get().boot?.me ?? null,
      content: input.content,
      createdAt: Date.now(),
      editedAt: null,
      deleted: false,
      replyTo: null,
      attachments: input.attachments ?? [],
      reactions: [],
      pending: true,
    };
    set((state) => {
      const bucket = state.messages[key] ?? emptyBucket();
      return { messages: { ...state.messages, [key]: { ...bucket, items: [...bucket.items, optimistic] } } };
    });
    try {
      const { message } = await api.sendMessage(input);
      set((state) => {
        const bucket = state.messages[key] ?? emptyBucket();
        const items = bucket.items.map((item) => (item.id === optimistic.id ? message : item));
        return { messages: { ...state.messages, [key]: { ...bucket, items: dedupe(items) } } };
      });
      const boot = get().boot;
      if (input.scope === 'dm' && boot) {
        const preview = message.content.slice(0, 140);
        set({
          boot: {
            ...boot,
            dms: boot.dms
              .map((dm) =>
                dm.id === input.scopeId
                  ? { ...dm, lastMessageAt: message.createdAt, lastMessage: { id: message.id, content: preview, authorId: message.authorId, createdAt: message.createdAt, deleted: false } }
                  : dm,
              )
              .sort((a, b) => b.lastMessageAt - a.lastMessageAt),
          },
        });
      }
    } catch (error) {
      set((state) => {
        const bucket = state.messages[key] ?? emptyBucket();
        const items = bucket.items.map((item) => (item.id === optimistic.id ? { ...item, pending: false, failed: true } : item));
        return { messages: { ...state.messages, [key]: { ...bucket, items } } };
      });
      get().pushToast({ title: 'Message not sent', body: error instanceof Error ? error.message : 'Unknown error', kind: 'error' });
    }
  },

  editMessage: async (message, content) => {
    await api.editMessage(message.id, content);
  },

  deleteMessage: async (message) => {
    await api.deleteMessage(message.id);
  },

  toggleReaction: async (message, emoji) => {
    const key = groupKey(message.scope, message.scopeId);
    const me = get().boot?.me.id ?? '';
    set((state) => {
      const bucket = state.messages[key];
      if (!bucket) return {};
      const items = bucket.items.map((item) => {
        if (item.id !== message.id) return item;
        const existing = item.reactions.find((r) => r.emoji === emoji);
        if (!existing) {
          return { ...item, reactions: [...item.reactions, { emoji, count: 1, me: true, userIds: [me] }] };
        }
        if (existing.me) {
          const userIds = existing.userIds.filter((id) => id !== me);
          const reactions = userIds.length
            ? item.reactions.map((r) => (r.emoji === emoji ? { ...r, count: userIds.length, me: false, userIds } : r))
            : item.reactions.filter((r) => r.emoji !== emoji);
          return { ...item, reactions };
        }
        const userIds = [...existing.userIds, me];
        return {
          ...item,
          reactions: item.reactions.map((r) => (r.emoji === emoji ? { ...r, count: userIds.length, me: true, userIds } : r)),
        };
      });
      return { messages: { ...state.messages, [key]: { ...bucket, items } } };
    });
    try {
      await api.toggleReaction(message.id, emoji);
    } catch {
      get().pushToast({ title: 'Reaction failed', kind: 'error' });
    }
  },

  notifyTyping: (scope, scopeId) => {
    get().socket?.emit('typing', { scope, scopeId });
  },

  markRead: async (scope, scopeId) => {
    const key = groupKey(scope, scopeId);
    const bucket = get().messages[key];
    const last = bucket?.items.filter((m) => !m.pending).at(-1);
    await api.markRead(scope, scopeId, last?.createdAt ?? Date.now()).catch(() => undefined);
    if (scope === 'dm') {
      const boot = get().boot;
      if (boot) set({ boot: { ...boot, dms: boot.dms.map((dm) => (dm.id === scopeId ? { ...dm, unread: 0 } : dm)) } });
    } else {
      const boot = get().boot;
      if (boot) {
        set({
          boot: {
            ...boot,
            servers: boot.servers.map((server) => ({
              ...server,
              channels: server.channels.map((channel) => (channel.id === scopeId ? { ...channel, unread: 0 } : channel)),
            })),
          },
        });
      }
    }
  },

  openDm: async (userId) => {
    try {
      const { dm } = await api.openDm(userId);
      const boot = get().boot;
      if (boot && !boot.dms.some((d) => d.id === dm.id)) {
        set({ boot: { ...boot, dms: [dm, ...boot.dms] } });
      }
      set({ view: { kind: 'dm', dmId: dm.id } });
      return dm.id;
    } catch (error) {
      get().pushToast({ title: 'Could not open DM', body: error instanceof Error ? error.message : '', kind: 'error' });
      return null;
    }
  },

  openProfile: async (userId) => {
    set({ activeProfileId: userId, profile: null });
    try {
      const { user } = await api.user(userId);
      set({ profile: user });
    } catch {
      set({ activeProfileId: null, profile: null });
    }
  },

  closeProfile: () => set({ activeProfileId: null, profile: null }),

  /* ------------------------------------------------------------ calling */

  startCall: (user, dmId, video) => {
    const socket = get().socket;
    if (!socket) return;
    socket.emit('call:start', { userId: user.id, dmId, video });
  },

  acceptCall: () => {
    const incoming = get().incoming;
    const socket = get().socket;
    if (!incoming || !socket) return;
    socket.emit('call:accept', { callId: incoming.id });
    set({ incoming: null, call: { ...incoming, status: 'accepted', peerSocketIds: [], startedAt: Date.now() } });
  },

  declineCall: () => {
    const incoming = get().incoming;
    if (!incoming) return;
    get().socket?.emit('call:decline', { callId: incoming.id });
    set({ incoming: null });
    void voiceEngine.leave();
  },

  endCall: () => {
    const active = get().call ?? get().outgoing ?? get().incoming;
    if (active) get().socket?.emit('call:end', { callId: active.id });
    set({ call: null, incoming: null, outgoing: null });
    void voiceEngine.leave();
  },

  joinVoiceChannel: async (channel, serverName, video = false) => {
    await voiceEngine.joinChannel(channel.id, `${serverName} · ${channel.name}`, { video });
  },

  leaveVoice: async () => {
    await voiceEngine.leave();
  },

  setPresence: (presence) => {
    get().socket?.emit('presence:set', { presence });
    const boot = get().boot;
    if (boot) set({ boot: { ...boot, me: { ...boot.me, presence } } });
  },

  setModal: (modal) => set({ modal }),
  setSearchOpen: (open) => set({ searchOpen: open }),
  toggleMemberList: () => set((state) => ({ memberListOpen: !state.memberListOpen })),

  pushToast: (toast) => {
    const id = crypto.randomUUID();
    set((state) => ({ toasts: [...state.toasts.slice(-3), { ...toast, id }] }));
    window.setTimeout(() => get().dismissToast(id), 6000);
  },

  dismissToast: (id) => set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) })),

  setMembers: (serverId, members) => set((state) => ({ members: { ...state.members, [serverId]: members } })),
}));

/* ------------------------------------------------------------------ helpers */

type Setter = (partial: Partial<AppState> | ((state: AppState) => Partial<AppState>)) => void;
type Getter = () => AppState;

async function loadMembers(get: Getter, serverId: string) {
  try {
    const { members } = await api.members(serverId);
    get().setMembers(serverId, members);
  } catch {
    /* not a member anymore */
  }
}

function dedupe(messages: Message[]): Message[] {
  const map = new Map<string, Message>();
  for (const message of messages) {
    const key = message.pending ? message.id : message.id;
    map.set(key, message);
  }
  return [...map.values()].sort((a, b) => a.createdAt - b.createdAt);
}

function connectRealtime(set: Setter, get: Getter) {
  get().socket?.disconnect();
  const socket = createSocket();
  voiceEngine.setSocket(socket);
  set({ socket, connection: 'connecting' });

  socket.on('connect', () => {
    set({ connection: 'online' });
    voiceEngine.rejoin();
    void get().refresh();
  });
  socket.on('disconnect', () => set({ connection: 'offline' }));
  socket.on('connect_error', (error) => {
    set({
      connection: 'offline',
      authState: error.message === 'unauthorized' ? 'signed-out' : get().authState,
    });
  });

  socket.on('realtime:ready', (payload: { rosters: { scopeId: string; participants: VoiceParticipant[] }[] }) => {
    const rosters: Record<string, VoiceParticipant[]> = {};
    for (const roster of payload.rosters ?? []) rosters[groupKey('channel', roster.scopeId)] = roster.participants;
    set({ rosters });
  });

  socket.on('state:refresh', () => {
    void get().refresh();
  });

  socket.on('user:update', (user: User & { email?: string }) => {
    const boot = get().boot;
    if (!boot) return;
    if (user.id === boot.me.id) {
      set({ boot: { ...boot, me: { ...boot.me, ...user, email: user.email ?? boot.me.email } } });
      return;
    }
    set({
      boot: {
        ...boot,
        friends: boot.friends.map((f) => (f.id === user.id ? { ...f, ...user } : f)),
        dms: boot.dms.map((dm) => (dm.other?.id === user.id ? { ...dm, other: { ...dm.other, ...user } } : dm)),
      },
    });
  });

  socket.on(
    'message:new',
    (message: Message & { scope: 'channel' | 'dm'; scopeId: string }) => {
      const key = groupKey(message.scope, message.scopeId);
      const state = get();
      const boot = state.boot;
      set((s) => {
        const bucket = s.messages[key] ?? emptyBucket();
        if (bucket.items.some((item) => item.id === message.id)) return {};
        return { messages: { ...s.messages, [key]: { ...bucket, items: [...bucket.items, message] } } };
      });

      if (!boot) return;
      const isMine = message.authorId === boot.me.id;
      const viewing =
        state.view.kind === 'channel'
          ? message.scope === 'channel' && state.view.channelId === message.scopeId
          : state.view.kind === 'dm'
            ? message.scope === 'dm' && state.view.dmId === message.scopeId
            : false;

      if (message.scope === 'dm') {
        const preview = message.deleted ? '' : message.content.slice(0, 140);
        const dms = boot.dms.map((dm) =>
          dm.id === message.scopeId
            ? {
                ...dm,
                lastMessageAt: message.createdAt,
                lastMessage: {
                  id: message.id,
                  content: preview,
                  authorId: message.authorId,
                  createdAt: message.createdAt,
                  deleted: message.deleted,
                },
                unread: isMine || viewing ? 0 : dm.unread + 1,
              }
            : dm,
        );
        if (!dms.some((dm) => dm.id === message.scopeId)) {
          void api.openDm(message.authorId).then(({ dm }) => {
            const current = get().boot;
            if (current && !current.dms.some((d) => d.id === dm.id)) set({ boot: { ...current, dms: [dm, ...current.dms] } });
          });
        }
        set({ boot: { ...boot, dms: dms.sort((a, b) => b.lastMessageAt - a.lastMessageAt) } });
      } else if (!isMine && !viewing) {
        set({
          boot: {
            ...boot,
            servers: boot.servers.map((server) => ({
              ...server,
              channels: server.channels.map((channel) =>
                channel.id === message.scopeId ? { ...channel, unread: (channel.unread ?? 0) + 1 } : channel,
              ),
            })),
          },
        });
      }

      if (!isMine && !viewing) {
        set({ unreadPings: { ...state.unreadPings, [key]: Date.now() } });
      }
      if (viewing) void get().markRead(message.scope, message.scopeId);
    },
  );

  socket.on('message:update', (message: Message) => {
    const key = groupKey(message.scope, message.scopeId);
    set((state) => {
      const bucket = state.messages[key];
      if (!bucket) return {};
      return {
        messages: { ...state.messages, [key]: { ...bucket, items: bucket.items.map((m) => (m.id === message.id ? message : m)) } },
      };
    });
  });

  socket.on('message:delete', (payload: { id: string; scope: 'channel' | 'dm'; scopeId: string }) => {
    const key = groupKey(payload.scope, payload.scopeId);
    set((state) => {
      const bucket = state.messages[key];
      if (!bucket) return {};
      return { messages: { ...state.messages, [key]: { ...bucket, items: bucket.items.filter((m) => m.id !== payload.id) } } };
    });
  });

  socket.on('reaction:update', (payload: { messageId: string; scope: 'channel' | 'dm'; scopeId: string; reactions: Message['reactions'] }) => {
    const me = get().boot?.me.id ?? '';
    const key = groupKey(payload.scope, payload.scopeId);
    set((state) => {
      const bucket = state.messages[key];
      if (!bucket) return {};
      const items = bucket.items.map((message) =>
        message.id === payload.messageId
          ? {
              ...message,
              reactions: payload.reactions.map((reaction) => ({
                ...reaction,
                me: reaction.userIds.includes(me),
              })),
            }
          : message,
      );
      return { messages: { ...state.messages, [key]: { ...bucket, items } } };
    });
  });

  socket.on('typing', (payload: { scope: 'channel' | 'dm'; scopeId: string; userId: string; displayName: string; at: number }) => {
    const key = groupKey(payload.scope, payload.scopeId);
    set((state) => {
      const current = (state.typing[key] ?? []).filter((entry) => entry.userId !== payload.userId && Date.now() - entry.at < 5000);
      return { typing: { ...state.typing, [key]: [...current, { userId: payload.userId, displayName: payload.displayName, at: payload.at }] } };
    });
    window.setTimeout(() => {
      set((state) => {
        const current = state.typing[key] ?? [];
        const next = current.filter((entry) => Date.now() - entry.at < 4000);
        if (next.length === current.length) return {};
        return { typing: { ...state.typing, [key]: next } };
      });
    }, 4200);
  });

  socket.on('presence:update', (payload: { userId: string; presence: Presence }) => {
    const boot = get().boot;
    if (!boot) return;
    set({
      boot: {
        ...boot,
        friends: boot.friends.map((f) => (f.id === payload.userId ? { ...f, presence: payload.presence } : f)),
        dms: boot.dms.map((dm) => (dm.other?.id === payload.userId ? { ...dm, other: { ...dm.other, presence: payload.presence } } : dm)),
      },
    });
  });

  socket.on('server:member-joined', () => void get().refresh());

  socket.on('voice:roster', (payload: { scope: 'channel' | 'dm'; scopeId: string; participants: VoiceParticipant[] }) => {
    const key = groupKey(payload.scope, payload.scopeId);
    set((state) => {
      const rosters = { ...state.rosters };
      if (payload.participants.length === 0) delete rosters[key];
      else rosters[key] = payload.participants;
      return { rosters };
    });
  });

  socket.on('voice:rosters', (payload: { scopeId: string; participants: VoiceParticipant[] }[]) => {
    const rosters: Record<string, VoiceParticipant[]> = { ...get().rosters };
    for (const roster of payload) {
      const key = groupKey('channel', roster.scopeId);
      if (roster.participants.length === 0) delete rosters[key];
      else rosters[key] = roster.participants;
    }
    set({ rosters });
  });

  socket.on(
    'voice:joined',
    (payload: { key: string; peers: { socketId: string; userId: string; muted: boolean; video: boolean; screen: boolean }[] }) => {
      for (const peer of payload.peers) {
        voiceEngine.addPeer(peer.socketId, peer.userId, true);
        voiceEngine.setPeerFlags(peer.socketId, { micOn: !peer.muted, video: peer.video, screen: peer.screen });
      }
    },
  );

  socket.on(
    'voice:peer-joined',
    (payload: { socketId: string; userId: string; muted: boolean; video: boolean; screen: boolean }) => {
      voiceEngine.addPeer(payload.socketId, payload.userId, false);
      voiceEngine.setPeerFlags(payload.socketId, { micOn: !payload.muted, video: payload.video, screen: payload.screen });
    },
  );

  socket.on('voice:peer-left', (payload: { socketId: string }) => voiceEngine.removePeer(payload.socketId));

  socket.on(
    'voice:peer-state',
    (payload: { socketId: string; muted: boolean; video: boolean; screen: boolean }) => {
      voiceEngine.setPeerFlags(payload.socketId, { micOn: !payload.muted, video: payload.video, screen: payload.screen });
    },
  );

  socket.on('signal', (payload: { from: string; callId: string | null; payload: { description?: RTCSessionDescriptionInit; candidate?: RTCIceCandidateInit } }) => {
    void voiceEngine.handleSignal(payload.from, payload.payload ?? {});
  });

  /* --------------------------------------------------------------- calls */

  socket.on('call:ringing', (payload: { call: CallSummary }) => {
    set({ outgoing: payload.call });
  });

  socket.on('call:incoming', (payload: { call: CallSummary }) => {
    const state = get();
    if (state.call) {
      socket.emit('call:decline', { callId: payload.call.id });
      return;
    }
    set({ incoming: payload.call });
  });

  socket.on('call:accepted', (payload: { callId: string; dmId: string | null; video: boolean; participants: { userId: string; socketIds: string[] }[] }) => {
    const me = get().boot?.me.id ?? '';
    const peerSocketIds = payload.participants
      .filter((participant) => participant.userId !== me)
      .flatMap((participant) => participant.socketIds);
    const base: CallSummary | null = get().call ?? get().incoming ?? get().outgoing ?? null;
    const withUser = base?.with ?? null;
    set({
      incoming: null,
      call: {
        id: payload.callId,
        video: payload.video,
        createdAt: base?.createdAt ?? Date.now(),
        status: 'accepted',
        direction: base?.direction ?? 'outgoing',
        with: withUser,
        dmId: payload.dmId,
        peerSocketIds,
        startedAt: Date.now(),
      },
      outgoing: null,
    });
    void voiceEngine.joinCall(payload.callId, withUser?.displayName ?? 'Call', peerSocketIds, { video: payload.video });
  });

  socket.on('call:declined', () => {
    get().pushToast({ title: 'Call declined', kind: 'info' });
    set({ call: null, outgoing: null, incoming: null });
    void voiceEngine.leave();
  });

  socket.on('call:missed', () => {
    get().pushToast({ title: 'No answer', kind: 'info' });
    set({ outgoing: null });
  });

  socket.on('call:ended', () => {
    set({ call: null, outgoing: null, incoming: null });
    void voiceEngine.leave();
  });

  socket.on('call:error', (payload: { message: string }) => {
    get().pushToast({ title: 'Call failed', body: payload.message, kind: 'error' });
    set({ outgoing: null });
  });

  socket.on('call:peer-state', (payload: { userId: string; muted: boolean; video: boolean; screen: boolean }) => {
    const call = get().call;
    if (!call) return;
    for (const socketId of call.peerSocketIds) {
      voiceEngine.setPeerFlags(socketId, { micOn: !payload.muted, video: payload.video, screen: payload.screen });
    }
  });

  socket.on('friend:request', (payload: Friendship) => {
    const boot = get().boot;
    if (!boot) return;
    get().pushToast({
      title: 'New friend request',
      body: `${payload.user.displayName} (@${payload.user.username}) wants to connect.`,
      accent: payload.user.accent,
    });
    if (!boot.friendships.some((f) => f.id === payload.id)) {
      set({ boot: { ...boot, friendships: [payload, ...boot.friendships] } });
    }
  });

  socket.on('friend:accepted', (payload: Friendship) => {
    void get().refresh();
    get().pushToast({
      title: 'Friend request accepted',
      body: `${payload.user.displayName} is now a friend.`,
      accent: payload.user.accent,
    });
  });
}

export { useVoiceStore };
