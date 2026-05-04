import "socket.io";

declare module "socket.io" {
  interface SocketData {
    userId: string;
  }
}
