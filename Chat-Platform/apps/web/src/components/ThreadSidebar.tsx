import React from 'react';
import { X, MessageSquare, Users, EyeOff } from 'lucide-react';
import { MemberProps, MessageProps } from './types';

interface SidebarContainerProps {
  threadMessage: MessageProps | null;
  onCloseThread: () => void;
  members: MemberProps[];
}

export const ContextualSidebar: React.FC<SidebarContainerProps> = ({ threadMessage, onCloseThread, members }) => {
  if (threadMessage) {
    // Render Active Thread View
    return (
      <aside className="w-72 bg-[#2b2d31] border-l border-black/20 flex flex-col shrink-0 z-10 animate-in slide-in-from-right duration-200">
        <div className="flex h-12 items-center justify-between border-b border-black/20 px-4 font-bold text-white shadow-sm shrink-0">
          <div className="flex items-center gap-2 text-sm text-slate-200">
            <MessageSquare size={16} className="text-[#80848e]" />
            <span className="truncate">Thread Context</span>
          </div>
          <button onClick={onCloseThread} className="text-[#949ba4] hover:text-white transition">
            <X size={18} />
          </button>
        </div>
        
        {/* Parent contextual seed post */}
        <div className="p-4 bg-[#313338]/40 border-b border-black/10">
          <span className="text-xs font-bold text-slate-400">{threadMessage.user.name}</span>
          <p className="text-xs text-slate-300 mt-1 break-words italic">"{threadMessage.content}"</p>
        </div>

        {/* Thread Streams */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar">
          {(threadMessage.replies || []).map((reply) => (
            <div key={reply.id} className="text-xs">
              <div className="flex items-baseline gap-1.5">
                <span className="font-bold text-white">{reply.user.name}</span>
                <span className="text-[10px] text-slate-400">{reply.timestamp}</span>
              </div>
              <p className="text-slate-300 mt-0.5 break-words bg-[#313338] p-2 rounded">{reply.content}</p>
            </div>
          ))}
        </div>

        {/* Reply Box input zone */}
        <div className="p-3 bg-[#313338]">
          <input 
            type="text" 
            placeholder="Reply to thread pipeline..." 
            className="w-full bg-[#383a40] text-xs text-[#dbdee1] p-2 rounded outline-none placeholder-[#6d737d]"
          />
        </div>
      </aside>
    );
  }

  // Fallback default: Traditional Workspace Member Track List
  return (
    <aside className="w-60 bg-[#2b2d31] border-l border-black/20 flex flex-col shrink-0 z-10">
      <div className="flex h-12 items-center border-b border-black/20 px-4 font-bold text-white shadow-sm shrink-0 gap-2">
        <Users size={16} className="text-[#80848e]" />
        <span className="text-sm">Active Nodes ({members.length})</span>
      </div>
      <div className="flex-1 overflow-y-auto p-3 space-y-4 custom-scrollbar">
        <div>
          <h4 className="px-2 text-[10px] font-bold uppercase tracking-wider text-[#949ba4]">Online Status</h4>
          <div className="mt-1.5 space-y-1">
            {members.filter(m => m.status === 'online').map((m) => (
              <div key={m.id} className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-[#35373c] cursor-pointer group transition-colors">
                <div className="h-6 w-6 rounded-full bg-indigo-600 flex items-center justify-center text-white text-[10px] font-bold relative">
                  {m.name.charAt(0)}
                  <div className="absolute -bottom-0.5 -right-0.5 h-2 w-2 rounded-full bg-emerald-500 border border-[#2b2d31]" />
                </div>
                <span className="text-sm font-medium text-[#949ba4] group-hover:text-[#dbdee1] truncate">{m.name}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </aside>
  );
};