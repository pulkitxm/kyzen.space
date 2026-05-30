// Dev/test helper: artificially delay every database query.
//
// drizzle-orm/postgres-js executes *all* queries through three methods on the
// postgres.js client — `unsafe` (every read/write), `begin` (transactions) and
// `savepoint` (nested transactions). By wrapping those in a Proxy we add latency
// to all drizzle queries without touching a single call site.
//
// postgres.js queries are lazy "pending" objects (thenable, with chainable
// shaping methods like `.values()`). drizzle calls `.values()` synchronously
// before awaiting, so we cannot just make `unsafe` async — we wrap the pending
// object instead and defer its execution by intercepting `then`.

/** Pending-query methods that return another pending query (must stay wrapped). */
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
        // Sleep first, then execute the real query and forward its result.
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
      // Every query flows through `unsafe`; delay its pending result.
      if (prop === "unsafe") {
        return (...args: unknown[]) =>
          wrapPending(value.apply(target, args) as object, sleep);
      }
      // Transactions receive a fresh client; wrap it so inner queries (and any
      // further savepoints) are delayed too. The callback is the last argument.
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

/**
 * Wrap a postgres.js client so every drizzle query is delayed by `ms`.
 * Returns the client untouched when `ms` is not a positive number, so it is
 * safe (and zero-overhead) to leave in place with the env var unset.
 */
export function withLatency<T extends object>(client: T, ms: number): T {
  if (!Number.isFinite(ms) || ms <= 0) {
    return client;
  }
  const sleep = () => new Promise<void>((resolve) => setTimeout(resolve, ms));
  return wrapClient(client, sleep);
}
