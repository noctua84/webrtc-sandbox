// Complete Enhanced WebRTC Store with comprehensive logging for debugging
import {action, computed, makeAutoObservable, observable, runInAction} from 'mobx';
import socketStore from './socket.store';
import roomStore from './room.store';

import {ConnectivityTestResult, runWebRTCDiagnostics} from "@/diagnostics/webrtc.diagnostics.ts";

import {LogData, LogEntry, LogLevel} from "@/types/logging.types.ts";
import {
    MediaConstraints,
    MediaStatus,
    PeerConnection,
    WebRTCAnswer,
    WebRTCIceCandidate,
    WebRTCOffer
} from "@/types/webrtc.types.ts";

// ============================================================================
// CONSTANTS & CONFIGURATION
// ============================================================================

// Basic STUN servers for fallback
const FALLBACK_ICE_SERVERS: RTCIceServer[] = [
    { urls: ['stun:stun.l.google.com:19302'] },
    { urls: ['stun:stun1.l.google.com:19302'] },
];

const CONNECTION_CONFIG = {
    MAX_RETRY_ATTEMPTS: 3,
    RETRY_DELAY_BASE: 2000,
    ICE_GATHERING_TIMEOUT: 10000,
    CONNECTION_TIMEOUT: 15000
} as const;

// ============================================================================
// TYPES & INTERFACES
// ============================================================================
interface TurnCredentials {
    username: string;
    password: string;
    ttl: number;
    servers: string[];
    expiresAt: number;
}

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

    // TURN credentials management
    @observable turnCredentials: TurnCredentials | null = null;
    @observable isRefreshingCredentials: boolean = false;
    @observable credentialError: string | null = null;

    // Internal state (not observable)
    private pendingIceCandidates: Map<string, RTCIceCandidateInit[]> = new Map();
    private connectionAttempts: Map<string, ConnectionAttempt> = new Map();
    private connectionInitiators: Set<string> = new Set();
    private connectionTimeouts: Map<string, NodeJS.Timeout> = new Map();
    private credentialRefreshInterval: NodeJS.Timeout | null = null;

    @observable connectivityTestResult: ConnectivityTestResult | null = null;
    @observable isRunningConnectivityTest = false;

    constructor() {
        makeAutoObservable(this, {
            localStream: true,
            peerConnections: true,
            mediaStatus: true,
            hasVideo: true,
            hasAudio: true,
            isScreenSharing: true,
            mediaError: true,
            logs: true,
            turnCredentials: true,
            isRefreshingCredentials: true,
            credentialError: true
        });

        this.setupSocketListeners();
        this.log('info', '🚀 WebRTC Store initialized with enhanced logging');
    }

    // ========================================================================
    // TURN CREDENTIALS MANAGEMENT
    // ========================================================================

    @action
    async refreshTurnCredentials(userName?: string): Promise<void> {
        if (this.isRefreshingCredentials) {
            this.log('info', '🔄 TURN credential refresh already in progress');
            return;
        }

        runInAction(() => {
            this.isRefreshingCredentials = true;
            this.credentialError = null;
        });

        try {
            const currentUserName = userName || roomStore.currentParticipant?.userName || 'anonymous';

            this.log('info', '🔑 Requesting fresh TURN credentials', { userName: currentUserName });

            const response = await fetch('http://localhost:3001/api/turn-credentials', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ userName: currentUserName })
            });

            if (!response.ok) {
                throw new Error(`TURN credential request failed: ${response.status} ${response.statusText}`);
            }

            const data = await response.json();

            if (!data.success) {
                throw new Error('TURN credential generation failed on server');
            }

            const credentials: TurnCredentials = {
                username: data.userName,
                password: data.password,
                ttl: data.ttl,
                servers: data.servers,
                expiresAt: Date.now() + (data.ttl * 1000) - 60000 // Refresh 1 minute before expiry
            };

            runInAction(() => {
                this.turnCredentials = credentials;
                this.isRefreshingCredentials = false;
                this.credentialError = null;
            });

            this.log('success', '✅ TURN credentials refreshed successfully', {
                username: credentials.username,
                ttl: credentials.ttl,
                servers: credentials.servers,
                expiresAt: new Date(credentials.expiresAt).toISOString()
            });

            // Schedule next refresh
            this.scheduleCredentialRefresh(credentials.expiresAt - Date.now());

        } catch (error) {
            const errorMessage = (error as Error).message;

            runInAction(() => {
                this.isRefreshingCredentials = false;
                this.credentialError = errorMessage;
            });

            this.log('error', '❌ Failed to refresh TURN credentials', {
                error: errorMessage,
                willUseFallback: true
            });

            // Schedule retry in 30 seconds
            setTimeout(() => {
                if (!this.turnCredentials) {
                    this.refreshTurnCredentials(userName);
                }
            }, 30000);
        }
    }

    private async scheduleCredentialRefresh(delayMs: number)  {
        if (this.credentialRefreshInterval) {
            clearTimeout(this.credentialRefreshInterval);
        }

        this.credentialRefreshInterval = setTimeout(async () => {
            this.log('info', '⏰ Scheduled TURN credential refresh triggered');
            await this.refreshTurnCredentials();
        }, delayMs);

        this.log('info', '⏰ Scheduled TURN credential refresh', {
            delayMs,
            refreshAt: new Date(Date.now() + delayMs).toISOString()
        });
    }

    private getCurrentIceServers(): RTCIceServer[] {
        const iceServers: RTCIceServer[] = [...FALLBACK_ICE_SERVERS];

        if (this.turnCredentials && Date.now() < this.turnCredentials.expiresAt) {
            // Add TURN servers with credentials
            this.turnCredentials.servers.forEach(serverUrl => {
                if (serverUrl.startsWith('turn:')) {
                    iceServers.push({
                        urls: [serverUrl],
                        username: this.turnCredentials!.username,
                        credential: this.turnCredentials!.password
                    });
                } else if (serverUrl.startsWith('stun:')) {
                    iceServers.push({ urls: [serverUrl] });
                }
            });

            this.log('info', '🌐 Using TURN credentials for ICE servers', {
                turnServers: this.turnCredentials.servers.filter(url => url.startsWith('turn:')).length,
                stunServers: iceServers.filter(server => server.urls).length
            });
        } else {
            this.log('warning', '⚠️ Using fallback STUN servers only (no valid TURN credentials)', {
                hasCredentials: !!this.turnCredentials,
                credentialsExpired: this.turnCredentials ? Date.now() >= this.turnCredentials.expiresAt : false
            });
        }

        return iceServers;
    }

    private getCurrentRTCConfiguration(): RTCConfiguration {
        return {
            iceServers: this.getCurrentIceServers(),
            iceCandidatePoolSize: 10,
            iceTransportPolicy: 'all',
            bundlePolicy: 'balanced',
            rtcpMuxPolicy: 'require'
        };
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

    /**
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
    */

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
    // PEER CONNECTION MANAGEMENT WITH DYNAMIC CREDENTIALS
    // ========================================================================

    async createPeerConnection(participantId: string, userName: string, isInitiator: boolean): Promise<PeerConnection> {
        this.log('info', 'Creating peer connection', { participantId, userName, isInitiator });

        // Ensure we have fresh TURN credentials
        if (!this.turnCredentials || Date.now() >= this.turnCredentials.expiresAt) {
            this.log('info', '🔑 Refreshing TURN credentials before creating connection', {
                participantId,
                hasCredentials: !!this.turnCredentials,
                credentialsExpired: this.turnCredentials ? Date.now() >= this.turnCredentials.expiresAt : false
            });
            await this.refreshTurnCredentials(userName);
        }

        try {
            const rtcConfiguration = this.getCurrentRTCConfiguration();
            const connection = new RTCPeerConnection(rtcConfiguration);

            const peerConnection: PeerConnection = {
                participantId,
                userName,
                connection,
                isInitiator,
                connectionState: connection.connectionState,
                iceConnectionState: connection.iceConnectionState
            };

            // Set up comprehensive event handlers
            this.setupPeerConnectionHandlers(peerConnection);

            // Add to our map
            this.peerConnections.set(participantId, peerConnection);

            // Add local stream if available
            if (this.localStream) {
                this.addStreamToPeerConnection(peerConnection, this.localStream);
            }

            this.log('success', 'Peer connection created with current credentials', {
                participantId,
                userName,
                isInitiator,
                totalConnections: this.peerConnections.size,
                iceServerCount: rtcConfiguration?.iceServers?.length,
                hasTurnCredentials: !!this.turnCredentials
            });

            return peerConnection;
        } catch (error) {
            this.log('error', 'Failed to create peer connection', {
                participantId,
                userName,
                error: (error as Error).message
            });
            throw error;
        }
    }

    private setupPeerConnectionHandlers(peerConnection: PeerConnection): void {
        const { connection, participantId, userName } = peerConnection;

        // Connection state changes
        connection.onconnectionstatechange = () => {
            this.log('info', 'Peer connection state changed', {
                participantId,
                userName,
                state: connection.connectionState,
                iceState: connection.iceConnectionState,
                gatheringState: connection.iceGatheringState
            });

            runInAction(() => {
                peerConnection.connectionState = connection.connectionState;
            });

            if (connection.connectionState === 'failed') {
                this.log('error', 'Peer connection failed', {
                    participantId,
                    userName,
                    iceState: connection.iceConnectionState,
                    gatheringState: connection.iceGatheringState
                });
                this.handleConnectionFailure(participantId, 'Connection failed');
            } else if (connection.connectionState === 'connected') {
                this.log('success', 'Peer connection established successfully', {
                    participantId,
                    userName
                });
            }
        };

        // ICE connection state changes with detailed logging
        connection.oniceconnectionstatechange = () => {
            this.log('info', 'ICE connection state changed', {
                participantId,
                userName,
                iceState: connection.iceConnectionState,
                gatheringState: connection.iceGatheringState
            });

            runInAction(() => {
                peerConnection.iceConnectionState = connection.iceConnectionState;
            });

            if (connection.iceConnectionState === 'failed') {
                this.log('error', 'ICE connection failed', { participantId, userName });
                this.handleConnectionFailure(participantId, 'ICE connection failed');
            } else if (connection.iceConnectionState === 'disconnected') {
                this.log('warning', 'ICE connection disconnected', { participantId, userName });
                // Don't immediately close - might reconnect
            }
        };

        // ICE gathering state changes
        connection.onicegatheringstatechange = () => {
            this.log('info', 'ICE gathering state changed', {
                participantId,
                userName,
                gatheringState: connection.iceGatheringState
            });

            if (connection.iceGatheringState === 'complete') {
                this.log('info', 'ICE gathering completed', { participantId, userName });
            }
        };

        // ICE candidates with detailed logging
        connection.onicecandidate = (event) => {
            if (event.candidate) {
                this.log('info', 'ICE candidate generated', {
                    participantId,
                    userName,
                    candidate: {
                        type: event.candidate.type,
                        protocol: event.candidate.protocol,
                        address: event.candidate.address?.substring(0, 10) + '...' // Partial for privacy
                    }
                });

                // Forward ICE candidate to remote peer
                socketStore.emit('webrtc-ice-candidate', {
                    roomId: roomStore.currentRoom!.id,
                    targetParticipantId: participantId,
                    candidate: event.candidate
                });
            } else {
                this.log('info', 'ICE candidate gathering finished', { participantId, userName });
            }
        };

        // Remote stream handling
        connection.ontrack = (event) => {
            this.log('success', 'Remote track received', {
                participantId,
                userName,
                kind: event.track.kind,
                streamId: event.streams[0]?.id
            });

            if (event.streams[0]) {
                runInAction(() => {
                    peerConnection.remoteStream = event.streams[0];
                });
            }
        };

        // Data channel handling
        connection.ondatachannel = (event) => {
            this.log('info', 'Data channel received', {
                participantId,
                userName,
                label: event.channel.label
            });

            event.channel.onopen = () => {
                this.log('success', 'Data channel opened', { participantId, userName });
            };

            event.channel.onclose = () => {
                this.log('info', 'Data channel closed', { participantId, userName });
            };

            event.channel.onerror = (error) => {
                this.log('error', 'Data channel error', {
                    participantId,
                    userName,
                    error
                });
            };
        };
    }

    // New method to handle connection failures with retry logic
    private handleConnectionFailure(participantId: string, reason: string): void {
        this.log('warning', 'Handling connection failure', { participantId, reason });

        const peerConnection = this.peerConnections.get(participantId);
        if (!peerConnection) return;

        // Close the failed connection
        this.closePeerConnection(participantId);

        // Could implement retry logic here if needed
        this.log('info', 'Connection cleanup completed', { participantId, reason });
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

    @action
    async runConnectivityTest(): Promise<ConnectivityTestResult> {
        if (this.isRunningConnectivityTest) {
            this.log('warning', 'Connectivity test already in progress');
            return this.connectivityTestResult!;
        }

        runInAction(() => {
            this.isRunningConnectivityTest = true;
            this.connectivityTestResult = null;
        });

        try {
            // Use the enhanced diagnostics with network detection
            const result = await runWebRTCDiagnostics((level, message, data) => {
                this.log(level as any, message, data);
            });

            runInAction(() => {
                this.connectivityTestResult = result;
                this.isRunningConnectivityTest = false;
            });

            // Enhanced logging based on network environment
            if (result.networkEnvironment) {
                this.log('info', '🌐 Network Environment Analysis', {
                    type: result.networkEnvironment.type,
                    natType: result.networkEnvironment.natType,
                    firewallLevel: result.networkEnvironment.firewallLevel
                });
            }

            // Smart status reporting
            if (result.issueCount === 0) {
                this.log('success', '🎉 All connectivity tests passed!', {
                    networkType: result.networkEnvironment?.type || 'unknown',
                    natType: result.networkEnvironment?.natType || 'unknown'
                });
            } else {
                // Categorize issues by severity and type
                const criticalIssues = this.categorizeCriticalIssues(result);
                const networkIssues = this.categorizeNetworkIssues(result);

                this.log('warning', `⚠️ ${result.issueCount} issue(s) detected`, {
                    criticalIssues,
                    networkIssues,
                    networkType: result.networkEnvironment?.type,
                    totalRecommendations: result.recommendations.length
                });

                // Log specific guidance based on network environment
                if (result.networkEnvironment?.type === 'corporate') {
                    this.log('info', '🏢 Corporate network detected - IT assistance may be required');
                } else if (result.networkEnvironment?.type === 'mobile') {
                    this.log('info', '📱 Mobile/Carrier network - TURN servers required');
                } else if (result.networkEnvironment?.natType === 'symmetric') {
                    this.log('info', '🔄 Symmetric NAT - relay connections needed');
                }
            }

            return result;
        } catch (error) {
            this.log('error', 'Connectivity test failed with unexpected error', {
                error: (error as Error).message
            });

            const failedResult: ConnectivityTestResult = {
                mediaAccess: false,
                stunConnectivity: false,
                candidateGeneration: false,
                peerConnectionCreation: false,
                localOfferGeneration: false,
                iceGathering: false,
                issueCount: 1,
                issues: [`Connectivity test failed: ${(error as Error).message}`],
                recommendations: [
                    'Check browser console for detailed error information',
                    'Try refreshing the page',
                    'Ensure stable internet connection'
                ],
                details: { errors: [(error as Error).message] }
            };

            runInAction(() => {
                this.connectivityTestResult = failedResult;
                this.isRunningConnectivityTest = false;
            });

            return failedResult;
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

    // ========================================================================
    // PUBLIC API - MEDIA METHODS
    // ========================================================================

    async startMedia(constraints: MediaConstraints = { video: true, audio: true }): Promise<void> {
        this.log('info', '📹 Starting media capture', constraints);

        // Refresh TURN credentials when starting media
        if (!this.turnCredentials || Date.now() >= this.turnCredentials.expiresAt) {
            await this.refreshTurnCredentials();
        }

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

        // Refresh TURN credentials before connecting to multiple participants
        if (!this.turnCredentials || Date.now() >= this.turnCredentials.expiresAt) {
            await this.refreshTurnCredentials();
        }

        const otherParticipants = roomStore.participants.filter(
            p => p.isConnected &&
                p.socketId !== roomStore.currentParticipant?.socketId &&
                !this.peerConnections.has(p.socketId) // Only connect to new participants
        );

        this.log('info', '🌐 Connecting to all participants', {
            participantCount: otherParticipants.length,
            participants: otherParticipants.map(p => ({ id: p.socketId, name: p.userName })),
            hasTurnCredentials: !!this.turnCredentials
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
        this.log('info', 'Cleaning up WebRTC store');

        try {
            this.stopMedia();
            this.closeAllPeerConnections();

            // Clear credential refresh interval
            if (this.credentialRefreshInterval) {
                clearTimeout(this.credentialRefreshInterval);
                this.credentialRefreshInterval = null;
            }

            runInAction(() => {
                this.mediaError = null;
                this.connectivityTestResult = null;
                this.isRunningConnectivityTest = false;
                this.turnCredentials = null;
                this.isRefreshingCredentials = false;
                this.credentialError = null;
            });

            this.log('success', 'WebRTC store cleanup completed');
        } catch (error) {
            this.log('error', 'Error during cleanup', { error: (error as Error).message });
        }
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

    get hasTurnCredentials(): boolean {
        return !!this.turnCredentials && Date.now() < this.turnCredentials.expiresAt;
    }

    get credentialStatus(): 'valid' | 'expired' | 'missing' | 'refreshing' {
        if (this.isRefreshingCredentials) return 'refreshing';
        if (!this.turnCredentials) return 'missing';
        if (Date.now() >= this.turnCredentials.expiresAt) return 'expired';
        return 'valid';
    }

    get diagnosticSummary(): any {
        return {
            mediaStatus: this.mediaStatus,
            totalConnections: this.peerConnections.size,
            connectedPeers: this.connectedPeersCount,
            pendingCandidates: this.pendingCandidatesCount,
            activeRetries: this.activeRetryCount,
            turnCredentials: {
                status: this.credentialStatus,
                expiresAt: this.turnCredentials?.expiresAt,
                username: this.turnCredentials?.username,
                hasServers: !!this.turnCredentials?.servers?.length
            },
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

    @computed
    get connectivitySummary() {
        if (!this.connectivityTestResult) return null;

        const result = this.connectivityTestResult;
        return {
            overallStatus: result.issueCount === 0 ? 'healthy' : 'issues',
            passedTests: [
                result.mediaAccess && 'Media Access',
                result.stunConnectivity && 'STUN Connectivity',
                result.candidateGeneration && 'ICE Candidates',
                result.peerConnectionCreation && 'Peer Connection',
                result.localOfferGeneration && 'Offer Generation',
                result.iceGathering && 'ICE Gathering'
            ].filter(Boolean),
            failedTests: [
                !result.mediaAccess && 'Media Access',
                !result.stunConnectivity && 'STUN Connectivity',
                !result.candidateGeneration && 'ICE Candidates',
                !result.peerConnectionCreation && 'Peer Connection',
                !result.localOfferGeneration && 'Offer Generation',
                !result.iceGathering && 'ICE Gathering'
            ].filter(Boolean),
            recommendations: result.recommendations
        };
    }

    @computed
    get canRunConnectivityTest(): boolean {
        return !this.isRunningConnectivityTest;
    }

    // Helper methods for categorizing issues
    private categorizeCriticalIssues(result: ConnectivityTestResult): string[] {
        const critical: string[] = [];

        if (!result.mediaAccess) {
            critical.push('Media access blocked');
        }
        if (!result.peerConnectionCreation) {
            critical.push('WebRTC API unavailable');
        }
        if (!result.localOfferGeneration) {
            critical.push('SDP generation failed');
        }

        return critical;
    }

    private categorizeNetworkIssues(result: ConnectivityTestResult): string[] {
        const network: string[] = [];

        if (!result.stunConnectivity) {
            network.push('STUN servers blocked');
        }
        if (!result.candidateGeneration) {
            network.push('ICE candidate generation failed');
        }
        if (!result.iceGathering) {
            network.push('ICE gathering incomplete');
        }

        return network;
    }
}

export default new WebRTCStore();