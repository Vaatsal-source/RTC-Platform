import { useEffect, useRef, useState } from 'react';
import { MessageSquare, X } from 'lucide-react';
import { Api } from '../../lib/api';
import { sendThreadReply } from '../../lib/actions';
import { useAppStore } from '../../store/useAppStore';
import { Spinner } from '../ui';
import { MessageItem } from './MessageItem';

interface Props {
  channelId: string;
  parentId: string;
  members: Array<{ userId: string; name: string }>;
  readOnly: boolean;
  canModerate: boolean;
}

// Module 4 — thread replies. Replies are loaded over REST when the panel opens and then kept
// live by THREAD_REPLY frames.
export function ThreadPanel({ channelId, parentId, members, readOnly, canModerate }: Props) {
  const parent = useAppStore((s) => s.messages[channelId]?.items.find((m) => m.id === parentId));
  const replies = useAppStore((s) => s.threads[parentId]);
  const myId = useAppStore((s) => s.user!.id);
  const close = useAppStore((s) => s.closeThread);
  const [draft, setDraft] = useState('');
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    Api.replies(parentId)
      .then((r) => !cancelled && useAppStore.getState().threadLoaded(parentId, r))
      .catch(() => !cancelled && useAppStore.getState().toast('Could not load thread', 'error'));
    return () => {
      cancelled = true;
    };
  }, [parentId]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' });
  }, [replies?.length]);

  const submit = () => {
    const text = draft.trim();
    if (!text) return;
    sendThreadReply(channelId, parentId, text);
    setDraft('');
  };

  return (
    <aside className="z-10 flex w-80 shrink-0 flex-col border-l border-black/20 bg-[#2b2d31]" aria-label="Thread">
      <div className="flex h-12 shrink-0 items-center justify-between border-b border-black/20 px-4 shadow-sm">
        <div className="flex items-center gap-2 text-sm font-bold text-white"><MessageSquare size={16} className="text-[#80848e]" /> Thread</div>
        <button onClick={close} aria-label="Close thread" className="text-[#949ba4] hover:text-white"><X size={18} /></button>
      </div>

      {parent && (
        <div className="border-b border-black/10 bg-[#313338]/40 py-2">
          <MessageItem msg={parent} members={members} myId={myId} canModerate={false} readOnly showReceipts={false} inThread />
        </div>
      )}

      <div className="custom-scrollbar flex-1 overflow-y-auto py-2">
        {!replies ? <Spinner /> : replies.length === 0 ? <p className="p-4 text-center text-xs text-gray-500">No replies yet</p> : replies.map((r) => (
          <MessageItem key={r.id} msg={r} members={members} myId={myId} canModerate={canModerate} readOnly={readOnly} showReceipts={false} inThread />
        ))}
        <div ref={endRef} />
      </div>

      {readOnly ? (
        <p className="bg-[#313338] p-3 text-center text-xs text-gray-500">This channel is archived</p>
      ) : (
        <div className="bg-[#313338] p-3">
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && submit()}
            placeholder="Reply to thread…"
            aria-label="Reply to thread"
            className="w-full rounded bg-[#383a40] p-2 text-sm text-[#dbdee1] placeholder-[#6d737d] outline-none"
          />
        </div>
      )}
    </aside>
  );
}
