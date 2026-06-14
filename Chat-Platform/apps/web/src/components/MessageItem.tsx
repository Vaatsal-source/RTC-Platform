import React, { useState } from 'react';
import { MessageProps } from './types';
import { Smile, Edit2, Trash2, MessageSquare } from 'lucide-react';

interface ExtendedMessageItemProps extends MessageProps {
  onOpenThread: (msgId: string) => void;
}

export const MessageItem: React.FC<ExtendedMessageItemProps> = ({ 
  id, user, content, timestamp, isEdited, reactions = [], replies = [], onOpenThread 
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(content);

  return (
    <div className="flex items-start space-x-4 p-4 hover:bg-[#2e3035] transition-colors duration-150 group relative">
      {/* Floating Action Bar */}
      <div className="absolute right-6 -top-3 hidden group-hover:flex items-center bg-[#313338] border border-[#232428] rounded-md shadow-md overflow-hidden z-10">
        <button 
          title="Add Reaction"
          className="p-2 text-[#b5bac1] hover:bg-[#35373c] hover:text-[#dbdee1] transition"
          onClick={() => alert(`Mock: Open Emoji Picker for message ${id}`)}
        >
          <Smile size={16} />
        </button>
        <button 
          title="Reply in Thread"
          className="p-2 text-[#b5bac1] hover:bg-[#35373c] hover:text-[#dbdee1] transition"
          onClick={() => onOpenThread(id)}
        >
          <MessageSquare size={16} />
        </button>
        {user.role === 'admin' && (
          <>
            <button 
              title="Edit Message" 
              className="p-2 text-[#b5bac1] hover:bg-[#35373c] hover:text-[#dbdee1] transition"
              onClick={() => setIsEditing(!isEditing)}
            >
              <Edit2 size={16} />
            </button>
            <button 
              title="Delete Message" 
              className="p-2 text-rose-400 hover:bg-rose-500/10 transition"
              onClick={() => alert(`Mock: Delete message ${id}`)}
            >
              <Trash2 size={16} />
            </button>
          </>
        )}
      </div>

      {/* Avatar Container */}
      <div className="flex-shrink-0">
        <div className="w-10 h-10 rounded-full bg-[#5865F2] flex items-center justify-center text-white font-semibold text-sm">
          {user.name.charAt(0).toUpperCase()}
        </div>
      </div>

      {/* Content Block */}
      <div className="flex flex-col flex-1 min-w-0">
        <div className="flex items-baseline space-x-2">
          <span className="font-medium text-slate-100 hover:underline cursor-pointer">
            {user.name}
          </span>
          {user.role === 'admin' && (
            <span className="bg-[#23a55a] text-[9px] text-white px-1 rounded font-bold uppercase tracking-wide">
              Admin
            </span>
          )}
          <span className="text-xs text-slate-400 select-none">{timestamp}</span>
          {isEdited && <span className="text-[10px] text-slate-500">(edited)</span>}
        </div>

        {/* Dynamic Edit Input Mode */}
        {isEditing ? (
          <div className="mt-1 w-full">
            <input 
              type="text" 
              value={editValue} 
              onChange={(e) => setEditValue(e.target.value)}
              className="w-full bg-[#383a40] text-sm text-[#dbdee1] px-3 py-1.5 rounded outline-none border border-[#5865F2]"
            />
            <div className="text-[11px] text-slate-400 mt-1">
              Escape to <button className="text-[#00a8fc] hover:underline" onClick={() => setIsEditing(false)}>cancel</button> &bull; Enter to <button className="text-[#00a8fc] hover:underline" onClick={() => setIsEditing(false)}>save</button>
            </div>
          </div>
        ) : (
          <p className="text-slate-300 text-sm leading-relaxed mt-1 break-words whitespace-pre-wrap">
            {content}
          </p>
        )}

        {/* Emoji Reactions Tray */}
        {reactions.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-2">
            {reactions.map((react, i) => (
              <button 
                key={i}
                className={`flex items-center space-x-1.5 px-2 py-0.5 rounded text-xs border transition ${
                  react.userReacted 
                    ? 'bg-[#5865f2]/10 border-[#5865F2] text-[#5865F2]' 
                    : 'bg-[#2b2d31] border-transparent text-[#b5bac1] hover:border-[#3f4248]'
                }`}
                onClick={() => alert(`Mock: Toggle reaction ${react.emoji}`)}
              >
                <span>{react.emoji}</span>
                <span className="text-[11px] font-semibold">{react.count}</span>
              </button>
            ))}
          </div>
        )}

        {/* Thread replies preview row */}
        {replies.length > 0 && (
          <button 
            onClick={() => onOpenThread(id)}
            className="flex items-center space-x-2 mt-2 text-xs font-semibold text-[#00a8fc] hover:underline w-max"
          >
            <MessageSquare size={14} />
            <span>{replies.length} {replies.length === 1 ? 'reply' : 'replies'}</span>
          </button>
        )}
      </div>
    </div>
  );
};