import axios, { AxiosError } from 'axios';
import type {
  ActivityDTO,
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

export const API_URL: string = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';
export const WS_URL: string = import.meta.env.VITE_WS_URL || 'ws://localhost:8080';

export const TOKEN_KEY = 'token';
export const AUTH_EXPIRED_EVENT = 'auth:expired';

export const api = axios.create({ baseURL: API_URL, headers: { 'Content-Type': 'application/json' } });

api.interceptors.request.use((config) => {
  const token = localStorage.getItem(TOKEN_KEY);
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (r) => r,
  (error: AxiosError) => {
    // A 401 on anything except the credential endpoints means the session is gone.
    const url = error.config?.url ?? '';
    if (error.response?.status === 401 && !url.startsWith('/auth/login') && !url.startsWith('/auth/register')) {
      window.dispatchEvent(new Event(AUTH_EXPIRED_EVENT));
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
  user: UserDTO;
}

export const Api = {
  // ── Auth ──
  register: (b: { name: string; email: string; password: string }) => data<AuthResult>(api.post('/auth/register', b)),
  login: (b: { email: string; password: string }) => data<AuthResult>(api.post('/auth/login', b)),
  me: () => data<{ user: UserDTO }>(api.get('/auth/me')).then((r) => r.user),
  logout: () => api.post('/auth/logout').catch(() => undefined),

  // ── Workspaces ──
  workspaces: () => data<{ workspaces: WorkspaceDTO[] }>(api.get('/workspaces')).then((r) => r.workspaces),
  createWorkspace: (b: { name: string; description?: string }) => data<{ workspace: WorkspaceDTO }>(api.post('/workspaces', b)).then((r) => r.workspace),
  updateWorkspace: (id: string, b: { name?: string; description?: string }) => data<{ workspace: WorkspaceDTO }>(api.patch(`/workspaces/${id}`, b)).then((r) => r.workspace),
  deleteWorkspace: (id: string) => api.delete(`/workspaces/${id}`),
  joinWorkspace: (code: string) => data<{ workspace: WorkspaceDTO }>(api.post('/workspaces/join', { code })).then((r) => r.workspace),
  rotateInvite: (id: string) => data<{ workspace: WorkspaceDTO }>(api.post(`/workspaces/${id}/invite-code`)).then((r) => r.workspace),
  members: (id: string) => data<{ members: WorkspaceMemberDTO[] }>(api.get(`/workspaces/${id}/members`)).then((r) => r.members),
  inviteByEmail: (id: string, email: string) => api.post(`/workspaces/${id}/members`, { email }),
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
