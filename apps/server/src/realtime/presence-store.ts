export interface PresenceStore {
  markOnline(userId: string, socketId: string): Promise<{ wasOnline: boolean }>;
  refresh(userId: string, socketId: string): Promise<void>;
  markOffline(
    userId: string,
    socketId: string,
  ): Promise<{ stillOnline: boolean }>;
  isOnline(userId: string): Promise<boolean>;
  onlineAmong(userIds: string[]): Promise<Set<string>>;
}

export class InMemoryPresenceStore implements PresenceStore {
  private readonly sockets = new Map<string, Set<string>>();

  async markOnline(
    userId: string,
    socketId: string,
  ): Promise<{ wasOnline: boolean }> {
    const set = this.sockets.get(userId);
    const wasOnline = (set?.size ?? 0) > 0;
    if (set) {
      set.add(socketId);
    } else {
      this.sockets.set(userId, new Set([socketId]));
    }
    return { wasOnline };
  }

  async refresh(): Promise<void> {}

  async markOffline(
    userId: string,
    socketId: string,
  ): Promise<{ stillOnline: boolean }> {
    const set = this.sockets.get(userId);
    if (!set) return { stillOnline: false };
    set.delete(socketId);
    if (set.size === 0) this.sockets.delete(userId);
    return { stillOnline: set.size > 0 };
  }

  async isOnline(userId: string): Promise<boolean> {
    return (this.sockets.get(userId)?.size ?? 0) > 0;
  }

  async onlineAmong(userIds: string[]): Promise<Set<string>> {
    const online = new Set<string>();
    for (const id of userIds) {
      if ((this.sockets.get(id)?.size ?? 0) > 0) online.add(id);
    }
    return online;
  }
}
