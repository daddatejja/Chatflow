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

  // Timers
  const [callDuration, setCallDuration] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Video elements
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Audio analyzer
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyzerRef = useRef<AnalyserNode | null>(null);
  const dataArrayRef = useRef<Uint8Array | null>(null);
  const animationFrameRef = useRef<number | null>(null);

  // Sync callType from context
  useEffect(() => { setCurrentCallType(callState.callType); }, [callState.callType]);

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
    const track = await webrtcService.addVideoTrack();
    if (track) {
      setCurrentCallType('video');
      attachStreams();
      toast.success('Upgraded to video call');
    } else {
      toast.error('Could not enable camera');
    }
  }, [attachStreams]);

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

              {/* Screen share */}
              <ControlButton
                active={isScreenSharing}
                activeClassName="bg-blue-500 hover:bg-blue-600"
                inactiveClassName="bg-white/15 hover:bg-white/25"
                onClick={toggleScreenShare}
                label={isScreenSharing ? 'Stop share' : 'Share screen'}
                icon={isScreenSharing ? <MonitorOff className="w-6 h-6" /> : <Monitor className="w-6 h-6" />}
                disabled={!isScreenSharing && callState.isRemoteScreenSharing}
              />

              {/* Upgrade / downgrade call */}
              {!isVideoCall && (
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
