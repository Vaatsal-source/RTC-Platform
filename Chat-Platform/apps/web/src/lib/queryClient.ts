import { QueryClient } from '@tanstack/react-query';

// React Query owns *server state* (workspaces, channels, members, notifications…).
// Live message streams live in the Zustand store and are fed by the WebSocket.
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: { refetchOnWindowFocus: false, retry: 1, staleTime: 15_000 },
  },
});
