import { io } from 'socket.io-client';
import { tokenStore } from './api.js';

let socket = null;

export function connectSocket() {
  const token = tokenStore.get();
  if (!token) return null;
  if (socket && socket.auth?.token === token) return socket;
  socket?.disconnect();
  socket = io({ auth: { token }, transports: ['websocket', 'polling'], reconnectionDelayMax: 8000 });
  return socket;
}

export function getSocket() {
  return socket || connectSocket();
}

export function disconnectSocket() {
  socket?.disconnect();
  socket = null;
}
