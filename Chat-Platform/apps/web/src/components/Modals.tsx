import React, { useState } from 'react';
import { X, Shield, UserPlus, Settings, FolderPlus, Upload, Info, Users as UsersIcon, Hash, Lock, Trash2 } from 'lucide-react';
import { MemberProps } from './types';

interface ModalWrapperProps {
  title: string;
  icon: React.ReactNode;
  onClose: () => void;
  children: React.ReactNode;
}

const ModalWrapper: React.FC<ModalWrapperProps> = ({ title, icon, onClose, children }) => (
  <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
    <div className="w-full max-w-md bg-[#313338] rounded-lg overflow-hidden shadow-2xl border border-black/20 text-gray-200 animate-in fade-in zoom-in-95 duration-150">
      <div className="flex items-center justify-between p-4 border-b border-black/20 bg-[#2b2d31]">
        <div className="flex items-center gap-2 font-bold text-white">
          {icon}
          <span>{title}</span>
        </div>
        <button onClick={onClose} className="text-gray-400 hover:text-white transition">
          <X size={18} />
        </button>
      </div>
      <div className="p-4">{children}</div>
    </div>
  </div>
);

export const CreateWorkspaceModal = ({ onClose }: { onClose: () => void }) => (
  <ModalWrapper title="Create Custom Workspace" icon={<FolderPlus size={18} />} onClose={onClose}>
    <div className="space-y-4">
      <div>
        <div className="flex flex-col items-center justify-center mb-6">
          <label className="cursor-pointer group relative">
            <div className="h-20 w-20 rounded-full bg-[#1e1f22] border-2 border-dashed border-[#4e5058] flex flex-col items-center justify-center text-[#b5bac1] group-hover:border-[#5865F2] group-hover:text-[#dbdee1] transition-colors">
              <Upload size={24} />
              <span className="text-[10px] font-bold mt-1 uppercase">Upload</span>
            </div>
            <input type="file" className="hidden" accept="image/*" />
            <div className="absolute -top-1 -right-1 bg-[#5865F2] rounded-full p-1 shadow-lg">
              <FolderPlus size={12} className="text-white" />
            </div>
          </label>
          <span className="text-[10px] font-bold text-[#949ba4] mt-2 uppercase tracking-tighter">Workspace Icon</span>
        </div>
        <label className="text-xs font-bold uppercase tracking-wider text-[#949ba4]">Workspace Name</label>
        <input type="text" placeholder="Production Core Mesh" className="w-full mt-1.5 bg-[#1e1f22] p-2.5 rounded border border-transparent focus:border-[#5865F2] outline-none text-sm text-white transition-all" />
      </div>
      <button onClick={onClose} className="w-full bg-[#5865F2] hover:bg-[#4752c4] text-white p-2.5 rounded font-medium text-sm transition">
        Compile Workspace Layout
      </button>
    </div>
  </ModalWrapper>
);

export const InviteMembersModal = ({ onClose }: { onClose: () => void }) => (
  <ModalWrapper title="Invite Access Nodes" icon={<UserPlus size={18} />} onClose={onClose}>
    <div className="space-y-4">
      <div>
        <label className="text-xs font-bold uppercase tracking-wider text-[#949ba4]">Share Invite URL</label>
        <div className="flex mt-1.5 gap-2">
          <input type="text" readOnly value="https://syncgrid.io/invite/core-dev-77x" className="flex-1 bg-[#1e1f22] p-2 text-xs rounded text-emerald-400 outline-none font-mono" />
          <button onClick={() => alert('Copied to clipboard!')} className="bg-[#5865F2] text-xs font-semibold px-4 rounded hover:bg-[#4752c4] transition text-white">Copy</button>
        </div>
      </div>
    </div>
  </ModalWrapper>
);

export const WorkspaceSettingsModal = ({ onClose, members }: { onClose: () => void; members: MemberProps[] }) => {
  const [activeTab, setActiveTab] = useState<'overview' | 'members'>('overview');

  return (
    <ModalWrapper title="Workspace Controls" icon={<Settings size={18} />} onClose={onClose}>
      <div className="flex gap-4">
        {/* Mini Sidebar */}
        <div className="w-32 shrink-0 space-y-1">
          <button 
            onClick={() => setActiveTab('overview')}
            className={`w-full flex items-center gap-2 px-2 py-1.5 rounded text-xs font-medium transition ${activeTab === 'overview' ? 'bg-[#3f4248] text-white' : 'text-[#949ba4] hover:bg-[#35373c] hover:text-[#dbdee1]'}`}
          >
            <Info size={14} /> Overview
          </button>
          <button 
            onClick={() => setActiveTab('members')}
            className={`w-full flex items-center gap-2 px-2 py-1.5 rounded text-xs font-medium transition ${activeTab === 'members' ? 'bg-[#3f4248] text-white' : 'text-[#949ba4] hover:bg-[#35373c] hover:text-[#dbdee1]'}`}
          >
            <UsersIcon size={14} /> Members
          </button>
        </div>

        {/* Tab Content */}
        <div className="flex-1 min-h-[300px]">
          {activeTab === 'overview' ? (
            <div className="space-y-4 animate-in fade-in slide-in-from-right-2 duration-200">
              <div>
                <label className="text-xs font-bold uppercase tracking-wider text-[#949ba4]">Rename Deployment Cluster</label>
                <input type="text" defaultValue="Core Development" className="w-full mt-1.5 bg-[#1e1f22] p-2.5 rounded outline-none text-sm text-white focus:border-[#5865F2] border border-transparent transition-all" />
              </div>
              <button className="bg-[#5865F2] hover:bg-[#4752c4] text-white text-xs font-semibold px-4 py-2 rounded transition">Save Changes</button>
            </div>
          ) : (
            <div className="space-y-4 animate-in fade-in slide-in-from-right-2 duration-200">
              <label className="text-xs font-bold uppercase tracking-wider text-[#949ba4] block mb-2">Role Security Matrix</label>
              <div className="space-y-2 max-h-60 overflow-y-auto custom-scrollbar pr-1">
                {members.map((member) => (
                  <div key={member.id} className="flex items-center justify-between p-2 bg-[#2b2d31] rounded group hover:bg-[#35373c] transition-colors">
                    <span className="text-sm font-medium text-white">{member.name}</span>
                    <div className="flex items-center gap-2">
                      <select 
                        defaultValue={member.role}
                        className="bg-[#1e1f22] text-[11px] text-slate-200 border-none p-1 rounded outline-none cursor-pointer hover:bg-black transition-colors"
                        onChange={(e) => alert(`Mock: Altered role permission to ${e.target.value}`)}
                      >
                        <option value="member">Member</option>
                        <option value="admin">Admin</option>
                      </select>
                      <button className="text-rose-400 opacity-0 group-hover:opacity-100 p-1 hover:bg-rose-500/10 rounded transition-all" title="Kick Node"><X size={14}/></button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </ModalWrapper>
  );
};

export const DeleteMessageModal = ({ onClose, onConfirm }: { onClose: () => void; onConfirm: () => void }) => (
  <ModalWrapper title="Delete Message" icon={<Trash2 size={18} className="text-rose-500" />} onClose={onClose}>
    <div className="space-y-4">
      <p className="text-sm text-[#949ba4]">Are you sure you want to delete this message? This action cannot be undone and the node data will be purged.</p>
      <div className="flex gap-3 justify-end mt-2">
        <button onClick={onClose} className="px-4 py-2 text-sm font-medium text-white hover:underline transition">Cancel</button>
        <button 
          onClick={() => { onConfirm(); onClose(); }} 
          className="bg-rose-600 hover:bg-rose-700 text-white px-4 py-2 rounded text-sm font-bold transition"
        >
          Delete
        </button>
      </div>
    </div>
  </ModalWrapper>
);

// CreateChannelModal: Implements a text input and a toggle switch for 
// Public vs Private channel initialization.
export const CreateChannelModal = ({ onClose }: { onClose: () => void }) => {
  const [isPrivate, setIsPrivate] = useState(false);

  return (
    <ModalWrapper title="Create Channel" icon={<Hash size={18} />} onClose={onClose}>
      <div className="space-y-4">
        <div>
          <label className="text-xs font-bold uppercase tracking-wider text-[#949ba4]">Channel Name</label>
          <div className="relative mt-1.5">
            <div className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[#949ba4]">
              {isPrivate ? <Lock size={14} /> : <Hash size={14} />}
            </div>
            <input 
              type="text" 
              placeholder="new-channel" 
              className="w-full bg-[#1e1f22] pl-8 p-2.5 rounded border border-transparent focus:border-[#5865F2] outline-none text-sm text-white transition-all" 
            />
          </div>
        </div>

        <div className="flex items-center justify-between p-3 bg-[#1e1f22] rounded-lg border border-black/20">
          <div className="flex flex-col">
            <div className="flex items-center gap-1.5">
              <Lock size={14} className={isPrivate ? "text-emerald-400" : "text-[#949ba4]"} />
              <span className="text-sm font-semibold text-white">Private Channel</span>
            </div>
            <span className="text-[11px] text-[#949ba4] mt-0.5">Limit access to specific nodes only.</span>
          </div>
          <button
            onClick={() => setIsPrivate(!isPrivate)}
            className={`w-10 h-5 rounded-full transition-all relative shrink-0 ${isPrivate ? 'bg-emerald-500' : 'bg-[#4e5058]'}`}
          >
            <div className={`absolute top-1 left-1 w-3 h-3 bg-white rounded-full transition-transform ${isPrivate ? 'translate-x-5' : ''}`} />
          </button>
        </div>

        <button onClick={onClose} className="w-full bg-[#5865F2] hover:bg-[#4752c4] text-white p-2.5 rounded font-medium text-sm transition">
          Initialize Channel
        </button>
      </div>
    </ModalWrapper>
  );
};

export const ChannelSettingsModal = ({ onClose, channelName }: { onClose: () => void; channelName: string }) => {
  const [confirmName, setConfirmName] = useState('');

  return (
    <ModalWrapper title="Channel Settings" icon={<Settings size={18} />} onClose={onClose}>
      <div className="space-y-6">
        <div>
          <label className="text-xs font-bold uppercase tracking-wider text-[#949ba4] block mb-3">Management</label>
          <button className="w-full text-left p-3 rounded bg-[#2b2d31] hover:bg-[#35373c] border border-black/10 transition group">
            <span className="text-sm font-medium text-white block">Archive Channel</span>
            <span className="text-[11px] text-[#949ba4]">Set this channel to read-only mode for all nodes.</span>
          </button>
        </div>

        <div className="pt-4 border-t border-white/5">
          <label className="text-xs font-bold uppercase tracking-wider text-rose-400 block mb-3">Danger Zone</label>
          <div className="p-3 border border-rose-500/20 rounded-lg bg-rose-500/5">
            <p className="text-[11px] text-[#949ba4] mb-3 leading-relaxed">
              To delete <span className="text-white font-bold">{channelName}</span>, please type the channel name to confirm terminal decommissioning.
            </p>
            <input type="text" value={confirmName} onChange={(e) => setConfirmName(e.target.value)} placeholder={channelName} className="w-full bg-[#1e1f22] p-2.5 rounded border border-transparent focus:border-rose-500 outline-none text-sm text-white mb-3 transition-all" />
            <button disabled={confirmName !== channelName} className="w-full bg-rose-600 hover:bg-rose-700 disabled:opacity-50 disabled:cursor-not-allowed text-white p-2 rounded font-bold text-xs transition">
              Delete Channel
            </button>
          </div>
        </div>
      </div>
    </ModalWrapper>
  );
};