import axios, { AxiosError, type InternalAxiosRequestConfig } from 'axios';
import type {
  ActivityDTO,
  AnalyticsDTO,
  AuditEntryDTO,
  PendingInviteDTO,
  ChannelDTO,
  FileDTO,
  MessageDTO,
  NotificationDTO,
  SearchResultDTO,
  UserDTO,
  WorkspaceDTO,
  WorkspaceMemberDTO,
  WorkspaceRole,
} from '@repo/shared-types';
import { getRefreshToken, getToken, saveTokens } from './session';

export const API_URL: string = import.meta.env.VITE_API_URL || (import.meta.env.DEV ? 'http://localhost:5000/api' : '/api');
// Production default: same origin behind the reverse proxy (wss://<host>/ws). Dev: the WS server directly.
// A relative value such as "/ws" is resolved against the page's origin (ws:// or wss:// to match http/https).
const sameOriginWs = (path: string) => `${window.location.protocol === 'https:' ? 'wss' : 'ws'}://${window.location.host}${path}`;
const configuredWs: string = import.meta.env.VITE_WS_URL || '';
export const WS_URL: string = configuredWs.startsWith('/') ? sameOriginWs(configuredWs) : configuredWs || (import.meta.env.DEV ? 'ws://localhost:8080' : sameOriginWs('/ws'));

export const AUTH_EXPIRED_EVENT = 'auth:expired';
export const TOKENS_REFRESHED_EVENT = 'auth:tokens';

export const api = axios.create({ baseURL: API_URL, headers: { 'Content-Type': 'application/json' } });

api.interceptors.request.use((config) => {
  const token = getToken();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// ── Silent token refresh ─────────────────────────────────────────────────────
// Access tokens last 1 h. On a 401 we trade the single-use refresh token for a new pair and replay the request.
// Concurrent 401s share ONE refresh call (the refresh token can only be used once).
let refreshing: Promise<string | null> | null = null;

async function refreshSession(): Promise<string | null> {
  const used = getRefreshToken();
  if (!used) return null;
  try {
    const res = await axios.post<{ token: string; refreshToken: string }>(`${API_URL}/auth/refresh`, { refreshToken: used });
    saveTokens(res.data.token, res.data.refreshToken);
    window.dispatchEvent(new CustomEvent(TOKENS_REFRESHED_EVENT, { detail: res.data }));
    return res.data.token;
  } catch {
    // Another tab may have rotated the token a moment ago — if the stored one changed, use that session.
    return getRefreshToken() !== used ? getToken() : null;
  }
}

/** Resolves to a fresh access token, or null if the session can't be renewed. */
export function ensureFreshToken(): Promise<string | null> {
  return (refreshing ??= refreshSession().finally(() => {
    refreshing = null;
  }));
}

type Retryable = InternalAxiosRequestConfig & { _retried?: boolean };

api.interceptors.response.use(
  (r) => r,
  async (error: AxiosError) => {
    const config = error.config as Retryable | undefined;
    const url = config?.url ?? '';
    const isCredentialCall = /^\/auth\/(login|register|refresh|forgot-password|reset-password|verify-email)/.test(url);
    if (error.response?.status === 401 && config && !isCredentialCall) {
      if (!config._retried) {
        const token = await ensureFreshToken();
        if (token) {
          config._retried = true;
          config.headers.Authorization = `Bearer ${token}`;
          return api(config);
        }
      }
      window.dispatchEvent(new Event(AUTH_EXPIRED_EVENT)); // can't renew → logged out
    }
    return Promise.reject(error);
  },
);

export function errorMessage(err: unknown, fallback = 'Something went wrong'): string {
  const e = err as AxiosError<{ message?: string; errors?: Array<{ message: string }> }>;
  const first = e.response?.data?.errors?.[0]?.message;
  return first ?? e.response?.data?.message ?? (e.code === 'ERR_NETWORK' ? 'Cannot reach the server' : fallback);
}

const data = <T>(p: Promise<{ data: T }>): Promise<T> => p.then((r) => r.data);

export interface AuthResult {
  token: string;
  refreshToken: string;
  user: UserDTO;
}

export const Api = {
  // ── Auth ──
  register: (b: { name: string; email: string; password: string }) => data<AuthResult>(api.post('/auth/register', b)),
  login: (b: { email: string; password: string }) => data<AuthResult>(api.post('/auth/login', b)),
  me: () => data<{ user: UserDTO }>(api.get('/auth/me')).then((r) => r.user),
  logout: () => api.post('/auth/logout', { refreshToken: getRefreshToken() }).catch(() => undefined),
  forgotPassword: (email: string) => api.post('/auth/forgot-password', { email }),
  resetPassword: (token: string, password: string) => api.post('/auth/reset-password', { token, password }),
  verifyEmail: (token: string) => data<{ user: UserDTO; joinedWorkspaces: number }>(api.post('/auth/verify-email', { token })),
  resendVerification: () => api.post('/auth/resend-verification'),

  // ── Workspaces ──
  workspaces: () => data<{ workspaces: WorkspaceDTO[] }>(api.get('/workspaces')).then((r) => r.workspaces),
  createWorkspace: (b: { name: string; description?: string }) => data<{ workspace: WorkspaceDTO }>(api.post('/workspaces', b)).then((r) => r.workspace),
  updateWorkspace: (id: string, b: { name?: string; description?: string }) => data<{ workspace: WorkspaceDTO }>(api.patch(`/workspaces/${id}`, b)).then((r) => r.workspace),
  deleteWorkspace: (id: string) => api.delete(`/workspaces/${id}`),
  joinWorkspace: (code: string) => data<{ workspace: WorkspaceDTO }>(api.post('/workspaces/join', { code })).then((r) => r.workspace),
  rotateInvite: (id: string) => data<{ workspace: WorkspaceDTO }>(api.post(`/workspaces/${id}/invite-code`)).then((r) => r.workspace),
  members: (id: string) => data<{ members: WorkspaceMemberDTO[] }>(api.get(`/workspaces/${id}/members`)).then((r) => r.members),
  /** `pending: true` ⇒ no account yet; an invitation email was sent and is redeemed when they verify their address. */
  inviteByEmail: (id: string, email: string) => data<{ pending?: boolean }>(api.post(`/workspaces/${id}/members`, { email })),
  invites: (id: string) => data<{ invites: PendingInviteDTO[] }>(api.get(`/workspaces/${id}/invites`)).then((r) => r.invites),
  revokeInvite: (id: string, inviteId: string) => api.delete(`/workspaces/${id}/invites/${inviteId}`),
  audit: (id: string) => data<{ entries: AuditEntryDTO[] }>(api.get(`/workspaces/${id}/audit`, { params: { limit: 100 } })).then((r) => r.entries),
  analytics: (id: string) => data<AnalyticsDTO>(api.get(`/workspaces/${id}/analytics`)),
  setRole: (id: string, userId: string, role: WorkspaceRole) => api.patch(`/workspaces/${id}/members/${userId}`, { role }),
  removeMember: (id: string, userId: string) => api.delete(`/workspaces/${id}/members/${userId}`),
  activity: (id: string) => data<{ activity: ActivityDTO[] }>(api.get(`/workspaces/${id}/activity`, { params: { limit: 50 } })).then((r) => r.activity),

  // ── Channels ──
  channels: (workspaceId: string) => data<{ channels: ChannelDTO[] }>(api.get(`/workspaces/${workspaceId}/channels`)).then((r) => r.channels),
  createChannel: (workspaceId: string, b: { name: string; isPrivate: boolean; memberIds?: string[] }) =>
    data<{ channel: ChannelDTO }>(api.post(`/workspaces/${workspaceId}/channels`, b)).then((r) => r.channel),
  renameChannel: (id: string, name: string) => data<{ channel: ChannelDTO }>(api.patch(`/channels/${id}`, { name })).then((r) => r.channel),
  setArchived: (id: string, archived: boolean) => data<{ channel: ChannelDTO }>(api.post(`/channels/${id}/${archived ? 'archive' : 'unarchive'}`)).then((r) => r.channel),
  deleteChannel: (id: string) => api.delete(`/channels/${id}`),
  channelMembers: (id: string) => data<{ members: Array<{ userId: string; name: string; email: string }> }>(api.get(`/channels/${id}/members`)).then((r) => r.members),
  addChannelMember: (id: string, userId: string) => api.post(`/channels/${id}/members`, { userId }),
  removeChannelMember: (id: string, userId: string) => api.delete(`/channels/${id}/members/${userId}`),

  // ── DMs / messages ──
  dms: () => data<{ channels: ChannelDTO[] }>(api.get('/dms')).then((r) => r.channels),
  openDm: (userId: string) => data<{ channel: ChannelDTO }>(api.post('/dms', { userId })).then((r) => r.channel),
  replies: (messageId: string) => data<{ replies: MessageDTO[] }>(api.get(`/messages/${messageId}/replies`)).then((r) => r.replies),

  // ── Notifications ──
  notifications: () => data<{ notifications: NotificationDTO[]; unreadCount: number }>(api.get('/notifications', { params: { limit: 30 } })),
  markNotificationsRead: (ids?: string[]) => data<{ unreadCount: number }>(api.post('/notifications/read', { ids })),

  // ── Search ──
  search: (q: string, workspaceId?: string) => data<SearchResultDTO>(api.get('/search', { params: { q, workspaceId } })),

  // ── Files ──
  uploadFile: (channelId: string, file: File, onProgress?: (pct: number) => void) => {
    const form = new FormData();
    form.append('channelId', channelId); // must precede the file field
    form.append('file', file);
    return data<{ file: FileDTO }>(
      api.post('/files', form, {
        headers: { 'Content-Type': 'multipart/form-data' },
        onUploadProgress: (e) => e.total && onProgress?.(Math.round((e.loaded / e.total) * 100)),
      }),
    ).then((r) => r.file);
  },
  /** Files are auth-protected, so they're fetched with the bearer token and shown via object URLs. */
  fileBlob: (url: string, download = false) =>
    api.get<Blob>(url.replace(/^\/api/, ''), { responseType: 'blob', params: download ? { download: 1 } : undefined }).then((r) => r.data),
};
