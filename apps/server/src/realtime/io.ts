import type { Server as IOServer } from "socket.io";

let ioRef: IOServer | null = null;

export function setIO(io: IOServer): void {
  ioRef = io;
}

export function getIO(): IOServer | null {
  return ioRef;
}
