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
