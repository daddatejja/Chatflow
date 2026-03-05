import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import type { User, Message, MessageType } from '@/types';
import { messageAPI } from '@/services/api';
import { socketService } from '@/services/socket';
import { toast } from 'sonner';
import { useAuth } from './AuthContext';
import { useFriends } from './FriendsContext';

export function normalizeMessage(raw: any): Message {
  return {
    ...raw,
    type: (raw.type || 'TEXT').toLowerCase() as MessageType,
    timestamp: new Date(raw.createdAt || raw.timestamp || Date.now()),
    status: raw.status ? raw.status.toLowerCase() : undefined,
    reactions: raw.reactions || [],
  };
}

interface MessageContextType {
  selectedChat: User | null;
  messages: Message[];
  unreadCounts: Record<string, number>;
  isTyping: Record<string, boolean>;
  lastMessages: Record<string, Message>;
  hasMore: boolean;
  isLoadingMore: boolean;
  selectChat: (user: User | null) => void;
  sendMessage: (content: string, type: MessageType, duration?: number, fileName?: string, fileSize?: number, mimeType?: string, replyToId?: string) => void;
  sendMediaMessage: (blob: Blob, type: 'voice' | 'video', duration: number) => Promise<void>;
  sendFileMessage: (file: File) => Promise<void>;
  addReaction: (messageId: string, emoji: string) => void;
  editMessage: (messageId: string, content: string) => void;
  deleteMessage: (messageId: string) => void;
  markAsRead: (userId: string) => void;
  loadMessages: (userId: string) => Promise<void>;
  loadEarlierMessages: () => Promise<void>;
}

const MessageContext = createContext<MessageContextType | undefined>(undefined);

export function MessageProvider({ children }: { children: React.ReactNode }) {
  const { currentUser } = useAuth();
  const { users } = useFriends();

  const [selectedChat, setSelectedChat] = useState<User | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [unreadCounts, setUnreadCounts] = useState<Record<string, number>>({});
  const [isTyping, setIsTyping] = useState<Record<string, boolean>>({});
  const [lastMessages, setLastMessages] = useState<Record<string, Message>>({});
  const [hasMore, setHasMore] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [cursor, setCursor] = useState<string | null>(null);

  const selectedChatRef = useRef<User | null>(null);
  const currentUserRef = useRef<User | null>(null);

  useEffect(() => { selectedChatRef.current = selectedChat; }, [selectedChat]);
  useEffect(() => { currentUserRef.current = currentUser; }, [currentUser]);

  const loadUnreadCounts = useCallback(async () => {
    try {
      const response = await messageAPI.getUnreadCounts();
      setUnreadCounts(response.data.counts ?? {});
    } catch (error) {
      console.error('Failed to load unread counts:', error);
    }
  }, []);

  useEffect(() => {
    loadUnreadCounts();
  }, [loadUnreadCounts]);

  // Socket listeners for messages
  useEffect(() => {
    const handleMessage = (raw: any) => {
      const message = normalizeMessage(raw);
      const selected = selectedChatRef.current;
      const me = currentUserRef.current;

      setMessages(prev => {
        if (prev.some(m => m.id === message.id)) return prev;
        return [...prev, message];
      });

      const otherId = message.senderId === me?.id ? message.receiverId : message.senderId;
      setLastMessages(prev => ({ ...prev, [otherId]: message }));

      if (message.senderId !== selected?.id && message.senderId !== me?.id) {
        setUnreadCounts(prev => ({
          ...prev,
          [message.senderId]: (prev[message.senderId] || 0) + 1
        }));
        const sender = users.find(u => u.id === message.senderId);
        if (sender) {
          toast.message(`New message from ${sender.name}`, {
            description: message.type === 'text' ? message.content : `Sent a ${message.type} message`
          });
        }
      }
    };

    const handleTyping = (data: { userId: string; typing: boolean }) => {
      setIsTyping(prev => ({ ...prev, [data.userId]: data.typing }));
      if (data.typing) {
        setTimeout(() => {
          setIsTyping(prev => ({ ...prev, [data.userId]: false }));
        }, 3000);
      }
    };

    const handleReadReceipt = ({ messageId }: { messageId: string }) => {
      setMessages(prev => prev.map(m => m.id === messageId ? { ...m, isRead: true } : m));
    };

    const handleReaction = ({ messageId, userId, emoji, action }: any) => {
      setMessages(prev => prev.map(m => {
        if (m.id !== messageId) return m;
        const reactions = m.reactions || [];
        if (action === 'add') {
          if (reactions.some(r => r.userId === userId && r.emoji === emoji)) return m;
          return { ...m, reactions: [...reactions, { emoji, userId }] };
        } else {
          return { ...m, reactions: reactions.filter(r => !(r.userId === userId && r.emoji === emoji)) };
        }
      }));
    };

    const handleMessageEdit = ({ messageId, content }: any) => {
      setMessages(prev => prev.map(m => m.id === messageId ? { ...m, content, isEdited: true } : m));
    };

    const handleMessageDelete = ({ messageId }: any) => {
      setMessages(prev => prev.map(m => m.id === messageId ? { ...m, isDeleted: true, content: 'This message was deleted' } : m));
    };

    socketService.onMessage(handleMessage);
    socketService.onTyping(handleTyping);
    socketService.onReadReceipt(handleReadReceipt);
    socketService.onReaction(handleReaction);
    socketService.onMessageEdit(handleMessageEdit);
    socketService.onMessageDelete(handleMessageDelete);

    return () => {
      socketService.offMessage(handleMessage);
      socketService.offTyping(handleTyping);
      socketService.offReadReceipt(handleReadReceipt);
      socketService.offReaction(handleReaction);
      socketService.offMessageEdit(handleMessageEdit);
      socketService.offMessageDelete(handleMessageDelete);
    };
  }, [users]);

  const markAsRead = useCallback(async (userId: string) => {
    try {
      await messageAPI.markAsRead(userId);
      setUnreadCounts(prev => ({ ...prev, [userId]: 0 }));
    } catch (error) {
      console.error('Failed to mark as read:', error);
    }
  }, []);

  const loadMessages = async (userId: string) => {
    try {
      setHasMore(false);
      setCursor(null);
      const response = await messageAPI.getMessages(userId);
      const normalized = (response.data.messages || []).map(normalizeMessage);
      setMessages(normalized);
      setHasMore(response.data.pagination?.hasMore || false);
      setCursor(response.data.pagination?.cursor || null);

      if (normalized.length > 0) {
        setLastMessages(prev => ({ ...prev, [userId]: normalized[normalized.length - 1] }));
      }

      const unread = normalized.filter((m: Message) => !m.isRead && m.senderId === userId);
      if (unread.length > 0) {
        socketService.emitMessagesRead(unread.map((m: Message) => m.id));
      }
    } catch (error) {
      console.error('Failed to load messages:', error);
    }
  };

  const selectChat = useCallback((user: User | null) => {
    setSelectedChat(user);
    if (user) {
      loadMessages(user.id);
      markAsRead(user.id);
    } else {
      setMessages([]);
    }
  }, [markAsRead]);

  const loadEarlierMessages = useCallback(async () => {
    const chat = selectedChatRef.current;
    if (!chat || isLoadingMore || !hasMore || !cursor) return;
    try {
      setIsLoadingMore(true);
      const response = await messageAPI.getMessages(chat.id, undefined, undefined, cursor);
      const normalized = (response.data.messages || []).map(normalizeMessage);
      setMessages(prev => {
        const existingIds = new Set(prev.map(m => m.id));
        const newMsgs = normalized.filter((m: Message) => !existingIds.has(m.id));
        return [...newMsgs, ...prev];
      });
      setHasMore(response.data.pagination?.hasMore || false);
      setCursor(response.data.pagination?.cursor || null);
    } catch (e) {
      console.error('Failed to load earlier messages:', e);
    } finally {
      setIsLoadingMore(false);
    }
  }, [isLoadingMore, hasMore, cursor]);

  const sendMessage = useCallback(async (content: string, type: MessageType, duration?: number, fileName?: string, fileSize?: number, mimeType?: string, replyToId?: string) => {
    const chat = selectedChatRef.current;
    const me = currentUserRef.current;
    if (!chat || !me) return;

    const optimistic: Message = {
      id: `tmp-${Date.now()}`,
      senderId: me.id,
      receiverId: chat.id,
      type,
      content,
      timestamp: new Date(),
      isRead: false,
      duration,
      fileName,
      fileSize,
      mimeType,
      replyToId,
      reactions: [],
    };
    setMessages(prev => [...prev, optimistic]);
    setLastMessages(prev => ({ ...prev, [chat.id]: optimistic }));

    try {
      const message = await socketService.sendMessage(chat.id, content, type, duration, fileName, fileSize, mimeType, replyToId);
      const normalized = normalizeMessage(message);
      setMessages(prev => prev.map(m => m.id === optimistic.id ? normalized : m));
      setLastMessages(prev => ({ ...prev, [chat.id]: normalized }));
    } catch (error) {
      setMessages(prev => prev.filter(m => m.id !== optimistic.id));
      console.error('Failed to send message:', error);
      toast.error('Failed to send message');
    }
  }, []);

  const sendMediaMessage = useCallback(async (blob: Blob, type: 'voice' | 'video', duration: number) => {
    const chat = selectedChatRef.current;
    if (!chat) return;
    try {
      const ext = 'webm';
      const fileName = `${type}-${Date.now()}.${ext}`;
      const response = await messageAPI.uploadMedia(blob, type, chat.id, duration, fileName);
      const normalized = normalizeMessage(response.data.message);
      setMessages(prev => [...prev, normalized]);
      setLastMessages(prev => ({ ...prev, [chat.id]: normalized }));
    } catch (error) {
      console.error('Failed to send media:', error);
      toast.error('Failed to send media message');
    }
  }, []);

  const sendFileMessage = useCallback(async (file: File) => {
    const chat = selectedChatRef.current;
    if (!chat) return;
    const type = file.type.startsWith('image/') ? 'image' as const : 'file' as const;
    const me = currentUserRef.current;

    const optimistic: Message = {
      id: `tmp-${Date.now()}`,
      senderId: me?.id || '',
      receiverId: chat.id,
      type,
      content: URL.createObjectURL(file),
      timestamp: new Date(),
      isRead: false,
      fileName: file.name,
      fileSize: file.size,
      mimeType: file.type,
      reactions: [],
    };
    setMessages(prev => [...prev, optimistic]);

    try {
      const response = await messageAPI.uploadMedia(file, type, chat.id, undefined, file.name);
      const normalized = normalizeMessage(response.data.message);
      setMessages(prev => prev.map(m => m.id === optimistic.id ? normalized : m));
      setLastMessages(prev => ({ ...prev, [chat.id]: normalized }));
    } catch (error) {
      setMessages(prev => prev.filter(m => m.id !== optimistic.id));
      console.error('Failed to upload file:', error);
      toast.error('Failed to upload file');
    }
  }, []);

  const addReaction = useCallback((messageId: string, emoji: string) => {
    const me = currentUserRef.current;
    if (!me) return;
    socketService.emitReaction(messageId, emoji, 'add');
    setMessages(prev => prev.map(m => {
      if (m.id !== messageId) return m;
      const reactions = m.reactions || [];
      const alreadyReacted = reactions.some(r => r.userId === me.id && r.emoji === emoji);
      if (alreadyReacted) {
        socketService.emitReaction(messageId, emoji, 'remove');
        return { ...m, reactions: reactions.filter(r => !(r.userId === me.id && r.emoji === emoji)) };
      }
      return { ...m, reactions: [...reactions, { emoji, userId: me.id }] };
    }));
  }, []);

  const editMessage = useCallback(async (messageId: string, content: string) => {
    try {
      await messageAPI.editMessage(messageId, content);
      socketService.emitMessageEdit(messageId, content);
      setMessages(prev => prev.map(m => m.id === messageId ? { ...m, content, isEdited: true } : m));
    } catch (error) {
      console.error('Failed to edit message:', error);
      toast.error('Failed to edit message');
    }
  }, []);

  const deleteMessage = useCallback(async (messageId: string) => {
    try {
      await messageAPI.deleteMessage(messageId);
      socketService.emitMessageDelete(messageId);
      setMessages(prev => prev.map(m => m.id === messageId ? { ...m, isDeleted: true, content: 'This message was deleted' } : m));
    } catch (error) {
      console.error('Failed to delete message:', error);
      toast.error('Failed to delete message');
    }
  }, []);

  return (
    <MessageContext.Provider value={{
      selectedChat, messages, unreadCounts, isTyping, lastMessages, hasMore, isLoadingMore,
      selectChat, sendMessage, sendMediaMessage, sendFileMessage, addReaction, editMessage, deleteMessage,
      markAsRead, loadMessages, loadEarlierMessages,
    }}>
      {children}
    </MessageContext.Provider>
  );
}

export function useMessage() {
  const context = useContext(MessageContext);
  if (context === undefined) {
    throw new Error('useMessage must be used within a MessageProvider');
  }
  return context;
}
