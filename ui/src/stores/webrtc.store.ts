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

// ============================================================================
// CONSTANTS & CONFIGURATION
// ============================================================================

const ICE_SERVERS: RTCIceServer[] = [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' }
];

const RTC_CONFIGURATION: RTCConfiguration = {
    iceServers: ICE_SERVERS,
    iceCandidatePoolSize: 10
};

const CONNECTION_CONFIG = {
    MAX_RETRY_ATTEMPTS: 3,
    RETRY_DELAY_BASE: 2000,
    ICE_GATHERING_TIMEOUT: 5000,
    CONNECTION_TIMEOUT: 10000
} as const;

// ============================================================================
// TYPES & INTERFACES
// ============================================================================

interface ConnectionAttempt {
    count: number;
    lastAttempt: number;
}

interface PendingCandidate {
    candidate: RTCIceCandidateInit;
    timestamp: number;
}

interface ConnectionDiagnostics {
    totalConnections: number;
    connectionStates: Record<string, RTCPeerConnectionState>;
    iceStates: Record<string, RTCIceConnectionState>;
    signalingStates: Record<string, RTCSignalingState>;
    pendingCandidates: Record<string, number>;
    connectionAttempts: Record<string, number>;
    mediaStatus: MediaStatus;
    hasLocalStream: boolean;
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

const createLogEntry = (level: LogLevel, message: string, data?: LogData): LogEntry => ({
    id: Date.now() + Math.random(),
    timestamp: new Date().toISOString(),
    level,
    message,
    data: data ? JSON.stringify(data, null, 2) : null
});

const calculateRetryDelay = (attemptCount: number): number =>
    CONNECTION_CONFIG.RETRY_DELAY_BASE * Math.pow(2, attemptCount - 1);

const isValidRoomContext = (roomId: string): boolean =>
    !!roomStore.currentRoom && roomStore.currentRoom.id === roomId;

const createDetailedError = (
    operation: string,
    participantId: string,
    originalError: Error,
    connectionState?: RTCPeerConnectionState,
    signalingState?: RTCSignalingState
): Error => {
    const errorDetails = {
        operation,
        participantId,
        originalError: originalError.message,
        connectionState,
        signalingState,
        timestamp: new Date().toISOString()
    };

    return new Error(`${operation}: ${originalError.message} | ${JSON.stringify(errorDetails)}`);
};

// ============================================================================
// MAIN WEBRTC STORE CLASS
// ============================================================================

class WebRTCStore {
    // Observable state
    localStream: MediaStream | null = null;
    peerConnections: Map<string, PeerConnection> = new Map();
    mediaStatus: MediaStatus = 'inactive';
    hasVideo: boolean = false;
    hasAudio: boolean = false;
    isScreenSharing: boolean = false;
    mediaError: string | null = null;
    logs: LogEntry[] = [];

    // Internal state (not observable)
    private pendingIceCandidates: Map<string, PendingCandidate[]> = new Map();
    private connectionAttempts: Map<string, ConnectionAttempt> = new Map();
    private connectionInitiators: Set<string> = new Set();

    constructor() {
        makeAutoObservable(this, {
            // Only specify what should be observable
            localStream: true,
            peerConnections: true,
            mediaStatus: true,
            hasVideo: true,
            hasAudio: true,
            isScreenSharing: true,
            mediaError: true,
            logs: true
        });

        this.setupSocketListeners();
    }

    // ========================================================================
    // LOGGING FUNCTIONS
    // ========================================================================

    log(level: LogLevel, message: string, data?: LogData): void {
        const logEntry = createLogEntry(level, message, data);

        runInAction(() => {
            this.logs.push(logEntry);
            if (this.logs.length > 100) {
                this.logs.splice(0, this.logs.length - 100);
            }
        });

        const consoleMessage = `[WEBRTC] [${level.toUpperCase()}] ${message}`;
        if (data) {
            console.log(consoleMessage, data);
        } else {
            console.log(consoleMessage);
        }
    }

    clearLogs(): void {
        runInAction(() => {
            this.logs.length = 0;
        });
        this.log('info', 'WebRTC logs cleared');
    }

    // ========================================================================
    // SOCKET EVENT HANDLERS
    // ========================================================================

    private setupSocketListeners(): void {
        this.log('info', 'Setting up WebRTC socket listeners');

        socketStore.on('webrtc-offer', this.handleIncomingOffer.bind(this));
        socketStore.on('webrtc-answer', this.handleIncomingAnswer.bind(this));
        socketStore.on('webrtc-ice-candidate', this.handleIncomingIceCandidate.bind(this));
        socketStore.on('peer-disconnected', this.handlePeerDisconnected.bind(this));

        this.log('info', 'WebRTC socket listeners configured');
    }

    private async handleIncomingOffer(data: WebRTCOffer): Promise<void> {
        const { targetParticipantId, sdp, roomId } = data;

        if (!isValidRoomContext(roomId)) {
            this.log('warning', 'Received offer for different room', { roomId, targetParticipantId });
            return;
        }

        const participant = roomStore.participants.find(p => p.socketId === targetParticipantId);
        if (!participant) {
            this.log('error', 'Received offer from unknown participant', { targetParticipantId });
            return;
        }

        this.log('info', 'Handling incoming offer', {
            from: targetParticipantId,
            userName: participant.userName,
            offerType: sdp.type,
            sdpLength: sdp.sdp?.length || 0
        });

        try {
            const peerConnection = await this.createPeerConnection(targetParticipantId, participant.userName, false);

            await peerConnection.connection.setRemoteDescription(sdp);
            this.log('info', 'Set remote description from offer', {
                participantId: targetParticipantId,
                signalingState: peerConnection.connection.signalingState
            });

            await this.processPendingIceCandidates(targetParticipantId);

            const answer = await peerConnection.connection.createAnswer();
            await peerConnection.connection.setLocalDescription(answer);

            this.log('info', 'Created and set local answer', {
                participantId: targetParticipantId,
                answerType: answer.type,
                signalingState: peerConnection.connection.signalingState
            });

            await socketStore.emitWithCallback('webrtc-answer', {
                roomId: roomStore.currentRoom!.id,
                targetParticipantId: targetParticipantId,
                sdp: answer
            });

            this.log('success', 'Answer sent to peer', { participantId: targetParticipantId });

        } catch (error) {
            const detailedError = createDetailedError(
                'Handle incoming offer',
                targetParticipantId,
                error as Error
            );

            this.log('error', detailedError.message);
            this.closePeerConnection(targetParticipantId);
        }
    }

    private async handleIncomingAnswer(data: WebRTCAnswer): Promise<void> {
        const { targetParticipantId, sdp, roomId } = data;

        if (!isValidRoomContext(roomId)) {
            this.log('warning', 'Received answer for different room', { roomId, targetParticipantId });
            return;
        }

        const peerConnection = this.peerConnections.get(targetParticipantId);
        if (!peerConnection) {
            this.log('error', 'Received answer for non-existent peer connection', { targetParticipantId });
            return;
        }

        if (peerConnection.connection.signalingState !== 'have-local-offer') {
            this.log('error', 'Received answer in wrong signaling state', {
                targetParticipantId,
                currentState: peerConnection.connection.signalingState,
                expectedState: 'have-local-offer'
            });
            return;
        }

        this.log('info', 'Handling incoming answer', {
            from: targetParticipantId,
            answerType: sdp.type,
            currentState: peerConnection.connection.signalingState,
            sdpLength: sdp.sdp?.length || 0
        });

        try {
            await peerConnection.connection.setRemoteDescription(sdp);
            this.log('success', 'Set remote description from answer', {
                participantId: targetParticipantId,
                newState: peerConnection.connection.signalingState
            });

            await this.processPendingIceCandidates(targetParticipantId);

        } catch (error) {
            const detailedError = createDetailedError(
                'Handle incoming answer',
                targetParticipantId,
                error as Error,
                peerConnection.connection.connectionState,
                peerConnection.connection.signalingState
            );

            this.log('error', detailedError.message);
            this.closePeerConnection(targetParticipantId);
        }
    }

    private async handleIncomingIceCandidate(data: WebRTCIceCandidate): Promise<void> {
        const { targetParticipantId, candidate, roomId } = data;

        if (!isValidRoomContext(roomId)) {
            this.log('warning', 'Received ICE candidate for different room', { roomId, targetParticipantId });
            return;
        }

        const peerConnection = this.peerConnections.get(targetParticipantId);
        if (!peerConnection) {
            this.log('warning', 'Received ICE candidate for non-existent peer connection', { targetParticipantId });
            return;
        }

        if (peerConnection.connection.remoteDescription === null) {
            this.log('info', 'Buffering ICE candidate (no remote description yet)', { targetParticipantId });
            this.bufferIceCandidate(targetParticipantId, candidate);
            return;
        }

        try {
            await peerConnection.connection.addIceCandidate(candidate);
            this.log('info', 'Added ICE candidate', {
                participantId: targetParticipantId,
                candidateType: candidate.candidate?.split(' ')[7] || 'unknown'
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

        if (!isValidRoomContext(roomId)) {
            return;
        }

        this.log('info', 'Peer disconnected, cleaning up connection', { participantId });
        this.closePeerConnection(participantId);
    }

    // ========================================================================
    // ICE CANDIDATE MANAGEMENT
    // ========================================================================

    private bufferIceCandidate(participantId: string, candidate: RTCIceCandidateInit): void {
        if (!this.pendingIceCandidates.has(participantId)) {
            this.pendingIceCandidates.set(participantId, []);
        }

        const pendingCandidate: PendingCandidate = {
            candidate,
            timestamp: Date.now()
        };

        this.pendingIceCandidates.get(participantId)!.push(pendingCandidate);

        this.log('info', 'ICE candidate buffered', {
            participantId,
            bufferedCount: this.pendingIceCandidates.get(participantId)!.length
        });
    }

    private async processPendingIceCandidates(participantId: string): Promise<void> {
        const pendingCandidates = this.pendingIceCandidates.get(participantId);
        if (!pendingCandidates || pendingCandidates.length === 0) return;

        const peerConnection = this.peerConnections.get(participantId);
        if (!peerConnection) return;

        this.log('info', 'Processing buffered ICE candidates', {
            participantId,
            candidateCount: pendingCandidates.length
        });

        for (const { candidate } of pendingCandidates) {
            try {
                await peerConnection.connection.addIceCandidate(candidate);
                this.log('info', 'Added buffered ICE candidate', { participantId });
            } catch (error) {
                this.log('error', 'Failed to add buffered ICE candidate', {
                    participantId,
                    error: (error as Error).message
                });
            }
        }

        this.pendingIceCandidates.delete(participantId);
        this.log('success', 'All buffered ICE candidates processed', { participantId });
    }

    // ========================================================================
    // PEER CONNECTION MANAGEMENT
    // ========================================================================

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

        this.setupPeerConnectionEventHandlers(peerConnection);
        this.peerConnections.set(participantId, peerConnection);

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

    private setupPeerConnectionEventHandlers(peerConnection: PeerConnection): void {
        const { connection, participantId, userName } = peerConnection;

        connection.onconnectionstatechange = () => {
            this.log('info', 'Peer connection state changed', {
                participantId,
                userName,
                state: connection.connectionState
            });

            runInAction(() => {
                peerConnection.connectionState = connection.connectionState;
            });

            if (connection.connectionState === 'connected') {
                this.clearRetryAttempts(participantId);
                this.log('success', 'Peer connection established', { participantId, userName });
            } else if (connection.connectionState === 'failed') {
                this.log('error', 'Peer connection failed', { participantId, userName });

                if (peerConnection.isInitiator) {
                    this.retryConnection(participantId, userName);
                } else {
                    this.closePeerConnection(participantId);
                }
            }
        };

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

    // ========================================================================
    // CONNECTION RETRY MANAGEMENT
    // ========================================================================

    private async retryConnection(participantId: string, userName: string): Promise<void> {
        const attempt = this.connectionAttempts.get(participantId) || { count: 0, lastAttempt: 0 };

        if (attempt.count >= CONNECTION_CONFIG.MAX_RETRY_ATTEMPTS) {
            this.log('error', 'Max connection attempts reached', {
                participantId,
                attempts: attempt.count
            });
            this.connectionAttempts.delete(participantId);
            return;
        }

        const newAttempt: ConnectionAttempt = {
            count: attempt.count + 1,
            lastAttempt: Date.now()
        };

        this.connectionAttempts.set(participantId, newAttempt);

        const delay = calculateRetryDelay(newAttempt.count);

        this.log('info', 'Scheduling connection retry', {
            participantId,
            attempt: newAttempt.count,
            delayMs: delay
        });

        setTimeout(async () => {
            try {
                await this.initiatePeerConnection(participantId, userName);
            } catch (error) {
                this.log('error', 'Connection retry failed', {
                    participantId,
                    attempt: newAttempt.count,
                    error: (error as Error).message
                });
            }
        }, delay);
    }

    private clearRetryAttempts(participantId: string): void {
        const attempt = this.connectionAttempts.get(participantId);
        if (attempt) {
            this.connectionAttempts.delete(participantId);
            this.log('info', 'Cleared retry attempts', { participantId, attempts: attempt.count });
        }
    }

    // ========================================================================
    // PUBLIC API - MEDIA METHODS
    // ========================================================================

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

            await this.updateMediaStatus();
            this.addStreamToAllPeerConnections(stream);

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

            stream.getVideoTracks()[0]?.addEventListener('ended', () => {
                this.log('info', 'Screen share ended by user');
                this.stopMedia();
            });

            await this.updateMediaStatus();
            this.replaceStreamInAllPeerConnections(stream);

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
                this.log('info', 'Stopped media track', {
                    kind: track.kind,
                    label: track.label
                });
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

        this.updateMediaStatus();
        this.removeStreamFromAllPeerConnections();
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

    // ========================================================================
    // PUBLIC API - CONNECTION METHODS
    // ========================================================================

    async handleNewParticipant(participantId: string, userName: string): Promise<void> {
        if (!this.isMediaActive) {
            this.log('info', 'Media not active, skipping connection to new participant', { participantId });
            return;
        }

        if (this.peerConnections.has(participantId)) {
            this.log('info', 'Connection already exists for participant', { participantId });
            return;
        }

        try {
            await this.initiatePeerConnection(participantId, userName);
            this.log('success', 'Initiated connection to new participant', { participantId, userName });
        } catch (error) {
            this.log('error', 'Failed to connect to new participant', {
                participantId,
                userName,
                error: (error as Error).message
            });
        }
    }

    async initiatePeerConnection(participantId: string, userName: string): Promise<void> {
        if (!roomStore.currentRoom) {
            throw new Error('Not in a room');
        }

        // Prevent race conditions - only the participant with the smaller socket ID initiates
        const currentSocketId = roomStore.currentParticipant?.socketId;
        if (!currentSocketId) {
            throw new Error('No current participant');
        }

        const shouldInitiate = currentSocketId < participantId;
        if (!shouldInitiate) {
            this.log('info', 'Skipping connection initiation - other participant should initiate', {
                participantId,
                currentSocketId,
                targetSocketId: participantId
            });
            return;
        }

        // Check if already initiated
        if (this.connectionInitiators.has(participantId)) {
            this.log('info', 'Connection already being initiated', { participantId });
            return;
        }

        this.connectionInitiators.add(participantId);

        try {
            this.log('info', 'Initiating peer connection', { participantId, userName });

            const peerConnection = await this.createPeerConnection(participantId, userName, true);

            const offer = await peerConnection.connection.createOffer({
                offerToReceiveAudio: true,
                offerToReceiveVideo: true
            });

            await peerConnection.connection.setLocalDescription(offer);

            this.log('info', 'Created and set local offer', {
                participantId,
                offerType: offer.type,
                signalingState: peerConnection.connection.signalingState
            });

            await socketStore.emitWithCallback('webrtc-offer', {
                roomId: roomStore.currentRoom.id,
                targetParticipantId: participantId,
                sdp: offer
            });

            this.log('success', 'Offer sent to peer', { participantId });

        } catch (error) {
            const detailedError = createDetailedError(
                'Initiate peer connection',
                participantId,
                error as Error
            );

            this.log('error', detailedError.message);
            this.closePeerConnection(participantId);
            throw detailedError;
        } finally {
            this.connectionInitiators.delete(participantId);
        }
    }

    async connectToAllParticipants(): Promise<void> {
        if (!roomStore.currentRoom || !roomStore.currentParticipant) return;

        const otherParticipants = roomStore.participants.filter(
            p => p.isConnected &&
                p.socketId !== roomStore.currentParticipant?.socketId &&
                !this.peerConnections.has(p.socketId) // Only connect to new participants
        );

        this.log('info', 'Connecting to all participants', {
            participantCount: otherParticipants.length,
            participants: otherParticipants.map(p => ({ id: p.socketId, name: p.userName }))
        });

        // Connect to all participants in parallel
        const connectionPromises = otherParticipants.map(participant =>
            this.handleNewParticipant(participant.socketId, participant.userName)
        );

        await Promise.allSettled(connectionPromises);

        this.log('info', 'Finished connecting to all participants', {
            totalConnections: this.peerConnections.size,
            connectedCount: this.connectedPeersCount
        });
    }

    closePeerConnection(participantId: string): void {
        const peerConnection = this.peerConnections.get(participantId);
        if (!peerConnection) return;

        this.log('info', 'Closing peer connection', {
            participantId,
            userName: peerConnection.userName
        });

        const connection = peerConnection.connection;
        connection.onconnectionstatechange = null;
        connection.oniceconnectionstatechange = null;
        connection.onicecandidate = null;
        connection.ontrack = null;

        connection.close();
        this.peerConnections.delete(participantId);
        this.pendingIceCandidates.delete(participantId);
        this.connectionAttempts.delete(participantId);
        this.connectionInitiators.delete(participantId);

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

    // ========================================================================
    // STREAM MANAGEMENT
    // ========================================================================

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

    private addStreamToAllPeerConnections(stream: MediaStream): void {
        for (const [, peerConnection] of this.peerConnections.entries()) {
            this.addStreamToPeerConnection(peerConnection, stream);
        }
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

    private replaceStreamInAllPeerConnections(stream: MediaStream): void {
        for (const [, peerConnection] of this.peerConnections.entries()) {
            this.replaceStreamInPeerConnection(peerConnection, stream);
        }
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

    private removeStreamFromAllPeerConnections(): void {
        for (const [, peerConnection] of this.peerConnections.entries()) {
            this.removeStreamFromPeerConnection(peerConnection);
        }
    }

    // ========================================================================
    // SERVER COMMUNICATION
    // ========================================================================

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

    // ========================================================================
    // UTILITY METHODS
    // ========================================================================

    getDiagnosticInfo(): ConnectionDiagnostics {
        const diagnostics: ConnectionDiagnostics = {
            totalConnections: this.peerConnections.size,
            connectionStates: {},
            iceStates: {},
            signalingStates: {},
            pendingCandidates: {},
            connectionAttempts: {},
            mediaStatus: this.mediaStatus,
            hasLocalStream: !!this.localStream
        };

        for (const [id, pc] of this.peerConnections) {
            diagnostics.connectionStates[id] = pc.connection.connectionState;
            diagnostics.iceStates[id] = pc.connection.iceConnectionState;
            diagnostics.signalingStates[id] = pc.connection.signalingState;
            diagnostics.pendingCandidates[id] = this.pendingIceCandidates.get(id)?.length || 0;
        }

        for (const [id, attempt] of this.connectionAttempts) {
            diagnostics.connectionAttempts[id] = attempt.count;
        }

        return diagnostics;
    }

    cleanup(): void {
        this.log('info', 'Cleaning up WebRTC store');

        this.stopMedia();
        this.closeAllPeerConnections();

        runInAction(() => {
            this.pendingIceCandidates.clear();
            this.connectionAttempts.clear();
            this.connectionInitiators.clear();
            this.mediaError = null;
        });

        this.log('success', 'WebRTC store cleanup completed');
    }

    // ========================================================================
    // COMPUTED PROPERTIES
    // ========================================================================

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

    get isConnecting(): boolean {
        return Array.from(this.peerConnections.values()).some(
            pc => ['connecting', 'new'].includes(pc.connectionState)
        );
    }

    get hasFailedConnections(): boolean {
        return Array.from(this.peerConnections.values()).some(
            pc => pc.connectionState === 'failed'
        );
    }

    get connectionSummary(): Record<string, RTCPeerConnectionState> {
        const summary: Record<string, RTCPeerConnectionState> = {};
        for (const [id, pc] of this.peerConnections) {
            summary[id] = pc.connectionState;
        }
        return summary;
    }

    get pendingCandidatesCount(): number {
        return Array.from(this.pendingIceCandidates.values())
            .reduce((total, candidates) => total + candidates.length, 0);
    }

    get activeRetryCount(): number {
        return this.connectionAttempts.size;
    }
}

export default new WebRTCStore();