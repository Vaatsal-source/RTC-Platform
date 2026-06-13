import React from 'react';
import { useAppStore } from './store/useAppStore';
import { Hash, MessageSquare, ShieldAlert, Users, Volume2 } from 'lucide-react';

export default function App() {
  const { activeChannelId, setActiveChannel } = useAppStore();

  // Mock initial data for structure representation
  const channels = [
    { id: '1', name: 'general' },
    { id: '2', name: 'engineering' },
    { id: '3', name: 'random' },
  ];

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-[#1a1d21] text-gray-200 antialiased">
      
      {/* 1. WORKSPACE BAR */}
      <div className="flex w-16 flex-col items-center gap-4 border-r border-gray-800 bg-[#121416] py-4">
        <div className="flex h-12 w-12 cursor-pointer items-center justify-center rounded-xl bg-indigo-600 font-bold text-white transition hover:rounded-2xl">
          W1
        </div>
        <div className="flex h-12 w-12 cursor-pointer items-center justify-center rounded-xl bg-gray-800 font-bold text-gray-400 transition hover:bg-gray-700 hover:rounded-2xl">
          +
        </div>
      </div>

      {/* 2. CHANNELS / NAVIGATION SIDEBAR */}
      <div className="flex w-64 flex-col bg-[#1f2226]">
        <div className="flex h-14 items-center justify-between border-b border-gray-800 px-4 font-bold text-white shadow-sm">
          <span>Dev Workspace</span>
        </div>
        
        <div className="flex-1 overflow-y-auto px-2 py-4">
          <div className="mb-4">
            <p className="px-2 text-xs font-semibold uppercase tracking-wider text-gray-500">Channels</p>
            <div className="mt-2 space-y-0.5">
              {channels.map((channel) => (
                <button
                  key={channel.id}
                  onClick={() => setActiveChannel(channel.id)}
                  className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm font-medium transition ${
                    activeChannelId === channel.id
                      ? 'bg-indigo-600/20 text-indigo-400'
                      : 'text-gray-400 hover:bg-gray-800 hover:text-gray-200'
                  }`}
                >
                  <Hash size={16} />
                  {channel.name}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* 3. MAIN CHAT CONTAINER */}
      <div className="flex flex-1 flex-col bg-[#1a1d21]">
        {/* Top Header navbar */}
        <div className="flex h-14 items-center border-b border-gray-800 px-6 shadow-sm">
          <div className="flex items-center gap-2 font-bold text-white">
            <Hash size={18} className="text-gray-400" />
            <span>{channels.find(c => c.id === activeChannelId)?.name || 'select-a-channel'}</span>
          </div>
        </div>

        {/* Message Stream */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          <div className="flex items-start gap-3">
            <div className="h-10 w-10 rounded bg-indigo-500 flex items-center justify-center font-bold text-white">U</div>
            <div>
              <div className="flex items-baseline gap-2">
                <span className="font-semibold text-white">System System</span>
                <span className="text-xs text-gray-500">12:34 PM</span>
              </div>
              <p className="text-sm text-gray-300 mt-0.5">Welcome to your real-time chat dashboard framework shell. Ready to hook up APIs!</p>
            </div>
          </div>
        </div>

        {/* Message Text Input Area */}
        <div className="p-4 bg-[#1a1d21]">
          <div className="relative flex items-center rounded-lg border border-gray-700 bg-[#22252a] px-4 py-2.5 focus-within:border-gray-500">
            <input
              type="text"
              placeholder="Message your teammates..."
              className="w-full bg-transparent text-sm text-gray-200 placeholder-gray-500 outline-none"
            />
          </div>
        </div>
      </div>

    </div>
  );
}