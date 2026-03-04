export type MessageType = 'text' | 'voice' | 'video' | 'image' | 'file';
export type CallType = 'audio' | 'video';
export type CallStatus = 'idle' | 'calling' | 'ringing' | 'connected' | 'ended';
export type GroupRole = 'OWNER' | 'ADMIN' | 'MEMBER';

export interface User {
  id: string;
  name: string;
  avatar: string;
  status: 'online' | 'offline' | 'away' | 'busy';
  lastSeen?: Date;
  bio?: string;
  isBlocked?: boolean;
}

export interface MessageReaction {
  emoji: string;
  userId: string;
  userName?: string;
}

export interface Message {
  id: string;
  senderId: string;
  receiverId: string;
  type: MessageType;
  content: string;
  timestamp: Date;
  createdAt?: Date;
  duration?: number;
  isRead: boolean;
  readAt?: Date;
  isEdited?: boolean;
  isDeleted?: boolean;
  reactions?: MessageReaction[];
  fileName?: string;
  fileSize?: number;
  mimeType?: string;
  replyToId?: string;
}

export interface GroupMember {
  userId: string;
  groupId: string;
  role: GroupRole;
  user: User;
  joinedAt?: Date;
}

export interface Group {
  id: string;
  name: string;
  description?: string;
  avatar?: string;
  ownerId: string;
  isPrivate: boolean;
  inviteCode?: string;
  members: GroupMember[];
  owner: User;
  _count?: { members: number };
  createdAt?: Date;
  updatedAt?: Date;
  unreadCount?: number;
}

export interface GroupMessage {
  id: string;
  groupId: string;
  senderId: string;
  sender?: User;
  type: MessageType;
  content: string;
  timestamp: Date;
  createdAt?: Date;
  duration?: number;
  isEdited?: boolean;
  isDeleted?: boolean;
  reactions?: MessageReaction[];
  fileName?: string;
  fileSize?: number;
  mimeType?: string;
  replyToId?: string;
}

export interface AppNotification {
  id: string;
  userId: string;
  type: string;
  title: string;
  body: string;
  isRead: boolean;
  createdAt: Date;
  triggeredBy?: User;
  triggeredById?: string;
}

export interface Chat {
  id: string;
  participants: User[];
  messages: Message[];
  unreadCount: number;
  lastMessage?: Message;
}

export interface CallState {
  isActive: boolean;
  callType: CallType;
  status: CallStatus;
  remoteUser?: User;
  localStream?: MediaStream;
  remoteStream?: MediaStream;
  startTime?: Date;
  isRemoteMuted?: boolean;
  isRemoteScreenSharing?: boolean;
}

export interface RecordingState {
  isRecording: boolean;
  type: 'voice' | 'video' | null;
  duration: number;
  stream?: MediaStream;
  mediaRecorder?: MediaRecorder;
  chunks: Blob[];
}
