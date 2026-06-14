import React, { useEffect, useRef } from 'react';
import { MessageItem } from './MessageItem';
import { MessageProps } from './types';

interface MessageFeedProps {
  messages: MessageProps[];
  onOpenThread: (messageId: string) => void;
}

export const MessageFeed: React.FC<MessageFeedProps> = ({ messages, onOpenThread }) => {
  const feedEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    feedEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  return (
    <div className="flex-1 overflow-y-auto bg-[#313338] custom-scrollbar flex flex-col justify-end">
      <div className="overflow-y-auto max-h-full">
        {messages.map((msg) => (
          <MessageItem 
            key={msg.id}
            id={msg.id}
            user={msg.user}
            content={msg.content}
            timestamp={msg.timestamp}
            onOpenThread={onOpenThread}
          />
        ))}
        <div ref={feedEndRef} />
      </div>
    </div>
  );
};