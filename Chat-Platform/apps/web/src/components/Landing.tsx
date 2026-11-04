import { motion } from 'framer-motion';
import { ChevronRight, MessageSquare, Shield, Terminal, Zap } from 'lucide-react';
import BackgroundParticles from './BackgroundParticles';

const GithubIcon = () => (
  <svg className="h-5 w-5 fill-current" viewBox="0 0 24 24" aria-hidden="true">
    <path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12" />
  </svg>
);

const features = [
  { Icon: Zap, tone: 'text-indigo-400', title: 'Raw WebSocket', body: 'A strict JSON protocol over the `ws` library — no Socket.IO abstraction, every frame validated on the server.' },
  { Icon: Shield, tone: 'text-purple-400', title: 'Event-driven', body: 'Messages publish events on Redis Pub/Sub; notifications, audit and activity are handled by BullMQ workers.' },
  { Icon: MessageSquare, tone: 'text-fuchsia-400', title: 'Horizontally scaled', body: 'Run as many WebSocket instances as you like — Redis fans every broadcast out to the right sockets.' },
];

export default function Landing({ onLaunch }: { onLaunch: () => void }) {
  return (
    <div className="relative flex min-h-screen w-screen select-none flex-col overflow-x-hidden bg-black text-gray-200 antialiased">
      <header className="absolute inset-x-0 top-0 z-50 mx-auto flex h-24 w-full max-w-7xl items-center justify-between px-8">
        <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} className="flex items-center gap-3 text-xl font-bold tracking-tight text-white">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-tr from-indigo-600 to-fuchsia-600 shadow-lg shadow-indigo-600/20"><MessageSquare size={20} className="text-white" /></div>
          <span className="bg-gradient-to-r from-white to-gray-400 bg-clip-text font-extrabold tracking-wide text-transparent">SyncGrid</span>
        </motion.div>
        <motion.button initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} onClick={onLaunch} className="rounded-full bg-white px-6 py-2.5 text-sm font-bold text-black shadow-md transition hover:bg-gray-200">Launch Console</motion.button>
      </header>

      <div className="relative flex min-h-[85vh] w-full flex-col items-center justify-center pb-32 pt-40">
        <div className="pointer-events-none absolute inset-0 z-0 overflow-hidden">
          <BackgroundParticles />
          <img src="/hero-bg.jpg" alt="" className="h-full w-full object-cover opacity-60" />
          <div className="absolute inset-0 bg-gradient-to-b from-black/40 via-black/60 to-black" />
        </div>
        <main className="relative z-10 mx-auto flex w-full max-w-6xl flex-col items-center px-6 text-center">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="mb-6 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-1.5 text-xs font-semibold text-gray-300 shadow-lg backdrop-blur-md">
            <Terminal size={12} className="text-fuchsia-400" /> WebSockets &bull; Redis Pub/Sub &bull; BullMQ
          </motion.div>
          <motion.h1 initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, delay: 0.1 }} className="max-w-4xl text-5xl font-black leading-[1.05] tracking-tight text-white drop-shadow-2xl md:text-7xl">
            A Fast Workspace. <br />
            <span className="bg-gradient-to-r from-indigo-400 via-purple-400 to-fuchsia-400 bg-clip-text text-transparent">Scalable Core Architecture.</span>
          </motion.h1>
          <motion.p initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, delay: 0.2 }} className="mt-6 max-w-2xl text-base font-medium leading-relaxed text-gray-300 drop-shadow-md md:text-lg">
            A Slack-style team chat built over raw WebSockets: channels, threads, reactions, presence, read receipts, DMs and file sharing.
          </motion.p>
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, delay: 0.3 }} className="mt-10">
            <button onClick={onLaunch} className="flex items-center justify-center gap-2 rounded-full bg-gradient-to-r from-indigo-600 via-purple-600 to-fuchsia-600 px-8 py-4 text-base font-bold text-white shadow-[0_0_40px_rgba(168,85,247,0.4)] transition hover:opacity-90 active:scale-[0.99]">
              Get Started Now <ChevronRight size={18} />
            </button>
          </motion.div>
        </main>
      </div>

      <div className="relative z-20 w-full flex-1 bg-black">
        <div className="mx-auto -mt-16 max-w-6xl px-6 pb-24">
          <div className="grid w-full grid-cols-1 gap-6 text-left md:grid-cols-3">
            {features.map(({ Icon, tone, title, body }) => (
              <div key={title} className="rounded-2xl border border-white/[0.06] bg-[#0a0a0c] p-6 shadow-2xl transition hover:border-white/[0.12] hover:bg-[#101114]">
                <Icon size={22} className={`${tone} mb-4`} />
                <h3 className="text-xs font-bold uppercase tracking-widest text-white">{title}</h3>
                <p className="mt-2.5 text-sm leading-relaxed text-gray-400">{body}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      <footer className="relative z-20 w-full border-t border-white/[0.06] bg-[#050505]">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-8 py-8">
          <span className="text-[10px] font-bold uppercase tracking-widest text-gray-500">SyncGrid &bull; Real-Time Team Chat Platform</span>
          <a href="https://github.com" target="_blank" rel="noreferrer" aria-label="GitHub" className="rounded-xl p-2 text-gray-400 transition hover:bg-white/5 hover:text-white"><GithubIcon /></a>
        </div>
      </footer>
    </div>
  );
}
