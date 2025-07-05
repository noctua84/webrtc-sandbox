// Complete Enhanced WebRTC Store with comprehensive logging for debugging
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
    ICE_GATHERING_TIMEOUT: 10000,
    CONNECTION_TIMEOUT: 15000
} as const;

// ============================================================================
// TYPES & INTERFACES
// ============================================================================

interface ConnectionAttempt {
    count: number;
    lastAttempt: number;
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

/**
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
 */

const logWebRTCStates = (participantId: string, connection: RTCPeerConnection, operation: string) => {
    return {
        operation,
        participantId,
        connectionState: connection.connectionState,
        iceConnectionState: connection.iceConnectionState,
        iceGatheringState: connection.iceGatheringState,
        signalingState: connection.signalingState,
        hasLocalDescription: !!connection.localDescription,
        hasRemoteDescription: !!connection.remoteDescription,
        localDescriptionType: connection.localDescription?.type,
        remoteDescriptionType: connection.remoteDescription?.type
    };
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
    private pendingIceCandidates: Map<string, RTCIceCandidateInit[]> = new Map();
    private connectionAttempts: Map<string, ConnectionAttempt> = new Map();
    private connectionInitiators: Set<string> = new Set();
    private connectionTimeouts: Map<string, NodeJS.Timeout> = new Map();

    constructor() {
        makeAutoObservable(this, {
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
        this.log('info', '🚀 WebRTC Store initialized with enhanced logging');
    }

    // ========================================================================
    // ENHANCED LOGGING
    // ========================================================================

    log(level: LogLevel, message: string, data?: LogData): void {
        const logEntry = createLogEntry(level, message, data);

        runInAction(() => {
            this.logs.push(logEntry);
            if (this.logs.length > 200) { // Increased log retention for debugging
                this.logs.splice(0, this.logs.length - 200);
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
        this.log('info', '🧹 WebRTC logs cleared');
    }

    private logConnectionProgress(participantId: string, connection: RTCPeerConnection, event: string): void {
        const states = logWebRTCStates(participantId, connection, event);
        this.log('info', `📊 Connection Progress: ${event}`, states);

        // Log detailed ICE information
        if (connection.iceConnectionState === 'checking') {
            this.log('info', '🧊 ICE checking phase started', { participantId });
        } else if (connection.iceConnectionState === 'connected') {
            this.log('success', '🎉 ICE connection established!', { participantId });
        } else if (connection.iceConnectionState === 'failed') {
            this.log('error', '❌ ICE connection failed', { participantId });
        }
    }

    // ========================================================================
    // SOCKET EVENT HANDLERS WITH ENHANCED LOGGING
    // ========================================================================

    private setupSocketListeners(): void {
        this.log('info', '🔌 Setting up enhanced WebRTC socket listeners');

        socketStore.on('webrtc-offer', this.handleIncomingOffer.bind(this));
        socketStore.on('webrtc-answer', this.handleIncomingAnswer.bind(this));
        socketStore.on('webrtc-ice-candidate', this.handleIncomingIceCandidate.bind(this));
        socketStore.on('peer-disconnected', this.handlePeerDisconnected.bind(this));

        this.log('success', '✅ Enhanced WebRTC socket listeners configured');
    }

    private async handleIncomingOffer(data: WebRTCOffer): Promise<void> {
        const { targetParticipantId, sdp, roomId } = data;

        this.log('info', '📨 Received WebRTC offer', {
            from: targetParticipantId,
            roomId,
            offerType: sdp.type,
            sdpLength: sdp.sdp?.length || 0,
            timestamp: new Date().toISOString()
        });

        if (!isValidRoomContext(roomId)) {
            this.log('warning', '⚠️ Offer for different/invalid room', { roomId, targetParticipantId });
            return;
        }

        const participant = roomStore.participants.find(p => p.socketId === targetParticipantId);
        if (!participant) {
            this.log('error', '❌ Offer from unknown participant', { targetParticipantId });
            return;
        }

        try {
            this.log('info', '🔧 Creating peer connection for incoming offer', {
                from: targetParticipantId,
                userName: participant.userName
            });

            const peerConnection = await this.createPeerConnection(targetParticipantId, participant.userName, false);

            this.log('info', '📝 Setting remote description from offer', {
                participantId: targetParticipantId,
                beforeState: logWebRTCStates(targetParticipantId, peerConnection.connection, 'before-set-remote-offer')
            });

            await peerConnection.connection.setRemoteDescription(sdp);

            this.log('success', '✅ Remote description set from offer', {
                participantId: targetParticipantId,
                afterState: logWebRTCStates(targetParticipantId, peerConnection.connection, 'after-set-remote-offer')
            });

            // Process buffered ICE candidates
            await this.processPendingIceCandidates(targetParticipantId);

            this.log('info', '🔄 Creating answer for offer', { participantId: targetParticipantId });

            const answer = await peerConnection.connection.createAnswer();
            await peerConnection.connection.setLocalDescription(answer);

            this.log('success', '📤 Answer created and set as local description', {
                participantId: targetParticipantId,
                answerType: answer.type,
                finalState: logWebRTCStates(targetParticipantId, peerConnection.connection, 'after-create-answer')
            });

            // Send answer back
            this.log('info', '📡 Sending answer to peer', { targetParticipantId });

            await socketStore.emitWithCallback('webrtc-answer', {
                roomId: roomStore.currentRoom!.id,
                targetParticipantId: targetParticipantId,
                sdp: answer
            });

            this.log('success', '🎯 Answer sent successfully', { participantId: targetParticipantId });

        } catch (error) {
            this.log('error', '💥 Failed to handle incoming offer', {
                participantId: targetParticipantId,
                error: (error as Error).message,
                stack: (error as Error).stack
            });
            this.closePeerConnection(targetParticipantId);
        }
    }

    private async handleIncomingAnswer(data: WebRTCAnswer): Promise<void> {
        const { targetParticipantId, sdp, roomId } = data;

        this.log('info', '📨 Received WebRTC answer', {
            from: targetParticipantId,
            roomId,
            answerType: sdp.type,
            sdpLength: sdp.sdp?.length || 0,
            timestamp: new Date().toISOString()
        });

        if (!isValidRoomContext(roomId)) {
            this.log('warning', '⚠️ Answer for different/invalid room', { roomId, targetParticipantId });
            return;
        }

        const peerConnection = this.peerConnections.get(targetParticipantId);
        if (!peerConnection) {
            this.log('error', '❌ Answer for non-existent peer connection', { targetParticipantId });
            return;
        }

        this.log('info', '🔍 Validating signaling state for answer', {
            participantId: targetParticipantId,
            currentState: peerConnection.connection.signalingState,
            expectedState: 'have-local-offer',
            stateDetails: logWebRTCStates(targetParticipantId, peerConnection.connection, 'before-answer')
        });

        if (peerConnection.connection.signalingState !== 'have-local-offer') {
            this.log('error', '❌ Wrong signaling state for answer', {
                targetParticipantId,
                currentState: peerConnection.connection.signalingState,
                expectedState: 'have-local-offer'
            });
            return;
        }

        try {
            this.log('info', '📝 Setting remote description from answer', { targetParticipantId });

            await peerConnection.connection.setRemoteDescription(sdp);

            this.log('success', '✅ Remote description set from answer', {
                participantId: targetParticipantId,
                newState: logWebRTCStates(targetParticipantId, peerConnection.connection, 'after-set-remote-answer')
            });

            // Process buffered ICE candidates
            await this.processPendingIceCandidates(targetParticipantId);

            // Start connection timeout monitoring
            this.startConnectionMonitoring(targetParticipantId);

        } catch (error) {
            this.log('error', '💥 Failed to handle incoming answer', {
                participantId: targetParticipantId,
                error: (error as Error).message,
                stack: (error as Error).stack
            });
            this.closePeerConnection(targetParticipantId);
        }
    }

    private async handleIncomingIceCandidate(data: WebRTCIceCandidate): Promise<void> {
        const { targetParticipantId, candidate, roomId } = data;

        this.log('info', '🧊 Received ICE candidate', {
            from: targetParticipantId,
            roomId,
            candidateType: candidate.candidate?.split(' ')[7] || 'unknown',
            candidateData: candidate.candidate?.substring(0, 50) + '...',
            timestamp: new Date().toISOString()
        });

        if (!isValidRoomContext(roomId)) {
            this.log('warning', '⚠️ ICE candidate for different/invalid room', { roomId, targetParticipantId });
            return;
        }

        const peerConnection = this.peerConnections.get(targetParticipantId);
        if (!peerConnection) {
            this.log('warning', '⚠️ ICE candidate for non-existent peer connection', { targetParticipantId });
            return;
        }

        if (peerConnection.connection.remoteDescription === null) {
            this.log('info', '📦 Buffering ICE candidate (no remote description yet)', {
                targetParticipantId,
                candidateType: candidate.candidate?.split(' ')[7] || 'unknown'
            });
            this.bufferIceCandidate(targetParticipantId, candidate);
            return;
        }

        try {
            this.log('info', '➕ Adding ICE candidate immediately', {
                participantId: targetParticipantId,
                candidateType: candidate.candidate?.split(' ')[7] || 'unknown'
            });

            await peerConnection.connection.addIceCandidate(candidate);

            this.log('success', '✅ ICE candidate added successfully', {
                participantId: targetParticipantId,
                newIceState: peerConnection.connection.iceConnectionState,
                newConnectionState: peerConnection.connection.connectionState
            });
        } catch (error) {
            this.log('error', '💥 Failed to add ICE candidate', {
                participantId: targetParticipantId,
                error: (error as Error).message,
                candidateData: candidate
            });
        }
    }

    private handlePeerDisconnected(data: { roomId: string; participantId: string }): void {
        const { roomId, participantId } = data;

        if (!isValidRoomContext(roomId)) {
            return;
        }

        this.log('info', '🔌 Peer disconnected, cleaning up connection', { participantId });
        this.closePeerConnection(participantId);
    }

    // ========================================================================
    // ICE CANDIDATE MANAGEMENT WITH ENHANCED LOGGING
    // ========================================================================

    private bufferIceCandidate(participantId: string, candidate: RTCIceCandidateInit): void {
        if (!this.pendingIceCandidates.has(participantId)) {
            this.pendingIceCandidates.set(participantId, []);
        }

        this.pendingIceCandidates.get(participantId)!.push(candidate);

        this.log('info', '📦 ICE candidate buffered', {
            participantId,
            bufferedCount: this.pendingIceCandidates.get(participantId)!.length,
            candidateType: candidate.candidate?.split(' ')[7] || 'unknown'
        });
    }

    private async processPendingIceCandidates(participantId: string): Promise<void> {
        const pendingCandidates = this.pendingIceCandidates.get(participantId);
        if (!pendingCandidates || pendingCandidates.length === 0) {
            this.log('info', '📭 No pending ICE candidates to process', { participantId });
            return;
        }

        const peerConnection = this.peerConnections.get(participantId);
        if (!peerConnection) {
            this.log('warning', '⚠️ Cannot process ICE candidates - no peer connection', { participantId });
            return;
        }

        this.log('info', '🔄 Processing buffered ICE candidates', {
            participantId,
            candidateCount: pendingCandidates.length
        });

        let successCount = 0;
        let errorCount = 0;

        for (const candidate of pendingCandidates) {
            try {
                await peerConnection.connection.addIceCandidate(candidate);
                successCount++;
                this.log('info', '✅ Buffered ICE candidate added', {
                    participantId,
                    candidateType: candidate.candidate?.split(' ')[7] || 'unknown'
                });
            } catch (error) {
                errorCount++;
                this.log('error', '💥 Failed to add buffered ICE candidate', {
                    participantId,
                    error: (error as Error).message
                });
            }
        }

        this.pendingIceCandidates.delete(participantId);

        this.log('success', '🎯 Finished processing buffered ICE candidates', {
            participantId,
            successCount,
            errorCount,
            totalProcessed: pendingCandidates.length
        });
    }

    // ========================================================================
    // PEER CONNECTION MANAGEMENT WITH ENHANCED LOGGING
    // ========================================================================

    async createPeerConnection(participantId: string, userName: string, isInitiator: boolean): Promise<PeerConnection> {
        this.log('info', '🔧 Creating peer connection', {
            participantId,
            userName,
            isInitiator,
            iceServers: ICE_SERVERS.length
        });

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

        this.log('success', '✅ Peer connection created successfully', {
            participantId,
            userName,
            isInitiator,
            totalConnections: this.peerConnections.size,
            initialState: logWebRTCStates(participantId, connection, 'created')
        });

        return peerConnection;
    }

    private setupPeerConnectionEventHandlers(peerConnection: PeerConnection): void {
        const { connection, participantId, userName } = peerConnection;

        // Enhanced connection state monitoring
        connection.onconnectionstatechange = () => {
            this.log('info', '🔄 Connection state changed', {
                participantId,
                userName,
                newState: connection.connectionState,
                fullState: logWebRTCStates(participantId, connection, 'connection-state-change')
            });

            runInAction(() => {
                peerConnection.connectionState = connection.connectionState;
            });

            if (connection.connectionState === 'connected') {
                this.clearConnectionTimeout(participantId);
                this.clearRetryAttempts(participantId);
                this.log('success', '🎉 PEER CONNECTION ESTABLISHED!', {
                    participantId,
                    userName,
                    finalState: logWebRTCStates(participantId, connection, 'connected')
                });
            } else if (connection.connectionState === 'failed') {
                this.log('error', '❌ Peer connection failed', {
                    participantId,
                    userName,
                    failedState: logWebRTCStates(participantId, connection, 'failed')
                });

                if (peerConnection.isInitiator) {
                    this.retryConnection(participantId, userName);
                } else {
                    this.closePeerConnection(participantId);
                }
            }
        };

        // Enhanced ICE connection monitoring
        connection.oniceconnectionstatechange = () => {
            this.logConnectionProgress(participantId, connection, 'ice-connection-state-change');

            runInAction(() => {
                peerConnection.iceConnectionState = connection.iceConnectionState;
            });

            if (connection.iceConnectionState === 'failed') {
                this.log('error', '❌ ICE connection failed - checking for STUN server issues', {
                    participantId,
                    iceServers: ICE_SERVERS,
                    fullState: logWebRTCStates(participantId, connection, 'ice-failed')
                });
            }
        };

        // Enhanced ICE gathering monitoring
        connection.onicegatheringstatechange = () => {
            this.log('info', '🧊 ICE gathering state changed', {
                participantId,
                newState: connection.iceGatheringState,
                fullState: logWebRTCStates(participantId, connection, 'ice-gathering-state-change')
            });
        };

        // Enhanced ICE candidate generation monitoring
        connection.onicecandidate = async (event) => {
            if (event.candidate) {
                const candidateInfo = {
                    participantId,
                    candidateType: event.candidate.type,
                    protocol: event.candidate.protocol,
                    address: event.candidate.address,
                    port: event.candidate.port,
                    foundation: event.candidate.foundation
                };

                this.log('info', '📤 Generated local ICE candidate', candidateInfo);

                if (roomStore.currentRoom) {
                    try {
                        await socketStore.emitWithCallback('webrtc-ice-candidate', {
                            roomId: roomStore.currentRoom.id,
                            targetParticipantId: participantId,
                            candidate: event.candidate.toJSON()
                        });

                        this.log('success', '📡 ICE candidate sent to server', candidateInfo);
                    } catch (error) {
                        this.log('error', '💥 Failed to send ICE candidate', {
                            ...candidateInfo,
                            error: (error as Error).message
                        });
                    }
                }
            } else {
                this.log('info', '🏁 ICE candidate gathering complete', {
                    participantId,
                    finalGatheringState: connection.iceGatheringState
                });
            }
        };

        // Enhanced track reception monitoring
        connection.ontrack = (event) => {
            this.log('success', '🎬 Received remote media track', {
                participantId,
                userName,
                trackKind: event.track.kind,
                trackId: event.track.id,
                streamId: event.streams[0]?.id,
                streamCount: event.streams.length,
                trackSettings: event.track.kind === 'video' ? event.track.getSettings() : undefined
            });

            runInAction(() => {
                peerConnection.remoteStream = event.streams[0];
            });
        };

        // Enhanced signaling state monitoring
        connection.onsignalingstatechange = () => {
            this.log('info', '📡 Signaling state changed', {
                participantId,
                newState: connection.signalingState,
                fullState: logWebRTCStates(participantId, connection, 'signaling-state-change')
            });
        };
    }

    // ========================================================================
    // CONNECTION MONITORING AND TIMEOUTS
    // ========================================================================

    private startConnectionMonitoring(participantId: string): void {
        this.log('info', '⏰ Starting connection timeout monitoring', {
            participantId,
            timeoutMs: CONNECTION_CONFIG.CONNECTION_TIMEOUT
        });

        const timeout = setTimeout(() => {
            const peerConnection = this.peerConnections.get(participantId);
            if (peerConnection && peerConnection.connectionState !== 'connected') {
                this.log('error', '⏱️ Connection timeout - forcing retry', {
                    participantId,
                    currentState: peerConnection.connectionState,
                    timeoutMs: CONNECTION_CONFIG.CONNECTION_TIMEOUT
                });

                if (peerConnection.isInitiator) {
                    this.retryConnection(participantId, peerConnection.userName);
                }
            }
        }, CONNECTION_CONFIG.CONNECTION_TIMEOUT);

        this.connectionTimeouts.set(participantId, timeout);
    }

    private clearConnectionTimeout(participantId: string): void {
        const timeout = this.connectionTimeouts.get(participantId);
        if (timeout) {
            clearTimeout(timeout);
            this.connectionTimeouts.delete(participantId);
            this.log('info', '⏰ Cleared connection timeout', { participantId });
        }
    }

    // ========================================================================
    // CONNECTION RETRY MANAGEMENT
    // ========================================================================

    private async retryConnection(participantId: string, userName: string): Promise<void> {
        const attempt = this.connectionAttempts.get(participantId) || { count: 0, lastAttempt: 0 };

        if (attempt.count >= CONNECTION_CONFIG.MAX_RETRY_ATTEMPTS) {
            this.log('error', '❌ Max connection attempts reached', {
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

        this.log('info', '🔄 Scheduling connection retry', {
            participantId,
            attempt: newAttempt.count,
            delayMs: delay
        });

        setTimeout(async () => {
            try {
                await this.initiatePeerConnection(participantId, userName);
            } catch (error) {
                this.log('error', '💥 Connection retry failed', {
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
            this.log('info', '🧹 Cleared retry attempts', { participantId, attempts: attempt.count });
        }
    }

    // ========================================================================
    // PUBLIC API - MEDIA METHODS
    // ========================================================================

    async startMedia(constraints: MediaConstraints = { video: true, audio: true }): Promise<void> {
        this.log('info', '📹 Starting media capture', constraints);

        runInAction(() => {
            this.mediaStatus = 'requesting';
            this.mediaError = null;
        });

        try {
            const stream = await navigator.mediaDevices.getUserMedia(constraints);

            this.log('success', '✅ Media capture started', {
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
            this.log('error', '💥 Failed to start media capture', {
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
        this.log('info', '🖥️ Starting screen share');

        runInAction(() => {
            this.mediaStatus = 'requesting';
            this.mediaError = null;
        });

        try {
            const stream = await navigator.mediaDevices.getDisplayMedia({
                video: true,
                audio: true
            });

            this.log('success', '✅ Screen share started', {
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
                this.log('info', '🛑 Screen share ended by user');
                this.stopMedia();
            });

            await this.updateMediaStatus();
            this.replaceStreamInAllPeerConnections(stream);

        } catch (error) {
            const err = error as Error;
            this.log('error', '💥 Failed to start screen share', {
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
        this.log('info', '🛑 Stopping media');

        if (this.localStream) {
            this.localStream.getTracks().forEach(track => {
                track.stop();
                this.log('info', '🔇 Stopped media track', {
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

            this.log('info', `📹 Video ${videoTrack.enabled ? 'enabled' : 'disabled'}`);
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

            this.log('info', `🎤 Audio ${audioTrack.enabled ? 'enabled' : 'disabled'}`);
            this.updateMediaStatus();
        }
    }

    // ========================================================================
    // PUBLIC API - CONNECTION METHODS
    // ========================================================================

    async handleNewParticipant(participantId: string, userName: string): Promise<void> {
        this.log('info', '👋 Handling new participant', { participantId, userName });

        if (!this.isMediaActive) {
            this.log('info', '📵 Media not active, skipping connection', { participantId });
            return;
        }

        if (this.peerConnections.has(participantId)) {
            this.log('info', '🔗 Connection already exists', { participantId });
            return;
        }

        try {
            await this.initiatePeerConnection(participantId, userName);
            this.log('success', '🎯 Successfully initiated connection to new participant', { participantId, userName });
        } catch (error) {
            this.log('error', '💥 Failed to connect to new participant', {
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

        const currentSocketId = roomStore.currentParticipant?.socketId;
        if (!currentSocketId) {
            throw new Error('No current participant');
        }

        // Connection coordination to prevent race conditions
        const shouldInitiate = currentSocketId < participantId;
        this.log('info', '🎲 Connection coordination check', {
            currentSocketId,
            targetParticipantId: participantId,
            shouldInitiate,
            reason: shouldInitiate ? 'smaller socket ID' : 'larger socket ID - waiting for other side'
        });

        if (!shouldInitiate) {
            this.log('info', '⏸️ Skipping initiation - other participant should initiate', {
                participantId,
                currentSocketId,
                targetSocketId: participantId
            });
            return;
        }

        if (this.connectionInitiators.has(participantId)) {
            this.log('info', '⏸️ Connection already being initiated', { participantId });
            return;
        }

        this.connectionInitiators.add(participantId);

        try {
            this.log('info', '🚀 Starting peer connection initiation', { participantId, userName });

            const peerConnection = await this.createPeerConnection(participantId, userName, true);

            this.log('info', '📝 Creating offer', { participantId });

            const offer = await peerConnection.connection.createOffer({
                offerToReceiveAudio: true,
                offerToReceiveVideo: true
            });

            await peerConnection.connection.setLocalDescription(offer);

            this.log('success', '📤 Offer created and set as local description', {
                participantId,
                offerType: offer.type,
                offerState: logWebRTCStates(participantId, peerConnection.connection, 'after-create-offer')
            });

            this.log('info', '📡 Sending offer to server', { participantId });

            await socketStore.emitWithCallback('webrtc-offer', {
                roomId: roomStore.currentRoom.id,
                targetParticipantId: participantId,
                sdp: offer
            });

            this.log('success', '🎯 Offer sent successfully', { participantId });

            // Start connection monitoring
            this.startConnectionMonitoring(participantId);

        } catch (error) {
            this.log('error', '💥 Failed to initiate peer connection', {
                participantId,
                error: (error as Error).message,
                stack: (error as Error).stack
            });
            this.closePeerConnection(participantId);
            throw error;
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

        this.log('info', '🌐 Connecting to all participants', {
            participantCount: otherParticipants.length,
            participants: otherParticipants.map(p => ({ id: p.socketId, name: p.userName }))
        });

        // Connect to all participants in parallel
        const connectionPromises = otherParticipants.map(participant =>
            this.handleNewParticipant(participant.socketId, participant.userName)
        );

        await Promise.allSettled(connectionPromises);

        this.log('info', '✅ Finished connecting to all participants', {
            totalConnections: this.peerConnections.size,
            connectedCount: this.connectedPeersCount
        });
    }

    closePeerConnection(participantId: string): void {
        const peerConnection = this.peerConnections.get(participantId);
        if (!peerConnection) return;

        this.log('info', '🔌 Closing peer connection', {
            participantId,
            userName: peerConnection.userName
        });

        const connection = peerConnection.connection;
        connection.onconnectionstatechange = null;
        connection.oniceconnectionstatechange = null;
        connection.onicegatheringstatechange = null;
        connection.onicecandidate = null;
        connection.ontrack = null;
        connection.onsignalingstatechange = null;

        connection.close();
        this.peerConnections.delete(participantId);
        this.pendingIceCandidates.delete(participantId);
        this.connectionAttempts.delete(participantId);
        this.connectionInitiators.delete(participantId);
        this.clearConnectionTimeout(participantId);

        this.log('success', '✅ Peer connection closed', {
            participantId,
            remainingConnections: this.peerConnections.size
        });
    }

    closeAllPeerConnections(): void {
        this.log('info', '🔌 Closing all peer connections', {
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
            this.log('info', '➕ Added track to peer connection', {
                participantId: peerConnection.participantId,
                trackKind: track.kind,
                trackLabel: track.label
            });
        });
    }

    private addStreamToAllPeerConnections(stream: MediaStream): void {
        this.log('info', '🎬 Adding stream to all peer connections', {
            connectionCount: this.peerConnections.size,
            streamId: stream.id
        });

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
                this.log('info', '🔄 Replaced track in peer connection', {
                    participantId: peerConnection.participantId,
                    trackKind: track.kind
                });
            } else {
                peerConnection.connection.addTrack(track, stream);
                this.log('info', '➕ Added new track to peer connection', {
                    participantId: peerConnection.participantId,
                    trackKind: track.kind
                });
            }
        });
    }

    private replaceStreamInAllPeerConnections(stream: MediaStream): void {
        this.log('info', '🔄 Replacing stream in all peer connections', {
            connectionCount: this.peerConnections.size,
            streamId: stream.id
        });

        for (const [, peerConnection] of this.peerConnections.entries()) {
            this.replaceStreamInPeerConnection(peerConnection, stream);
        }
    }

    private removeStreamFromPeerConnection(peerConnection: PeerConnection): void {
        const senders = peerConnection.connection.getSenders();
        senders.forEach(sender => {
            if (sender.track) {
                peerConnection.connection.removeTrack(sender);
                this.log('info', '➖ Removed track from peer connection', {
                    participantId: peerConnection.participantId,
                    trackKind: sender.track.kind
                });
            }
        });
    }

    private removeStreamFromAllPeerConnections(): void {
        this.log('info', '➖ Removing stream from all peer connections', {
            connectionCount: this.peerConnections.size
        });

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

            this.log('info', '📡 Updated media status on server', {
                hasVideo: this.hasVideo,
                hasAudio: this.hasAudio,
                isScreenSharing: this.isScreenSharing
            });

        } catch (error) {
            this.log('error', '💥 Failed to update media status', {
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
        this.log('info', '🧹 Cleaning up WebRTC store');

        this.stopMedia();
        this.closeAllPeerConnections();

        runInAction(() => {
            this.pendingIceCandidates.clear();
            this.connectionAttempts.clear();
            this.connectionInitiators.clear();
            this.connectionTimeouts.clear();
            this.mediaError = null;
        });

        this.log('success', '✅ WebRTC store cleanup completed');
    }

    // ========================================================================
    // COMPUTED PROPERTIES WITH DIAGNOSTIC INFO
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

    get diagnosticSummary(): any {
        return {
            mediaStatus: this.mediaStatus,
            totalConnections: this.peerConnections.size,
            connectedPeers: this.connectedPeersCount,
            pendingCandidates: this.pendingCandidatesCount,
            activeRetries: this.activeRetryCount,
            connectionStates: Array.from(this.peerConnections.values()).map(pc => ({
                participantId: pc.participantId,
                userName: pc.userName,
                connectionState: pc.connectionState,
                iceConnectionState: pc.iceConnectionState,
                signalingState: pc.connection.signalingState,
                hasLocalDescription: !!pc.connection.localDescription,
                hasRemoteDescription: !!pc.connection.remoteDescription
            }))
        };
    }

    // ========================================================================
    // WEBRTC DIAGNOSTIC METHODS
    // ========================================================================

    async testWebRTCConnectivity(): Promise<{
        stunConnectivity: boolean;
        candidateGeneration: boolean;
        mediaAccess: boolean;
        detectedIssues: string[];
        recommendations: string[];
    }> {
        const results = {
            stunConnectivity: false,
            candidateGeneration: false,
            mediaAccess: false,
            detectedIssues: [] as string[],
            recommendations: [] as string[]
        };

        this.log('info', '🧪 Starting comprehensive WebRTC connectivity test');

        // Test 1: Media Access
        this.log('info', '🎥 Testing media device access...');
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
            results.mediaAccess = true;
            this.log('success', '✅ Media access successful', {
                videoTracks: stream.getVideoTracks().length,
                audioTracks: stream.getAudioTracks().length
            });
            stream.getTracks().forEach(track => track.stop()); // Clean up
        } catch (error) {
            results.detectedIssues.push('Media access denied or unavailable');
            results.recommendations.push('Grant camera/microphone permissions in browser');
            this.log('error', '❌ Media access failed', { error: (error as Error).message });
        }

        // Test 2: STUN Server Connectivity and ICE Candidate Generation
        this.log('info', '🌐 Testing STUN server connectivity...');

        const stunServers = [
            'stun:stun.l.google.com:19302',
            'stun:stun1.l.google.com:19302',
            'stun:stun.google.com:19302',
            'stun:stun.stunprotocol.org:3478'
        ];

        for (const stunServer of stunServers) {
            try {
                const testResult = await this.testSingleStunServer(stunServer);
                if (testResult.success) {
                    results.stunConnectivity = true;
                    results.candidateGeneration = true;
                    this.log('success', '✅ STUN server connectivity confirmed', {
                        server: stunServer,
                        candidateType: testResult.candidateType,
                        address: testResult.address
                    });
                    break; // Found working STUN server
                } else {
                    this.log('warning', '⚠️ STUN server failed', {
                        server: stunServer,
                        issue: testResult.error
                    });
                }
            } catch (error) {
                this.log('error', '💥 STUN server test error', {
                    server: stunServer,
                    error: (error as Error).message
                });
            }
        }

        // Test 3: Full WebRTC Connection Test (self-connection)
        this.log('info', '🔗 Testing full WebRTC connection flow...');
        try {
            const connectionTest = await this.testWebRTCConnectionFlow();
            if (connectionTest.success) {
                this.log('success', '✅ WebRTC connection flow successful');
            } else {
                results.detectedIssues.push(`WebRTC connection flow failed: ${connectionTest.error}`);
                this.log('error', '❌ WebRTC connection flow failed', { error: connectionTest.error });
            }
        } catch (error) {
            results.detectedIssues.push('WebRTC connection flow test crashed');
            this.log('error', '💥 WebRTC connection flow test error', { error: (error as Error).message });
        }

        // Analyze results and provide recommendations
        if (!results.stunConnectivity) {
            results.detectedIssues.push('No STUN server connectivity');
            results.recommendations.push('Check firewall settings - UDP port 3478 and 19302 should be open');
            results.recommendations.push('Try testing on mobile hotspot to isolate network issues');
            results.recommendations.push('Contact network administrator about WebRTC/STUN access');
        }

        if (!results.candidateGeneration) {
            results.detectedIssues.push('ICE candidate generation failed');
            results.recommendations.push('Network may be blocking UDP traffic required for WebRTC');
        }

        if (!results.mediaAccess) {
            results.detectedIssues.push('Media device access issues');
            results.recommendations.push('Ensure browser has camera/microphone permissions');
            results.recommendations.push('Check if another application is using the camera');
        }

        this.log('info', '📊 WebRTC connectivity test completed', {
            stunConnectivity: results.stunConnectivity,
            candidateGeneration: results.candidateGeneration,
            mediaAccess: results.mediaAccess,
            issueCount: results.detectedIssues.length,
            recommendationCount: results.recommendations.length
        });

        return results;
    }

    private async testSingleStunServer(stunServer: string): Promise<{
        success: boolean;
        candidateType?: RTCIceCandidateType | null | undefined;
        address?: string | null | undefined;
        error?: string;
    }> {
        return new Promise((resolve) => {
            const pc = new RTCPeerConnection({
                iceServers: [{ urls: stunServer }]
            });

            let resolved = false;
            const timeout = setTimeout(() => {
                if (!resolved) {
                    resolved = true;
                    pc.close();
                    resolve({ success: false, error: 'Timeout - no candidates received' });
                }
            }, 10000); // 10 second timeout

            pc.onicecandidate = (event) => {
                if (event.candidate && !resolved) {
                    resolved = true;
                    clearTimeout(timeout);
                    pc.close();

                    const candidate = event.candidate;
                    resolve({
                        success: true,
                        candidateType: candidate.type,
                        address: candidate.address
                    });
                }
            };

            pc.onicecandidateerror = (event) => {
                if (!resolved) {
                    resolved = true;
                    clearTimeout(timeout);
                    pc.close();
                    resolve({
                        success: false,
                        error: `ICE candidate error: ${(event as any).errorText || 'Unknown error'}`
                    });
                }
            };

            // Create offer to start ICE gathering
            pc.createDataChannel('test');
            pc.createOffer()
                .then(offer => pc.setLocalDescription(offer))
                .catch(error => {
                    if (!resolved) {
                        resolved = true;
                        clearTimeout(timeout);
                        pc.close();
                        resolve({ success: false, error: error.message });
                    }
                });
        });
    }

    private async testWebRTCConnectionFlow(): Promise<{ success: boolean; error?: string }> {
        return new Promise((resolve) => {
            const pc1 = new RTCPeerConnection({
                iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
            });
            const pc2 = new RTCPeerConnection({
                iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
            });

            let resolved = false;
            const timeout = setTimeout(() => {
                if (!resolved) {
                    resolved = true;
                    pc1.close();
                    pc2.close();
                    resolve({ success: false, error: 'Connection test timeout' });
                }
            }, 15000);

            // Set up connection monitoring
            pc1.onconnectionstatechange = () => {
                if (pc1.connectionState === 'connected' && !resolved) {
                    resolved = true;
                    clearTimeout(timeout);
                    pc1.close();
                    pc2.close();
                    resolve({ success: true });
                } else if (pc1.connectionState === 'failed' && !resolved) {
                    resolved = true;
                    clearTimeout(timeout);
                    pc1.close();
                    pc2.close();
                    resolve({ success: false, error: 'Connection failed during test' });
                }
            };

            // Set up ICE candidate exchange
            pc1.onicecandidate = (event) => {
                if (event.candidate) {
                    pc2.addIceCandidate(event.candidate).catch(() => {});
                }
            };

            pc2.onicecandidate = (event) => {
                if (event.candidate) {
                    pc1.addIceCandidate(event.candidate).catch(() => {});
                }
            };

            // Create data channels
            pc2.ondatachannel = (event) => {
                const dc2 = event.channel;
                dc2.onopen = () => {
                    // Connection successful
                };
            };

            // Start connection process
            pc1.createOffer()
                .then(offer => pc1.setLocalDescription(offer))
                .then(() => pc2.setRemoteDescription(pc1.localDescription!))
                .then(() => pc2.createAnswer())
                .then(answer => pc2.setLocalDescription(answer))
                .then(() => pc1.setRemoteDescription(pc2.localDescription!))
                .catch(error => {
                    if (!resolved) {
                        resolved = true;
                        clearTimeout(timeout);
                        pc1.close();
                        pc2.close();
                        resolve({ success: false, error: error.message });
                    }
                });
        });
    }

    // Helper method to run the diagnostic and display results
    async runConnectivityDiagnostic(): Promise<void> {
        this.log('info', '🚀 Running comprehensive WebRTC connectivity diagnostic...');

        const results = await this.testWebRTCConnectivity();

        // Display comprehensive results
        this.log('info', '📋 DIAGNOSTIC RESULTS SUMMARY', {
            mediaAccess: results.mediaAccess ? '✅ PASS' : '❌ FAIL',
            stunConnectivity: results.stunConnectivity ? '✅ PASS' : '❌ FAIL',
            candidateGeneration: results.candidateGeneration ? '✅ PASS' : '❌ FAIL',
            overallStatus: (results.mediaAccess && results.stunConnectivity && results.candidateGeneration) ? '✅ HEALTHY' : '❌ ISSUES DETECTED'
        });

        if (results.detectedIssues.length > 0) {
            this.log('error', '🚨 DETECTED ISSUES', {
                issues: results.detectedIssues,
                count: results.detectedIssues.length
            });
        }

        if (results.recommendations.length > 0) {
            this.log('info', '💡 RECOMMENDATIONS', {
                recommendations: results.recommendations,
                count: results.recommendations.length
            });
        }

        // Specific guidance based on results
        if (!results.stunConnectivity) {
            this.log('warning', '⚠️ NETWORK CONNECTIVITY ISSUE DETECTED', {
                problem: 'STUN servers are not reachable',
                impact: 'WebRTC connections will fail to establish',
                commonCauses: [
                    'Corporate firewall blocking UDP traffic',
                    'Router/ISP blocking WebRTC traffic',
                    'Proxy server interference',
                    'Network configuration issues'
                ],
                immediateActions: [
                    'Test on mobile hotspot to isolate network issues',
                    'Try different WiFi network',
                    'Contact network administrator',
                    'Check browser console for network errors'
                ]
            });
        }
    }
}

export default new WebRTCStore();