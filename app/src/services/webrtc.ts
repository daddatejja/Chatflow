import { socketService } from './socket';

type RemoteStreamCallback = (stream: MediaStream) => void;

class WebRTCService {
    private peerConnection: RTCPeerConnection | null = null;
    private localStream: MediaStream | null = null;
    private screenStream: MediaStream | null = null;
    private remoteStream: MediaStream | null = null;
    private onRemoteStreamCallback: RemoteStreamCallback | null = null;
    private onStreamUpdateCallback: (() => void) | null = null;

    private config: RTCConfiguration = {
        iceServers: [
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:stun1.l.google.com:19302' },
            // Free TURN servers for NAT traversal in production
            {
                urls: 'turn:a.relay.metered.ca:80',
                username: 'e8dd65b92f0b1f834f77b420',
                credential: '1lVXpnhp3GXOlMWu'
            },
            {
                urls: 'turn:a.relay.metered.ca:80?transport=tcp',
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
        ],
        iceCandidatePoolSize: 10
    };

    constructor() {
        this.setupSocketListeners();
    }

    private setupSocketListeners() {
        socketService.onWebrtc((data: any) => {
            const { webrtcType, userId, offer, answer, candidate } = data;
            const peerId = userId || data.peerId; // Handle both backend payload shapes just in case
            if (webrtcType === 'offer' && offer) this.handleOffer(peerId, offer);
            else if (webrtcType === 'answer' && answer) this.handleAnswer(answer);
            else if (webrtcType === 'ice-candidate' && candidate) this.handleIceCandidate(candidate);
        });
    }

    initialize(localStream: MediaStream) {
        if (this.peerConnection) this.cleanupPeerConnection();

        this.localStream = localStream;
        this.peerConnection = new RTCPeerConnection(this.config);

        localStream.getTracks().forEach(track => {
            this.peerConnection!.addTrack(track, localStream);
        });

        this.peerConnection.onicecandidate = (event) => {
            if (event.candidate && socketService.getCurrentPeerId()) {
                socketService.sendIceCandidate(socketService.getCurrentPeerId()!, event.candidate);
            }
        };

        this.peerConnection.ontrack = (event) => {
            if (event.streams && event.streams[0]) {
                // Create a new stream object to force React and <video> to detect srcObject change
                this.remoteStream = new MediaStream(event.streams[0].getTracks());
                this.onRemoteStreamCallback?.(this.remoteStream);
            } else {
                if (!this.remoteStream) this.remoteStream = new MediaStream();
                this.remoteStream.addTrack(event.track);
                this.remoteStream = new MediaStream(this.remoteStream.getTracks());
                this.onRemoteStreamCallback?.(this.remoteStream);
            }
        };

        this.peerConnection.onconnectionstatechange = () => {
            console.log('WebRTC connection state:', this.peerConnection?.connectionState);
        };
    }

    // ── Track replacement helpers ──────────────────────────────────

    /** Upgrade audio call to video: add video track to existing connection */
    async addVideoTrack(): Promise<MediaStreamTrack | null> {
        try {
            const videoStream = await navigator.mediaDevices.getUserMedia({ video: true });
            const videoTrack = videoStream.getVideoTracks()[0];
            if (!videoTrack || !this.peerConnection || !this.localStream) return null;

            this.localStream.addTrack(videoTrack);
            this.peerConnection.addTrack(videoTrack, this.localStream);

            // Renegotiate
            const offer = await this.peerConnection.createOffer();
            await this.peerConnection.setLocalDescription(offer);
            const peerId = socketService.getCurrentPeerId();
            if (peerId) socketService.sendOffer(peerId, offer);

            this.onStreamUpdateCallback?.();
            return videoTrack;
        } catch (error) {
            console.error('Failed to add video track:', error);
            return null;
        }
    }

    /** Downgrade video call to audio: stop and remove video tracks */
    async removeVideoTrack(): Promise<void> {
        if (!this.localStream || !this.peerConnection) return;

        const videoTracks = this.localStream.getVideoTracks();
        for (const track of videoTracks) {
            track.stop();
            this.localStream.removeTrack(track);
            const sender = this.peerConnection.getSenders().find(s => s.track === track);
            if (sender) this.peerConnection.removeTrack(sender);
        }

        // Renegotiate
        try {
            const offer = await this.peerConnection.createOffer();
            await this.peerConnection.setLocalDescription(offer);
            const peerId = socketService.getCurrentPeerId();
            if (peerId) socketService.sendOffer(peerId, offer);
        } catch (e) {
            console.error('Renegotiation error:', e);
        }

        this.onStreamUpdateCallback?.();
    }

    /** Start screen share: replaces the video sender's track */
    async startScreenShare(): Promise<MediaStream | null> {
        try {
            const screenStream = await navigator.mediaDevices.getDisplayMedia({
                video: { frameRate: 30 },
                audio: true,
            });
            this.screenStream = screenStream;

            if (this.peerConnection && this.localStream) {
                const screenVideoTrack = screenStream.getVideoTracks()[0];
                // Replace existing video sender, or if not present (audio-only), add a new track
                const videoSender = this.peerConnection.getSenders().find(
                    s => s.track?.kind === 'video' || (s.track === null && s.track === undefined /* sometimes kind is null when stopped */)
                );

                if (videoSender) {
                    await videoSender.replaceTrack(screenVideoTrack);
                } else {
                    this.peerConnection.addTrack(screenVideoTrack, this.localStream);
                }

                // Always renegotiate to be safe when adding/swapping major tracks like screensharing
                try {
                    const offer = await this.peerConnection.createOffer();
                    await this.peerConnection.setLocalDescription(offer);
                    const peerId = socketService.getCurrentPeerId();
                    if (peerId) socketService.sendOffer(peerId, offer);
                } catch (e) {
                    console.error('Screen share renegotiation error:', e);
                }

                // When user stops sharing via browser UI, restore camera
                screenVideoTrack.onended = () => {
                    this.stopScreenShare();
                };
            }

            this.onStreamUpdateCallback?.();
            return screenStream;
        } catch (error) {
            console.error('Failed to start screen share:', error);
            return null;
        }
    }

    /** Stop screen share: restore original camera video track */
    async stopScreenShare(): Promise<void> {
        if (!this.screenStream) return;
        this.screenStream.getTracks().forEach(t => t.stop());
        this.screenStream = null;

        if (!this.peerConnection || !this.localStream) return;

        // Restore camera video track in sender
        const cameraTrack = this.localStream.getVideoTracks()[0];
        const videoSender = this.peerConnection.getSenders().find(
            s => s.track === null || s.track?.kind === 'video'
        );

        if (cameraTrack && videoSender) {
            await videoSender.replaceTrack(cameraTrack);
        } else if (videoSender) {
            // It was an audio-only call originally. Screen share added a video track. Remove it.
            this.peerConnection.removeTrack(videoSender);
        }

        // Renegotiate
        try {
            const offer = await this.peerConnection.createOffer();
            await this.peerConnection.setLocalDescription(offer);
            const peerId = socketService.getCurrentPeerId();
            if (peerId) socketService.sendOffer(peerId, offer);
        } catch (e) {
            console.error('Stop screen share renegotiation error:', e);
        }

        this.onStreamUpdateCallback?.();
    }

    isScreenSharing(): boolean {
        return this.screenStream !== null && this.screenStream.getVideoTracks().some(t => t.readyState === 'live');
    }

    // ── Signaling ──────────────────────────────────────────────────

    async createOffer(peerId: string) {
        if (!this.peerConnection) return;
        try {
            const offer = await this.peerConnection.createOffer();
            await this.peerConnection.setLocalDescription(offer);
            socketService.sendOffer(peerId, offer);
        } catch (error) {
            console.error('Error creating offer:', error);
        }
    }

    async handleOffer(peerId: string, offer: RTCSessionDescriptionInit) {
        if (!this.peerConnection) this.initialize(new MediaStream());
        try {
            await this.peerConnection!.setRemoteDescription(new RTCSessionDescription(offer));
            const answer = await this.peerConnection!.createAnswer();
            await this.peerConnection!.setLocalDescription(answer);
            socketService.sendAnswer(peerId, answer);
        } catch (error) {
            console.error('Error handling offer:', error);
        }
    }

    async handleAnswer(answer: RTCSessionDescriptionInit) {
        if (!this.peerConnection) return;
        try {
            await this.peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
        } catch (error) {
            console.error('Error handling answer:', error);
        }
    }

    async handleIceCandidate(candidate: RTCIceCandidateInit) {
        if (!this.peerConnection) return;
        try {
            await this.peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
        } catch (error) {
            console.error('Error adding ICE candidate:', error);
        }
    }

    // ── Accessors / callbacks ──────────────────────────────────────

    getLocalStream(): MediaStream | null {
        return this.localStream;
    }

    getScreenStream(): MediaStream | null {
        return this.screenStream;
    }

    getRemoteStream(): MediaStream | null {
        return this.remoteStream;
    }

    setRemoteStreamCallback(callback: RemoteStreamCallback) {
        this.onRemoteStreamCallback = callback;
        if (this.remoteStream) callback(this.remoteStream);
    }

    setStreamUpdateCallback(callback: () => void) {
        this.onStreamUpdateCallback = callback;
    }

    // ── Cleanup ────────────────────────────────────────────────────

    private cleanupPeerConnection() {
        this.peerConnection?.close();
        this.peerConnection = null;
    }

    cleanup() {
        this.localStream?.getTracks().forEach(t => t.stop());
        this.screenStream?.getTracks().forEach(t => t.stop());
        this.cleanupPeerConnection();
        this.localStream = null;
        this.screenStream = null;
        this.remoteStream = null;
        this.onRemoteStreamCallback = null;
        this.onStreamUpdateCallback = null;
    }
}

export const webrtcService = new WebRTCService();
export default webrtcService;
