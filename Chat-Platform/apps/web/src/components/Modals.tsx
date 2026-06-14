import React from 'react';
import { X, Shield, UserPlus, Settings, FolderPlus } from 'lucide-react';
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
        <label className="text-xs font-bold uppercase tracking-wider text-[#949ba4]">Workspace Name</label>
        <input type="text" placeholder="Production Core Mesh" className="w-full mt-1.5 bg-[#1e1f22] p-2.5 rounded border border-transparent focus:border-[#5865F2] outline-none text-sm text-white" />
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

export const WorkspaceSettingsModal = ({ onClose, members }: { onClose: () => void; members: MemberProps[] }) => (
  <ModalWrapper title="Workspace Controls & Roles" icon={<Settings size={18} />} onClose={onClose}>
    <div className="space-y-4">
      <div>
        <label className="text-xs font-bold uppercase tracking-wider text-[#949ba4]">Rename Deployment Cluster</label>
        <input type="text" defaultValue="Core Development" className="w-full mt-1.5 bg-[#1e1f22] p-2.5 rounded outline-none text-sm text-white" />
      </div>
      <div>
        <label className="text-xs font-bold uppercase tracking-wider text-[#949ba4] block mb-2">Role Security Matrix</label>
        <div className="space-y-2 max-h-48 overflow-y-auto custom-scrollbar pr-1">
          {members.map((member) => (
            <div key={member.id} className="flex items-center justify-between p-2 bg-[#2b2d31] rounded">
              <span className="text-sm font-medium text-white">{member.name}</span>
              <select 
                defaultValue={member.role}
                className="bg-[#1e1f22] text-xs text-slate-200 border-none p-1 rounded outline-none cursor-pointer"
                onChange={(e) => alert(`Mock: Altered role permission to ${e.target.value}`)}
              >
                <option value="member">Member</option>
                <option value="admin">Admin</option>
              </select>
            </div>
          ))}
        </div>
      </div>
    </div>
  </ModalWrapper>
);