import { useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Api } from './api';
import { useAppStore } from '../store/useAppStore';

// React Query hooks for server state. WebSocket frames invalidate these keys (see socket.ts).

export const useWorkspaces = () => useQuery({ queryKey: ['workspaces'], queryFn: Api.workspaces });

export function useChannels(workspaceId: string | null) {
  const index = useAppStore((s) => s.indexChannels);
  const q = useQuery({ queryKey: ['channels', workspaceId], queryFn: () => Api.channels(workspaceId!), enabled: !!workspaceId });
  useEffect(() => {
    if (q.data) index(q.data);
  }, [q.data, index]);
  return q;
}

export function useDms() {
  const index = useAppStore((s) => s.indexChannels);
  const q = useQuery({ queryKey: ['dms'], queryFn: Api.dms });
  useEffect(() => {
    if (q.data) index(q.data);
  }, [q.data, index]);
  return q;
}

export const useMembers = (workspaceId: string | null) =>
  useQuery({ queryKey: ['members', workspaceId], queryFn: () => Api.members(workspaceId!), enabled: !!workspaceId });

export const useActivity = (workspaceId: string | null, enabled = true) =>
  useQuery({ queryKey: ['activity', workspaceId], queryFn: () => Api.activity(workspaceId!), enabled: !!workspaceId && enabled });

export function useNotificationsSync() {
  const set = useAppStore((s) => s.setNotifications);
  const q = useQuery({ queryKey: ['notifications'], queryFn: Api.notifications });
  useEffect(() => {
    if (q.data) set(q.data.notifications, q.data.unreadCount);
  }, [q.data, set]);
  return q;
}

export function useMarkNotificationsRead() {
  const set = useAppStore((s) => s.setNotifications);
  return useMutation({
    mutationFn: (ids?: string[]) => Api.markNotificationsRead(ids),
    onSuccess: (_r, ids) => {
      const { notifications } = useAppStore.getState();
      set(
        notifications.map((n) => (!ids || ids.includes(n.id) ? { ...n, read: true } : n)),
        _r.unreadCount,
      );
    },
  });
}

export function useInvalidate() {
  const qc = useQueryClient();
  return (...keys: unknown[][]) => keys.forEach((queryKey) => void qc.invalidateQueries({ queryKey }));
}
