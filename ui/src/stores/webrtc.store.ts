import { makeAutoObservable, runInAction } from 'mobx';
import socketStore from './socket.store';
import roomStore from './room.store';
import type {
    PeerConnection,
    WebRTCOffer,
    WebRTCAnswer,
    WebRTCIceCandidate,
    MediaConstraints,
    MediaStatus,
    LogLevel,
    LogEntry,
    LogData
} from '../types';

// WebRTC Configuration
const ICE_SERVERS: RTCIceServer[] = [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' }
];

const RTC_CONFIGURATION: RTCConfiguration = {
    iceServers: ICE_SERVERS,
    iceCandidatePoolSize: 10
};

class WebRTCStore {
    localStream: MediaStream | null = null;
    peerConnections: Map<string, PeerConnection> = new Map();
    mediaStatus: MediaStatus = 'inactive';
    hasVideo: boolean = false;
    hasAudio: boolean = false;
    isScreenSharing: boolean = false;
    mediaError: string | null = null;
    logs: LogEntry[] = [];

    constructor() {
        makeAutoObservable(this);
        this.setupSocketListeners();
    }

    // Detailed logging function
    log(level: LogLevel, message: string, data: LogData | null = null): void {
        const timestamp = new Date().toISOString();
        const logEntry: LogEntry = {
            id: Date.now() + Math.random(),
            timestamp,
            level,
            message,
            data: data ? JSON.stringify(data, null, 2) : null
        };

        runInAction(() => {
            this.logs.push(logEntry);
            // Keep only last 100 logs
            if (this.logs.length > 100) {
                this.logs = this.logs.slice(-100);
            }
        });

        // Also log to console
        const consoleMessage = `[WEBRTC] [${level.toUpperCase()}] ${message}`;
        if (data) {
            console.log(consoleMessage, data);
        } else {
            console.log(consoleMessage);
        }
    }

    private setupSocketListeners(): void {
        this.log('info', 'Setting up WebRTC socket listeners');

        // Handle incoming WebRTC offers
        socketStore.on('webrtc-offer', async (data: WebRTCOffer) => {
            await this.handleIncomingOffer(data);
        });

        // Handle incoming WebRTC answers
        socketStore.on('webrtc-answer', async (data: WebRTCAnswer) => {
            await this.handleIncomingAnswer(data);
        });

        // Handle incoming ICE candidates
        socketStore.on('webrtc-ice-candidate', async (data: WebRTCIceCandidate) => {
            await this.handleIncomingIceCandidate(data);
        });

        // Handle peer disconnections
        socketStore.on('peer-disconnected', (data: { roomId: string; participantId: string }) => {
            this.handlePeerDisconnected(data);
        });

        this.log('info', 'WebRTC socket listeners configured');
    }

    async startMedia(constraints: MediaConstraints = { video: true, audio: true }): Promise<void> {
        this.log('info', 'Starting media capture', constraints);

        runInAction(() => {
            this.mediaStatus = 'requesting';
            this.mediaError = null;
        });

        try {
            const stream = await navigator.mediaDevices.getUserMedia(constraints);

            this.log('success', 'Media capture started', {
                videoTracks: stream.getVideoTracks().length,
                audioTracks: stream.getAudioTracks().length,
                streamId: stream.id
            });

            runInAction(() => {
                this.localStream = stream;
                this.hasVideo = stream.getVideoTracks().length > 0;
                this.hasAudio = stream.getAudioTracks().length > 0;
                this.isScreenSharing = false;
                this.mediaStatus = 'active';
            });

            // Update media status on server
            await this.updateMediaStatus();

            // Add stream to existing peer connections
            for (const [, peerConnection] of this.peerConnections.entries()) {
                this.addStreamToPeerConnection(peerConnection, stream);
            }

        } catch (error) {
            const err = error as Error;
            this.log('error', 'Failed to start media capture', {
                error: err.message,
                name: err.name
            });

            runInAction(() => {
                this.mediaStatus = 'error';
                this.mediaError = err.message;
            });

            throw error;
        }
    }

    async startScreenShare(): Promise<void> {
        this.log('info', 'Starting screen share');

        runInAction(() => {
            this.mediaStatus = 'requesting';
            this.mediaError = null;
        });

        try {
            const stream = await navigator.mediaDevices.getDisplayMedia({
                video: true,
                audio: true
            });

            this.log('success', 'Screen share started', {
                videoTracks: stream.getVideoTracks().length,
                audioTracks: stream.getAudioTracks().length,
                streamId: stream.id
            });

            // Stop previous local stream
            if (this.localStream) {
                this.localStream.getTracks().forEach(track => track.stop());
            }

            runInAction(() => {
                this.localStream = stream;
                this.hasVideo = stream.getVideoTracks().length > 0;
                this.hasAudio = stream.getAudioTracks().length > 0;
                this.isScreenSharing = true;
                this.mediaStatus = 'active';
            });

            // Handle screen share ending
            stream.getVideoTracks()[0]?.addEventListener('ended', () => {
                this.log('info', 'Screen share ended by user');
                this.stopMedia();
            });

            // Update media status on server
            await this.updateMediaStatus();

            // Replace stream in existing peer connections
            for (const [, peerConnection] of this.peerConnections.entries()) {
                this.replaceStreamInPeerConnection(peerConnection, stream);
            }

        } catch (error) {
            const err = error as Error;
            this.log('error', 'Failed to start screen share', {
                error: err.message,
                name: err.name
            });

            runInAction(() => {
                this.mediaStatus = 'error';
                this.mediaError = err.message;
            });

            throw error;
        }
    }

    stopMedia(): void {
        this.log('info', 'Stopping media');

        if (this.localStream) {
            this.localStream.getTracks().forEach(track => {
                track.stop();
                this.log('info', 'Stopped media track', { kind: track.kind, label: track.label });
            });
        }

        runInAction(() => {
            this.localStream = null;
            this.hasVideo = false;
            this.hasAudio = false;
            this.isScreenSharing = false;
            this.mediaStatus = 'inactive';
            this.mediaError = null;
        });

        // Update media status on server
        this.updateMediaStatus();

        // Remove stream from peer connections
        for (const [, peerConnection] of this.peerConnections.entries()) {
            this.removeStreamFromPeerConnection(peerConnection);
        }
    }

    toggleVideo(): void {
        if (!this.localStream) return;

        const videoTrack = this.localStream.getVideoTracks()[0];
        if (videoTrack) {
            videoTrack.enabled = !videoTrack.enabled;
            runInAction(() => {
                this.hasVideo = videoTrack.enabled;
            });

            this.log('info', `Video ${videoTrack.enabled ? 'enabled' : 'disabled'}`);
            this.updateMediaStatus();
        }
    }

    toggleAudio(): void {
        if (!this.localStream) return;

        const audioTrack = this.localStream.getAudioTracks()[0];
        if (audioTrack) {
            audioTrack.enabled = !audioTrack.enabled;
            runInAction(() => {
                this.hasAudio = audioTrack.enabled;
            });

            this.log('info', `Audio ${audioTrack.enabled ? 'enabled' : 'disabled'}`);
            this.updateMediaStatus();
        }
    }

    async createPeerConnection(participantId: string, userName: string, isInitiator: boolean): Promise<PeerConnection> {
        this.log('info', 'Creating peer connection', { participantId, userName, isInitiator });

        const connection = new RTCPeerConnection(RTC_CONFIGURATION);

        const peerConnection: PeerConnection = {
            participantId,
            userName,
            connection,
            isInitiator,
            connectionState: connection.connectionState,
            iceConnectionState: connection.iceConnectionState
        };

        // Set up event handlers
        this.setupPeerConnectionHandlers(peerConnection);

        // Add to our map
        this.peerConnections.set(participantId, peerConnection);

        // Add local stream if available
        if (this.localStream) {
            this.addStreamToPeerConnection(peerConnection, this.localStream);
        }

        this.log('success', 'Peer connection created', {
            participantId,
            userName,
            isInitiator,
            totalConnections: this.peerConnections.size
        });

        return peerConnection;
    }

    private setupPeerConnectionHandlers(peerConnection: PeerConnection): void {
        const { connection, participantId, userName } = peerConnection;

        // Handle connection state changes
        connection.onconnectionstatechange = () => {
            this.log('info', 'Peer connection state changed', {
                participantId,
                userName,
                state: connection.connectionState
            });

            runInAction(() => {
                peerConnection.connectionState = connection.connectionState;
            });

            if (connection.connectionState === 'failed') {
                this.log('error', 'Peer connection failed', { participantId, userName });
                this.closePeerConnection(participantId);
            }
        };

        // Handle ICE connection state changes
        connection.oniceconnectionstatechange = () => {
            this.log('info', 'ICE connection state changed', {
                participantId,
                userName,
                state: connection.iceConnectionState
            });

            runInAction(() => {
                peerConnection.iceConnectionState = connection.iceConnectionState;
            });
        };

        // Handle ICE candidates
        connection.onicecandidate = async (event) => {
            if (event.candidate && roomStore.currentRoom) {
                this.log('info', 'Generated ICE candidate', {
                    participantId,
                    candidateType: event.candidate.type,
                    protocol: event.candidate.protocol
                });

                try {
                    await socketStore.emitWithCallback('webrtc-ice-candidate', {
                        roomId: roomStore.currentRoom.id,
                        targetParticipantId: participantId,
                        candidate: event.candidate.toJSON()
                    });
                } catch (error) {
                    this.log('error', 'Failed to send ICE candidate', {
                        participantId,
                        error: (error as Error).message
                    });
                }
            }
        };

        // Handle incoming streams
        connection.ontrack = (event) => {
            this.log('success', 'Received remote stream', {
                participantId,
                userName,
                streamId: event.streams[0]?.id,
                trackKind: event.track.kind
            });

            runInAction(() => {
                peerConnection.remoteStream = event.streams[0];
            });
        };
    }

    async initiatePeerConnection(participantId: string, userName: string): Promise<void> {
        if (!roomStore.currentRoom) {
            throw new Error('Not in a room');
        }

        this.log('info', 'Initiating peer connection', { participantId, userName });

        const peerConnection = await this.createPeerConnection(participantId, userName, true);

        try {
            // Create offer
            const offer = await peerConnection.connection.createOffer({
                offerToReceiveAudio: true,
                offerToReceiveVideo: true
            });

            await peerConnection.connection.setLocalDescription(offer);

            this.log('info', 'Created and set local offer', {
                participantId,
                offerType: offer.type
            });

            // Send offer to peer
            await socketStore.emitWithCallback('webrtc-offer', {
                roomId: roomStore.currentRoom.id,
                targetParticipantId: participantId,
                sdp: offer
            });

            this.log('success', 'Offer sent to peer', { participantId });

        } catch (error) {
            this.log('error', 'Failed to initiate peer connection', {
                participantId,
                error: (error as Error).message
            });
            this.closePeerConnection(participantId);
            throw error;
        }
    }

    private async handleIncomingOffer(data: WebRTCOffer): Promise<void> {
        const { targetParticipantId, sdp, roomId } = data;

        if (!roomStore.currentRoom || roomStore.currentRoom.id !== roomId) {
            this.log('warning', 'Received offer for different room', { roomId, targetParticipantId });
            return;
        }

        // Find participant info
        const participant = roomStore.participants.find(p => p.socketId === targetParticipantId);
        if (!participant) {
            this.log('error', 'Received offer from unknown participant', { targetParticipantId });
            return;
        }

        this.log('info', 'Handling incoming offer', {
            from: targetParticipantId,
            userName: participant.userName
        });

        try {
            const peerConnection = await this.createPeerConnection(targetParticipantId, participant.userName, false);

            // Set remote description
            await peerConnection.connection.setRemoteDescription(sdp);

            // Create answer
            const answer = await peerConnection.connection.createAnswer();
            await peerConnection.connection.setLocalDescription(answer);

            this.log('info', 'Created and set local answer', {
                participantId: targetParticipantId,
                answerType: answer.type
            });

            // Send answer back
            await socketStore.emitWithCallback('webrtc-answer', {
                roomId: roomStore.currentRoom.id,
                targetParticipantId: targetParticipantId,
                sdp: answer
            });

            this.log('success', 'Answer sent to peer', { participantId: targetParticipantId });

        } catch (error) {
            this.log('error', 'Failed to handle incoming offer', {
                participantId: targetParticipantId,
                error: (error as Error).message
            });
            this.closePeerConnection(targetParticipantId);
        }
    }

    private async handleIncomingAnswer(data: WebRTCAnswer): Promise<void> {
        const { targetParticipantId, sdp, roomId } = data;

        if (!roomStore.currentRoom || roomStore.currentRoom.id !== roomId) {
            this.log('warning', 'Received answer for different room', { roomId, targetParticipantId });
            return;
        }

        this.log('info', 'Handling incoming answer', { from: targetParticipantId });

        const peerConnection = this.peerConnections.get(targetParticipantId);
        if (!peerConnection) {
            this.log('error', 'Received answer for non-existent peer connection', { targetParticipantId });
            return;
        }

        try {
            await peerConnection.connection.setRemoteDescription(sdp);
            this.log('success', 'Set remote description from answer', { participantId: targetParticipantId });

        } catch (error) {
            this.log('error', 'Failed to handle incoming answer', {
                participantId: targetParticipantId,
                error: (error as Error).message
            });
            this.closePeerConnection(targetParticipantId);
        }
    }

    private async handleIncomingIceCandidate(data: WebRTCIceCandidate): Promise<void> {
        const { targetParticipantId, candidate, roomId } = data;

        if (!roomStore.currentRoom || roomStore.currentRoom.id !== roomId) {
            this.log('warning', 'Received ICE candidate for different room', { roomId, targetParticipantId });
            return;
        }

        const peerConnection = this.peerConnections.get(targetParticipantId);
        if (!peerConnection) {
            this.log('warning', 'Received ICE candidate for non-existent peer connection', { targetParticipantId });
            return;
        }

        try {
            await peerConnection.connection.addIceCandidate(candidate);
            this.log('info', 'Added ICE candidate', {
                participantId: targetParticipantId,
                candidateType: candidate.candidate?.split(' ')[7]
            });

        } catch (error) {
            this.log('error', 'Failed to add ICE candidate', {
                participantId: targetParticipantId,
                error: (error as Error).message
            });
        }
    }

    private handlePeerDisconnected(data: { roomId: string; participantId: string }): void {
        const { roomId, participantId } = data;

        if (!roomStore.currentRoom || roomStore.currentRoom.id !== roomId) {
            return;
        }

        this.log('info', 'Peer disconnected, cleaning up connection', { participantId });
        this.closePeerConnection(participantId);
    }

    closePeerConnection(participantId: string): void {
        const peerConnection = this.peerConnections.get(participantId);
        if (!peerConnection) return;

        this.log('info', 'Closing peer connection', {
            participantId,
            userName: peerConnection.userName
        });

        peerConnection.connection.close();
        this.peerConnections.delete(participantId);

        this.log('success', 'Peer connection closed', {
            participantId,
            remainingConnections: this.peerConnections.size
        });
    }

    closeAllPeerConnections(): void {
        this.log('info', 'Closing all peer connections', {
            count: this.peerConnections.size
        });

        for (const [participantId] of this.peerConnections) {
            this.closePeerConnection(participantId);
        }
    }

    private addStreamToPeerConnection(peerConnection: PeerConnection, stream: MediaStream): void {
        stream.getTracks().forEach(track => {
            peerConnection.connection.addTrack(track, stream);
            this.log('info', 'Added track to peer connection', {
                participantId: peerConnection.participantId,
                trackKind: track.kind,
                trackLabel: track.label
            });
        });
    }

    private replaceStreamInPeerConnection(peerConnection: PeerConnection, stream: MediaStream): void {
        const senders = peerConnection.connection.getSenders();

        stream.getTracks().forEach(track => {
            const sender = senders.find(s => s.track?.kind === track.kind);
            if (sender) {
                sender.replaceTrack(track);
                this.log('info', 'Replaced track in peer connection', {
                    participantId: peerConnection.participantId,
                    trackKind: track.kind
                });
            } else {
                peerConnection.connection.addTrack(track, stream);
                this.log('info', 'Added new track to peer connection', {
                    participantId: peerConnection.participantId,
                    trackKind: track.kind
                });
            }
        });
    }

    private removeStreamFromPeerConnection(peerConnection: PeerConnection): void {
        const senders = peerConnection.connection.getSenders();
        senders.forEach(sender => {
            if (sender.track) {
                peerConnection.connection.removeTrack(sender);
                this.log('info', 'Removed track from peer connection', {
                    participantId: peerConnection.participantId,
                    trackKind: sender.track.kind
                });
            }
        });
    }

    private async updateMediaStatus(): Promise<void> {
        if (!roomStore.currentRoom) return;

        try {
            await socketStore.emitWithCallback('update-media-status', {
                roomId: roomStore.currentRoom.id,
                hasVideo: this.hasVideo,
                hasAudio: this.hasAudio,
                isScreenSharing: this.isScreenSharing
            });

            this.log('info', 'Updated media status on server', {
                hasVideo: this.hasVideo,
                hasAudio: this.hasAudio,
                isScreenSharing: this.isScreenSharing
            });

        } catch (error) {
            this.log('error', 'Failed to update media status', {
                error: (error as Error).message
            });
        }
    }

    // Initialize peer connections for all connected participants
    async connectToAllParticipants(): Promise<void> {
        if (!roomStore.currentRoom || !roomStore.currentParticipant) return;

        const otherParticipants = roomStore.participants.filter(
            p => p.isConnected && p.socketId !== roomStore.currentParticipant?.socketId
        );

        this.log('info', 'Connecting to all participants', {
            participantCount: otherParticipants.length,
            participants: otherParticipants.map(p => ({ id: p.socketId, name: p.userName }))
        });

        for (const participant of otherParticipants) {
            try {
                await this.initiatePeerConnection(participant.socketId, participant.userName);
            } catch (error) {
                this.log('error', 'Failed to connect to participant', {
                    participantId: participant.socketId,
                    userName: participant.userName,
                    error: (error as Error).message
                });
            }
        }
    }

    // Clear logs
    clearLogs(): void {
        runInAction(() => {
            this.logs = [];
        });
        this.log('info', 'WebRTC logs cleared');
    }

    // Cleanup when leaving room
    cleanup(): void {
        this.log('info', 'Cleaning up WebRTC store');

        this.stopMedia();
        this.closeAllPeerConnections();

        runInAction(() => {
            this.mediaError = null;
        });
    }

    // Computed properties
    get isMediaActive(): boolean {
        return this.mediaStatus === 'active' && this.localStream !== null;
    }

    get connectedPeersCount(): number {
        return Array.from(this.peerConnections.values()).filter(
            pc => pc.connectionState === 'connected'
        ).length;
    }

    get canStartMedia(): boolean {
        return this.mediaStatus === 'inactive' && roomStore.isInRoom;
    }

    get canStopMedia(): boolean {
        return this.mediaStatus === 'active';
    }
}

export default new WebRTCStore();