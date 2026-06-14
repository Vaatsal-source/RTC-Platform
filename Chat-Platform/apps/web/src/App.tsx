import React, { useState } from 'react';
import { useAppStore } from './store/useAppStore';
import AuthPage from './components/AuthPage';
import BackgroundParticles from './components/BackgroundParticles';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Hash, MessageSquare, Terminal, Zap, Shield, ChevronRight, 
  LogOut, LayoutDashboard, User, ChevronDown, UserPlus, Settings, Plus, Lock 
} from 'lucide-react';
import { MessageFeed } from './components/MessageFeed';
import { MessageProps, MemberProps } from './components/types';
import { 
  CreateWorkspaceModal, 
  InviteMembersModal, 
  WorkspaceSettingsModal,
  CreateChannelModal,
  ChannelSettingsModal
} from './components/Modals';

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

export default function App() {
  const { activeChannelId, setActiveChannel } = useAppStore();
  const [showAuth, setShowAuth] = useState(false);
  const [viewOverride, setViewOverride] = useState(true); 
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const [showWorkspaceDropdown, setShowWorkspaceDropdown] = useState(false);
  
  // Modal States
  const [showCreateWorkspace, setShowCreateWorkspace] = useState(false);
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [showCreateChannel, setShowCreateChannel] = useState(false);
  const [showChannelSettings, setShowChannelSettings] = useState(false);
  const [selectedChannelId, setSelectedChannelId] = useState<string | null>(null);

  // Mock Data for UI Simulation
  const userRole = 'admin'; 
  const mockMembers: MemberProps[] = [
    { id: '1', name: 'Vaatsalya', role: 'admin', status: 'online' },
    { id: '2', name: 'John Dev', role: 'member', status: 'online' },
    { id: '3', name: 'Sarah Archi', role: 'member', status: 'offline' },
  ];

  const [messages, setMessages] = useState<MessageProps[]>([
    {
      id: '1',
      user: { name: 'System Client', isSystem: true },
      content: 'Premium Figma-aligned UI compiled. Feel free to check out seamless navigation jumping.',
      timestamp: 'Today at 7:42 PM'
    }
  ]);

  const isAuthenticated = !!localStorage.getItem('token');
  const isViewingLanding = !isAuthenticated || viewOverride;

  const channels = [
    { id: '1', name: 'general', isPrivate: false },
    { id: '2', name: 'engineering', isPrivate: false },
    { id: '3', name: 'private-ops', isPrivate: true },
  ];

  const handleLogout = () => {
    localStorage.removeItem('token');
    setViewOverride(true);
    window.location.reload();
  };

  const handleThreadOpen = (messageId: string) => {
    console.log("Opening context thread for message:", messageId);
    // You can handle sidebar state tracking logic here later if needed
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
        
        {/* Global Navigation Header - Pinned at the top over everything */}
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

        {/* HERO SECTION - Text sitting ON TOP of the Blueprint Image */}
        <div className="relative w-full pt-40 pb-32 flex flex-col items-center justify-center min-h-[85vh]">
          
          {/* THE BACKGROUND IMAGE LAYER */}
          <div className="absolute inset-0 z-0 pointer-events-none overflow-hidden">
            <BackgroundParticles />
            <img 
              src="/hero-bg.jpg" 
              alt="Background Blueprint" 
              className="w-full h-full object-cover opacity-60"
            />
            {/* The Gradient Fade - Transitions the image smoothly into the solid black section below */}
            <div className="absolute inset-0 bg-gradient-to-b from-[#000000]/40 via-[#000000]/60 to-[#000000]" />
          </div>

          {/* THE FOREGROUND TEXT LAYER */}
          <main className="relative z-10 max-w-6xl mx-auto text-center px-6 flex flex-col items-center w-full">
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
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

        {/* CARDS SECTION - Sits elegantly below the hero, hugging the fade transition */}
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

        {/* FOOTER SECTION */}
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
    <div className="flex h-screen w-screen overflow-hidden bg-[#313338] text-gray-200 antialiased select-none">
      
      {/* COLUMN 1: SERVER TRACK */}
      <nav className="w-[72px] flex flex-col items-center py-3 bg-[#1e1f22] gap-2 z-10 shrink-0">
        <div className="flex h-12 w-12 cursor-pointer items-center justify-center rounded-2xl bg-indigo-600 font-bold text-white transition-all hover:rounded-xl shadow-md">
          S1
        </div>
        <div className="h-[2px] w-8 bg-[#35373c] rounded-full my-1" />
        <button 
          onClick={() => setShowCreateWorkspace(true)}
          className="flex h-12 w-12 cursor-pointer items-center justify-center rounded-3xl bg-[#313338] font-bold text-emerald-500 transition-all hover:bg-emerald-500 hover:text-white hover:rounded-2xl"
        >
          +
        </button>
      </nav>

      {/* COLUMN 2: CHANNEL NAV PANEL */}
      <aside className="w-60 bg-[#2b2d31] flex flex-col shrink-0 relative z-10">
        <div 
          className="flex h-12 items-center justify-between border-b border-black/20 px-4 font-bold text-white shadow-sm cursor-pointer hover:bg-[#35373c] transition-colors relative"
          onClick={() => setShowWorkspaceDropdown(!showWorkspaceDropdown)}
        >
          <span className="tracking-wide text-[15px]">Core Development</span>
          <ChevronDown size={16} className={`text-white transition-transform duration-200 ${showWorkspaceDropdown ? 'rotate-180' : ''}`} />
          
          <AnimatePresence>
            {showWorkspaceDropdown && (
              <>
                <div className="fixed inset-0 z-20" onClick={(e) => { e.stopPropagation(); setShowWorkspaceDropdown(false); }} />
                <motion.div 
                  initial={{ opacity: 0, scale: 0.95, y: -10 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95, y: -10 }}
                  className="absolute top-12 left-2 right-2 z-30 rounded-md bg-[#111214] p-1.5 shadow-xl border border-black/40"
                  onClick={(e) => e.stopPropagation()}
                >
                  <button 
                    onClick={() => { setShowInviteModal(true); setShowWorkspaceDropdown(false); }}
                    className="flex w-full items-center justify-between rounded-sm px-2 py-2 text-xs font-medium text-indigo-400 hover:bg-[#4752c4] hover:text-white transition-colors"
                  >
                    Invite People <UserPlus size={14} />
                  </button>
                  
                  {userRole === 'admin' && (
                    <>
                      <div className="my-1 border-t border-[#1f2023]" />
                      <button 
                        onClick={() => { setShowSettingsModal(true); setShowWorkspaceDropdown(false); }}
                        className="flex w-full items-center justify-between rounded-sm px-2 py-2 text-xs font-medium text-[#dbdee1] hover:bg-[#4752c4] hover:text-white transition-colors"
                      >
                        Workspace Settings <Settings size={14} />
                      </button>
                    </>
                  )}
                </motion.div>
              </>
            )}
          </AnimatePresence>
        </div>
        
        <div className="flex-1 overflow-y-auto px-2 py-3">
          <div className="mb-4">
            <div className="flex items-center justify-between px-2 mb-1 group/header relative">
              <div className="flex items-center gap-0.5 cursor-pointer text-[#949ba4] hover:text-[#dbdee1] transition-colors">
                <ChevronDown size={12} className="text-[#949ba4]" />
                <p className="text-[11px] font-bold uppercase tracking-wider">Channels</p>
              </div>
              <button 
                onClick={() => setShowCreateChannel(true)}
                className="text-[#949ba4] hover:text-[#dbdee1] transition-colors p-0.5"
              >
                <Plus size={14} />
              </button>
            </div>
            <div className="mt-1 space-y-0.5">
              {channels.map((channel) => (
                <div key={channel.id} className="group relative">
                  <button
                    onClick={() => setActiveChannel(channel.id)}
                    className={`flex w-full items-center gap-2 rounded-[4px] px-2 py-1.5 text-[15px] font-medium transition-colors ${
                      activeChannelId === channel.id
                        ? 'bg-[#3f4248] text-white'
                        : 'text-[#949ba4] hover:bg-[#36373d] hover:text-[#dbdee1]'
                    }`}
                  >
                    {channel.isPrivate ? (
                      <Lock size={14} className={activeChannelId === channel.id ? 'text-white' : 'text-[#80848e]'} />
                    ) : (
                      <Hash size={18} className={activeChannelId === channel.id ? 'text-white' : 'text-[#80848e]'} />
                    )}
                    <span className="truncate">{channel.name}</span>
                  </button>
                  <button 
                    onClick={(e) => { e.stopPropagation(); setSelectedChannelId(channel.id); setShowChannelSettings(true); }}
                    className="absolute right-2 top-2 opacity-0 group-hover:opacity-100 text-[#b5bac1] hover:text-[#dbdee1] transition"
                  >
                    <Settings size={14} />
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* DISCORD-COMPLIANT USER DRAWER BAR */}
        <div className="bg-[#232428] h-[52px] px-2 flex items-center justify-between relative">
          <button 
            onClick={() => setShowProfileMenu(!showProfileMenu)}
            className="flex items-center gap-2 p-1 rounded hover:bg-[#35373c] transition-colors text-left flex-1 min-w-0"
          >
            <div className="h-8 w-8 rounded-full bg-gradient-to-tr from-purple-500 to-fuchsia-500 flex items-center justify-center font-bold text-white text-xs shrink-0 relative">
              <User size={14} />
              <div className="absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full bg-emerald-500 border-2 border-[#232428]" />
            </div>
            <div className="truncate leading-tight">
              <p className="text-xs font-bold text-white truncate">Vaatsalya</p>
              <p className="text-[11px] text-[#949ba4] truncate">Online</p>
            </div>
          </button>

          <AnimatePresence>
            {showProfileMenu && (
              <>
                <div className="fixed inset-0 z-20" onClick={() => setShowProfileMenu(false)} />
                <motion.div 
                  initial={{ opacity: 0, scale: 0.95, y: -10 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95, y: -10 }}
                  className="absolute bottom-14 left-2 z-30 w-48 rounded-md bg-[#111214] p-1.5 shadow-xl border border-black/40"
                >
                  <button 
                    onClick={() => { setViewOverride(true); setShowProfileMenu(false); }}
                    className="flex w-full items-center gap-2 rounded-sm px-2 py-2 text-xs font-medium text-[#dbdee1] hover:bg-[#4752c4] hover:text-white transition-colors"
                  >
                    <LayoutDashboard size={14} /> View Landing Page
                  </button>
                  <div className="my-1 border-t border-[#1f2023]" />
                  <button 
                    onClick={handleLogout}
                    className="flex w-full items-center gap-2 rounded-sm px-2 py-2 text-xs font-medium text-rose-400 hover:bg-rose-500/10 transition-colors"
                  >
                    <LogOut size={14} /> Disconnect Session
                  </button>
                </motion.div>
              </>
            )}
          </AnimatePresence>
        </div>
      </aside>

      {/* COLUMN 3: MAIN CHAT INTERFACE */}
      <div className="flex flex-1 flex-col bg-[#313338] min-w-0">
        <div className="flex h-12 items-center border-b border-black/20 px-4 shadow-sm shrink-0">
          <div className="flex items-center gap-2 font-bold text-white text-[15px]">
            <Hash size={24} className="text-[#80848e]" />
            <span>{channels.find(c => c.id === activeChannelId)?.name || 'select-a-channel'}</span>
          </div>
        </div>

        {/* INTEGRATED CHAT FEED CONTAINER MODULE */}
        <MessageFeed messages={messages} onOpenThread={handleThreadOpen} />

        {/* TEXT INPUT ZONE */}
        <div className="px-4 pb-6 bg-[#313338]">
          <div className="relative flex items-center rounded-lg bg-[#383a40] px-4 py-2.5 shadow-md">
            <input
              type="text"
              placeholder={`Message #${channels.find(c => c.id === activeChannelId)?.name || 'channel'}`}
              className="w-full bg-transparent text-[15px] text-[#dbdee1] placeholder-[#6d737d] outline-none"
            />
          </div>
        </div>
      </div>

      {/* MODAL OVERLAY LAYER */}
      {showCreateWorkspace && <CreateWorkspaceModal onClose={() => setShowCreateWorkspace(false)} />}
      {showInviteModal && <InviteMembersModal onClose={() => setShowInviteModal(false)} />}
      {showSettingsModal && <WorkspaceSettingsModal members={mockMembers} onClose={() => setShowSettingsModal(false)} />}
      {showCreateChannel && <CreateChannelModal onClose={() => setShowCreateChannel(false)} />}
      {showChannelSettings && <ChannelSettingsModal channelName={channels.find(c => c.id === selectedChannelId)?.name || 'channel'} onClose={() => setShowChannelSettings(false)} />}
    </div>
  );
}