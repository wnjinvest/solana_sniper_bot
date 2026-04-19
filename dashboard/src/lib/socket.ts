import { io, Socket } from 'socket.io-client';
import type { ServerToClientEvents, ClientToServerEvents } from './types';

export type BotSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

let socket: BotSocket | null = null;

export function getSocket(): BotSocket {
  if (!socket) {
    const host = window.location.hostname;
    socket = io(`http://${host}:3001`, {
      reconnectionAttempts: 20,
      reconnectionDelay:    1_000,
      reconnectionDelayMax: 10_000,
      timeout:              5_000,
      autoConnect:          true,
    });
  }
  return socket;
}

export function disconnectSocket(): void {
  socket?.disconnect();
  socket = null;
}
