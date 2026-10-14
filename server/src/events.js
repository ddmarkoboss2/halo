/** Socket.IO singleton plus typed emit helpers shared by the REST routes. */

let io = null;

/** userId -> Set of connected socket ids. */
const socketsByUser = new Map();

export function setIo(instance) {
  io = instance;
}

export function getIo() {
  return io;
}

export function userRoom(userId) {
  return `user:${userId}`;
}

export function scopeRoom(scope, scopeId) {
  return `scope:${scope}:${scopeId}`;
}

/** Registered by the socket layer so room subscriptions follow structural changes. */
let resyncHandler = () => undefined;

export function setResyncHandler(handler) {
  resyncHandler = handler;
}

/** Tells clients their sidebar/guild state changed and should be refetched. */
export function notifyState(userIds, reason) {
  for (const userId of new Set(userIds.filter(Boolean))) resyncHandler(userId);
  emitToUsers(userIds, 'state:refresh', { reason });
}

export function emitToUsers(userIds, event, payload) {
  if (!io) return;
  for (const userId of new Set(userIds.filter(Boolean))) {
    io.to(userRoom(userId)).emit(event, payload);
  }
}

export function emitToScope(scope, scopeId, event, payload, exceptSocketId) {
  if (!io) return;
  let target = io.to(scopeRoom(scope, scopeId));
  if (exceptSocketId) target = io.to(scopeRoom(scope, scopeId)).except(exceptSocketId);
  target.emit(event, payload);
}

export function registerSocket(userId, socketId) {
  const set = socketsByUser.get(userId) ?? new Set();
  set.add(socketId);
  socketsByUser.set(userId, set);
  return set.size;
}

export function unregisterSocket(userId, socketId) {
  const set = socketsByUser.get(userId);
  if (!set) return 0;
  set.delete(socketId);
  if (set.size === 0) socketsByUser.delete(userId);
  return set.size;
}

export function isUserOnline(userId) {
  return socketsByUser.has(userId);
}

export function onlineUserIds() {
  return [...socketsByUser.keys()];
}

export function socketIdsForUser(userId) {
  return [...(socketsByUser.get(userId) ?? [])];
}

export function socketCount(userId) {
  return socketsByUser.get(userId)?.size ?? 0;
}
