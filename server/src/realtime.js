import { Server } from 'socket.io';
import { parse as parseCookie } from 'cookie';
import { config } from './config.js';
import { all, run } from './db.js';
import {
  emitToScope,
  getIo,
  registerSocket,
  scopeRoom,
  setIo,
  setResyncHandler,
  socketCount,
  unregisterSocket,
  userRoom,
} from './events.js';
import { broadcastPresence, markOffline } from './presence.js';
import { canAccessScope } from './access.js';
import { sessionUser } from './store.js';
import { channelRostersFor, handleCallEvent, handleDisconnect, handleVoiceEvent } from './voice.js';

const TYPING_THROTTLE_MS = 350;

/** Every channel and DM room this user should receive message events for. */
export function subscriptionRooms(userId) {
  const channels = all(
    `SELECT c.id FROM channels c
       JOIN server_members m ON m.server_id = c.server_id
      WHERE m.user_id = ?`,
    userId,
  ).map((row) => row.id);
  const dms = all('SELECT id FROM dms WHERE user_a = ? OR user_b = ?', userId, userId).map((row) => row.id);
  return [
    ...channels.map((id) => scopeRoom('channel', id)),
    ...dms.map((id) => scopeRoom('dm', id)),
  ];
}

export function attachRealtime(httpServer) {
  const io = new Server(httpServer, {
    path: '/socket.io',
    serveClient: false,
    maxHttpBufferSize: 1e6,
    pingTimeout: 25_000,
  });
  setIo(io);

  // Structural changes (a new server, channel or DM) must re-subscribe live sockets.
  setResyncHandler((userId) => {
    const rooms = subscriptionRooms(userId);
    if (rooms.length) io.in(userRoom(userId)).socketsJoin(rooms);
  });

  io.use((socket, next) => {
    const cookies = parseCookie(socket.handshake.headers.cookie ?? '');
    const token = cookies[config.cookieName] ?? socket.handshake.auth?.token ?? null;
    const user = sessionUser(token);
    if (!user) return next(new Error('unauthorized'));
    socket.data.userId = user.id;
    socket.data.username = user.username;
    socket.data.displayName = user.display_name;
    socket.data.typingAt = 0;
    return next();
  });

  io.on('connection', (socket) => {
    const userId = socket.data.userId;
    registerSocket(userId, socket.id);
    socket.join(userRoom(userId));
    for (const room of subscriptionRooms(userId)) socket.join(room);

    run('UPDATE users SET presence = ?, last_seen = ? WHERE id = ?', 'online', Date.now(), userId);
    socket.emit('realtime:ready', { userId, sessionId: socket.id, rosters: channelRostersFor(userId) });
    broadcastPresence(userId, 'online');

    socket.on('presence:set', (payload = {}) => {
      const presence = ['online', 'idle', 'dnd'].includes(payload.presence) ? payload.presence : 'online';
      run('UPDATE users SET presence = ? WHERE id = ?', presence, userId);
      broadcastPresence(userId, presence);
    });

    socket.on('typing', (payload = {}) => {
      const scope = payload.scope === 'dm' ? 'dm' : 'channel';
      const scopeId = String(payload.scopeId ?? '');
      if (!scopeId || !canAccessScope(userId, scope, scopeId)) return;
      const timestamp = Date.now();
      if (timestamp - socket.data.typingAt < TYPING_THROTTLE_MS) return;
      socket.data.typingAt = timestamp;
      emitToScope(
        scope,
        scopeId,
        'typing',
        {
          scope,
          scopeId,
          userId,
          displayName: socket.data.displayName,
          username: socket.data.username,
          at: timestamp,
        },
        socket.id,
      );
    });

    socket.on('voice:join', (payload) => handleVoiceEvent(socket, 'voice:join', payload));
    socket.on('voice:leave', (payload) => handleVoiceEvent(socket, 'voice:leave', payload));
    socket.on('voice:state', (payload) => handleVoiceEvent(socket, 'voice:state', payload));
    socket.on('voice:rosters', () => socket.emit('voice:rosters', channelRostersFor(userId)));
    socket.on('call:start', (payload) => handleCallEvent(socket, 'call:start', payload));
    socket.on('call:accept', (payload) => handleCallEvent(socket, 'call:accept', payload));
    socket.on('call:decline', (payload) => handleCallEvent(socket, 'call:decline', payload));
    socket.on('call:end', (payload) => handleCallEvent(socket, 'call:end', payload));
    socket.on('call:state', (payload) => handleCallEvent(socket, 'call:state', payload));
    socket.on('signal', (payload) => handleCallEvent(socket, 'signal', payload));

    socket.on('disconnect', () => {
      handleDisconnect(socket);
      unregisterSocket(userId, socket.id);
      if (socketCount(userId) === 0) markOffline(userId);
    });
  });

  return io;
}

export { getIo };
