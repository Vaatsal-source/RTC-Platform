import { create } from 'zustand';

interface AppState {
  activeWorkspaceId: string | null;
  activeChannelId: string | null;
  isSidebarOpen: boolean;
  setActiveWorkspace: (id: string | null) => void;
  setActiveChannel: (id: string | null) => void;
  toggleSidebar: () => void;
}

export const useAppStore = create<AppState>((set) => ({
  activeWorkspaceId: null,
  activeChannelId: null,
  isSidebarOpen: true,
  setActiveWorkspace: (id) => set({ activeWorkspaceId: id, activeChannelId: null }), // Reset channel on workspace change
  setActiveChannel: (id) => set({ activeChannelId: id }),
  toggleSidebar: () => set((state) => ({ isSidebarOpen: !state.isSidebarOpen })),
}));