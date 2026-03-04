import { io, Socket } from 'socket.io-client';

const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || 'http://localhost:3000';

type Listener<T = any> = (data: T) => void;

class SocketService {
  private socket: Socket | null = null;
  private messageListeners: Listener[] = [];
  private typingListeners: Listener[] = [];
  private callListeners: Listener[] = [];
  private webrtcListeners: Listener[] = [];
  private statusListeners: Listener<{ userId: string; status: string }>[] = [];
  private notificationListeners: Listener[] = [];
  private readReceiptListeners: Listener[] = [];
  private reactionListeners: Listener[] = [];
  private messageEditListeners: Listener[] = [];
  private messageDeleteListeners: Listener[] = [];
  private friendListeners: Listener[] = [];
  private groupMessageListeners: Listener[] = [];
  private groupTypingListeners: Listener[] = [];
  private callMuteListeners: Listener<{ userId: string; isMuted: boolean }>[] = [];
  private callScreenShareListeners: Listener<{ userId: string; isSharing: boolean }>[] = [];
  private currentPeerId: string | null = null;

  connect(token: string): void {
    if (this.socket?.connected) return;

    this.socket = io(SOCKET_URL, {
      auth: { token },
      transports: ['websocket', 'polling']
    });

    this.socket.on('connect', () => {
      console.log('Socket connected');
    });

    this.socket.on('disconnect', () => {
      console.log('Socket disconnected');
    });

    this.socket.on('connect_error', (err) => {
      console.error('Socket connection error:', err.message);
    });

    this.socket.on('message:receive', (message) => {
      this.messageListeners.forEach(l => l(message));
    });

    this.socket.on('typing:start', (data) => {
      this.typingListeners.forEach(l => l({ ...data, typing: true }));
    });

    this.socket.on('typing:stop', (data) => {
      this.typingListeners.forEach(l => l({ ...data, typing: false }));
    });

    this.socket.on('user:status', (data) => {
      this.statusListeners.forEach(l => l(data));
    });

    this.socket.on('notification:receive', (data) => {
      this.notificationListeners.forEach(l => l(data));
    });

    this.socket.on('call:incoming', (data) => {
      this.callListeners.forEach(l => l({ ...data, type: 'incoming' }));
    });

    this.socket.on('call:accepted', (data) => {
      this.callListeners.forEach(l => l({ ...data, type: 'accepted' }));
    });

    this.socket.on('call:rejected', (data) => {
      this.callListeners.forEach(l => l({ ...data, type: 'rejected' }));
    });

    this.socket.on('call:ended', (data) => {
      this.callListeners.forEach(l => l({ ...data, type: 'ended' }));
    });

    this.socket.on('call:mute:toggle', (data) => {
      this.callMuteListeners.forEach(l => l(data));
    });

    this.socket.on('call:screenshare:toggle', (data) => {
      this.callScreenShareListeners.forEach(l => l(data));
    });

    this.socket.on('webrtc:offer', (data) => {
      this.webrtcListeners.forEach(l => l({ ...data, webrtcType: 'offer' }));
    });

    this.socket.on('webrtc:answer', (data) => {
      this.webrtcListeners.forEach(l => l({ ...data, webrtcType: 'answer' }));
    });

    this.socket.on('webrtc:ice-candidate', (data) => {
      this.webrtcListeners.forEach(l => l({ ...data, webrtcType: 'ice-candidate' }));
    });

    // Read receipts
    this.socket.on('message:read', (data) => {
      this.readReceiptListeners.forEach(l => l(data));
    });

    // Reactions
    this.socket.on('message:reaction', (data) => {
      this.reactionListeners.forEach(l => l(data));
    });

    // Message edit
    this.socket.on('message:edited', (data) => {
      this.messageEditListeners.forEach(l => l(data));
    });

    // Message delete
    this.socket.on('message:deleted', (data) => {
      this.messageDeleteListeners.forEach(l => l(data));
    });

    // Friend events
    this.socket.on('friend:accepted', (data) => {
      this.friendListeners.forEach(l => l({ ...data, type: 'accepted' }));
    });

    this.socket.on('friend:request', (data) => {
      this.friendListeners.forEach(l => l({ ...data, type: 'request' }));
    });

    // Group messages (server emits both event names depending on source)
    this.socket.on('group:message', (data) => {
      this.groupMessageListeners.forEach(l => l(data));
    });
    this.socket.on('group:message:receive', (data) => {
      this.groupMessageListeners.forEach(l => l(data));
    });

    // Group typing
    this.socket.on('group:typing:start', (data) => {
      this.groupTypingListeners.forEach(l => l({ ...data, typing: true }));
    });
    this.socket.on('group:typing:stop', (data) => {
      this.groupTypingListeners.forEach(l => l({ ...data, typing: false }));
    });
  }

  disconnect(): void {
    this.socket?.disconnect();
    this.socket = null;
  }

  // Send message via socket
  sendMessage(receiverId: string, content: string, type: string = 'text', duration?: number, fileName?: string, fileSize?: number, mimeType?: string, replyToId?: string): Promise<any> {
    return new Promise((resolve, reject) => {
      if (!this.socket) {
        reject(new Error('Socket not connected'));
        return;
      }
      this.socket.emit('message:send', { receiverId, content, type, duration, fileName, fileSize, mimeType, replyToId }, (response: any) => {
        if (response.success) {
          resolve(response.message);
        } else {
          reject(new Error(response.error));
        }
      });
    });
  }

  // Emit message read for multiple messages
  emitMessagesRead(messageIds: string[]): void {
    messageIds.forEach(messageId => {
      this.socket?.emit('message:read', { messageId });
    });
  }

  // Emit reaction
  emitReaction(messageId: string, emoji: string, action: 'add' | 'remove'): void {
    this.socket?.emit('message:reaction', { messageId, emoji, action });
  }

  // Emit message edit
  emitMessageEdit(messageId: string, content: string): void {
    this.socket?.emit('message:edit', { messageId, content });
  }

  // Emit message delete
  emitMessageDelete(messageId: string): void {
    this.socket?.emit('message:delete', { messageId });
  }

  // Typing indicators
  startTyping(receiverId: string): void {
    this.socket?.emit('typing:start', { receiverId });
  }

  stopTyping(receiverId: string): void {
    this.socket?.emit('typing:stop', { receiverId });
  }

  // Call signaling
  initiateCall(receiverId: string, callType: 'audio' | 'video'): void {
    this.socket?.emit('call:initiate', { receiverId, callType });
  }

  acceptCall(callerId: string, callLogId?: string): void {
    this.socket?.emit('call:accept', { callerId, callLogId });
  }

  rejectCall(callerId: string, callLogId?: string): void {
    this.socket?.emit('call:reject', { callerId, callLogId });
  }

  endCall(peerId: string, callLogId?: string, duration?: number): void {
    this.socket?.emit('call:end', { peerId, callLogId, duration });
  }

  // Call features
  toggleMute(peerId: string, isMuted: boolean): void {
    this.socket?.emit('call:mute:toggle', { peerId, isMuted });
  }

  toggleScreenShare(peerId: string, isSharing: boolean): void {
    this.socket?.emit('call:screenshare:toggle', { peerId, isSharing });
  }

  // WebRTC signaling
  sendOffer(peerId: string, offer: RTCSessionDescriptionInit): void {
    this.socket?.emit('webrtc:offer', { peerId, offer });
  }

  sendAnswer(peerId: string, answer: RTCSessionDescriptionInit): void {
    this.socket?.emit('webrtc:answer', { peerId, answer });
  }

  sendIceCandidate(peerId: string, candidate: RTCIceCandidateInit): void {
    this.socket?.emit('webrtc:ice-candidate', { peerId, candidate });
  }

  setCurrentPeerId(peerId: string | null): void {
    this.currentPeerId = peerId;
  }

  getCurrentPeerId(): string | null {
    return this.currentPeerId;
  }

  isConnected(): boolean {
    return this.socket?.connected || false;
  }

  getSocket(): Socket | null {
    return this.socket;
  }

  // ---- Listener registration ----
  onMessage(l: Listener) { this.messageListeners.push(l); }
  offMessage(l: Listener) { this.messageListeners = this.messageListeners.filter(x => x !== l); }

  onTyping(l: Listener) { this.typingListeners.push(l); }
  offTyping(l: Listener) { this.typingListeners = this.typingListeners.filter(x => x !== l); }

  onStatus(l: Listener<{ userId: string; status: string }>) { this.statusListeners.push(l); }
  offStatus(l: Listener<{ userId: string; status: string }>) { this.statusListeners = this.statusListeners.filter(x => x !== l); }

  onNotification(l: Listener) { this.notificationListeners.push(l); }
  offNotification(l: Listener) { this.notificationListeners = this.notificationListeners.filter(x => x !== l); }

  onCall(l: Listener) { this.callListeners.push(l); }
  offCall(l: Listener) { this.callListeners = this.callListeners.filter(x => x !== l); }

  onWebrtc(l: Listener) { this.webrtcListeners.push(l); }
  offWebrtc(l: Listener) { this.webrtcListeners = this.webrtcListeners.filter(x => x !== l); }
  onWebRTC(l: Listener) { this.webrtcListeners.push(l); }
  offWebRTC(l: Listener) { this.webrtcListeners = this.webrtcListeners.filter(x => x !== l); }

  onReadReceipt(l: Listener) { this.readReceiptListeners.push(l); }
  offReadReceipt(l: Listener) { this.readReceiptListeners = this.readReceiptListeners.filter(x => x !== l); }

  onReaction(l: Listener) { this.reactionListeners.push(l); }
  offReaction(l: Listener) { this.reactionListeners = this.reactionListeners.filter(x => x !== l); }

  onMessageEdit(l: Listener) { this.messageEditListeners.push(l); }
  offMessageEdit(l: Listener) { this.messageEditListeners = this.messageEditListeners.filter(x => x !== l); }

  onMessageDelete(l: Listener) { this.messageDeleteListeners.push(l); }
  offMessageDelete(l: Listener) { this.messageDeleteListeners = this.messageDeleteListeners.filter(x => x !== l); }

  onFriend(l: Listener) { this.friendListeners.push(l); }
  offFriend(l: Listener) { this.friendListeners = this.friendListeners.filter(x => x !== l); }

  onCallMuteToggle(l: Listener<{ userId: string; isMuted: boolean }>) { this.callMuteListeners.push(l); }
  offCallMuteToggle(l: Listener<{ userId: string; isMuted: boolean }>) { this.callMuteListeners = this.callMuteListeners.filter(x => x !== l); }

  onCallScreenShareToggle(l: Listener<{ userId: string; isSharing: boolean }>) { this.callScreenShareListeners.push(l); }
  offCallScreenShareToggle(l: Listener<{ userId: string; isSharing: boolean }>) { this.callScreenShareListeners = this.callScreenShareListeners.filter(x => x !== l); }

  // Group
  joinGroup(groupId: string) { this.socket?.emit('group:join', { groupId }); }
  leaveGroup(groupId: string) { this.socket?.emit('group:leave', { groupId }); }

  sendGroupMessage(groupId: string, content: string, type: string, duration?: number, replyToId?: string): Promise<any> {
    return new Promise((resolve, reject) => {
      if (!this.socket) { reject(new Error('Not connected')); return; }
      this.socket.emit('group:message:send', { groupId, content, type, duration, replyToId }, (res: any) => {
        if (res?.success) resolve(res.message);
        else reject(new Error(res?.error || 'Failed'));
      });
    });
  }

  startGroupTyping(groupId: string) { this.socket?.emit('group:typing:start', { groupId }); }
  stopGroupTyping(groupId: string) { this.socket?.emit('group:typing:stop', { groupId }); }

  onGroupMessage(l: Listener) { this.groupMessageListeners.push(l); }
  offGroupMessage(l: Listener) { this.groupMessageListeners = this.groupMessageListeners.filter(x => x !== l); }

  onGroupTyping(l: Listener) { this.groupTypingListeners.push(l); }
  offGroupTyping(l: Listener) { this.groupTypingListeners = this.groupTypingListeners.filter(x => x !== l); }
}

export const socketService = new SocketService();
export default socketService;
