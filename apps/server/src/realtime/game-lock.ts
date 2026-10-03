const tails = new Map<string, Promise<void>>();

export function withGameLock<T>(
  gameId: string,
  fn: () => Promise<T>,
): Promise<T> {
  const previous = tails.get(gameId) ?? Promise.resolve();
  const run = previous.then(fn);
  const tail = run.then(
    () => undefined,
    () => undefined,
  );
  tails.set(gameId, tail);
  void tail.then(() => {
    if (tails.get(gameId) === tail) tails.delete(gameId);
  });
  return run;
}

export function lockedGameCount(): number {
  return tails.size;
}
