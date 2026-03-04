import { useState, useRef, useCallback, useEffect } from 'react';

interface UseWebRTCReturn {
  localStream: MediaStream | null;
  remoteStream: MediaStream | null;
  isCallActive: boolean;
  callDuration: number;
  startCall: (type: 'audio' | 'video') => Promise<void>;
  endCall: () => void;
  error: string | null;
}

export function useWebRTC(): UseWebRTCReturn {
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [isCallActive, setIsCallActive] = useState(false);
  const [callDuration, setCallDuration] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const startCall = useCallback(async (type: 'audio' | 'video') => {
    try {
      setError(null);
      const constraints = type === 'audio'
        ? { audio: true, video: false }
        : { audio: true, video: { width: 1280, height: 720 } };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      setLocalStream(stream);

      // Create peer connection
      const pc = new RTCPeerConnection({
        iceServers: [
          { urls: 'stun:stun.l.google.com:19302' },
          { urls: 'stun:stun1.l.google.com:19302' },
          {
            urls: 'turn:a.relay.metered.ca:80',
            username: 'e8dd65b92f0b1f834f77b420',
            credential: '1lVXpnhp3GXOlMWu'
          },
          {
            urls: 'turn:a.relay.metered.ca:443',
            username: 'e8dd65b92f0b1f834f77b420',
            credential: '1lVXpnhp3GXOlMWu'
          },
          {
            urls: 'turns:a.relay.metered.ca:443?transport=tcp',
            username: 'e8dd65b92f0b1f834f77b420',
            credential: '1lVXpnhp3GXOlMWu'
          }
        ]
      });

      // Add local stream tracks
      stream.getTracks().forEach(track => {
        pc.addTrack(track, stream);
      });

      // Handle remote stream
      pc.ontrack = (event) => {
        if (event.streams[0]) {
          setRemoteStream(event.streams[0]);
        }
      };

      peerConnectionRef.current = pc;
      setIsCallActive(true);

      // Start call duration timer
      intervalRef.current = setInterval(() => {
        setCallDuration(prev => prev + 1);
      }, 1000);

    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start call');
      throw err;
    }
  }, []);

  const endCall = useCallback(() => {
    if (peerConnectionRef.current) {
      peerConnectionRef.current.close();
      peerConnectionRef.current = null;
    }

    if (localStream) {
      localStream.getTracks().forEach(track => track.stop());
    }

    if (intervalRef.current) {
      clearInterval(intervalRef.current);
    }

    setLocalStream(null);
    setRemoteStream(null);
    setIsCallActive(false);
    setCallDuration(0);
  }, [localStream]);

  useEffect(() => {
    return () => {
      endCall();
    };
  }, [endCall]);

  return {
    localStream,
    remoteStream,
    isCallActive,
    callDuration,
    startCall,
    endCall,
    error,
  };
}
