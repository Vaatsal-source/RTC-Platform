import { lazy, Suspense, useMemo, useRef, useState } from 'react';
import { Loader2, Paperclip, Smile, X, FileText } from 'lucide-react';
import type { EmojiClickData, Theme } from 'emoji-picker-react';
import { MAX_MESSAGE_LENGTH, mentionHandle, type FileDTO } from '@repo/shared-types';
import { Api, errorMessage } from '../../lib/api';
import { sendChatMessage, stopTyping, typing } from '../../lib/actions';
import { useAppStore } from '../../store/useAppStore';
import { Avatar } from '../ui';

const EmojiPicker = lazy(() => import('emoji-picker-react'));

interface Props {
  channelId: string;
  placeholder: string;
  members: Array<{ userId: string; name: string }>;
  disabled?: boolean;
  disabledReason?: string;
}

export function Composer({ channelId, placeholder, members, disabled, disabledReason }: Props) {
  const [text, setText] = useState('');
  const [files, setFiles] = useState<FileDTO[]>([]);
  const [uploading, setUploading] = useState<{ name: string; pct: number } | null>(null);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [mentionIdx, setMentionIdx] = useState(0);
  const area = useRef<HTMLTextAreaElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const toast = useAppStore((s) => s.toast);
  const myId = useAppStore((s) => s.user?.id);

  // Drafts can't leak between channels: ChatView is keyed by channel id, so this component remounts.
  // @mention autocomplete: the word being typed at the caret, if it starts with @
  const mentionQuery = useMemo(() => /(?:^|\s)@([a-zA-Z0-9_]*)$/.exec(text)?.[1] ?? null, [text]);
  const suggestions = useMemo(() => {
    if (mentionQuery === null) return [];
    const q = mentionQuery.toLowerCase();
    return members.filter((m) => m.userId !== myId && mentionHandle(m.name).startsWith(q)).slice(0, 5);
  }, [mentionQuery, members, myId]);

  const insertMention = (name: string) => {
    setText((t) => t.replace(/@[a-zA-Z0-9_]*$/, `@${mentionHandle(name)} `));
    setMentionIdx(0);
    area.current?.focus();
  };

  const submit = () => {
    const content = text.trim();
    if ((!content && files.length === 0) || disabled || uploading) return;
    sendChatMessage(channelId, content, files);
    stopTyping(channelId);
    setText('');
    setFiles([]);
    if (area.current) area.current.style.height = 'auto';
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (suggestions.length > 0) {
      if (e.key === 'ArrowDown') { e.preventDefault(); setMentionIdx((i) => (i + 1) % suggestions.length); return; }
      if (e.key === 'ArrowUp') { e.preventDefault(); setMentionIdx((i) => (i - 1 + suggestions.length) % suggestions.length); return; }
      if (e.key === 'Tab' || e.key === 'Enter') { e.preventDefault(); insertMention(suggestions[mentionIdx % suggestions.length].name); return; }
    }
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  };

  const upload = async (list: FileList | null) => {
    const file = list?.[0];
    if (!file) return;
    setUploading({ name: file.name, pct: 0 });
    try {
      const uploaded = await Api.uploadFile(channelId, file, (pct) => setUploading({ name: file.name, pct }));
      setFiles((f) => [...f, uploaded]);
    } catch (err) {
      toast(errorMessage(err, 'Upload failed'), 'error');
    } finally {
      setUploading(null);
      if (fileInput.current) fileInput.current.value = '';
    }
  };

  if (disabled) {
    return <div className="bg-[#1a1d21] p-4"><div className="rounded-xl border border-gray-800 bg-[#22252a] px-4 py-3 text-sm text-gray-500">{disabledReason}</div></div>;
  }

  return (
    <div className="bg-[#1a1d21] p-4 pt-2">
      {(files.length > 0 || uploading) && (
        <div className="mb-2 flex flex-wrap gap-2">
          {files.map((f) => (
            <span key={f.id} className="flex items-center gap-2 rounded-lg border border-gray-800 bg-[#22252a] py-1 pl-2 pr-1 text-xs text-gray-300">
              <FileText size={14} className="text-gray-500" />
              <span className="max-w-[160px] truncate">{f.name}</span>
              <button aria-label={`Remove ${f.name}`} onClick={() => setFiles((l) => l.filter((x) => x.id !== f.id))} className="rounded p-0.5 text-gray-500 hover:text-rose-400"><X size={12} /></button>
            </span>
          ))}
          {uploading && <span className="flex items-center gap-2 rounded-lg border border-gray-800 bg-[#22252a] px-2 py-1 text-xs text-gray-400"><Loader2 size={12} className="animate-spin" />{uploading.name} {uploading.pct}%</span>}
        </div>
      )}

      <div className="relative flex items-end rounded-xl border border-gray-800 bg-[#22252a] px-3 py-2.5 shadow-lg transition focus-within:border-gray-700">
        {suggestions.length > 0 && (
          <ul className="absolute bottom-full left-0 z-20 mb-2 w-64 overflow-hidden rounded-lg border border-black/40 bg-[#111214] shadow-xl" role="listbox">
            {suggestions.map((m, i) => (
              <li key={m.userId} role="option" aria-selected={i === mentionIdx % suggestions.length}>
                <button onMouseDown={(e) => { e.preventDefault(); insertMention(m.name); }} className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm text-[#dbdee1] ${i === mentionIdx % suggestions.length ? 'bg-[#4752c4]' : 'hover:bg-[#2b2d31]'}`}>
                  <Avatar name={m.name} id={m.userId} size={20} />
                  {m.name}
                </button>
              </li>
            ))}
          </ul>
        )}

        <button aria-label="Attach file" onClick={() => fileInput.current?.click()} className="mb-0.5 mr-2 shrink-0 text-gray-500 transition hover:text-gray-300"><Paperclip size={18} /></button>
        <input ref={fileInput} type="file" className="hidden" onChange={(e) => void upload(e.target.files)} />

        <textarea
          ref={area}
          value={text}
          rows={1}
          maxLength={MAX_MESSAGE_LENGTH}
          placeholder={placeholder}
          aria-label="Message"
          onChange={(e) => { setText(e.target.value); if (e.target.value) typing(channelId); else stopTyping(channelId); }}
          onKeyDown={onKeyDown}
          onInput={(e) => { const el = e.currentTarget; el.style.height = 'auto'; el.style.height = `${Math.min(el.scrollHeight, 160)}px`; }}
          className="max-h-40 w-full resize-none overflow-y-auto bg-transparent text-sm leading-relaxed text-gray-200 placeholder-gray-600 outline-none"
        />

        <button aria-label="Emoji" onClick={() => setEmojiOpen((v) => !v)} className="mb-0.5 ml-2 shrink-0 text-gray-500 transition hover:text-yellow-400"><Smile size={18} /></button>
        {emojiOpen && (
          <>
            <div className="fixed inset-0 z-20" onClick={() => setEmojiOpen(false)} />
            <div className="absolute bottom-12 right-2 z-30">
              <Suspense fallback={<div className="rounded bg-[#1f2226] p-4 text-xs text-gray-500">Loading…</div>}>
                <EmojiPicker theme={'dark' as Theme} onEmojiClick={(d: EmojiClickData) => setText((t) => t + d.emoji)} width={300} height={350} />
              </Suspense>
            </div>
          </>
        )}
      </div>
      <p className="mt-1 px-1 text-[10px] text-gray-600">Enter to send • Shift+Enter for a new line • @ to mention</p>
    </div>
  );
}
