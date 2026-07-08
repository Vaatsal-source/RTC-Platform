import { useEffect, useRef, useCallback } from 'react';

// ─── Types ────────────────────────────────────────────────────────────────────
interface IncomingMessage {
  type: string;
  payload: any;
}

interface UseWebSocketOptions {
  onNewMessage?: (payload: any) => void;
  onPresenceUpdate?: (payload: any) => void;
  onTypingUpdate?: (payload: any) => void;
  onMessageDeleted?: (payload: any) => void;
  onThreadReply?: (payload: any) => void;
  onMessageHistory?: (payload: any) => void;
  onMessageEdited?: (payload: any) => void;
  onMoreMessagesLoaded?: (payload: any) => void;
  onConnected?: (payload: { userId: string; username: string; message: string }) => void;
  onReactionUpdate?: (payload: any) => void;
}

// ─── The Hook ─────────────────────────────────────────────────────────────────
// Usage in App.tsx:
//   const { sendMessage, joinChannel, sendTyping } = useWebSocket({
//     onNewMessage: (msg) => setMessages(prev => [...prev, msg]),
//     onTypingUpdate: (data) => setTypingUsers(data),
//   });
export function useWebSocket(options: UseWebSocketOptions = {}) {
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const activeChannelRef = useRef<string | null>(null);
  const isUnmountedRef = useRef(false);

  // ── Keep a stable ref to the latest options ────────────────────────────────
  // App.tsx passes a brand-new { onNewMessage, onTypingUpdate, ... } object
  // literal on EVERY render. If `connect` depended on `options` directly,
  // it would get a new identity every render too, which (combined with
  // React effect timing) was causing the connection to never settle.
  // By storing options in a ref, connect() can read the LATEST callbacks
  // without ever needing to be recreated itself.
  const optionsRef = useRef(options);
  useEffect(() => {
    optionsRef.current = options;
  }, [options]);

  const WS_URL = import.meta.env.VITE_WS_URL || 'ws://localhost:8080';

  // ── Send a raw message to the server ──────────────────────────────────────
  const send = useCallback((type: string, payload: any) => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      console.warn('[WS] Not connected, cannot send:', type);
      return;
    }
    ws.send(JSON.stringify({ type, payload }));
  }, []);

  const joinChannel = useCallback((channelId: string) => {
    activeChannelRef.current = channelId;
    send('JOIN_CHANNEL', { channelId });
  }, [send]);

  // ── Connect ────────────────────────────────────────────────────────────────
  // No dependencies on `options` here at all — it reads optionsRef.current
  // at call time, so this function's identity never changes after creation.
  const connect = useCallback(() => {
    const token = localStorage.getItem('token');

    if (!token) {
      // No token yet — this happens when the component mounts BEFORE login
      // (e.g. on the landing page, since useWebSocket is called at App's
      // top level regardless of which view is showing). Rather than giving
      // up, poll every second until a token shows up (e.g. after login).
      console.warn('[WS] No token in localStorage, retrying in 1s...');
      reconnectTimer.current = setTimeout(() => {
        if (!isUnmountedRef.current) connect();
      }, 1000);
      return;
    }

    console.log('[WS] Connecting...');
    const ws = new WebSocket(`${WS_URL}?token=${token}`);
    wsRef.current = ws;

    ws.onopen = () => {
      console.log('[WS] Connected to SyncGrid');
      if (activeChannelRef.current) {
        send('JOIN_CHANNEL', { channelId: activeChannelRef.current });
      }
    };

    ws.onmessage = (event) => {
      let parsed: IncomingMessage;
      try {
        parsed = JSON.parse(event.data);
      } catch {
        console.error('[WS] Failed to parse message:', event.data);
        return;
      }

      const { type, payload } = parsed;
      const opts = optionsRef.current; // always the LATEST callbacks

      switch (type) {
        case 'NEW_MESSAGE':
          opts.onNewMessage?.(payload);
          break;

        case 'PRESENCE_UPDATE':
          opts.onPresenceUpdate?.(payload);
          break;

        case 'TYPING_UPDATE':
          opts.onTypingUpdate?.(payload);
          break;

        case 'MESSAGE_DELETED':
          opts.onMessageDeleted?.(payload);
          break;

        case 'MESSAGE_EDITED':
          opts.onMessageEdited?.(payload);
          break;

        case 'MESSAGE_HISTORY':
          opts.onMessageHistory?.(payload);
          break;

        case 'MORE_MESSAGES_LOADED':
          opts.onMoreMessagesLoaded?.(payload);
          break;

        case 'THREAD_REPLY':
          opts.onThreadReply?.(payload);
          break;

        case 'CONNECTED':
          console.log('[WS] Server confirmed:', payload.message);
          opts.onConnected?.(payload);
          break;

        case 'REACTION_UPDATE':
          opts.onReactionUpdate?.(payload);
          break;

        case 'ERROR':
          console.error('[WS] Server error:', payload.message);
          break;

        default:
          console.log('[WS] Unknown event:', type, payload);
      }
    };

    ws.onclose = (event) => {
      console.log('[WS] Disconnected. Code:', event.code);

      if (isUnmountedRef.current || event.code === 1000) {
        return; // real unmount or deliberate close — don't reconnect
      }

      reconnectTimer.current = setTimeout(() => {
        console.log('[WS] Attempting reconnect...');
        connect();
      }, 3000);
    };

    ws.onerror = (err) => {
      console.error('[WS] Connection error:', err);
    };
  }, [WS_URL, send]); // stable deps only — this function's identity never changes

  // ── Lifecycle: connect on mount, disconnect on unmount ────────────────────
  useEffect(() => {
    isUnmountedRef.current = false;
    connect();

    return () => {
      isUnmountedRef.current = true;
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);

      const ws = wsRef.current;
      if (ws) {
        ws.onclose = null;
        ws.onerror = null;
        ws.onmessage = null;
        ws.onopen = null;
        ws.close(1000, 'Component unmounted');
      }
    };
  }, [connect]); // connect is now stable, so this effectively runs once

  // ── Public API ─────────────────────────────────────────────────────────────

  const leaveChannel = useCallback((channelId: string) => {
    send('LEAVE_CHANNEL', { channelId });
  }, [send]);

  const sendMessage = useCallback((channelId: string, content: string) => {
    const tempId = `temp_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    send('SEND_MESSAGE', { channelId, content, tempId });
    return tempId;
  }, [send]);

  const sendTypingStart = useCallback((channelId: string) => {
    send('TYPING_START', { channelId });
  }, [send]);

  const sendTypingStop = useCallback((channelId: string) => {
    send('TYPING_STOP', { channelId });
  }, [send]);

  // ── Module 4: Delete & Thread Reply ───────────────────────────────────────
  const deleteMessage = useCallback((messageId: string, channelId: string) => {
    send('DELETE_MESSAGE', { messageId, channelId });
  }, [send]);

  const editMessage = useCallback((messageId: string, channelId: string, newContent: string) => {
    send('EDIT_MESSAGE', { messageId, channelId, newContent });
  }, [send]);

  const sendThreadReply = useCallback((parentMessageId: string, channelId: string, content: string) => {
    const tempId = `temp_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    send('SEND_THREAD_REPLY', { parentMessageId, channelId, content, tempId });
    return tempId;
  }, [send]);

  const loadMoreMessages = useCallback((channelId: string, before: string) => {
    send('LOAD_MORE_MESSAGES', { channelId, before });
  }, [send]);

  const addReaction = useCallback((messageId: string, channelId: string, emoji: string) => {
    send('ADD_REACTION', { messageId, channelId, emoji });
  }, [send]);

  const removeReaction = useCallback((messageId: string, channelId: string, emoji: string) => {
    send('REMOVE_REACTION', { messageId, channelId, emoji });
  }, [send]);

  return {
    joinChannel,
    leaveChannel,
    sendMessage,
    sendTypingStart,
    sendTypingStop,
    deleteMessage,
    editMessage,
    sendThreadReply,
    loadMoreMessages,
    addReaction,
    removeReaction,
  };
}