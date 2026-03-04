import React, { createContext, useContext, useState, useCallback, useRef, useEffect } from 'react';
import type { User, Message, CallState, CallType, MessageType } from '@/types';
import { userAPI, messageAPI } from '@/services/api';
import { socketService } from '@/services/socket';
import { webrtcService } from '@/services/webrtc';
import { toast } from 'sonner';

function normalizeMessage(raw: any): Message {
  return {
    ...raw,
    type: (raw.type || 'TEXT').toLowerCase() as MessageType,
    timestamp: new Date(raw.createdAt || raw.timestamp || Date.now()),
    status: raw.status ? raw.status.toLowerCase() : undefined,
    reactions: raw.reactions || [],
  };
}

interface ChatContextType {
  currentUser: User | null;
  users: User[];
  selectedChat: User | null;
  messages: Message[];
  callState: CallState;
  isRecording: boolean;
  recordingType: 'voice' | 'video' | null;
  recordingDuration: number;
  unreadCounts: Record<string, number>;
  isTyping: Record<string, boolean>;
  lastMessages: Record<string, Message>;
  selectChat: (user: User | null) => void;
  sendMessage: (content: string, type: MessageType, duration?: number, fileName?: string, fileSize?: number, mimeType?: string, replyToId?: string) => void;
  sendMediaMessage: (blob: Blob, type: 'voice' | 'video', duration: number) => Promise<void>;
  sendFileMessage: (file: File) => Promise<void>;
  addReaction: (messageId: string, emoji: string) => void;
  editMessage: (messageId: string, content: string) => void;
  deleteMessage: (messageId: string) => void;
  startCall: (type: CallType) => void;
  endCall: () => void;
  acceptCall: () => void;
  rejectCall: () => void;
  startRecording: (type: 'voice' | 'video') => void;
  stopRecording: () => void;
  cancelRecording: () => void;
  markAsRead: (userId: string) => void;
  loadMessages: (userId: string) => Promise<void>;
  loadFriends: () => Promise<void>;
  hasMore: boolean;
  isLoadingMore: boolean;
  loadEarlierMessages: () => Promise<void>;
  blockedUsers: User[];
  blockUser: (userId: string) => Promise<void>;
  unblockUser: (userId: string) => Promise<void>;
}

const ChatContext = createContext<ChatContextType | undefined>(undefined);

export function ChatProvider({ children }: { children: React.ReactNode }) {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [selectedChat, setSelectedChat] = useState<User | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [callState, setCallState] = useState<CallState>({ isActive: false, callType: 'audio', status: 'idle' });
  const [isRecording, setIsRecording] = useState(false);
  const [recordingType, setRecordingType] = useState<'voice' | 'video' | null>(null);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const [unreadCounts, setUnreadCounts] = useState<Record<string, number>>({});
  const [isTyping, setIsTyping] = useState<Record<string, boolean>>({});
  const [lastMessages, setLastMessages] = useState<Record<string, Message>>({});
  const [hasMore, setHasMore] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [cursor, setCursor] = useState<string | null>(null);
  const [blockedUsers, setBlockedUsers] = useState<User[]>([]);

  const recordingIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const selectedChatRef = useRef<User | null>(null);
  const currentUserRef = useRef<User | null>(null);

  // Keep refs in sync so socket handlers don't capture stale closures
  useEffect(() => { selectedChatRef.current = selectedChat; }, [selectedChat]);
  useEffect(() => { currentUserRef.current = currentUser; }, [currentUser]);

  const loadFriends = useCallback(async () => {
    try {
      const usersRes = await userAPI.getFriends();
      const friends = (usersRes.data.friends ?? []).map((f: any) => ({
        ...f,
        status: (f.status || 'OFFLINE').toLowerCase(),
      }));
      setUsers(friends);
    } catch (error) {
      console.error('Failed to load friends:', error);
    }
  }, []);

  const loadUnreadCounts = useCallback(async () => {
    try {
      const response = await messageAPI.getUnreadCounts();
      setUnreadCounts(response.data.counts ?? {});
    } catch (error) {
      console.error('Failed to load unread counts:', error);
    }
  }, []);

  // Initial data load
  useEffect(() => {
    const loadUserData = async () => {
      try {
        const [profileRes, usersRes, blockedRes] = await Promise.all([
          userAPI.getProfile(),
          userAPI.getFriends(),
          userAPI.getBlockedUsers()
        ]);
        const user = profileRes.data.user;
        setCurrentUser({ ...user, status: (user.status || 'OFFLINE').toLowerCase() });
        const friends = (usersRes.data.friends ?? []).map((f: any) => ({
          ...f,
          status: (f.status || 'OFFLINE').toLowerCase(),
        }));
        setUsers(friends);
        setBlockedUsers(blockedRes.data.blockedUsers || []);
      } catch (error) {
        console.error('Failed to load user data:', error);
      }
    };
    loadUserData();
    loadUnreadCounts();
  }, [loadUnreadCounts]);

  // Socket.IO event listeners
  useEffect(() => {
    const handleMessage = (raw: any) => {
      const message = normalizeMessage(raw);
      const selected = selectedChatRef.current;
      const me = currentUserRef.current;

      setMessages(prev => {
        if (prev.some(m => m.id === message.id)) return prev;
        return [...prev, message];
      });

      // Update last message tracking
      const otherId = message.senderId === me?.id ? message.receiverId : message.senderId;
      setLastMessages(prev => ({ ...prev, [otherId]: message }));

      // Update unread count if not from currently selected chat
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

    const handleStatus = ({ userId, status }: { userId: string; status: string }) => {
      const normalized = status.toLowerCase() as any;
      setUsers(prev => prev.map(u => u.id === userId ? { ...u, status: normalized } : u));
      setSelectedChat(prev => prev?.id === userId ? { ...prev, status: normalized } : prev);
    };

    const handleTyping = (data: { userId: string; typing: boolean }) => {
      setIsTyping(prev => ({ ...prev, [data.userId]: data.typing }));
      // Auto clear typing after 3s
      if (data.typing) {
        setTimeout(() => {
          setIsTyping(prev => ({ ...prev, [data.userId]: false }));
        }, 3000);
      }
    };

    const handleCall = (data: any) => {
      if (data.type === 'incoming') {
        const caller = users.find(u => u.id === data.callerId);
        setCallState({ isActive: true, callType: data.callType, status: 'ringing', remoteUser: caller });
        // Assume callLogId is saved temporarily if needed in state, 
        // passing it through to the accept/reject calls.
        if (data.callLogId) {
          (window as any)._currentCallLogId = data.callLogId;
        }
      } else if (data.type === 'accepted') {
        setCallState(prev => {
          socketService.setCurrentPeerId(data.receiverId || prev.remoteUser?.id || null);
          if (socketService.getCurrentPeerId()) {
            webrtcService.createOffer(socketService.getCurrentPeerId()!);
          }
          return { ...prev, status: 'connected', startTime: new Date() };
        });
      } else if (data.type === 'rejected' || data.type === 'ended') {
        setCallState({ isActive: false, callType: 'audio', status: 'idle' });
        socketService.setCurrentPeerId(null);
        webrtcService.cleanup();
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

    const handleCallMute = ({ userId, isMuted }: { userId: string, isMuted: boolean }) => {
      setCallState(prev => {
        if (prev.remoteUser?.id === userId) {
          return { ...prev, isRemoteMuted: isMuted };
        }
        return prev;
      });
    };

    const handleCallScreenShare = ({ userId, isSharing }: { userId: string, isSharing: boolean }) => {
      setCallState(prev => {
        if (prev.remoteUser?.id === userId) {
          return { ...prev, isRemoteScreenSharing: isSharing };
        }
        return prev;
      });
    };

    const handleFriend = (data: any) => {
      if (data.type === 'accepted') {
        // Refresh friends list
        loadFriends();
        toast.success(`${data.friend?.name || 'Someone'} accepted your friend request!`);
      }
    };

    socketService.onMessage(handleMessage);
    socketService.onTyping(handleTyping);
    socketService.onCall(handleCall);
    socketService.onStatus(handleStatus);
    socketService.onReadReceipt(handleReadReceipt);
    socketService.onReaction(handleReaction);
    socketService.onMessageEdit(handleMessageEdit);
    socketService.onMessageDelete(handleMessageDelete);
    socketService.onFriend(handleFriend);

    // Dynamic call states
    const onMute = (data: { userId: string, isMuted: boolean }) => handleCallMute(data);
    const onShare = (data: { userId: string, isSharing: boolean }) => handleCallScreenShare(data);

    socketService.onCallMuteToggle(onMute);
    socketService.onCallScreenShareToggle(onShare);

    return () => {
      socketService.offMessage(handleMessage);
      socketService.offTyping(handleTyping);
      socketService.offCall(handleCall);
      socketService.offStatus(handleStatus);
      socketService.offReadReceipt(handleReadReceipt);
      socketService.offReaction(handleReaction);
      socketService.offMessageEdit(handleMessageEdit);
      socketService.offMessageDelete(handleMessageDelete);
      socketService.offFriend(handleFriend);

      socketService.offCallMuteToggle(onMute);
      socketService.offCallScreenShareToggle(onShare);
    };
  }, [users, loadFriends]);

  const selectChat = useCallback((user: User | null) => {
    setSelectedChat(user);
    if (user) {
      loadMessages(user.id);
      markAsRead(user.id);
    } else {
      setMessages([]);
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

      // Set last message for preview
      if (normalized.length > 0) {
        setLastMessages(prev => ({ ...prev, [userId]: normalized[normalized.length - 1] }));
      }

      // Emit read receipts for unread messages from this user
      const unread = normalized.filter((m: Message) => !m.isRead && m.senderId === userId);
      if (unread.length > 0) {
        socketService.emitMessagesRead(unread.map((m: Message) => m.id));
      }
    } catch (error) {
      console.error('Failed to load messages:', error);
    }
  };

  const loadEarlierMessages = useCallback(async () => {
    const chat = selectedChatRef.current;
    if (!chat || isLoadingMore || !hasMore || !cursor) return;
    try {
      setIsLoadingMore(true);
      const response = await messageAPI.getMessages(chat.id, undefined, undefined, cursor);
      const normalized = (response.data.messages || []).map(normalizeMessage);
      setMessages(prev => {
        // Filter out any duplicates
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

    // Optimistic update
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
      // Replace optimistic with real
      setMessages(prev => prev.map(m => m.id === optimistic.id ? normalized : m));
      setLastMessages(prev => ({ ...prev, [chat.id]: normalized }));
    } catch (error) {
      // Remove optimistic on failure
      setMessages(prev => prev.filter(m => m.id !== optimistic.id));
      console.error('Failed to send message:', error);
      toast.error('Failed to send message');
    }
  }, []);

  const sendMediaMessage = useCallback(async (blob: Blob, type: 'voice' | 'video', duration: number) => {
    const chat = selectedChatRef.current;
    if (!chat) return;
    try {
      const ext = type === 'voice' ? 'webm' : 'webm';
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

    // Optimistic update with a preview
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
    // Optimistic
    setMessages(prev => prev.map(m => {
      if (m.id !== messageId) return m;
      const reactions = m.reactions || [];
      const alreadyReacted = reactions.some(r => r.userId === me.id && r.emoji === emoji);
      if (alreadyReacted) {
        // Toggle off
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

  const startCall = useCallback((type: CallType) => {
    const chat = selectedChatRef.current;
    if (!chat) return;
    setCallState({ isActive: true, callType: type, status: 'calling', remoteUser: chat });
    socketService.setCurrentPeerId(chat.id);
    socketService.initiateCall(chat.id, type);
    navigator.mediaDevices.getUserMedia({ audio: true, video: type === 'video' })
      .then(stream => webrtcService.initialize(stream))
      .catch(console.error);
  }, []);

  const endCall = useCallback(() => {
    if (callState.remoteUser) {
      let duration = 0;
      if (callState.startTime) {
        duration = Math.floor((new Date().getTime() - callState.startTime.getTime()) / 1000);
      }
      socketService.endCall(callState.remoteUser.id, (window as any)._currentCallLogId, duration);
    }
    setCallState({ isActive: false, callType: 'audio', status: 'idle' });
    socketService.setCurrentPeerId(null);
    webrtcService.cleanup();
  }, [callState.remoteUser, callState.startTime]);

  const acceptCall = useCallback(() => {
    if (callState.remoteUser) {
      socketService.acceptCall(callState.remoteUser.id, (window as any)._currentCallLogId);
      socketService.setCurrentPeerId(callState.remoteUser.id);
      setCallState(prev => ({ ...prev, status: 'connected', startTime: new Date() }));
      navigator.mediaDevices.getUserMedia({ audio: true, video: callState.callType === 'video' })
        .then(stream => webrtcService.initialize(stream))
        .catch(console.error);
    }
  }, [callState.remoteUser, callState.callType]);

  const rejectCall = useCallback(() => {
    if (callState.remoteUser) {
      socketService.rejectCall(callState.remoteUser.id, (window as any)._currentCallLogId);
    }
    setCallState({ isActive: false, callType: 'audio', status: 'idle' });
    webrtcService.cleanup();
  }, [callState.remoteUser]);

  const startRecording = useCallback(async (type: 'voice' | 'video') => {
    try {
      const constraints = type === 'voice'
        ? { audio: true, video: false }
        : { audio: true, video: true };
      const stream = await navigator.mediaDevices.getUserMedia(constraints);

      // Try to use a broad codec that works cross-browser
      let mimeType = '';
      const candidates = type === 'voice'
        ? ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg']
        : ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'];
      for (const c of candidates) {
        if (MediaRecorder.isTypeSupported(c)) { mimeType = c; break; }
      }

      const options = mimeType ? { mimeType } : {};
      const mediaRecorder = new MediaRecorder(stream, options);
      chunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      mediaRecorder.onstop = async () => {
        // Only send if there are chunks and we didn't clear them in cancelRecording
        if (chunksRef.current.length > 0) {
          const blob = new Blob(chunksRef.current, { type: mimeType || (type === 'voice' ? 'audio/webm' : 'video/webm') });
          await sendMediaMessage(blob, type, recordingDuration);
        }
        stream.getTracks().forEach(t => t.stop());
      };

      mediaRecorder.start(250); // collect chunks every 250ms
      mediaRecorderRef.current = mediaRecorder;
      setIsRecording(true);
      setRecordingType(type);
      setRecordingDuration(0);

      recordingIntervalRef.current = setInterval(() => {
        setRecordingDuration(prev => prev + 1);
      }, 1000);
    } catch (error) {
      console.error('Error starting recording:', error);
      toast.error('Could not access camera/microphone');
    }
  }, [sendMediaMessage, recordingDuration]);

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
    if (recordingIntervalRef.current) {
      clearInterval(recordingIntervalRef.current);
    }
    setIsRecording(false);
    setRecordingType(null);
    setRecordingDuration(0);
  }, []);

  const cancelRecording = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      // Clear chunks so the onstop handler doesn't send it
      chunksRef.current = [];
      mediaRecorderRef.current.stop();
    }
    if (recordingIntervalRef.current) {
      clearInterval(recordingIntervalRef.current);
    }
    setIsRecording(false);
    setRecordingType(null);
    setRecordingDuration(0);
  }, []);

  const markAsRead = useCallback(async (userId: string) => {
    try {
      await messageAPI.markAsRead(userId);
      setUnreadCounts(prev => ({ ...prev, [userId]: 0 }));
    } catch (error) {
      console.error('Failed to mark as read:', error);
    }
  }, []);

  const blockUser = useCallback(async (userId: string) => {
    try {
      await userAPI.blockUser(userId);
      setBlockedUsers(prev => {
        const userToBlock = users.find(u => u.id === userId);
        if (userToBlock && !prev.some(u => u.id === userId)) {
          return [...prev, userToBlock];
        }
        return prev;
      });
      // Optionally remove from friends list
      setUsers(prev => prev.filter(u => u.id !== userId));
      if (selectedChat?.id === userId) {
        setSelectedChat(null);
      }
      toast.success('User blocked successfully');
    } catch (error: any) {
      console.error('Failed to block user:', error);
      toast.error(error.response?.data?.error || 'Failed to block user');
    }
  }, [users, selectedChat]);

  const unblockUser = useCallback(async (userId: string) => {
    try {
      await userAPI.unblockUser(userId);
      setBlockedUsers(prev => prev.filter(u => u.id !== userId));
      // Reload friends list just in case
      loadFriends();
      toast.success('User unblocked successfully');
    } catch (error: any) {
      console.error('Failed to unblock user:', error);
      toast.error(error.response?.data?.error || 'Failed to unblock user');
    }
  }, [loadFriends]);

  return (
    <ChatContext.Provider value={{
      currentUser,
      users,
      selectedChat,
      messages,
      callState,
      isRecording,
      recordingType,
      recordingDuration,
      unreadCounts,
      isTyping,
      lastMessages,
      selectChat,
      sendMessage,
      sendMediaMessage,
      sendFileMessage,
      addReaction,
      editMessage,
      deleteMessage,
      startCall,
      endCall,
      acceptCall,
      rejectCall,
      startRecording,
      stopRecording,
      cancelRecording,
      markAsRead,
      loadMessages,
      loadFriends,
      hasMore,
      isLoadingMore,
      loadEarlierMessages,
      blockedUsers,
      blockUser,
      unblockUser,
    }}>
      {children}
    </ChatContext.Provider>
  );
}

export function useChat() {
  const context = useContext(ChatContext);
  if (context === undefined) {
    throw new Error('useChat must be used within a ChatProvider');
  }
  return context;
}
