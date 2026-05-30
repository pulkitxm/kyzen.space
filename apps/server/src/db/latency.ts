const CHAINABLE_QUERY_METHODS = new Set([
  "values",
  "execute",
  "raw",
  "cursor",
  "forEach",
  "stream",
  "describe",
]);

function wrapPending(pending: object, sleep: () => Promise<void>): object {
  return new Proxy(pending, {
    get(target, prop, receiver) {
      if (prop === "then") {
        return (onFulfilled?: unknown, onRejected?: unknown) =>
          sleep()
            .then(() => target as PromiseLike<unknown>)
            .then(onFulfilled as never, onRejected as never);
      }
      const value = Reflect.get(target, prop, receiver);
      if (typeof value === "function") {
        const bound = value.bind(target);
        if (CHAINABLE_QUERY_METHODS.has(prop as string)) {
          return (...args: unknown[]) =>
            wrapPending(bound(...args) as object, sleep);
        }
        return bound;
      }
      return value;
    },
  });
}

function wrapClient<T extends object>(
  client: T,
  sleep: () => Promise<void>,
): T {
  return new Proxy(client, {
    get(target, prop, receiver) {
      const value = Reflect.get(target, prop, receiver);
      if (typeof value !== "function") {
        return value;
      }
      if (prop === "unsafe") {
        return (...args: unknown[]) =>
          wrapPending(value.apply(target, args) as object, sleep);
      }
      if (prop === "begin" || prop === "savepoint") {
        return (...args: unknown[]) => {
          const fn = args[args.length - 1];
          if (typeof fn === "function") {
            args[args.length - 1] = (txClient: object) =>
              (fn as (c: object) => unknown)(wrapClient(txClient, sleep));
          }
          return value.apply(target, args);
        };
      }
      return value.bind(target);
    },
  });
}

export function resolveDbLatencyMs(
  nodeEnv: string,
  requestedMs: number,
): number {
  return nodeEnv === "production" ? 0 : requestedMs;
}

export function withLatency<T extends object>(client: T, ms: number): T {
  if (!Number.isFinite(ms) || ms <= 0) {
    return client;
  }
  const sleep = () => new Promise<void>((resolve) => setTimeout(resolve, ms));
  return wrapClient(client, sleep);
}
