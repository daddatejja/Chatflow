import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import type { CallState, CallType } from '@/types';
import { socketService } from '@/services/socket';
import { webrtcService } from '@/services/webrtc';
import { toast } from 'sonner';
import { useFriends } from './FriendsContext';
import { useMessage } from './MessageContext';

interface CallContextType {
  callState: CallState;
  isRecording: boolean;
  recordingType: 'voice' | 'video' | null;
  recordingDuration: number;
  startCall: (type: CallType) => void;
  endCall: () => void;
  acceptCall: () => void;
  rejectCall: () => void;
  startRecording: (type: 'voice' | 'video') => void;
  stopRecording: () => void;
  cancelRecording: () => void;
}

const CallContext = createContext<CallContextType | undefined>(undefined);

export function CallProvider({ children }: { children: React.ReactNode }) {
  const { users } = useFriends();
  const { selectedChat, sendMediaMessage } = useMessage();

  const [callState, setCallState] = useState<CallState>({ isActive: false, callType: 'audio', status: 'idle' });
  const [isRecording, setIsRecording] = useState(false);
  const [recordingType, setRecordingType] = useState<'voice' | 'video' | null>(null);
  const [recordingDuration, setRecordingDuration] = useState(0);

  const recordingIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const selectedChatRef = useRef(selectedChat);

  useEffect(() => { selectedChatRef.current = selectedChat; }, [selectedChat]);

  // Socket listeners for calls
  useEffect(() => {
    const handleCall = (data: any) => {
      if (data.type === 'incoming') {
        const caller = users.find(u => u.id === data.callerId);
        setCallState({ isActive: true, callType: data.callType, status: 'ringing', remoteUser: caller });
        if (data.callLogId) {
          (window as any)._currentCallLogId = data.callLogId;
        }
      } else if (data.type === 'accepted') {
        setCallState(prev => {
          socketService.setCurrentPeerId(data.receiverId || prev.remoteUser?.id || null);
          const peerId = socketService.getCurrentPeerId();
          if (peerId) {
            setTimeout(() => webrtcService.createOffer(peerId), 100);
          }
          return { ...prev, status: 'connected', startTime: new Date() };
        });
      } else if (data.type === 'rejected' || data.type === 'ended') {
        setCallState({ isActive: false, callType: 'audio', status: 'idle' });
        socketService.setCurrentPeerId(null);
        webrtcService.cleanup();
      }
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

    socketService.onCall(handleCall);
    const onMute = (data: { userId: string, isMuted: boolean }) => handleCallMute(data);
    const onShare = (data: { userId: string, isSharing: boolean }) => handleCallScreenShare(data);
    
    socketService.onCallMuteToggle(onMute);
    socketService.onCallScreenShareToggle(onShare);

    return () => {
      socketService.offCall(handleCall);
      socketService.offCallMuteToggle(onMute);
      socketService.offCallScreenShareToggle(onShare);
    };
  }, [users]);

  const startCall = useCallback(async (type: CallType) => {
    const chat = selectedChatRef.current;
    if (!chat) return;
    setCallState({ isActive: true, callType: type, status: 'calling', remoteUser: chat });
    socketService.setCurrentPeerId(chat.id);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: type === 'video' });
      webrtcService.initialize(stream);
      socketService.initiateCall(chat.id, type);
    } catch (err) {
      console.error('Failed to start call - media access denied:', err);
      setCallState({ isActive: false, callType: 'audio', status: 'idle' });
      socketService.setCurrentPeerId(null);
      toast.error('Could not access microphone/camera');
    }
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

  const acceptCall = useCallback(async () => {
    if (callState.remoteUser) {
      socketService.acceptCall(callState.remoteUser.id, (window as any)._currentCallLogId);
      socketService.setCurrentPeerId(callState.remoteUser.id);
      setCallState(prev => ({ ...prev, status: 'connected', startTime: new Date() }));
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: callState.callType === 'video' });
        webrtcService.initialize(stream);
      } catch (err) {
        console.error('Failed to accept call - media access denied:', err);
        toast.error('Could not access microphone/camera');
      }
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
        if (chunksRef.current.length > 0) {
          const blob = new Blob(chunksRef.current, { type: mimeType || (type === 'voice' ? 'audio/webm' : 'video/webm') });
          await sendMediaMessage(blob, type, recordingDuration);
        }
        stream.getTracks().forEach(t => t.stop());
      };

      mediaRecorder.start(250);
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

  return (
    <CallContext.Provider value={{
      callState, isRecording, recordingType, recordingDuration,
      startCall, endCall, acceptCall, rejectCall, startRecording, stopRecording, cancelRecording,
    }}>
      {children}
    </CallContext.Provider>
  );
}

export function useCall() {
  const context = useContext(CallContext);
  if (context === undefined) {
    throw new Error('useCall must be used within a CallProvider');
  }
  return context;
}
