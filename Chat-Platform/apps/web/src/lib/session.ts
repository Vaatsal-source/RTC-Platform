// Where the session lives in the browser. Kept free of imports so both the API client and the store can use it.
//
// Trade-off: tokens are in localStorage (simple, survives reloads, works across tabs) which means an XSS bug
// could read them. We mitigate with short-lived (1 h) access tokens, single-use rotating refresh tokens,
// React's output escaping and a locked-down CSP on file downloads.

export const TOKEN_KEY = 'token';
export const REFRESH_KEY = 'refreshToken';
export const USER_KEY = 'user';

export const getToken = () => localStorage.getItem(TOKEN_KEY);
export const getRefreshToken = () => localStorage.getItem(REFRESH_KEY);

export function saveTokens(token: string, refreshToken?: string): void {
  localStorage.setItem(TOKEN_KEY, token);
  if (refreshToken) localStorage.setItem(REFRESH_KEY, refreshToken);
}

export function clearSession(): void {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(REFRESH_KEY);
  localStorage.removeItem(USER_KEY);
}
