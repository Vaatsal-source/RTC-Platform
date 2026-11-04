import { useCallback, useLayoutEffect, useMemo, useRef } from 'react';
import { Spinner } from '../ui';
import { MessageItem } from './MessageItem';
import { loadOlder } from '../../lib/actions';
import type { ChannelMessages } from '../../store/messages';

interface Props {
  channelId: string;
  data: ChannelMessages | undefined;
  members: Array<{ userId: string; name: string }>;
  myId: string;
  canModerate: boolean;
  readOnly: boolean;
  showReceipts: boolean;
  onOpenThread: (id: string) => void;
}

const GROUP_WINDOW_MS = 5 * 60 * 1000;

// Infinite scroll (Module 4): scrolling near the top asks for the next older page, and we
// restore the scroll offset afterwards so the viewport doesn't jump.
export function MessageList({ channelId, data, members, myId, canModerate, readOnly, showReceipts, onOpenThread }: Props) {
  const scroller = useRef<HTMLDivElement>(null);
  const stickToBottom = useRef(true);
  const prevHeight = useRef(0);
  const prevCount = useRef(0);
  const prevFirstId = useRef<string | undefined>(undefined);
  const items = useMemo(() => data?.items ?? [], [data?.items]);

  const onScroll = useCallback(() => {
    const el = scroller.current;
    if (!el) return;
    stickToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
    if (el.scrollTop < 120) loadOlder(channelId);
  }, [channelId]);

  useLayoutEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const firstId = items[0]?.id;
    const prependedOlder = prevFirstId.current !== undefined && firstId !== prevFirstId.current && items.length > prevCount.current && prevHeight.current > 0 && !stickToBottom.current;

    if (prependedOlder) el.scrollTop = el.scrollHeight - prevHeight.current + el.scrollTop; // keep the same message under the cursor
    else if (stickToBottom.current || prevCount.current === 0) el.scrollTop = el.scrollHeight;

    prevHeight.current = el.scrollHeight;
    prevCount.current = items.length;
    prevFirstId.current = firstId;
  }, [items]);

  // New channel → start at the bottom.
  useLayoutEffect(() => {
    stickToBottom.current = true;
    prevCount.current = 0;
    prevFirstId.current = undefined;
    prevHeight.current = 0;
  }, [channelId]);

  if (!data?.loaded) return <div className="flex-1"><Spinner label="Loading messages…" /></div>;

  return (
    <div ref={scroller} onScroll={onScroll} className="custom-scrollbar flex-1 overflow-y-auto pb-4 pt-2">
      {data.loadingMore && <Spinner label="Loading older messages…" />}
      {!data.hasMore && (
        <div className="px-4 py-6 text-center text-xs text-gray-500">{items.length === 0 ? 'No messages yet — say hello 👋' : 'You\'ve reached the beginning of this conversation'}</div>
      )}
      {items.map((m, i) => {
        const prev = items[i - 1];
        const compact = !!prev && prev.user.id === m.user.id && new Date(m.timestamp).getTime() - new Date(prev.timestamp).getTime() < GROUP_WINDOW_MS && new Date(m.timestamp).toDateString() === new Date(prev.timestamp).toDateString();
        const newDay = !prev || new Date(m.timestamp).toDateString() !== new Date(prev.timestamp).toDateString();
        return (
          <div key={m.tempId && m.pending ? m.tempId : m.id}>
            {newDay && (
              <div className="my-3 flex items-center gap-3 px-4 text-[11px] font-semibold text-gray-500">
                <div className="h-px flex-1 bg-[#3f4147]" />
                {new Date(m.timestamp).toLocaleDateString([], { weekday: 'long', month: 'short', day: 'numeric' })}
                <div className="h-px flex-1 bg-[#3f4147]" />
              </div>
            )}
            <MessageItem msg={m} members={members} myId={myId} canModerate={canModerate} readOnly={readOnly} showReceipts={showReceipts} compact={compact && !newDay} onOpenThread={onOpenThread} />
          </div>
        );
      })}
    </div>
  );
}
