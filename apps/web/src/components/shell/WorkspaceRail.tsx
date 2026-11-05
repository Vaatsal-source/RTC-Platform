import { Compass, Plus } from 'lucide-react';
import type { WorkspaceDTO } from '@repo/shared-types';
import { colorFor } from '../ui';

interface Props {
  workspaces: WorkspaceDTO[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onCreate: () => void;
  onJoin: () => void;
}

export function WorkspaceRail({ workspaces, activeId, onSelect, onCreate, onJoin }: Props) {
  return (
    <nav aria-label="Workspaces" className="z-10 flex w-[72px] shrink-0 flex-col items-center gap-2 overflow-y-auto bg-[#1e1f22] py-3">
      {workspaces.map((w) => {
        const active = w.id === activeId;
        return (
          <div key={w.id} className="relative flex w-full justify-center">
            <span className={`absolute left-0 top-1/2 w-1 -translate-y-1/2 rounded-r bg-white transition-all ${active ? 'h-10' : 'h-0'}`} />
            <button
              title={w.name}
              aria-label={w.name}
              aria-current={active}
              onClick={() => onSelect(w.id)}
              className={`flex h-12 w-12 items-center justify-center font-bold text-white shadow-md transition-all hover:rounded-xl ${colorFor(w.id)} ${active ? 'rounded-xl' : 'rounded-3xl'}`}
            >
              {w.name.slice(0, 2).toUpperCase()}
            </button>
          </div>
        );
      })}
      <div className="my-1 h-[2px] w-8 rounded-full bg-[#35373c]" />
      <button title="Create workspace" aria-label="Create workspace" onClick={onCreate} className="flex h-12 w-12 items-center justify-center rounded-3xl bg-[#313338] text-emerald-500 transition-all hover:rounded-2xl hover:bg-emerald-500 hover:text-white"><Plus size={22} /></button>
      <button title="Join a workspace" aria-label="Join a workspace" onClick={onJoin} className="flex h-12 w-12 items-center justify-center rounded-3xl bg-[#313338] text-sky-400 transition-all hover:rounded-2xl hover:bg-sky-500 hover:text-white"><Compass size={22} /></button>
    </nav>
  );
}
