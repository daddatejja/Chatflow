import { useChat } from '@/context/ChatContext';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { formatDuration } from '@/lib/utils';
import {
  Phone, Video, Mic, MicOff, VideoOff, PhoneOff,
  Volume2, VolumeX, Monitor, MonitorOff,
  Maximize2, Minimize2
} from 'lucide-react';
import { useState, useEffect, useRef, useCallback } from 'react';
import { webrtcService } from '@/services/webrtc';
import { socketService } from '@/services/socket';
import { toast } from 'sonner';

type LocalCallType = 'audio' | 'video';

export function CallModal() {
  const { callState, endCall, acceptCall, rejectCall } = useChat();

  // Media state
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoOff, setIsVideoOff] = useState(false);
  const [isSpeakerOn, setIsSpeakerOn] = useState(true);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [currentCallType, setCurrentCallType] = useState<LocalCallType>(callState.callType);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [audioLevel, setAudioLevel] = useState(0);
  const [videoUpgradeRequested, setVideoUpgradeRequested] = useState(false);
  const [pendingVideoUpgrade, setPendingVideoUpgrade] = useState(false);
  const isMobile = typeof navigator !== 'undefined' && /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);

  // Timers
  const [callDuration, setCallDuration] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Video elements
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const remoteAudioRef = useRef<HTMLAudioElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Audio analyzer
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyzerRef = useRef<AnalyserNode | null>(null);
  const dataArrayRef = useRef<Uint8Array | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const ringtoneRef = useRef<HTMLAudioElement | null>(null);

  // Sync callType from context
  useEffect(() => { setCurrentCallType(callState.callType); }, [callState.callType]);

  // Ringtone: play when ringing or calling, stop when connected/ended
  useEffect(() => {
    if (callState.status === 'ringing' || callState.status === 'calling') {
      try {
        // Use Web Audio API to generate a ringtone
        const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
        const oscillator = audioCtx.createOscillator();
        const gainNode = audioCtx.createGain();
        oscillator.connect(gainNode);
        gainNode.connect(audioCtx.destination);
        oscillator.type = 'sine';
        oscillator.frequency.value = callState.status === 'ringing' ? 440 : 400;
        gainNode.gain.value = 0.15;

        // Create a pulsing ring pattern
        const pulseGain = () => {
          const now = audioCtx.currentTime;
          gainNode.gain.setValueAtTime(0.15, now);
          gainNode.gain.setValueAtTime(0, now + 0.5);
          gainNode.gain.setValueAtTime(0.15, now + 1.0);
          gainNode.gain.setValueAtTime(0, now + 1.5);
        };

        oscillator.start();
        pulseGain();
        const intervalId = setInterval(pulseGain, 2000);

        // Store cleanup function
        ringtoneRef.current = {
          stop: () => {
            clearInterval(intervalId);
            oscillator.stop();
            audioCtx.close();
          }
        } as any;
      } catch (e) {
        console.warn('Could not create ringtone:', e);
      }
    }

    return () => {
      if (ringtoneRef.current && (ringtoneRef.current as any).stop) {
        (ringtoneRef.current as any).stop();
        ringtoneRef.current = null;
      }
    };
  }, [callState.status]);

  // Browser notification for incoming calls when tab is in background
  useEffect(() => {
    if (callState.status === 'ringing' && document.hidden) {
      if ('Notification' in window && Notification.permission === 'granted') {
        const n = new Notification(`Incoming ${callState.callType} call`, {
          body: `${callState.remoteUser?.name} is calling you`,
          icon: callState.remoteUser?.avatar || undefined,
          tag: 'incoming-call',
          requireInteraction: true
        });
        n.onclick = () => { window.focus(); n.close(); };
        return () => n.close();
      } else if ('Notification' in window && Notification.permission === 'default') {
        Notification.requestPermission();
      }
    }
  }, [callState.status, callState.callType, callState.remoteUser]);

  // Video upgrade listener
  useEffect(() => {
    const handleVideoUpgrade = (data: any) => {
      if (data.type === 'request') {
        setPendingVideoUpgrade(true);
      } else if (data.type === 'accepted') {
        // Remote user accepted our upgrade request
        setVideoUpgradeRequested(false);
        setCurrentCallType('video');
        toast.success('Video call upgrade accepted!');
      } else if (data.type === 'rejected') {
        setVideoUpgradeRequested(false);
        toast.info('Video upgrade was declined');
      }
    };

    socketService.onVideoUpgrade(handleVideoUpgrade);
    return () => socketService.offVideoUpgrade(handleVideoUpgrade);
  }, []);

  // Duration timer
  useEffect(() => {
    if (callState.status === 'connected' && callState.startTime) {
      intervalRef.current = setInterval(() => {
        setCallDuration(Math.floor((Date.now() - callState.startTime!.getTime()) / 1000));
      }, 1000);
    }
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [callState.status, callState.startTime]);

  // Attach streams to video elements
  const attachStreams = useCallback(() => {
    const localStream = webrtcService.getLocalStream();
    const screenStream = webrtcService.getScreenStream();

    if (localVideoRef.current) {
      localVideoRef.current.srcObject = screenStream || localStream;
    }

    webrtcService.setRemoteStreamCallback((remoteStream) => {
      // Always attach to hidden audio element for audio playback
      if (remoteAudioRef.current && remoteAudioRef.current.srcObject !== remoteStream) {
        remoteAudioRef.current.srcObject = remoteStream;
        remoteAudioRef.current.play().catch(console.warn);
      }
      // Also attach to video element if visible
      if (remoteVideoRef.current && remoteVideoRef.current.srcObject !== remoteStream) {
        remoteVideoRef.current.srcObject = remoteStream;
        remoteVideoRef.current.play().catch(console.warn);
      }
    });

    // Set up audio analyzer
    if (localStream && localStream.getAudioTracks().length > 0 && !audioContextRef.current) {
      try {
        const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
        audioContextRef.current = audioCtx;
        const analyzer = audioCtx.createAnalyser();
        analyzer.fftSize = 256;
        const source = audioCtx.createMediaStreamSource(localStream);
        source.connect(analyzer);
        analyzerRef.current = analyzer;
        const bufferLength = analyzer.frequencyBinCount;
        dataArrayRef.current = new Uint8Array(bufferLength);

        const updateAudioLevel = () => {
          if (analyzerRef.current && dataArrayRef.current && !isMuted) {
            // Type-safe cast for DOM analyzer
            analyzerRef.current.getByteFrequencyData(dataArrayRef.current as any);
            let sum = 0;
            for (let i = 0; i < bufferLength; i++) sum += dataArrayRef.current[i];
            const average = sum / bufferLength;
            setAudioLevel(average);
          } else {
            setAudioLevel(0);
          }
          animationFrameRef.current = requestAnimationFrame(updateAudioLevel);
        };
        updateAudioLevel();
      } catch (e) {
        console.error('Audio context initialization failed:', e);
      }
    }
  }, [isMuted]);

  useEffect(() => {
    if (callState.status === 'connected') {
      attachStreams();
      webrtcService.setStreamUpdateCallback(attachStreams);
    }
  }, [callState.status, attachStreams]);

  useEffect(() => {
    return () => {
      webrtcService.cleanup();
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
      if (audioContextRef.current?.state !== 'closed') audioContextRef.current?.close();
    };
  }, []);

  // Sync ref when video element mounts late (like when another user starts screen sharing)
  useEffect(() => {
    if (remoteVideoRef.current && (currentCallType === 'video' || callState.isRemoteScreenSharing)) {
      const remoteStream = webrtcService.getRemoteStream();
      if (remoteStream && remoteVideoRef.current.srcObject !== remoteStream) {
        remoteVideoRef.current.srcObject = remoteStream;
        remoteVideoRef.current.play().catch(console.warn);
      }
    }
  }, [currentCallType, callState.isRemoteScreenSharing]);

  // Sync ref when local PiP video mounts late (like when sharing screen in audio call)
  useEffect(() => {
    if (localVideoRef.current && (currentCallType === 'video' || isScreenSharing)) {
      const stream = webrtcService.getScreenStream() || webrtcService.getLocalStream();
      if (stream && localVideoRef.current.srcObject !== stream) {
        localVideoRef.current.srcObject = stream;
        localVideoRef.current.play().catch(console.warn);
      }
    }
  }, [currentCallType, isScreenSharing]);

  // ── Controls ──────────────────────────────────────────────────

  const toggleMute = useCallback(() => {
    const stream = webrtcService.getLocalStream();
    stream?.getAudioTracks().forEach(t => { t.enabled = isMuted; });
    const newMuteState = !isMuted;
    setIsMuted(newMuteState);
    if (callState.remoteUser) {
      socketService.toggleMute(callState.remoteUser.id, newMuteState);
    }
  }, [isMuted, callState.remoteUser]);

  const toggleVideo = useCallback(() => {
    const stream = webrtcService.getLocalStream();
    stream?.getVideoTracks().forEach(t => { t.enabled = isVideoOff; });
    setIsVideoOff(prev => !prev);
  }, [isVideoOff]);

  const toggleScreenShare = useCallback(async () => {
    if (callState.isRemoteScreenSharing && !isScreenSharing) {
      toast.error('Other user is already sharing their screen');
      return;
    }

    if (isScreenSharing) {
      await webrtcService.stopScreenShare();
      setIsScreenSharing(false);
      if (callState.remoteUser) socketService.toggleScreenShare(callState.remoteUser.id, false);
      toast.info('Screen sharing stopped');
    } else {
      const stream = await webrtcService.startScreenShare();
      if (stream) {
        setIsScreenSharing(true);
        if (callState.remoteUser) socketService.toggleScreenShare(callState.remoteUser.id, true);
        attachStreams();
        toast.success('Screen sharing started');
      } else {
        toast.error('Could not share screen');
      }
    }
  }, [isScreenSharing, callState.remoteUser, attachStreams]);

  const upgradeToVideo = useCallback(async () => {
    if (callState.remoteUser) {
      socketService.requestVideoUpgrade(callState.remoteUser.id);
      setVideoUpgradeRequested(true);
      toast.info('Video upgrade request sent...');
    }
  }, [callState.remoteUser]);

  const acceptVideoUpgrade = useCallback(async () => {
    setPendingVideoUpgrade(false);
    if (callState.remoteUser) {
      socketService.acceptVideoUpgrade(callState.remoteUser.id);
    }
    const track = await webrtcService.addVideoTrack();
    if (track) {
      setCurrentCallType('video');
      attachStreams();
      toast.success('Upgraded to video call');
    } else {
      toast.error('Could not enable camera');
    }
  }, [callState.remoteUser, attachStreams]);

  const rejectVideoUpgrade = useCallback(() => {
    setPendingVideoUpgrade(false);
    if (callState.remoteUser) {
      socketService.rejectVideoUpgrade(callState.remoteUser.id);
    }
    toast.info('Video upgrade declined');
  }, [callState.remoteUser]);

  const downgradeToAudio = useCallback(async () => {
    await webrtcService.removeVideoTrack();
    setCurrentCallType('audio');
    setIsVideoOff(false);
    attachStreams();
    toast.info('Switched to voice call');
  }, [attachStreams]);

  const toggleFullscreen = useCallback(() => {
    if (!containerRef.current) return;
    if (!document.fullscreenElement) {
      containerRef.current.requestFullscreen?.().then(() => setIsFullscreen(true)).catch(() => { });
    } else {
      document.exitFullscreen?.().then(() => setIsFullscreen(false)).catch(() => { });
    }
  }, []);

  // ── Render states ──────────────────────────────────────────────

  if (!callState.isActive) return null;

  // Incoming call screen
  if (callState.status === 'ringing') {
    return (
      <Dialog open={true}>
        <DialogContent className="sm:max-w-sm bg-background text-foreground border-border" aria-describedby={undefined}>
          <DialogTitle className="sr-only">Incoming Call</DialogTitle>
          <div className="flex flex-col items-center py-8">
            <div className="relative mb-6">
              <div className="absolute inset-0 rounded-full bg-primary/20 animate-ping" style={{ transform: 'scale(1.4)' }} />
              <Avatar className="w-24 h-24 ring-4 ring-primary/30 relative z-10">
                <AvatarImage src={callState.remoteUser?.avatar} />
                <AvatarFallback className="bg-gradient-to-br from-blue-500 to-indigo-500 text-white text-2xl font-medium">
                  {callState.remoteUser?.name.split(' ').map(n => n[0]).join('')}
                </AvatarFallback>
              </Avatar>
            </div>
            <h2 className="text-2xl font-semibold mb-1">{callState.remoteUser?.name}</h2>
            <p className="text-muted-foreground mb-2">
              Incoming {callState.callType === 'video' ? 'Video' : 'Voice'} Call
            </p>
            <div className="flex items-center gap-2 mb-8">
              {callState.callType === 'video' ? <Video className="w-4 h-4 text-muted-foreground" /> : <Phone className="w-4 h-4 text-muted-foreground" />}
              <span className="text-xs text-muted-foreground animate-pulse font-medium">Ringing...</span>
            </div>
            <div className="flex items-center gap-8">
              <div className="flex flex-col items-center gap-2">
                <Button
                  onClick={rejectCall}
                  className="w-16 h-16 rounded-full bg-destructive hover:bg-destructive/90 text-white shadow-lg"
                >
                  <PhoneOff className="w-7 h-7" />
                </Button>
                <span className="text-xs text-muted-foreground font-medium">Decline</span>
              </div>
              <div className="flex flex-col items-center gap-2">
                <Button
                  onClick={acceptCall}
                  className="w-16 h-16 rounded-full bg-green-500 hover:bg-green-600 text-white shadow-lg"
                >
                  {callState.callType === 'video' ? <Video className="w-7 h-7" /> : <Phone className="w-7 h-7" />}
                </Button>
                <span className="text-xs text-muted-foreground font-medium">Accept</span>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  // Outgoing call screen
  if (callState.status === 'calling') {
    return (
      <Dialog open={true}>
        <DialogContent className="sm:max-w-sm bg-background text-foreground border-border" aria-describedby={undefined}>
          <DialogTitle className="sr-only">Calling</DialogTitle>
          <div className="flex flex-col items-center py-8">
            <div className="relative mb-6">
              <div className="absolute inset-0 rounded-full bg-primary/10 animate-pulse" style={{ transform: 'scale(1.5)' }} />
              <Avatar className="w-24 h-24 ring-4 ring-primary/20 relative z-10">
                <AvatarImage src={callState.remoteUser?.avatar} />
                <AvatarFallback className="bg-gradient-to-br from-blue-500 to-indigo-500 text-white text-2xl font-medium">
                  {callState.remoteUser?.name.split(' ').map(n => n[0]).join('')}
                </AvatarFallback>
              </Avatar>
            </div>
            <h2 className="text-2xl font-semibold mb-1">{callState.remoteUser?.name}</h2>
            <p className="text-muted-foreground mb-8 flex items-center gap-2">
              <span>Calling</span>
              <span className="flex gap-0.5 items-end h-3">
                {[0, 150, 300].map(d => (
                  <span key={d} className="w-1 h-1 bg-muted-foreground rounded-full animate-bounce" style={{ animationDelay: `${d}ms` }} />
                ))}
              </span>
            </p>
            <div className="flex flex-col items-center gap-2">
              <Button
                onClick={endCall}
                className="w-16 h-16 rounded-full bg-destructive hover:bg-destructive/90 text-white shadow-lg"
              >
                <PhoneOff className="w-7 h-7" />
              </Button>
              <span className="text-xs text-muted-foreground font-medium">Cancel</span>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  // Active/connected call
  const isVideoCall = currentCallType === 'video';

  return (
    <Dialog open={true}>
      <DialogContent
        className="sm:max-w-5xl p-0 overflow-hidden bg-gray-950 text-white border-gray-800"
        aria-describedby={undefined}
      >
        <DialogTitle className="sr-only">Active Call</DialogTitle>
        <div ref={containerRef} className="relative" style={{ height: isFullscreen ? '100vh' : '620px' }}>

          {/* Hidden audio element - ALWAYS present for remote audio playback */}
          <audio ref={remoteAudioRef} autoPlay playsInline className="hidden" />

          {/* Remote video / audio background */}
          <div className="absolute inset-0 bg-gradient-to-b from-gray-900 to-gray-950 flex items-center justify-center">
            {(isVideoCall || callState.isRemoteScreenSharing) && (
              <video
                ref={remoteVideoRef}
                autoPlay
                playsInline
                className="absolute inset-0 w-full h-full object-cover opacity-90 z-0"
              />
            )}
            {/* Remote user info overlay (always visible on audio, semi on video) */}
            <div className={`text-center z-10 transition-opacity ${(isVideoCall || callState.isRemoteScreenSharing) ? 'absolute opacity-0 hover:opacity-100' : ''}`}>
              <Avatar className="w-28 h-28 mb-4 ring-4 ring-white/20 shadow-2xl mx-auto">
                <AvatarImage src={callState.remoteUser?.avatar} />
                <AvatarFallback className="bg-gradient-to-br from-blue-500 to-indigo-500 text-white text-3xl font-medium">
                  {callState.remoteUser?.name.split(' ').map(n => n[0]).join('')}
                </AvatarFallback>
              </Avatar>
              <h2 className="text-2xl font-semibold drop-shadow-lg">{callState.remoteUser?.name}</h2>
              {callState.isRemoteMuted && (
                <div className="mt-2 inline-flex items-center gap-1.5 text-red-400 bg-red-950/40 px-3 py-1 rounded-full text-sm font-medium">
                  <MicOff className="w-4 h-4" /> Muted
                </div>
              )}
              <div className="mt-2 inline-flex items-center gap-2 bg-black/40 backdrop-blur-sm rounded-full px-4 py-1.5">
                <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
                <span className="text-sm font-medium text-white/90">{formatDuration(callDuration)}</span>
              </div>
            </div>
            {/* Audio activity visualizer for audio-only remote calls */}
            {(!isVideoCall && !callState.isRemoteScreenSharing) && (
              <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 mt-32 flex gap-1 items-end h-8">
                {callState.isRemoteMuted ? (
                  <div className="text-muted-foreground flex flex-col items-center gap-2 mt-4">
                    <MicOff className="w-8 h-8 opacity-50" />
                  </div>
                ) : (
                  [1, 2, 3, 4, 5].map((i) => (
                    <div
                      key={i}
                      className={`w-2 rounded-t-sm bg-primary transition-all duration-75`}
                      style={{ height: Math.max(4, audioLevel * (Math.random() * 0.5 + 0.5) * (i === 3 ? 1 : i === 2 || i === 4 ? 0.8 : 0.5)) + 'px' }}
                    />
                  ))
                )}
              </div>
            )}
          </div>

          {/* Screen share label */}
          {isScreenSharing && (
            <div className="absolute top-4 left-1/2 -translate-x-1/2 z-30 flex items-center gap-2 bg-blue-600/90 backdrop-blur px-4 py-1.5 rounded-full text-sm font-medium shadow-lg">
              <Monitor className="w-4 h-4 animate-pulse" />
              Sharing your screen
            </div>
          )}
          {callState.isRemoteScreenSharing && (
            <div className="absolute top-4 left-1/2 -translate-x-1/2 z-30 flex items-center gap-2 bg-indigo-600/90 backdrop-blur px-4 py-1.5 rounded-full text-sm font-medium shadow-lg">
              <Monitor className="w-4 h-4" />
              Viewing {callState.remoteUser?.name}'s screen
            </div>
          )}

          {/* Video upgrade invitation */}
          {pendingVideoUpgrade && (
            <div className="absolute top-14 left-1/2 -translate-x-1/2 z-40 bg-gray-900/95 backdrop-blur-lg border border-white/20 rounded-2xl px-6 py-4 shadow-2xl flex flex-col items-center gap-3 min-w-[280px] animate-in slide-in-from-top-4">
              <div className="flex items-center gap-2 text-white font-medium">
                <Video className="w-5 h-5 text-blue-400" />
                <span>{callState.remoteUser?.name} wants to switch to video</span>
              </div>
              <div className="flex gap-3">
                <Button
                  onClick={acceptVideoUpgrade}
                  className="bg-green-500 hover:bg-green-600 text-white px-6 h-9 rounded-full font-medium shadow-md"
                >
                  Accept
                </Button>
                <Button
                  onClick={rejectVideoUpgrade}
                  variant="ghost"
                  className="text-white/80 hover:bg-white/10 px-6 h-9 rounded-full font-medium"
                >
                  Decline
                </Button>
              </div>
            </div>
          )}

          {/* Local video PiP (camera or screen) */}
          {(isVideoCall || isScreenSharing) && (
            <div className="absolute top-4 right-4 z-20 rounded-xl overflow-hidden shadow-2xl ring-2 ring-white/20 transition-all duration-300"
              style={{ width: 192, height: 136 }}>
              <video
                ref={localVideoRef}
                autoPlay
                muted
                playsInline
                className="w-full h-full object-cover"
              />
              <div className="absolute bottom-2 right-2 z-30 flex items-center justify-center w-6 h-6 rounded-full bg-black/60">
                {isMuted ? <MicOff className="w-3 h-3 text-red-500" /> : (
                  <div className="flex gap-0.5 items-end h-3">
                    <div className="w-0.5 bg-green-400 rounded-t-sm transition-all duration-75" style={{ height: Math.max(2, audioLevel * 0.1) + 'px' }} />
                    <div className="w-0.5 bg-green-400 rounded-t-sm transition-all duration-75" style={{ height: Math.max(2, audioLevel * 0.2) + 'px' }} />
                    <div className="w-0.5 bg-green-400 rounded-t-sm transition-all duration-75" style={{ height: Math.max(2, audioLevel * 0.1) + 'px' }} />
                  </div>
                )}
              </div>
              {isVideoOff && !isScreenSharing && (
                <div className="absolute inset-0 bg-gray-800 flex items-center justify-center">
                  <VideoOff className="w-8 h-8 text-gray-400" />
                </div>
              )}
              {isScreenSharing && (
                <div className="absolute bottom-1 left-1 text-[10px] bg-black/60 rounded px-1 font-medium">Screen</div>
              )}
            </div>
          )}

          {/* Top-right utility buttons */}
          <div className="absolute top-4 left-4 z-20 flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              onClick={toggleFullscreen}
              className="w-9 h-9 rounded-full bg-white/10 hover:bg-white/20 text-white"
              title={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
            >
              {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
            </Button>
          </div>

          {/* Call controls bar */}
          <div className="absolute bottom-0 left-0 right-0 z-20 bg-gradient-to-t from-black/90 to-transparent pt-16 pb-6">
            <div className="flex items-center justify-center gap-3 flex-wrap px-4">

              {/* Mute */}
              <ControlButton
                active={isMuted}
                activeClassName="bg-red-500 hover:bg-red-600"
                inactiveClassName="bg-white/15 hover:bg-white/25"
                onClick={toggleMute}
                label={isMuted ? 'Unmute' : 'Mute'}
                icon={isMuted ? <MicOff className="w-6 h-6" /> : <Mic className="w-6 h-6" />}
              />

              {/* Camera (only shown when video call) */}
              {isVideoCall && (
                <ControlButton
                  active={isVideoOff}
                  activeClassName="bg-red-500 hover:bg-red-600"
                  inactiveClassName="bg-white/15 hover:bg-white/25"
                  onClick={toggleVideo}
                  label={isVideoOff ? 'Camera on' : 'Camera off'}
                  icon={isVideoOff ? <VideoOff className="w-6 h-6" /> : <Video className="w-6 h-6" />}
                />
              )}

              {/* Screen share - hidden on mobile devices */}
              {!isMobile && (
                <ControlButton
                  active={isScreenSharing}
                  activeClassName="bg-blue-500 hover:bg-blue-600"
                  inactiveClassName="bg-white/15 hover:bg-white/25"
                  onClick={toggleScreenShare}
                  label={isScreenSharing ? 'Stop share' : 'Share screen'}
                  icon={isScreenSharing ? <MonitorOff className="w-6 h-6" /> : <Monitor className="w-6 h-6" />}
                  disabled={!isScreenSharing && callState.isRemoteScreenSharing}
                />
              )}

              {/* Upgrade / downgrade call */}
              {!isVideoCall && !videoUpgradeRequested && (
                <ControlButton
                  active={false}
                  activeClassName=""
                  inactiveClassName="bg-white/15 hover:bg-white/25"
                  onClick={upgradeToVideo}
                  label="Add video"
                  icon={<Video className="w-6 h-6" />}
                  blink={false}
                />
              )}
              {videoUpgradeRequested && (
                <ControlButton
                  active={true}
                  activeClassName="bg-amber-500 hover:bg-amber-600"
                  inactiveClassName=""
                  onClick={() => { }}
                  label="Waiting..."
                  icon={<Video className="w-6 h-6 animate-pulse" />}
                  blink={true}
                />
              )}
              {isVideoCall && (
                <ControlButton
                  active={false}
                  activeClassName=""
                  inactiveClassName="bg-white/15 hover:bg-white/25"
                  onClick={downgradeToAudio}
                  label="Audio only"
                  icon={<PhoneOff className="w-5 h-5" />}
                  blink={false}
                />
              )}

              {/* Speaker */}
              <ControlButton
                active={!isSpeakerOn}
                activeClassName="bg-red-500 hover:bg-red-600"
                inactiveClassName="bg-white/15 hover:bg-white/25"
                onClick={() => setIsSpeakerOn(p => !p)}
                label={isSpeakerOn ? 'Mute speaker' : 'Speaker on'}
                icon={isSpeakerOn ? <Volume2 className="w-6 h-6" /> : <VolumeX className="w-6 h-6" />}
              />

              {/* End call */}
              <div className="flex flex-col items-center gap-1">
                <Button
                  onClick={endCall}
                  className="w-16 h-16 rounded-full bg-red-500 hover:bg-red-600 text-white shadow-xl"
                >
                  <PhoneOff className="w-7 h-7" />
                </Button>
                <span className="text-xs text-white/60 font-medium">End</span>
              </div>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ControlButton({
  active, activeClassName, inactiveClassName, onClick, label, icon, blink, disabled
}: {
  active: boolean;
  activeClassName: string;
  inactiveClassName: string;
  onClick: () => void;
  label: string;
  icon: React.ReactNode;
  blink?: boolean;
  disabled?: boolean;
}) {
  return (
    <div className="flex flex-col items-center gap-1">
      <Button
        onClick={onClick}
        disabled={disabled}
        className={`w-14 h-14 rounded-full text-white shadow-md transition-all ${disabled ? 'opacity-50 cursor-not-allowed hidden-hover' : ''} ${active ? activeClassName : inactiveClassName} ${blink && active ? 'animate-pulse' : ''}`}
      >
        {icon}
      </Button>
      <span className="text-xs text-white/60 font-medium">{label}</span>
    </div>
  );
}
