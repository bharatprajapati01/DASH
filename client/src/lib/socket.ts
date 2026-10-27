import { io, type Socket } from "socket.io-client";

const SOCKET_URL = import.meta.env.VITE_API_URL || undefined;

let socket: Socket | null = null;

/** One authenticated connection per signed-in user. */
export function connectSocket(): Socket {
  if (socket) return socket;

  socket = io(SOCKET_URL, {
    withCredentials: true,
    transports: ["websocket", "polling"],
    reconnection: true,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 10_000,
  });

  return socket;
}

export function disconnectSocket() {
  socket?.disconnect();
  socket = null;
}