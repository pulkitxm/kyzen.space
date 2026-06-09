export const dbState: { game: unknown; card: unknown } = {
  game: null,
  card: null,
};

export function gameCardDbMock() {
  return {
    games: {
      getGameById: async () => dbState.game,
      getGameByCode: async () => dbState.game,
    },
    profiles: {
      getPublicUser: async (id: string) => ({
        id,
        username: "alice",
        displayName: "Alice",
        avatar: null,
      }),
      getPublicUsers: async () => [],
    },
    messages: { getGameCardByGameId: async () => dbState.card },
    accountMerge: {},
    conversations: {},
    friends: {},
    notifications: {},
    db: {},
    schema: {},
    createDb: () => ({ db: {}, client: {} }),
  };
}
