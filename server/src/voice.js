import { all, get } from './db.js';
import { canAccessScope } from './access.js';
import {
  emitToScope,
  emitToUsers,
  getIo,
  socketIdsForUser,
  userRoom,
} from './events.js';
import { channelById, getUserById, newId, now, publicUser } from './store.js';

/** key -> Map<socketId, { userId, muted, video, screen, joinedAt }> */
const voiceRooms = new Map();
/** callId -> call record */
const calls = new Map();
/** socketId -> Set<callId> */
const callsBySocket = new Map();

const voiceRoomKey = (scope, scopeId) => `voice:${scope}:${scopeId}`;
const CALL_RING_TIMEOUT = 60_000;

export function voiceKeyFor(scope, scopeId) {
  return voiceRoomKey(scope, scopeId);
}

export function roomParticipants(scope, scopeId) {
  const room = voiceRooms.get(voiceRoomKey(scope, scopeId));
  if (!room) return [];
  return [...room.entries()].map(([socketId, state]) => ({
    socketId,
    userId: state.userId,
    muted: Boolean(state.muted),
    video: Boolean(state.video),
    screen: Boolean(state.screen),
    speaking: Boolean(state.speaking),
    joinedAt: state.joinedAt,
  }));
}

export function channelRostersFor(userId) {
  const channelIds = all(
    `SELECT c.id FROM channels c
       JOIN server_members m ON m.server_id = c.server_id
      WHERE m.user_id = ? AND c.type = 'voice'`,
    userId,
  ).map((r) => r.id);
  const rosters = [];
  for (const channelId of channelIds) {
    const participants = roomParticipants('channel', channelId);
    if (participants.length) rosters.push({ scope: 'channel', scopeId: channelId, participants });
  }
  return rosters;
}

function broadcastRoster(scope, scopeId) {
  emitToScope(scope, scopeId, 'voice:roster', {
    scope,
    scopeId,
    participants: roomParticipants(scope, scopeId),
  });
}

function addParticipant(scope, scopeId, socket, state) {
  const key = voiceRoomKey(scope, scopeId);
  const room = voiceRooms.get(key) ?? new Map();
  const peers = [...room.entries()].map(([socketId, s]) => ({ socketId, userId: s.userId, ...s }));
  room.set(socket.id, { userId: socket.data.userId, joinedAt: now(), muted: false, video: false, screen: false, ...state });
  voiceRooms.set(key, room);
  socket.join(key);
  socket.emit('voice:joined', { scope, scopeId, key, peers });
  socket.to(key).emit('voice:peer-joined', {
    scope,
    scopeId,
    socketId: socket.id,
    userId: socket.data.userId,
    ...room.get(socket.id),
  });
  broadcastRoster(scope, scopeId);
  return room;
}

function removeParticipant(socket, scope, scopeId) {
  const key = voiceRoomKey(scope, scopeId);
  const room = voiceRooms.get(key);
  if (!room || !room.has(socket.id)) return false;
  room.delete(socket.id);
  socket.leave(key);
  if (room.size === 0) voiceRooms.delete(key);
  socket.to(key).emit('voice:peer-left', { scope, scopeId, socketId: socket.id });
  broadcastRoster(scope, scopeId);
  return true;
}

function updateParticipantState(socket, scope, scopeId, patch) {
  const room = voiceRooms.get(voiceRoomKey(scope, scopeId));
  const current = room?.get(socket.id);
  if (!current) return null;
  const next = { ...current, ...patch };
  room.set(socket.id, next);
  socket.to(voiceRoomKey(scope, scopeId)).emit('voice:peer-state', {
    scope,
    scopeId,
    socketId: socket.id,
    userId: socket.data.userId,
    ...next,
  });
  const visibleChange = ['muted', 'video', 'screen'].some((field) => current[field] !== next[field]);
  if (visibleChange) broadcastRoster(scope, scopeId);
  return next;
}

export function handleVoiceEvent(socket, event, payload = {}) {
  const io = getIo();
  if (!io) return;
  const scope = payload.scope === 'dm' ? 'dm' : 'channel';
  const scopeId = String(payload.scopeId ?? '');

  switch (event) {
    case 'voice:join': {
      if (scope === 'channel') {
        const channel = channelById(scopeId);
        if (!channel || channel.type !== 'voice') return;
        if (!canAccessScope(socket.data.userId, 'channel', scopeId)) return;
      }
      addParticipant(scope, scopeId, socket, {
        muted: Boolean(payload.muted),
        video: Boolean(payload.video),
        screen: Boolean(payload.screen),
      });
      break;
    }
    case 'voice:leave': {
      removeParticipant(socket, scope, scopeId);
      break;
    }
    case 'voice:state': {
      updateParticipantState(socket, scope, scopeId, {
        muted: Boolean(payload.muted),
        video: Boolean(payload.video),
        screen: Boolean(payload.screen),
        speaking: Boolean(payload.speaking),
      });
      break;
    }
    default:
      break;
  }
}

/* ------------------------------------------------------------------ DM calls */

function callFor(callId) {
  return calls.get(callId);
}

function serializeCall(call, viewerId) {
  const otherId = call.callerId === viewerId ? call.calleeId : call.callerId;
  return {
    id: call.id,
    video: call.video,
    createdAt: call.createdAt,
    status: call.status,
    direction: call.callerId === viewerId ? 'outgoing' : 'incoming',
    with: call.kind === 'dm' ? publicUser(getUserById(otherId)) : null,
    dmId: call.dmId ?? null,
  };
}

function endCall(callId, reason) {
  const call = calls.get(callId);
  if (!call) return;
  clearTimeout(call.timer);
  calls.delete(callId);
  for (const socketId of call.sockets) {
    const set = callsBySocket.get(socketId);
    set?.delete(callId);
    if (set && set.size === 0) callsBySocket.delete(socketId);
  }
  emitToUsers([call.callerId, call.calleeId], 'call:ended', { callId, reason });
}

export function handleCallEvent(socket, event, payload = {}) {
  const io = getIo();
  if (!io) return;
  const userId = socket.data.userId;

  switch (event) {
    case 'call:start': {
      const target = getUserById(String(payload.userId ?? ''));
      if (!target || target.id === userId) return;
      const active = [...calls.values()].find(
        (c) => c.status !== 'ended' && (c.callerId === userId || c.calleeId === userId),
      );
      if (active) {
        socket.emit('call:error', { callId: active.id, message: 'You are already in a call' });
        return;
      }
      if (!payload.force) {
        const busy = [...calls.values()].find(
          (c) => c.status === 'accepted' && (c.callerId === target.id || c.calleeId === target.id),
        );
        if (busy) {
          socket.emit('call:error', { callId: null, message: `${target.display_name} is on another call` });
          return;
        }
      }

      const call = {
        id: newId(),
        kind: 'dm',
        callerId: userId,
        calleeId: target.id,
        video: Boolean(payload.video),
        dmId: payload.dmId ? String(payload.dmId) : null,
        status: 'ringing',
        createdAt: now(),
        sockets: new Set(),
      };
      call.sockets.add(socket.id);
      callsBySocket.set(socket.id, new Set([call.id]));
      call.timer = setTimeout(() => {
        const current = calls.get(call.id);
        if (current && current.status === 'ringing') {
          emitToUsers([current.callerId], 'call:missed', { callId: current.id });
          endCall(current.id, 'no-answer');
        }
      }, CALL_RING_TIMEOUT);
      calls.set(call.id, call);

      socket.emit('call:ringing', { call: serializeCall(call, userId) });
      emitToUsers([target.id], 'call:incoming', { call: serializeCall(call, target.id) });
      break;
    }

    case 'call:accept': {
      const call = callFor(String(payload.callId ?? ''));
      if (!call || call.calleeId !== userId) return;
      call.status = 'accepted';
      clearTimeout(call.timer);
      call.sockets.add(socket.id);
      const set = callsBySocket.get(socket.id) ?? new Set();
      set.add(call.id);
      callsBySocket.set(socket.id, set);

      const callerSockets = socketIdsForUser(call.callerId);
      for (const id of callerSockets) {
        const existing = callsBySocket.get(id) ?? new Set();
        existing.add(call.id);
        callsBySocket.set(id, existing);
        calls.get(call.id).sockets.add(id);
      }
      emitToUsers([call.callerId, call.calleeId], 'call:accepted', {
        callId: call.id,
        video: call.video,
        dmId: call.dmId,
        participants: [
          { userId: call.callerId, socketIds: callerSockets },
          { userId: call.calleeId, socketIds: socketIdsForUser(call.calleeId) },
        ],
      });
      break;
    }

    case 'call:decline': {
      const call = callFor(String(payload.callId ?? ''));
      if (!call || call.calleeId !== userId) return;
      emitToUsers([call.callerId], 'call:declined', { callId: call.id });
      endCall(call.id, 'declined');
      break;
    }

    case 'call:end': {
      const call = callFor(String(payload.callId ?? ''));
      if (!call || (call.callerId !== userId && call.calleeId !== userId)) return;
      endCall(call.id, payload.reason ?? 'hangup');
      break;
    }

    case 'call:state': {
      const call = callFor(String(payload.callId ?? ''));
      if (!call || (call.callerId !== userId && call.calleeId !== userId)) return;
      const other = call.callerId === userId ? call.calleeId : call.callerId;
      emitToUsers([other], 'call:peer-state', {
        callId: call.id,
        userId,
        muted: Boolean(payload.muted),
        video: Boolean(payload.video),
        screen: Boolean(payload.screen),
      });
      break;
    }

    case 'signal': {
      const target = String(payload.to ?? '');
      if (!target) return;
      io.to(target).emit('signal', {
        from: socket.id,
        callId: payload.callId ?? null,
        payload: payload.payload ?? null,
      });
      break;
    }

    default:
      break;
  }
}

export function handleDisconnect(socket) {
  for (const [key, room] of [...voiceRooms.entries()]) {
    if (!room.has(socket.id)) continue;
    const [, scope, scopeId] = key.split(':');
    removeParticipant(socket, scope, scopeId);
  }
  for (const callId of [...(callsBySocket.get(socket.id) ?? [])]) {
    const call = calls.get(callId);
    if (!call) continue;
    const mySockets = socketIdsForUser(socket.data.userId);
    const stillHere = mySockets.some(
      (id) => id !== socket.id && Boolean(getIo()?.sockets?.sockets?.get(id)?.connected),
    );
    if (stillHere) continue;
    endCall(callId, call.status === 'ringing' ? 'cancelled' : 'disconnected');
  }
  callsBySocket.delete(socket.id);
  return userRoom(socket.data.userId);
}

export function activeCallCount() {
  return calls.size;
}
