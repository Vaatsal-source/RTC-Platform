import { Fragment } from 'react';
import { mentionHandle } from '@repo/shared-types';

// Renders message text with @mentions highlighted. React escapes the text, so no HTML injection is possible.
// A mention only gets styled when it resolves to a real member (same rule the server uses).

interface Props {
  content: string;
  members: Array<{ userId: string; name: string }>;
  myId?: string;
}

export function MessageContent({ content, members, myId }: Props) {
  const byHandle = new Map(members.map((m) => [mentionHandle(m.name), m]));
  const parts = content.split(/((?:^|\s)@[a-zA-Z0-9_]+)/g);

  return (
    <>
      {parts.map((part, i) => {
        const m = /^(\s?)@([a-zA-Z0-9_]+)$/.exec(part);
        const target = m && byHandle.get(m[2].toLowerCase());
        if (!m || !target) return <Fragment key={i}>{part}</Fragment>;
        const isMe = target.userId === myId;
        return (
          <Fragment key={i}>
            {m[1]}
            <span className={`rounded px-1 font-medium ${isMe ? 'bg-amber-500/25 text-amber-200' : 'bg-[#5865F2]/25 text-[#c9cdfb]'}`}>@{target.name}</span>
          </Fragment>
        );
      })}
    </>
  );
}
