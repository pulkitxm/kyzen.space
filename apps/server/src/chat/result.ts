// Shared result type for chat services, consumed by both REST routers and
// socket handlers. `status` maps to an HTTP status for the REST path.
export type ErrorStatus = 400 | 401 | 403 | 404 | 409 | 500;

export type ServiceResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: string; status: ErrorStatus };

export function ok<T>(value: T): { ok: true; value: T } {
  return { ok: true, value };
}

export function fail(
  error: string,
  status: ErrorStatus = 400,
): { ok: false; error: string; status: ErrorStatus } {
  return { ok: false, error, status };
}
