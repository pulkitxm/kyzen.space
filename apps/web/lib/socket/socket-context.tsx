"use client";

import {
  createContext,
  type ReactNode,
  use,
  useEffect,
  useRef,
  useState,
} from "react";
import { io, type Socket } from "socket.io-client";

type SocketStatus = "connecting" | "connected" | "disconnected";

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
  const [conn, setConn] = useState<SocketContextValue>({
    socket: null,
    status: "disconnected",
  });

  useEffect(() => {
    if (!enabled) {
      setConn({ socket: null, status: "disconnected" });
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
    setConn({ socket: s, status: "connecting" });
    s.on("connect", () => setConn((c) => ({ ...c, status: "connected" })));
    s.on("disconnect", () =>
      setConn((c) => ({ ...c, status: "disconnected" })),
    );
    s.io.on("reconnect_attempt", () =>
      setConn((c) => ({ ...c, status: "connecting" })),
    );

    return () => {
      s.disconnect();
      setConn({ socket: null, status: "disconnected" });
    };
  }, [enabled]);

  return (
    <SocketContext.Provider value={conn}>{children}</SocketContext.Provider>
  );
}

export function useSocket(): SocketContextValue {
  return use(SocketContext);
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
