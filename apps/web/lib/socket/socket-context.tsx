"use client";

import { atom, useSetAtom } from "jotai";
import {
  createContext,
  type ReactNode,
  use,
  useEffect,
  useEffectEvent,
  useMemo,
  useState,
} from "react";
import { io, type Socket } from "socket.io-client";

export type SocketStatus = "connecting" | "connected" | "disconnected";

export const socketStatusAtom = atom<SocketStatus>("disconnected");

type SocketContextValue = { socket: Socket | null };

const SocketContext = createContext<SocketContextValue>({ socket: null });

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
  const setStatus = useSetAtom(socketStatusAtom);

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
    const onConnect = () => setStatus("connected");
    const onDisconnect = () => setStatus("disconnected");
    const onReconnectAttempt = () => setStatus("connecting");
    s.on("connect", onConnect);
    s.on("disconnect", onDisconnect);
    s.io.on("reconnect_attempt", onReconnectAttempt);

    return () => {
      s.off("connect", onConnect);
      s.off("disconnect", onDisconnect);
      s.io.off("reconnect_attempt", onReconnectAttempt);
      s.disconnect();
      setSocket(null);
      setStatus("disconnected");
    };
  }, [enabled, setStatus]);

  const value = useMemo(() => ({ socket }), [socket]);

  return (
    <SocketContext.Provider value={value}>{children}</SocketContext.Provider>
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
  const onEvent = useEffectEvent(handler);

  useEffect(() => {
    if (!socket) return;
    const listener = (payload: T) => onEvent(payload);
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
    socket
      .timeout(8000)
      .emit(event, payload, (error: Error | null, res: unknown) => {
        if (error) {
          reject(new Error("Connection timed out. Please retry."));
          return;
        }
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
