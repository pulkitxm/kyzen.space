import type { Server as IOServer } from "socket.io";

// Singleton handle to the Socket.IO server so REST routes / services can fan out
// realtime events without being coupled to Express startup order. Set once by
// attachRealtime(); read via getIO() (callers optional-chain since it's null
// until the realtime layer is attached).
let ioRef: IOServer | null = null;

export function setIO(io: IOServer): void {
  ioRef = io;
}

export function getIO(): IOServer | null {
  return ioRef;
}
