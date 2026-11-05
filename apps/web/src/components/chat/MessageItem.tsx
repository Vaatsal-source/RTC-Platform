import { lazy, memo, Suspense, useState } from 'react';
import { Check, CheckCheck, Edit2, MessageSquare, Smile, Trash2 } from 'lucide-react';
import type { EmojiClickData, Theme } from 'emoji-picker-react';
import { Avatar, Modal } from '../ui';
import { MessageContent } from './MessageContent';
import { Attachment } from './Attachment';
import { receiptStatus, type LocalMessage } from '../../store/messages';
import { deleteMessage, editMessage, toggleReaction } from '../../lib/actions';

// The full picker is ~200KB — only load it when someone opens it.
const EmojiPicker = lazy(() => import('emoji-picker-react'));
const QUICK_EMOJIS = ['👍', '❤️', '😂', '🎉', '😮', '🔥'];

interface Props {
  msg: LocalMessage;
  members: Array<{ userId: string; name: string }>;
  myId: string;
  canModerate: boolean; // workspace admin may delete others' messages
  readOnly: boolean; // archived channel
  showReceipts: boolean;
  compact?: boolean; // same author as the previous message, close in time
  inThread?: boolean;
  onOpenThread?: (id: string) => void;
}

const time = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

function MessageItemImpl({ msg, members, myId, canModerate, readOnly, showReceipts, compact, inThread, onOpenThread }: Props) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(msg.content);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [fullPicker, setFullPicker] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const mine = msg.user.id === myId;
  const actionable = !msg.pending && !readOnly;

  const react = (emoji: string) => {
    const existing = msg.reactions.find((r) => r.emoji === emoji);
    toggleReaction(msg.channelId, msg.id, emoji, !!existing?.userIds.includes(myId));
    setPickerOpen(false);
    setFullPicker(false);
  };

  const saveEdit = () => {
    const text = draft.trim();
    if (text && text !== msg.content) editMessage(msg.channelId, msg.id, text);
    setEditing(false);
  };

  return (
    <div className={`group relative flex gap-3 px-4 hover:bg-[#2e3035] ${compact ? 'py-0.5' : 'mt-2 py-1.5'} ${msg.pending ? 'opacity-60' : ''}`}>
      {actionable && !editing && (
        <div className="absolute -top-3 right-4 z-10 hidden items-center overflow-hidden rounded-md border border-[#232428] bg-[#313338] shadow-md group-hover:flex">
          <button title="Add reaction" aria-label="Add reaction" onClick={() => setPickerOpen((v) => !v)} className="p-1.5 text-[#b5bac1] hover:bg-[#35373c] hover:text-white"><Smile size={16} /></button>
          {!inThread && <button title="Reply in thread" aria-label="Reply in thread" onClick={() => onOpenThread?.(msg.id)} className="p-1.5 text-[#b5bac1] hover:bg-[#35373c] hover:text-white"><MessageSquare size={16} /></button>}
          {mine && <button title="Edit" aria-label="Edit message" onClick={() => { setDraft(msg.content); setEditing(true); }} className="p-1.5 text-[#b5bac1] hover:bg-[#35373c] hover:text-white"><Edit2 size={16} /></button>}
          {(mine || canModerate) && <button title="Delete" aria-label="Delete message" onClick={() => setConfirmDelete(true)} className="p-1.5 text-rose-400 hover:bg-rose-500/10"><Trash2 size={16} /></button>}
        </div>
      )}

      {pickerOpen && (
        <>
          <div className="fixed inset-0 z-20" onClick={() => { setPickerOpen(false); setFullPicker(false); }} />
          <div className="absolute right-4 top-4 z-30 flex flex-col items-end gap-1.5">
            <div className="flex items-center gap-1 rounded-lg border border-gray-800 bg-[#1f2226] px-2 py-1.5 shadow-xl">
              {QUICK_EMOJIS.map((e) => <button key={e} onClick={() => react(e)} className="px-0.5 text-base transition-transform hover:scale-125">{e}</button>)}
              <div className="mx-0.5 h-5 w-px bg-gray-800" />
              <button aria-label="More emoji" onClick={() => setFullPicker((v) => !v)} className="px-1 text-gray-500 hover:text-gray-300"><Smile size={16} /></button>
            </div>
            {fullPicker && (
              <Suspense fallback={<div className="rounded bg-[#1f2226] p-4 text-xs text-gray-500">Loading…</div>}>
                <EmojiPicker theme={'dark' as Theme} onEmojiClick={(d: EmojiClickData) => react(d.emoji)} width={300} height={350} />
              </Suspense>
            )}
          </div>
        </>
      )}

      <div className="w-10 shrink-0 pt-0.5">
        {compact ? <span className="hidden select-none pl-1 text-[10px] text-slate-500 group-hover:block">{time(msg.timestamp)}</span> : <Avatar name={msg.user.name} id={msg.user.id} size={40} />}
      </div>

      <div className="min-w-0 flex-1">
        {!compact && (
          <div className="flex items-baseline gap-2">
            <span className="text-sm font-medium text-slate-100">{msg.user.name}</span>
            <span className="select-none text-xs text-slate-400">{time(msg.timestamp)}</span>
            {msg.pending && <span className="text-[10px] italic text-gray-500">sending…</span>}
          </div>
        )}

        {editing ? (
          <div className="mt-1">
            <input
              autoFocus
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') saveEdit(); if (e.key === 'Escape') setEditing(false); }}
              className="w-full rounded border border-[#5865F2] bg-[#383a40] px-3 py-1.5 text-sm text-[#dbdee1] outline-none"
            />
            <div className="mt-1 text-[11px] text-slate-400">
              Escape to <button className="text-[#00a8fc] hover:underline" onClick={() => setEditing(false)}>cancel</button> • Enter to <button className="text-[#00a8fc] hover:underline" onClick={saveEdit}>save</button>
            </div>
          </div>
        ) : (
          msg.content && (
            <p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-slate-300">
              <MessageContent content={msg.content} members={members} myId={myId} />
              {msg.isEdited && <span className="ml-1 text-[10px] text-slate-500">(edited)</span>}
            </p>
          )
        )}

        {msg.attachments.map((f) => <Attachment key={f.id} file={f} />)}

        {msg.reactions.length > 0 && (
          <div className="mt-1.5 flex flex-wrap gap-1">
            {msg.reactions.map((r) => {
              const reacted = r.userIds.includes(myId);
              return (
                <button
                  key={r.emoji}
                  disabled={readOnly}
                  onClick={() => react(r.emoji)}
                  title={`${r.userIds.length} reaction${r.userIds.length === 1 ? '' : 's'}`}
                  className={`flex items-center gap-1.5 rounded border px-2 py-0.5 text-xs transition ${reacted ? 'border-[#5865F2] bg-[#5865f2]/10 text-[#c9cdfb]' : 'border-transparent bg-[#2b2d31] text-[#b5bac1] hover:border-[#3f4248]'}`}
                >
                  <span>{r.emoji}</span>
                  <span className="text-[11px] font-semibold">{r.userIds.length}</span>
                </button>
              );
            })}
          </div>
        )}

        {!inThread && msg.replyCount > 0 && (
          <button onClick={() => onOpenThread?.(msg.id)} className="mt-1.5 flex w-max items-center gap-2 text-xs font-semibold text-[#00a8fc] hover:underline">
            <MessageSquare size={14} />
            {msg.replyCount} {msg.replyCount === 1 ? 'reply' : 'replies'}
          </button>
        )}

        {mine && showReceipts && !msg.pending && <Receipt status={receiptStatus(msg)} />}
      </div>

      {confirmDelete && (
        <Modal title="Delete message" icon={<Trash2 size={18} className="text-rose-500" />} onClose={() => setConfirmDelete(false)}>
          <p className="text-sm text-[#949ba4]">Delete this message for everyone in the channel? This can't be undone.</p>
          <blockquote className="mt-3 truncate rounded border border-black/20 bg-[#2b2d31] p-2 text-xs text-gray-400">{msg.content || '(attachment)'}</blockquote>
          <div className="mt-4 flex justify-end gap-3">
            <button onClick={() => setConfirmDelete(false)} className="px-4 py-2 text-sm font-medium text-white hover:underline">Cancel</button>
            <button onClick={() => { deleteMessage(msg.channelId, msg.id); setConfirmDelete(false); }} className="rounded bg-rose-600 px-4 py-2 text-sm font-bold text-white hover:bg-rose-700">Delete</button>
          </div>
        </Modal>
      )}
    </div>
  );
}

// Module 7: Sent → Delivered → Read
function Receipt({ status }: { status: 'sent' | 'delivered' | 'read' }) {
  const label = { sent: 'Sent', delivered: 'Delivered', read: 'Read' }[status];
  const Icon = status === 'sent' ? Check : CheckCheck;
  return (
    <span className={`mt-0.5 flex w-max items-center gap-1 text-[10px] ${status === 'read' ? 'text-sky-400' : 'text-slate-500'}`} title={label}>
      <Icon size={12} />
      {label}
    </span>
  );
}

export const MessageItem = memo(MessageItemImpl);
