import { io, type Socket } from "socket.io-client";

let socket: Socket | null = null;

/** One authenticated connection (session cookie) per signed-in user. Reconnects automatically with backoff. */
export function connectSocket(): Socket {
  if (socket) return socket;
  socket = io({
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
