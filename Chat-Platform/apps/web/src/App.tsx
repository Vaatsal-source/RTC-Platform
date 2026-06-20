import React, { useState, useEffect, useRef } from 'react';
import { useAppStore } from './store/useAppStore';
import AuthPage from './components/AuthPage';
import BackgroundParticles from './components/BackgroundParticles';
import { useWebSocket } from './lib/useWebSocket';
import { motion, AnimatePresence } from 'framer-motion';
import EmojiPicker, { EmojiClickData, Theme } from 'emoji-picker-react';
import { 
  Hash, MessageSquare, Terminal, Zap, Shield, ChevronRight, 
  LogOut, LayoutDashboard, User, Smile
} from 'lucide-react';

// Custom, legal-safe SVG Brand Icons
const GithubIcon = () => (
  <svg className="h-5 w-5 fill-current" viewBox="0 0 24 24">
    <path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12"/>
  </svg>
);

const TwitterIcon = () => (
  <svg className="h-4 w-4 fill-current" viewBox="0 0 24 24">
    <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
  </svg>
);

const LinkedinIcon = () => (
  <svg className="h-5 w-5 fill-current" viewBox="0 0 24 24">
    <path d="M19 0h-14c-2.761 0-5 2.239-5 5v14c0 2.761 2.239 5 5 5h14c2.762 0 5-2.239 5-5v-14c0-2.761-2.238-5-5-5zm-11 19h-3v-11h3v11zm-1.5-12.268c-.966 0-1.75-.79-1.75-1.764s.784-1.764 1.75-1.764 1.75.79 1.75 1.764-.783 1.764-1.75 1.764zm13.5 12.268h-3v-5.604c0-3.368-4-3.113-4 0v5.604h-3v-11h3v1.765c1.396-2.586 7-2.777 7 2.476v6.759z"/>
  </svg>
);

// ─── Message shape used purely on the frontend for rendering ─────────────────
interface ChatMessage {
  id: string;
  tempId?: string;
  channelId: string;
  content: string;
  timestamp: string;
  user: { id: string; name: string };
  pending?: boolean;
  parentMessageId?: string;
  deleted?: boolean;
  isEdited?: boolean;
  reactions?: { emoji: string; userIds: string[] }[];
}

export default function App() {
  const { activeChannelId, setActiveChannel } = useAppStore();
  const [showAuth, setShowAuth] = useState(false);
  const [viewOverride, setViewOverride] = useState(true); 
  const [showProfileMenu, setShowProfileMenu] = useState(false);

  // ── Real-time messaging state ─────────────────────────────────────────────
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [messageInput, setMessageInput] = useState('');
  const [replyingTo, setReplyingTo] = useState<ChatMessage | null>(null);
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [editInput, setEditInput] = useState('');
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [hasMoreHistory, setHasMoreHistory] = useState(true);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ChatMessage | null>(null);
  const [emojiPickerFor, setEmojiPickerFor] = useState<string | null>(null);
  const [fullPickerFor, setFullPickerFor] = useState<string | null>(null);
  const [showInputEmojiPicker, setShowInputEmojiPicker] = useState(false);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [typingUsers, setTypingUsers] = useState<Record<string, string>>({});
  const messagesEndRef = useRef<HTMLDivElement>(null);
  
  const isAuthenticated = !!localStorage.getItem('token');
  const isViewingLanding = !isAuthenticated || viewOverride;

  const channels = [
    { id: '1', name: 'general' },
    { id: '2', name: 'engineering' },
    { id: '3', name: 'random' },
  ];

  // ── WebSocket wiring ───────────────────────────────────────────────────────
  const { joinChannel, sendMessage, sendTypingStart, sendTypingStop, deleteMessage, editMessage, sendThreadReply, loadMoreMessages, addReaction, removeReaction } = useWebSocket({
    onNewMessage: (payload) => {
      setMessages((prev) => {
        const existingIndex = prev.findIndex((m) => m.tempId === payload.tempId);
        if (existingIndex !== -1) {
          const updated = [...prev];
          updated[existingIndex] = { ...payload, pending: false };
          return updated;
        }
        return [...prev, { ...payload, pending: false }];
      });
    },
    onTypingUpdate: (payload) => {
      setTypingUsers((prev) => {
        const updated = { ...prev };
        if (payload.isTyping) {
          updated[payload.userId] = payload.username;
        } else {
          delete updated[payload.userId];
        }
        return updated;
      });
    },
    onMessageDeleted: (payload) => {
      setMessages((prev) =>
        prev.map((m) => (m.id === payload.messageId ? { ...m, deleted: true } : m))
      );
    },
    onMessageEdited: (payload) => {
      setMessages((prev) =>
        prev.map((m) =>
          m.id === payload.messageId
            ? { ...m, content: payload.newContent, isEdited: true }
            : m
        )
      );
    },
    onThreadReply: (payload) => {
      setMessages((prev) => {
        const existingIndex = prev.findIndex((m) => m.tempId === payload.tempId);
        if (existingIndex !== -1) {
          const updated = [...prev];
          updated[existingIndex] = { ...payload, pending: false };
          return updated;
        }
        return [...prev, { ...payload, pending: false }];
      });
    },
    onMessageHistory: (payload) => {
      setMessages(payload.messages || []);
      setHasMoreHistory((payload.messages || []).length === 50);
    },
    onMoreMessagesLoaded: (payload) => {
      setMessages((prev) => [...(payload.messages || []), ...prev]);
      setHasMoreHistory(payload.hasMore);
      setIsLoadingMore(false);
    },
    onConnected: (payload) => {
      if (payload.userId) setCurrentUserId(payload.userId);
    },
    onReactionUpdate: (payload) => {
      const { messageId, emoji, userId, action } = payload;
      setMessages((prev) =>
        prev.map((m) => {
          if (m.id !== messageId) return m;

          const reactions = m.reactions ? [...m.reactions] : [];
          const existingIndex = reactions.findIndex((r) => r.emoji === emoji);

          if (action === 'add') {
            if (existingIndex !== -1) {
              if (!reactions[existingIndex].userIds.includes(userId)) {
                reactions[existingIndex] = {
                  ...reactions[existingIndex],
                  userIds: [...reactions[existingIndex].userIds, userId],
                };
              }
            } else {
              reactions.push({ emoji, userIds: [userId] });
            }
          } else {
            if (existingIndex !== -1) {
              const updatedUserIds = reactions[existingIndex].userIds.filter((id) => id !== userId);
              if (updatedUserIds.length === 0) {
                reactions.splice(existingIndex, 1);
              } else {
                reactions[existingIndex] = { ...reactions[existingIndex], userIds: updatedUserIds };
              }
            }
          }

          return { ...m, reactions };
        })
      );
    },
  });

  useEffect(() => {
    if (!isAuthenticated || isViewingLanding || !activeChannelId) return;
    setMessages([]);
    setTypingUsers({});
    setHasMoreHistory(true);
    joinChannel(activeChannelId);
  }, [activeChannelId, isAuthenticated, isViewingLanding, joinChannel]);

  const prevMessageCountRef = useRef(0);
  useEffect(() => {
    if (messages.length > prevMessageCountRef.current && !isLoadingMore) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
    prevMessageCountRef.current = messages.length;
  }, [messages, isLoadingMore]);

  const handleMessagesScroll = () => {
    const container = messagesContainerRef.current;
    if (!container || isLoadingMore || !hasMoreHistory || !activeChannelId) return;

    if (container.scrollTop < 100) {
      const oldestMessage = messages[0];
      if (!oldestMessage) return;

      setIsLoadingMore(true);
      loadMoreMessages(activeChannelId, oldestMessage.timestamp);
    }
  };

  // ── Resets the textarea's height back to a single row after sending ──────
  const resetTextareaHeight = () => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
  };

  const handleSend = () => {
    const trimmed = messageInput.trim();
    if (!trimmed || !activeChannelId) return;

    if (replyingTo) {
      const tempId = sendThreadReply(replyingTo.id, activeChannelId, trimmed);
      setMessages((prev) => [
        ...prev,
        {
          id: tempId,
          tempId,
          channelId: activeChannelId,
          content: trimmed,
          timestamp: new Date().toISOString(),
          user: { id: 'me', name: 'You' },
          pending: true,
          parentMessageId: replyingTo.id,
        },
      ]);
      setReplyingTo(null);
    } else {
      const tempId = sendMessage(activeChannelId, trimmed);
      setMessages((prev) => [
        ...prev,
        {
          id: tempId,
          tempId,
          channelId: activeChannelId,
          content: trimmed,
          timestamp: new Date().toISOString(),
          user: { id: 'me', name: 'You' },
          pending: true,
        },
      ]);
    }

    setMessageInput('');
    sendTypingStop(activeChannelId);
    resetTextareaHeight();
  };

  const handleRequestDelete = (msg: ChatMessage) => {
    setDeleteTarget(msg);
  };

  const handleConfirmDelete = () => {
    if (!deleteTarget || !activeChannelId) return;
    setMessages((prev) =>
      prev.map((m) => (m.id === deleteTarget.id ? { ...m, deleted: true } : m))
    );
    deleteMessage(deleteTarget.id, activeChannelId);
    setDeleteTarget(null);
  };

  const handleCancelDelete = () => {
    setDeleteTarget(null);
  };

  const toggleReaction = (msg: ChatMessage, emoji: string) => {
    if (!activeChannelId || !currentUserId) return;

    const existing = msg.reactions?.find((r) => r.emoji === emoji);
    const alreadyReacted = existing?.userIds.includes(currentUserId);

    // Find if user has ANY existing reaction on this message
    const previousReaction = msg.reactions?.find(
      (r) => r.emoji !== emoji && r.userIds.includes(currentUserId)
    );

    if (alreadyReacted) {
      // Same emoji clicked again → remove it (toggle off)
      removeReaction(msg.id, activeChannelId, emoji);
    } else {
      // Remove previous reaction first if exists
      if (previousReaction) {
        removeReaction(msg.id, activeChannelId, previousReaction.emoji);
      }
      addReaction(msg.id, activeChannelId, emoji);
    }

    setEmojiPickerFor(null);
  };

  const QUICK_EMOJIS = ['👍', '❤️', '😂', '🎉', '😮', '🔥'];

  const handleStartEdit = (msg: ChatMessage) => {
    setEditingMessageId(msg.id);
    setEditInput(msg.content);
  };

  const handleCancelEdit = () => {
    setEditingMessageId(null);
    setEditInput('');
  };

  const handleSaveEdit = () => {
    const trimmed = editInput.trim();
    if (!trimmed || !editingMessageId || !activeChannelId) return;

    setMessages((prev) =>
      prev.map((m) =>
        m.id === editingMessageId ? { ...m, content: trimmed, isEdited: true } : m
      )
    );
    editMessage(editingMessageId, activeChannelId, trimmed);
    setEditingMessageId(null);
    setEditInput('');
  };

  // ── Composer input: now a <textarea>, so it supports multi-line text ─────
  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setMessageInput(e.target.value);
    if (activeChannelId) sendTypingStart(activeChannelId);
  };

  // Enter alone   -> send the message
  // Shift + Enter -> insert a newline (default textarea behavior, so we
  //                  simply don't call preventDefault in that case)
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // Auto-grow the textarea as the user adds lines, capped at a max height
  // so a very long message doesn't take over the whole screen.
  const handleTextareaInput = (e: React.FormEvent<HTMLTextAreaElement>) => {
    const el = e.currentTarget;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    setViewOverride(true);
    window.location.reload();
  };

  if (!isAuthenticated && showAuth) {
    return (
      <AuthPage 
        onBackToLanding={() => setShowAuth(false)} 
        onSuccess={() => {
          setShowAuth(false);
          setViewOverride(false);
        }} 
      />
    );
  }

  // --- RENDERING MODULE 2: FIGMA-COMPLIANT LANDING PLATFORM ---
  if (isViewingLanding) {
    return (
      <div className="min-h-screen w-screen text-gray-200 antialiased flex flex-col relative overflow-x-hidden bg-[#000000] select-none">
        
        <header className="absolute top-0 inset-x-0 max-w-7xl w-full mx-auto px-8 h-24 flex items-center justify-between z-50">
          <motion.div 
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            className="flex items-center gap-3 font-bold text-white text-xl tracking-tight cursor-pointer"
            onClick={() => setViewOverride(true)}
          >
            <div className="h-10 w-10 bg-gradient-to-tr from-indigo-600 to-fuchsia-600 rounded-xl flex items-center justify-center shadow-lg shadow-indigo-600/20">
              <MessageSquare size={20} className="text-white" />
            </div>
            <span className="font-extrabold tracking-wide text-transparent bg-clip-text bg-gradient-to-r from-white to-gray-400">SyncGrid</span>
          </motion.div>

          <motion.div 
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            className="flex items-center gap-4"
          >
            {isAuthenticated ? (
              <button 
                onClick={() => setViewOverride(false)}
                className="px-6 py-2.5 text-sm font-bold rounded-full border border-indigo-500/30 bg-[#0c0d0f]/80 backdrop-blur-md text-indigo-300 hover:bg-indigo-500/20 transition flex items-center gap-2"
              >
                <LayoutDashboard size={16} /> Enter Console
              </button>
            ) : (
              <button 
                onClick={() => setShowAuth(true)}
                className="px-6 py-2.5 text-sm font-bold rounded-full bg-white text-black hover:bg-gray-200 transition shadow-md hover:shadow-white/10"
              >
                Launch Console
              </button>
            )}
          </motion.div>
        </header>

        <div className="relative w-full pt-40 pb-32 flex flex-col items-center justify-center min-h-[85vh]">
          
          <div className="absolute inset-0 z-0 pointer-events-none overflow-hidden">
            <BackgroundParticles />
            <img 
              src="/hero-bg.jpg" 
              alt="Background Blueprint" 
              className="w-full h-full object-cover opacity-60"
            />
            <div className="absolute inset-0 bg-gradient-to-b from-[#000000]/40 via-[#000000]/60 to-[#000000]" />
          </div>

          <main className="relative z-10 max-w-6xl mx-auto text-center px-6 flex flex-col items-center w-full">
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6 }}
              className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-white/[0.05] border border-white/[0.1] text-gray-300 text-xs font-semibold mb-6 backdrop-blur-md shadow-lg"
            >
              <Terminal size={12} className="text-fuchsia-400" /> WebSockets &bull; Distributed Pub/Sub Mesh
            </motion.div>

            <motion.h1 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.1 }}
              className="text-5xl md:text-7xl font-black text-white tracking-tight leading-[1.05] max-w-4xl drop-shadow-2xl"
            >
              A Fast Workspace. <br />
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 via-purple-400 to-fuchsia-400">
                Scalable Core Architecture.
              </span>
            </motion.h1>

            <motion.p 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.2 }}
              className="mt-6 text-base md:text-lg text-gray-300 max-w-2xl leading-relaxed font-medium drop-shadow-md"
            >
              A production-ready distributed system messaging experience built explicitly over raw WebSockets. Synchronized real-time execution nodes engineered for absolute agility.
            </motion.p>

            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.3 }}
              className="mt-10"
            >
              <button 
                onClick={() => {
                  if (isAuthenticated) setViewOverride(false);
                  else setShowAuth(true);
                }}
                className="px-8 py-4 rounded-full bg-gradient-to-r from-indigo-600 via-purple-600 to-fuchsia-600 hover:opacity-90 text-white text-base font-bold transition flex items-center justify-center gap-2 shadow-[0_0_40px_rgba(168,85,247,0.4)] active:scale-[0.99]"
              >
                {isAuthenticated ? 'Return to Active Space' : 'Get Started Now'} 
                <ChevronRight size={18} />
              </button>
            </motion.div>
          </main>
        </div>

        <div className="relative bg-[#000000] w-full z-20 flex-1">
          <div className="max-w-6xl mx-auto px-6 pb-24 -mt-16">
            <motion.div 
              initial={{ opacity: 0, y: 25 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, delay: 0.5 }}
              className="grid grid-cols-1 md:grid-cols-3 gap-6 text-left w-full"
            >
              <div className="p-6 rounded-2xl border border-white/[0.06] bg-[#0a0a0c] backdrop-blur-xl transition hover:border-white/[0.12] hover:bg-[#101114] shadow-2xl">
                <Zap size={22} className="text-indigo-400 mb-4" />
                <h3 className="text-xs font-bold text-white uppercase tracking-widest">Raw WebSocket</h3>
                <p className="text-sm text-gray-400 mt-2.5 leading-relaxed">Sub-millisecond data pipelines over absolute custom JSON handshakes bypassing third-party wrapper abstraction lag.</p>
              </div>
              <div className="p-6 rounded-2xl border border-white/[0.06] bg-[#0a0a0c] backdrop-blur-xl transition hover:border-white/[0.12] hover:bg-[#101114] shadow-2xl">
                <Shield size={22} className="text-purple-400 mb-4" />
                <h3 className="text-xs font-bold text-white uppercase tracking-widest">State Syncing</h3>
                <p className="text-sm text-gray-400 mt-2.5 leading-relaxed">State unified seamlessly using atomic store models alongside cached queries for zero network thrashing.</p>
              </div>
              <div className="p-6 rounded-2xl border border-white/[0.06] bg-[#0a0a0c] backdrop-blur-xl transition hover:border-white/[0.12] hover:bg-[#101114] shadow-2xl">
                <MessageSquare size={22} className="text-fuchsia-400 mb-4" />
                <h3 className="text-xs font-bold text-white uppercase tracking-widest">Horizontally Scaled</h3>
                <p className="text-sm text-gray-400 mt-2.5 leading-relaxed">Multi-instance routing pipelines optimized through sub-millisecond in-memory cross-plane routing engines.</p>
              </div>
            </motion.div>
          </div>
        </div>

        <footer className="relative w-full border-t border-white/[0.06] bg-[#050505] z-20">
          <div className="max-w-7xl mx-auto px-8 py-8 flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-2 text-[10px] font-bold text-gray-500 tracking-widest uppercase">
              <span>SYNCGRID CORE MODULES</span>
              <span className="text-gray-800">&bull;</span>
              <span>EST. 2026</span>
            </div>
            
            <div className="flex items-center gap-2 text-gray-400">
              <a href="https://github.com" target="_blank" rel="noreferrer" title="GitHub Source" className="hover:text-white transition p-2 rounded-xl hover:bg-white/[0.05]">
                <GithubIcon />
              </a>
              <a href="https://twitter.com" target="_blank" rel="noreferrer" title="Twitter Network" className="hover:text-white transition p-2 rounded-xl hover:bg-white/[0.05]">
                <TwitterIcon />
              </a>
              <a href="https://linkedin.com" target="_blank" rel="noreferrer" title="LinkedIn Professional" className="hover:text-white transition p-2 rounded-xl hover:bg-white/[0.05]">
                <LinkedinIcon />
              </a>
            </div>
          </div>
        </footer>
      </div>
    );
  }

  // --- RENDERING MODULE 3: PRODUCTION SYSTEM DESKTOP ENGINE ---
  return (
    <div className="flex h-screen w-screen overflow-hidden bg-[#1a1d21] text-gray-200 antialiased">
      <div className="flex p-3 w-18 flex-col items-center justify-between border-r border-gray-800 bg-[#121416]">
        <div className="flex flex-col items-center gap-4 w-full">
          <div className="flex h-12 w-12 cursor-pointer items-center justify-center rounded-xl bg-gradient-to-tr from-indigo-600 to-purple-600 font-bold text-white transition-all hover:rounded-2xl shadow-md shadow-indigo-600/10">
            S1
          </div>
          <div className="flex h-12 w-12 cursor-pointer items-center justify-center rounded-xl bg-gray-800 border border-gray-700 font-bold text-gray-400 transition-all hover:bg-gray-700 hover:text-white hover:rounded-2xl">
            +
          </div>
        </div>
        
        <div className="relative">
          <button 
            onClick={() => setShowProfileMenu(!showProfileMenu)}
            className="h-10 w-10 rounded-full bg-gradient-to-tr from-purple-500 to-fuchsia-500 border border-gray-700 flex items-center justify-center font-bold text-white shadow-md hover:scale-105 transition"
          >
            <User size={16} />
          </button>

          <AnimatePresence>
            {showProfileMenu && (
              <>
                <div className="fixed inset-0 z-20" onClick={() => setShowProfileMenu(false)} />
                <motion.div 
                  initial={{ opacity: 0, scale: 0.95, y: 10 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95, y: 10 }}
                  className="absolute bottom-12 left-0 z-30 w-48 rounded-lg border border-gray-800 bg-[#1f2226] p-1.5 shadow-xl"
                >
                  <button 
                    onClick={() => { setViewOverride(true); setShowProfileMenu(false); }}
                    className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-xs font-semibold text-gray-300 hover:bg-gray-800 hover:text-white transition"
                  >
                    <LayoutDashboard size={14} /> View Landing Page
                  </button>
                  <div className="my-1 border-t border-gray-800" />
                  <button 
                    onClick={handleLogout}
                    className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-xs font-semibold text-rose-400 hover:bg-rose-500/10 transition"
                  >
                    <LogOut size={14} /> Disconnect Session
                  </button>
                </motion.div>
              </>
            )}
          </AnimatePresence>
        </div>
      </div>

      <div className="flex w-64 flex-col bg-[#1f2226]">
        <div className="flex h-14 items-center justify-between border-b border-gray-800 px-4 font-bold text-white shadow-sm">
          <span className="tracking-wide">Core Development</span>
        </div>
        
        <div className="flex-1 overflow-y-auto px-2 py-4">
          <div className="mb-4">
            <p className="px-2 text-xs font-bold uppercase tracking-wider text-gray-500">Channels</p>
            <div className="mt-2 space-y-0.5">
              {channels.map((channel) => (
                <button
                  key={channel.id}
                  onClick={() => setActiveChannel(channel.id)}
                  className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm font-semibold transition ${
                    activeChannelId === channel.id
                      ? 'bg-indigo-600/20 text-indigo-400 border border-indigo-500/10'
                      : 'text-gray-400 hover:bg-gray-800 hover:text-gray-200'
                  }`}
                >
                  <Hash size={15} className={activeChannelId === channel.id ? 'text-indigo-400' : 'text-gray-500'} />
                  {channel.name}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="flex flex-1 flex-col bg-[#1a1d21]">
        <div className="flex h-14 items-center border-b border-gray-800 px-6 shadow-sm">
          <div className="flex items-center gap-2 font-bold text-white">
            <Hash size={18} className="text-gray-500" />
            <span>{channels.find(c => c.id === activeChannelId)?.name || 'select-a-channel'}</span>
          </div>
        </div>

        <div
          ref={messagesContainerRef}
          onScroll={handleMessagesScroll}
          className="flex-1 overflow-y-auto p-6 space-y-4"
        >
          {isLoadingMore && (
            <p className="text-center text-xs text-gray-500 italic">Loading older messages...</p>
          )}
          {!hasMoreHistory && messages.length > 0 && (
            <p className="text-center text-xs text-gray-600 italic">Beginning of channel history</p>
          )}

          <div className="flex items-start gap-3">
            <div className="h-9 w-9 rounded-lg bg-indigo-600/10 border border-indigo-500/20 flex items-center justify-center font-bold text-indigo-400 shadow-sm">S</div>
            <div>
              <div className="flex items-baseline gap-2">
                <span className="font-bold text-white text-sm">System Client</span>
                <span className="text-[10px] text-gray-500 font-semibold">Online</span>
              </div>
              <p className="text-sm text-gray-300 mt-0.5 max-w-2xl leading-relaxed">
                Premium Figma-aligned UI compiled. Feel free to access your new bottom-left profile avatar to check out seamless navigation jumping.
              </p>
            </div>
          </div>

          {messages.map((msg) => {
            const isOwnMessage = msg.user.id === 'me' || (currentUserId !== null && msg.user.id === currentUserId);
            const isReply = !!msg.parentMessageId;
            const isBeingEdited = editingMessageId === msg.id;

            return (
              <div
                key={msg.tempId || msg.id}
                className={`group flex items-start gap-3 ${isReply ? 'ml-10 pl-3 border-l-2 border-gray-800' : ''}`}
              >
                <div className="h-9 w-9 rounded-lg bg-purple-600/10 border border-purple-500/20 flex items-center justify-center font-bold text-purple-400 shadow-sm">
                  {msg.user.name.charAt(0).toUpperCase()}
                </div>
                <div className="flex-1">
                  <div className="flex items-baseline gap-2">
                    <span className="font-bold text-white text-sm">{msg.user.name}</span>
                    <span className="text-[10px] text-gray-500 font-semibold">
                      {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                    {msg.pending && (
                      <span className="text-[10px] text-gray-600 font-semibold italic">sending...</span>
                    )}
                    {msg.isEdited && !msg.deleted && (
                      <span className="text-[10px] text-gray-600 font-semibold italic">(edited)</span>
                    )}

                    {!msg.deleted && !isBeingEdited && (
                      <span className="opacity-0 group-hover:opacity-100 transition flex items-center gap-2 ml-1">
                        <button
                          onClick={() => setEmojiPickerFor(emojiPickerFor === msg.id ? null : msg.id)}
                          className="text-[10px] text-gray-500 hover:text-yellow-400 font-semibold"
                        >
                          React
                        </button>
                        <button
                          onClick={() => setReplyingTo(msg)}
                          className="text-[10px] text-gray-500 hover:text-indigo-400 font-semibold"
                        >
                          Reply
                        </button>
                        {isOwnMessage && (
                          <>
                            <button
                              onClick={() => handleStartEdit(msg)}
                              className="text-[10px] text-gray-500 hover:text-amber-400 font-semibold"
                            >
                              Edit
                            </button>
                            <button
                              onClick={() => handleRequestDelete(msg)}
                              className="text-[10px] text-gray-500 hover:text-rose-400 font-semibold"
                            >
                              Delete
                            </button>
                          </>
                        )}
                      </span>
                    )}
                  </div>

                  {/* ── Reaction picker: quick row + full picker toggle ───────── */}
                  {emojiPickerFor === msg.id && (
                    <div className="relative">
                      <div
                        className="fixed inset-0 z-20"
                        onClick={() => { setEmojiPickerFor(null); setFullPickerFor(null); }}
                      />
                      <div className="absolute z-30 mt-1 flex flex-col gap-1.5">
                        <div className="flex items-center gap-1 rounded-lg border border-gray-800 bg-[#1f2226] px-2 py-1.5 shadow-xl">
                          {QUICK_EMOJIS.map((emoji) => (
                            <button
                              key={emoji}
                              onClick={() => toggleReaction(msg, emoji)}
                              className="text-base hover:scale-125 transition-transform px-0.5"
                            >
                              {emoji}
                            </button>
                          ))}
                          <div className="w-px h-5 bg-gray-800 mx-0.5" />
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setFullPickerFor(fullPickerFor === msg.id ? null : msg.id);
                            }}
                            className="text-gray-500 hover:text-gray-300 px-1"
                            title="More emojis"
                          >
                            <Smile size={16} />
                          </button>
                        </div>

                        {/* Full emoji picker */}
                        {fullPickerFor === msg.id && (
                          <div onClick={(e) => e.stopPropagation()}>
                            <EmojiPicker
                              theme={Theme.DARK}
                              onEmojiClick={(emojiData: EmojiClickData) => {
                                toggleReaction(msg, emojiData.emoji);
                                setFullPickerFor(null);
                              }}
                              width={300}
                              height={350}
                            />
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {msg.deleted ? (
                    <p className="text-sm mt-0.5 max-w-2xl leading-relaxed text-gray-600 italic">
                      This message was deleted
                    </p>
                  ) : isBeingEdited ? (
                    <div className="mt-1 flex items-center gap-2 max-w-2xl">
                      <input
                        type="text"
                        value={editInput}
                        onChange={(e) => setEditInput(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') { e.preventDefault(); handleSaveEdit(); }
                          if (e.key === 'Escape') handleCancelEdit();
                        }}
                        autoFocus
                        className="flex-1 bg-[#22252a] border border-gray-700 rounded-lg px-3 py-1.5 text-sm text-gray-200 outline-none focus:border-indigo-500"
                      />
                      <button
                        onClick={handleSaveEdit}
                        className="text-xs text-indigo-400 hover:text-indigo-300 font-semibold"
                      >
                        Save
                      </button>
                      <button
                        onClick={handleCancelEdit}
                        className="text-xs text-gray-500 hover:text-gray-300 font-semibold"
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <p className={`text-sm mt-0.5 max-w-2xl leading-relaxed whitespace-pre-wrap ${msg.pending ? 'text-gray-500' : 'text-gray-300'}`}>
                      {msg.content}
                    </p>
                  )}

                  {/* ── Reaction pills ──────────────────────────────────────── */}
                  {!msg.deleted && msg.reactions && msg.reactions.length > 0 && (
                    <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                      {msg.reactions.map((r) => {
                        const reactedByMe = currentUserId ? r.userIds.includes(currentUserId) : false;
                        return (
                          <button
                            key={r.emoji}
                            onClick={() => toggleReaction(msg, r.emoji)}
                            className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-xs border transition ${
                              reactedByMe
                                ? 'bg-indigo-600/20 border-indigo-500/40 text-indigo-300'
                                : 'bg-[#22252a] border-gray-800 text-gray-400 hover:border-gray-700'
                            }`}
                          >
                            <span>{r.emoji}</span>
                            <span className="font-semibold">{r.userIds.length}</span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            );
          })}

          {/* ── Typing indicator ─────────────────────────────────────────── */}
          {Object.values(typingUsers).length > 0 && (
            <p className="text-xs text-gray-500 italic px-1">
              {Object.values(typingUsers).join(', ')} {Object.values(typingUsers).length === 1 ? 'is' : 'are'} typing...
            </p>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* ── Reply banner ──────────────────────────────────────────────────── */}
        {replyingTo && (
          <div className="px-4 pt-2 flex items-center justify-between bg-[#1a1d21]">
            <span className="text-xs text-gray-400">
              Replying to <span className="font-semibold text-gray-300">{replyingTo.user.name}</span>: "{replyingTo.content.slice(0, 40)}{replyingTo.content.length > 40 ? '...' : ''}"
            </span>
            <button
              onClick={() => setReplyingTo(null)}
              className="text-xs text-gray-500 hover:text-gray-300 font-semibold"
            >
              Cancel
            </button>
          </div>
        )}

        {/* ── Composer: now a multi-line <textarea> ───────────────────────────
            Enter alone sends the message; Shift+Enter inserts a newline.
            The textarea auto-grows (capped at max-h-40 worth of pixels via
            handleTextareaInput) so longer messages remain fully visible
            while typing, like WhatsApp/Slack/Discord composers. */}
        <div className="p-4 bg-[#1a1d21]">
          <div className="relative flex items-end rounded-xl border border-gray-800 bg-[#22252a] px-4 py-3 focus-within:border-gray-700 shadow-lg transition">
            <textarea
              ref={textareaRef}
              value={messageInput}
              onChange={handleInputChange}
              onKeyDown={handleKeyDown}
              onInput={handleTextareaInput}
              placeholder={replyingTo ? `Reply to ${replyingTo.user.name}...` : `Message #${channels.find(c => c.id === activeChannelId)?.name || 'channel'}...`}
              rows={1}
              className="w-full bg-transparent text-sm text-gray-200 placeholder-gray-600 outline-none resize-none max-h-40 overflow-y-auto leading-relaxed"
            />
            <button
              onClick={() => setShowInputEmojiPicker(!showInputEmojiPicker)}
              className="ml-2 text-gray-500 hover:text-yellow-400 transition flex-shrink-0"
              title="Add emoji"
            >
              <Smile size={18} />
            </button>

            {/* Input emoji picker */}
            {showInputEmojiPicker && (
              <>
                <div className="fixed inset-0 z-20" onClick={() => setShowInputEmojiPicker(false)} />
                <div className="absolute bottom-12 right-2 z-30" onClick={(e) => e.stopPropagation()}>
                  <EmojiPicker
                    theme={Theme.DARK}
                    onEmojiClick={(emojiData: EmojiClickData) => {
                      setMessageInput((prev) => prev + emojiData.emoji);
                    }}
                    width={300}
                    height={350}
                  />
                </div>
              </>
            )}
          </div>
          <p className="text-[10px] text-gray-600 mt-1 px-1">Enter to send &bull; Shift+Enter for new line</p>
        </div>
      </div>

      {/* ── Delete Confirmation Modal ─────────────────────────────────────── */}
      <AnimatePresence>
        {deleteTarget && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40"
              onClick={handleCancelDelete}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-full max-w-sm rounded-xl border border-gray-800 bg-[#1f2226] p-5 shadow-2xl"
            >
              <h3 className="text-sm font-bold text-white">Delete message?</h3>
              <p className="text-xs text-gray-400 mt-2 leading-relaxed">
                This can't be undone. Everyone in this channel will see that the message was deleted.
              </p>
              <div className="mt-4 p-2.5 rounded-lg bg-[#22252a] border border-gray-800">
                <p className="text-xs text-gray-400 truncate">"{deleteTarget.content}"</p>
              </div>
              <div className="mt-4 flex items-center justify-end gap-2">
                <button
                  onClick={handleCancelDelete}
                  className="px-3 py-1.5 rounded-lg text-xs font-semibold text-gray-300 hover:bg-gray-800 transition"
                >
                  Cancel
                </button>
                <button
                  onClick={handleConfirmDelete}
                  className="px-3 py-1.5 rounded-lg text-xs font-semibold text-white bg-rose-600 hover:bg-rose-500 transition"
                >
                  Delete
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}