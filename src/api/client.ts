const API_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:4000';

// A real (non-dev) build that still resolves to localhost means
// EXPO_PUBLIC_API_URL was never set for that build profile (see mobile/
// eas.json's preview/production "env") — it would otherwise fail silently
// on a real device with no indication why every request is timing out.
if (!__DEV__ && API_URL.includes('localhost')) {
  console.warn(
    `[config] EXPO_PUBLIC_API_URL resolved to "${API_URL}" in a production build — this almost ` +
      'certainly means it was never set for this build profile. See mobile/eas.json.'
  );
}

let authToken: string | null = null;
let refreshToken: string | null = null;
// AuthContext registers its own signOut here so this module — which has no
// React state of its own, by design — can fully sign the user out when the
// refresh token itself has expired (the 2-day session boundary, CLAUDE.md
// security baseline), not just this one access token.
let onAuthExpired: (() => void) | null = null;

// Called by AuthContext whenever the token changes (sign in/out/restore) —
// keeps this module decoupled from React state.
export const setAuthToken = (token: string | null): void => {
  authToken = token;
};

export const setRefreshToken = (token: string | null): void => {
  refreshToken = token;
};

export const setOnAuthExpired = (callback: (() => void) | null): void => {
  onAuthExpired = callback;
};

export class ApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  body?: unknown;
}

const REFRESH_PATH = '/api/auth/refresh-token';

// Plain fetch, not apiRequest — apiRequest calling itself here would recurse
// back into this same refresh logic on a failure.
const tryRefreshAccessToken = async (): Promise<boolean> => {
  if (!refreshToken) {
    return false;
  }

  try {
    const response = await fetch(`${API_URL}${REFRESH_PATH}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
    });

    if (!response.ok) {
      return false;
    }

    const data = (await response.json()) as { token: string };
    authToken = data.token;
    return true;
  } catch {
    return false;
  }
};

// This had no timeout at all — a hung backend response (e.g. the OTP send
// request blocking on a hung upstream MSG91 call, see msg91Client.ts) left
// this fetch pending forever, which left whatever screen's `loading` state
// spinning forever too (LoginScreen's finally{} never ran because the
// awaited promise never settled, not because it threw). 30s is generous
// for a mobile network but guarantees this always settles one way or
// another.
const REQUEST_TIMEOUT_MS = 30_000;

export const apiRequest = async <T>(path: string, options: RequestOptions = {}, isRetry = false): Promise<T> => {
  const abortController = new AbortController();
  const timeoutId = setTimeout(() => abortController.abort(), REQUEST_TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(`${API_URL}${path}`, {
      method: options.method ?? 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
      },
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
      signal: abortController.signal,
    });
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      throw new ApiError(0, 'Request timed out. Check your connection and try again.');
    }
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }

  // A 401 on an already-authenticated request means the access token
  // expired (it's short-lived by design, CLAUDE.md) — silently exchange the
  // still-valid refresh token for a new one and retry once, rather than
  // bouncing the user back to the OTP screen every ~30 minutes. Skipped for
  // the refresh endpoint itself (nothing to refresh from) and only retried
  // once (isRetry) so a genuinely expired/invalid refresh token can't loop.
  if (response.status === 401 && !isRetry && path !== REFRESH_PATH) {
    const refreshed = await tryRefreshAccessToken();

    if (refreshed) {
      return apiRequest<T>(path, options, true);
    }

    // Refresh token itself is gone (expired at the 2-day mark, or invalid) —
    // this is a real, deliberate session boundary (CLAUDE.md), not a bug:
    // fully sign out so the app returns to the OTP screen instead of
    // silently retrying a request that will never succeed.
    onAuthExpired?.();
  }

  const data = await response.json().catch(() => undefined);

  if (!response.ok) {
    const message = (data as { error?: string } | undefined)?.error ?? 'Request failed';
    throw new ApiError(response.status, message);
  }

  return data as T;
};
