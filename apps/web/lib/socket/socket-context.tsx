"use client";

import {
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { io, type Socket } from "socket.io-client";

export type SocketStatus = "connecting" | "connected" | "disconnected";

type SocketContextValue = { socket: Socket | null; status: SocketStatus };

const SocketContext = createContext<SocketContextValue>({
  socket: null,
  status: "disconnected",
});

const SOCKET_URL =
  process.env.NEXT_PUBLIC_SOCKET_URL ?? process.env.NEXT_PUBLIC_API_URL ?? "";

export function SocketProvider({
  enabled,
  children,
}: {
  enabled: boolean;
  children: ReactNode;
}) {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [status, setStatus] = useState<SocketStatus>("disconnected");

  useEffect(() => {
    if (!enabled) {
      setSocket(null);
      setStatus("disconnected");
      return;
    }
    const url =
      SOCKET_URL ||
      (typeof window !== "undefined" ? window.location.origin : "");
    const s = io(url, {
      path: "/socket.io",
      withCredentials: true,
      transports: ["websocket"],
      reconnection: true,
      reconnectionDelay: 500,
      reconnectionDelayMax: 5000,
    });
    setSocket(s);
    setStatus("connecting");
    s.on("connect", () => setStatus("connected"));
    s.on("disconnect", () => setStatus("disconnected"));
    s.io.on("reconnect_attempt", () => setStatus("connecting"));

    return () => {
      s.disconnect();
      setSocket(null);
      setStatus("disconnected");
    };
  }, [enabled]);

  return (
    <SocketContext.Provider value={{ socket, status }}>
      {children}
    </SocketContext.Provider>
  );
}

export function useSocket(): SocketContextValue {
  return useContext(SocketContext);
}

export function useSocketEvent<T = unknown>(
  event: string,
  handler: (payload: T) => void,
): void {
  const { socket } = useSocket();
  const handlerRef = useRef(handler);
  handlerRef.current = handler;

  useEffect(() => {
    if (!socket) return;
    const listener = (payload: T) => handlerRef.current(payload);
    socket.on(event, listener as (payload: unknown) => void);
    return () => {
      socket.off(event, listener as (payload: unknown) => void);
    };
  }, [socket, event]);
}

export function emitAck<T = Record<string, unknown>>(
  socket: Socket | null,
  event: string,
  payload: unknown,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    if (!socket) {
      reject(new Error("Not connected"));
      return;
    }
    socket.emit(event, payload, (res: unknown) => {
      if (
        res &&
        typeof res === "object" &&
        (res as { ok?: boolean }).ok === false
      ) {
        reject(
          new Error((res as { error?: string }).error ?? "Request failed"),
        );
      } else {
        resolve(res as T);
      }
    });
  });
}
