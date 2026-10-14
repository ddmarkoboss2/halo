import { io, type Socket } from 'socket.io-client';

/** Single shared Socket.IO connection for the signed-in session. */
export function createSocket(): Socket {
  return io({
    path: '/socket.io',
    withCredentials: true,
    transports: ['websocket', 'polling'],
    reconnectionDelay: 500,
    reconnectionDelayMax: 4000,
  });
}
