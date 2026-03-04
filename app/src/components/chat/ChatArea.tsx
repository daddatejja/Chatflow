import { useState } from 'react';
import { ChatHeader } from './ChatHeader';
import { MessageList } from './MessageList';
import { MessageInput } from './MessageInput';
import type { Message } from '@/types';

export function ChatArea() {
  const [replyToMessage, setReplyToMessage] = useState<Message | null>(null);

  return (
    <div className="flex-1 flex flex-col bg-background h-full relative">
      <ChatHeader />
      <MessageList onReply={setReplyToMessage} />
      <MessageInput
        replyToMessage={replyToMessage}
        onCancelReply={() => setReplyToMessage(null)}
      />
    </div>
  );
}
