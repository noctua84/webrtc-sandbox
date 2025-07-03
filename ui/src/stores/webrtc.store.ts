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
// LOGGING FUNCTIONS
// ============================================================================

const createLogger = (logs: LogEntry[]) => ({
    log: (level: LogLevel, message: string, data?: LogData): void => {
        const logEntry = createLogEntry(level, message, data);

        runInAction(() => {
            logs.push(logEntry);
            if (logs.length > 100) {
                logs.splice(0, logs.length - 100);
            }
        });

        const consoleMessage = `[WEBRTC] [${level.toUpperCase()}] ${message}`;
        if (data) {
            console.log(consoleMessage, data);
        } else {
            console.log(consoleMessage);
        }
    },

    clearLogs: (): void => {
        runInAction(() => {
            logs.length = 0;
        });
    }
});

// ============================================================================
// MEDIA MANAGEMENT FUNCTIONS
// ============================================================================

const createMediaManager = (store: any, logger: ReturnType<typeof createLogger>) => ({
    async startMedia(constraints: MediaConstraints = { video: true, audio: true }): Promise<void> {
        logger.log('info', 'Starting media capture', constraints);

        runInAction(() => {
            store.mediaStatus = 'requesting';
            store.mediaError = null;
        });

        try {
            const stream = await navigator.mediaDevices.getUserMedia(constraints);

            logger.log('success', 'Media capture started', {
                videoTracks: stream.getVideoTracks().length,
                audioTracks: stream.getAudioTracks().length,
                streamId: stream.id
            });

            runInAction(() => {
                store.localStream = stream;
                store.hasVideo = stream.getVideoTracks().length > 0;
                store.hasAudio = stream.getAudioTracks().length > 0;
                store.isScreenSharing = false;
                store.mediaStatus = 'active';
            });

            await updateMediaStatusOnServer(store, logger);
            addStreamToAllPeerConnections(store, stream, logger);

        } catch (error) {
            const err = error as Error;
            logger.log('error', 'Failed to start media capture', {
                error: err.message,
                name: err.name
            });

            runInAction(() => {
                store.mediaStatus = 'error';
                store.mediaError = err.message;
            });

            throw error;
        }
    },

    async startScreenShare(): Promise<void> {
        logger.log('info', 'Starting screen share');

        runInAction(() => {
            store.mediaStatus = 'requesting';
            store.mediaError = null;
        });

        try {
            if (!navigator.mediaDevices || !navigator.mediaDevices.getDisplayMedia) {
                logger.log('error', 'Screen sharing is not supported in this browser');
            }

            const stream = await navigator.mediaDevices.getDisplayMedia({
                video: true,
                audio: true
            });

            logger.log('success', 'Screen share started', {
                videoTracks: stream.getVideoTracks().length,
                audioTracks: stream.getAudioTracks().length,
                streamId: stream.id
            });

            if (store.localStream) {
                store.localStream.getTracks().forEach((track: { stop: () => any; }) => track.stop());
            }

            runInAction(() => {
                store.localStream = stream;
                store.hasVideo = stream.getVideoTracks().length > 0;
                store.hasAudio = stream.getAudioTracks().length > 0;
                store.isScreenSharing = true;
                store.mediaStatus = 'active';
            });

            stream.getVideoTracks()[0]?.addEventListener('ended', () => {
                logger.log('info', 'Screen share ended by user');
                store.stopMedia();
            });

            await updateMediaStatusOnServer(store, logger);
            replaceStreamInAllPeerConnections(store, stream, logger);

        } catch (error) {
            const err = error as Error;
            logger.log('error', 'Failed to start screen share', {
                error: err.message,
                name: err.name
            });

            runInAction(() => {
                store.mediaStatus = 'error';
                store.mediaError = err.message;
            });

            throw error;
        }
    },

    async stopMedia() {
        logger.log('info', 'Stopping media');

        if (store.localStream) {
            store.localStream.getTracks().forEach((track: { stop: () => void; kind: any; label: any; }) => {
                track.stop();
                logger.log('info', 'Stopped media track', {
                    kind: track.kind,
                    label: track.label
                });
            });
        }

        runInAction(() => {
            store.localStream = null;
            store.hasVideo = false;
            store.hasAudio = false;
            store.isScreenSharing = false;
            store.mediaStatus = 'inactive';
            store.mediaError = null;
        });

        await updateMediaStatusOnServer(store, logger);
        removeStreamFromAllPeerConnections(store, logger);
    },

    toggleVideo(): void {
        if (!store.localStream) return;

        const videoTrack = store.localStream.getVideoTracks()[0];
        if (videoTrack) {
            videoTrack.enabled = !videoTrack.enabled;
            runInAction(() => {
                store.hasVideo = videoTrack.enabled;
            });

            logger.log('info', `Video ${videoTrack.enabled ? 'enabled' : 'disabled'}`);
            updateMediaStatusOnServer(store, logger);
        }
    },

    toggleAudio(): void {
        if (!store.localStream) return;

        const audioTrack = store.localStream.getAudioTracks()[0];
        if (audioTrack) {
            audioTrack.enabled = !audioTrack.enabled;
            runInAction(() => {
                store.hasAudio = audioTrack.enabled;
            });

            logger.log('info', `Audio ${audioTrack.enabled ? 'enabled' : 'disabled'}`);
            updateMediaStatusOnServer(store, logger);
        }
    }
});

// ============================================================================
// PEER CONNECTION MANAGEMENT FUNCTIONS
// ============================================================================

const createPeerConnectionManager = (store: any, logger: ReturnType<typeof createLogger>) => ({
    async createPeerConnection(participantId: string, userName: string, isInitiator: boolean): Promise<PeerConnection> {
        logger.log('info', 'Creating peer connection', { participantId, userName, isInitiator });

        const connection = new RTCPeerConnection(RTC_CONFIGURATION);

        const peerConnection: PeerConnection = {
            participantId,
            userName,
            connection,
            isInitiator,
            connectionState: connection.connectionState,
            iceConnectionState: connection.iceConnectionState
        };

        setupPeerConnectionEventHandlers(peerConnection, store, logger);
        store.peerConnections.set(participantId, peerConnection);

        if (store.localStream) {
            addStreamToPeerConnection(peerConnection, store.localStream, logger);
        }

        logger.log('success', 'Peer connection created', {
            participantId,
            userName,
            isInitiator,
            totalConnections: store.peerConnections.size
        });

        return peerConnection;
    },

    async initiatePeerConnection(participantId: string, userName: string): Promise<void> {
        if (!roomStore.currentRoom) {
            throw new Error('Not in a room');
        }

        if (store.peerConnections.has(participantId)) {
            logger.log('warning', 'Peer connection already exists', { participantId });
            return;
        }

        logger.log('info', 'Initiating peer connection', { participantId, userName });

        const peerConnection = store.createPeerConnection(participantId, userName, true);

        try {
            const offer = await peerConnection.connection.createOffer({
                offerToReceiveAudio: true,
                offerToReceiveVideo: true
            });

            await peerConnection.connection.setLocalDescription(offer);

            logger.log('info', 'Created and set local offer', {
                participantId,
                offerType: offer.type,
                signalingState: peerConnection.connection.signalingState
            });

            await socketStore.emitWithCallback('webrtc-offer', {
                roomId: roomStore.currentRoom.id,
                targetParticipantId: participantId,
                sdp: offer
            });

            logger.log('success', 'Offer sent to peer', { participantId });

        } catch (error) {
            const detailedError = createDetailedError(
                'Initiate peer connection',
                participantId,
                error as Error,
                peerConnection.connection.connectionState,
                peerConnection.connection.signalingState
            );

            logger.log('error', detailedError.message);
            closePeerConnection(participantId, store, logger);
            throw detailedError;
        }
    },

    async connectToAllParticipants(): Promise<void> {
        if (!roomStore.currentRoom || !roomStore.currentParticipant) return;

        const otherParticipants = roomStore.participants.filter(
            p => p.isConnected && p.socketId !== roomStore.currentParticipant?.socketId
        );

        logger.log('info', 'Connecting to all participants', {
            participantCount: otherParticipants.length,
            participants: otherParticipants.map(p => ({ id: p.socketId, name: p.userName }))
        });

        const connectionPromises = otherParticipants.map(async (participant) => {
            try {
                await store.initiatePeerConnection(participant.socketId, participant.userName);
            } catch (error) {
                logger.log('error', 'Failed to connect to participant', {
                    participantId: participant.socketId,
                    userName: participant.userName,
                    error: (error as Error).message
                });
            }
        });

        await Promise.allSettled(connectionPromises);
    }
});

// ============================================================================
// ICE CANDIDATE MANAGEMENT FUNCTIONS
// ============================================================================

const createIceCandidateManager = (store: any, logger: ReturnType<typeof createLogger>) => ({
    bufferIceCandidate(participantId: string, candidate: RTCIceCandidateInit): void {
        if (!store.pendingIceCandidates.has(participantId)) {
            store.pendingIceCandidates.set(participantId, []);
        }

        const pendingCandidate: PendingCandidate = {
            candidate,
            timestamp: Date.now()
        };

        store.pendingIceCandidates.get(participantId)!.push(pendingCandidate);

        logger.log('info', 'ICE candidate buffered', {
            participantId,
            bufferedCount: store.pendingIceCandidates.get(participantId)!.length
        });
    },

    async processPendingIceCandidates(participantId: string): Promise<void> {
        const pendingCandidates = store.pendingIceCandidates.get(participantId);
        if (!pendingCandidates || pendingCandidates.length === 0) return;

        const peerConnection = store.peerConnections.get(participantId);
        if (!peerConnection) return;

        logger.log('info', 'Processing buffered ICE candidates', {
            participantId,
            candidateCount: pendingCandidates.length
        });

        for (const { candidate } of pendingCandidates) {
            try {
                await peerConnection.connection.addIceCandidate(candidate);
                logger.log('info', 'Added buffered ICE candidate', { participantId });
            } catch (error) {
                logger.log('error', 'Failed to add buffered ICE candidate', {
                    participantId,
                    error: (error as Error).message
                });
            }
        }

        store.pendingIceCandidates.delete(participantId);
        logger.log('success', 'All buffered ICE candidates processed', { participantId });
    },

    clearPendingCandidates(participantId: string): void {
        const count = store.pendingIceCandidates.get(participantId)?.length || 0;
        store.pendingIceCandidates.delete(participantId);

        if (count > 0) {
            logger.log('info', 'Cleared pending ICE candidates', { participantId, count });
        }
    }
});

// ============================================================================
// CONNECTION RETRY MANAGEMENT FUNCTIONS
// ============================================================================

const createRetryManager = (store: any, logger: ReturnType<typeof createLogger>) => ({
    async retryConnection(participantId: string, userName: string): Promise<void> {
        const attempt = store.connectionAttempts.get(participantId) || { count: 0, lastAttempt: 0 };

        if (attempt.count >= CONNECTION_CONFIG.MAX_RETRY_ATTEMPTS) {
            logger.log('error', 'Max connection attempts reached', {
                participantId,
                attempts: attempt.count
            });
            store.connectionAttempts.delete(participantId);
            return;
        }

        const newAttempt: ConnectionAttempt = {
            count: attempt.count + 1,
            lastAttempt: Date.now()
        };

        store.connectionAttempts.set(participantId, newAttempt);

        const delay = calculateRetryDelay(newAttempt.count);

        logger.log('info', 'Scheduling connection retry', {
            participantId,
            attempt: newAttempt.count,
            delayMs: delay
        });

        setTimeout(async () => {
            try {
                const peerConnectionManager = createPeerConnectionManager(store, logger);
                await peerConnectionManager.initiatePeerConnection(participantId, userName);
            } catch (error) {
                logger.log('error', 'Connection retry failed', {
                    participantId,
                    attempt: newAttempt.count,
                    error: (error as Error).message
                });
            }
        }, delay);
    },

    clearRetryAttempts(participantId: string): void {
        const attempt = store.connectionAttempts.get(participantId);
        if (attempt) {
            store.connectionAttempts.delete(participantId);
            logger.log('info', 'Cleared retry attempts', { participantId, attempts: attempt.count });
        }
    }
});

// ============================================================================
// WEBRTC SIGNALING HANDLERS
// ============================================================================

const createSignalingHandlers = (store: any, logger: ReturnType<typeof createLogger>) => {
    const iceCandidateManager = createIceCandidateManager(store, logger);
    const peerConnectionManager = createPeerConnectionManager(store, logger);

    return {
        async handleIncomingOffer(data: WebRTCOffer): Promise<void> {
            const { targetParticipantId, sdp, roomId } = data;

            if (!isValidRoomContext(roomId)) {
                logger.log('warning', 'Received offer for different room', { roomId, targetParticipantId });
                return;
            }

            const participant = roomStore.participants.find(p => p.socketId === targetParticipantId);
            if (!participant) {
                logger.log('error', 'Received offer from unknown participant', { targetParticipantId });
                return;
            }

            logger.log('info', 'Handling incoming offer', {
                from: targetParticipantId,
                userName: participant.userName,
                offerType: sdp.type
            });

            try {
                const peerConnection = await peerConnectionManager.createPeerConnection(
                    targetParticipantId,
                    participant.userName,
                    false
                );

                await peerConnection.connection.setRemoteDescription(sdp);
                logger.log('info', 'Set remote description from offer', {
                    participantId: targetParticipantId,
                    signalingState: peerConnection.connection.signalingState
                });

                await iceCandidateManager.processPendingIceCandidates(targetParticipantId);

                const answer = await peerConnection.connection.createAnswer();
                await peerConnection.connection.setLocalDescription(answer);

                logger.log('info', 'Created and set local answer', {
                    participantId: targetParticipantId,
                    answerType: answer.type,
                    signalingState: peerConnection.connection.signalingState
                });

                await socketStore.emitWithCallback('webrtc-answer', {
                    roomId: roomStore.currentRoom!.id,
                    targetParticipantId: targetParticipantId,
                    sdp: answer
                });

                logger.log('success', 'Answer sent to peer', { participantId: targetParticipantId });

            } catch (error) {
                const detailedError = createDetailedError(
                    'Handle incoming offer',
                    targetParticipantId,
                    error as Error
                );

                logger.log('error', detailedError.message);
                closePeerConnection(targetParticipantId, store, logger);
            }
        },

        async handleIncomingAnswer(data: WebRTCAnswer): Promise<void> {
            const { targetParticipantId, sdp, roomId } = data;

            if (!isValidRoomContext(roomId)) {
                logger.log('warning', 'Received answer for different room', { roomId, targetParticipantId });
                return;
            }

            const peerConnection = store.peerConnections.get(targetParticipantId);
            if (!peerConnection) {
                logger.log('error', 'Received answer for non-existent peer connection', { targetParticipantId });
                return;
            }

            if (peerConnection.connection.signalingState !== 'have-local-offer') {
                logger.log('error', 'Received answer in wrong signaling state', {
                    targetParticipantId,
                    currentState: peerConnection.connection.signalingState,
                    expectedState: 'have-local-offer'
                });
                return;
            }

            logger.log('info', 'Handling incoming answer', {
                from: targetParticipantId,
                answerType: sdp.type,
                currentState: peerConnection.connection.signalingState
            });

            try {
                await peerConnection.connection.setRemoteDescription(sdp);
                logger.log('success', 'Set remote description from answer', {
                    participantId: targetParticipantId,
                    newState: peerConnection.connection.signalingState
                });

                await iceCandidateManager.processPendingIceCandidates(targetParticipantId);

            } catch (error) {
                const detailedError = createDetailedError(
                    'Handle incoming answer',
                    targetParticipantId,
                    error as Error,
                    peerConnection.connection.connectionState,
                    peerConnection.connection.signalingState
                );

                logger.log('error', detailedError.message);
                closePeerConnection(targetParticipantId, store, logger);
            }
        },

        async handleIncomingIceCandidate(data: WebRTCIceCandidate): Promise<void> {
            const { targetParticipantId, candidate, roomId } = data;

            if (!isValidRoomContext(roomId)) {
                logger.log('warning', 'Received ICE candidate for different room', { roomId, targetParticipantId });
                return;
            }

            const peerConnection = store.peerConnections.get(targetParticipantId);
            if (!peerConnection) {
                logger.log('warning', 'Received ICE candidate for non-existent peer connection', { targetParticipantId });
                return;
            }

            if (peerConnection.connection.remoteDescription === null) {
                logger.log('info', 'Buffering ICE candidate (no remote description yet)', { targetParticipantId });
                iceCandidateManager.bufferIceCandidate(targetParticipantId, candidate);
                return;
            }

            try {
                await peerConnection.connection.addIceCandidate(candidate);
                logger.log('info', 'Added ICE candidate', {
                    participantId: targetParticipantId,
                    candidateType: candidate.candidate?.split(' ')[7] || 'unknown'
                });
            } catch (error) {
                logger.log('error', 'Failed to add ICE candidate', {
                    participantId: targetParticipantId,
                    error: (error as Error).message
                });
            }
        },

        handlePeerDisconnected(data: { roomId: string; participantId: string }): void {
            const { roomId, participantId } = data;

            if (!isValidRoomContext(roomId)) {
                return;
            }

            logger.log('info', 'Peer disconnected, cleaning up connection', { participantId });
            closePeerConnection(participantId, store, logger);
        }
    };
};

// ============================================================================
// STREAM MANAGEMENT FUNCTIONS
// ============================================================================

const addStreamToPeerConnection = (peerConnection: PeerConnection, stream: MediaStream, logger: ReturnType<typeof createLogger>): void => {
    stream.getTracks().forEach(track => {
        peerConnection.connection.addTrack(track, stream);
        logger.log('info', 'Added track to peer connection', {
            participantId: peerConnection.participantId,
            trackKind: track.kind,
            trackLabel: track.label
        });
    });
};

const addStreamToAllPeerConnections = (store: any, stream: MediaStream, logger: ReturnType<typeof createLogger>): void => {
    for (const [, peerConnection] of store.peerConnections.entries()) {
        addStreamToPeerConnection(peerConnection, stream, logger);
    }
};

const replaceStreamInPeerConnection = (peerConnection: PeerConnection, stream: MediaStream, logger: ReturnType<typeof createLogger>): void => {
    const senders = peerConnection.connection.getSenders();

    stream.getTracks().forEach(track => {
        const sender = senders.find(s => s.track?.kind === track.kind);
        if (sender) {
            sender.replaceTrack(track);
            logger.log('info', 'Replaced track in peer connection', {
                participantId: peerConnection.participantId,
                trackKind: track.kind
            });
        } else {
            peerConnection.connection.addTrack(track, stream);
            logger.log('info', 'Added new track to peer connection', {
                participantId: peerConnection.participantId,
                trackKind: track.kind
            });
        }
    });
};

const replaceStreamInAllPeerConnections = (store: any, stream: MediaStream, logger: ReturnType<typeof createLogger>): void => {
    for (const [, peerConnection] of store.peerConnections.entries()) {
        replaceStreamInPeerConnection(peerConnection, stream, logger);
    }
};

const removeStreamFromPeerConnection = (peerConnection: PeerConnection, logger: ReturnType<typeof createLogger>): void => {
    const senders = peerConnection.connection.getSenders();
    senders.forEach(sender => {
        if (sender.track) {
            peerConnection.connection.removeTrack(sender);
            logger.log('info', 'Removed track from peer connection', {
                participantId: peerConnection.participantId,
                trackKind: sender.track.kind
            });
        }
    });
};

const removeStreamFromAllPeerConnections = (store: any, logger: ReturnType<typeof createLogger>): void => {
    for (const [, peerConnection] of store.peerConnections.entries()) {
        removeStreamFromPeerConnection(peerConnection, logger);
    }
};

// ============================================================================
// EVENT HANDLER SETUP
// ============================================================================

const setupPeerConnectionEventHandlers = (peerConnection: PeerConnection, store: any, logger: ReturnType<typeof createLogger>): void => {
    const { connection, participantId, userName } = peerConnection;
    const retryManager = createRetryManager(store, logger);

    connection.onconnectionstatechange = () => {
        logger.log('info', 'Peer connection state changed', {
            participantId,
            userName,
            state: connection.connectionState
        });

        runInAction(() => {
            peerConnection.connectionState = connection.connectionState;
        });

        if (connection.connectionState === 'connected') {
            retryManager.clearRetryAttempts(participantId);
            logger.log('success', 'Peer connection established', { participantId, userName });
        } else if (connection.connectionState === 'failed') {
            logger.log('error', 'Peer connection failed', { participantId, userName });

            if (peerConnection.isInitiator) {
                retryManager.retryConnection(participantId, userName);
            } else {
                closePeerConnection(participantId, store, logger);
            }
        }
    };

    connection.oniceconnectionstatechange = () => {
        logger.log('info', 'ICE connection state changed', {
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
            logger.log('info', 'Generated ICE candidate', {
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
                logger.log('error', 'Failed to send ICE candidate', {
                    participantId,
                    error: (error as Error).message
                });
            }
        }
    };

    connection.ontrack = (event) => {
        logger.log('success', 'Received remote stream', {
            participantId,
            userName,
            streamId: event.streams[0]?.id,
            trackKind: event.track.kind
        });

        runInAction(() => {
            peerConnection.remoteStream = event.streams[0];
        });
    };
};

// ============================================================================
// CLEANUP FUNCTIONS
// ============================================================================

const closePeerConnection = (participantId: string, store: any, logger: ReturnType<typeof createLogger>): void => {
    const peerConnection = store.peerConnections.get(participantId);
    if (!peerConnection) return;

    logger.log('info', 'Closing peer connection', {
        participantId,
        userName: peerConnection.userName
    });

    const connection = peerConnection.connection;
    connection.onconnectionstatechange = null;
    connection.oniceconnectionstatechange = null;
    connection.onicecandidate = null;
    connection.ontrack = null;

    connection.close();
    store.peerConnections.delete(participantId);
    store.pendingIceCandidates.delete(participantId);
    store.connectionAttempts.delete(participantId);

    logger.log('success', 'Peer connection closed', {
        participantId,
        remainingConnections: store.peerConnections.size
    });
};

const closeAllPeerConnections = (store: any, logger: ReturnType<typeof createLogger>): void => {
    logger.log('info', 'Closing all peer connections', {
        count: store.peerConnections.size
    });

    for (const [participantId] of store.peerConnections) {
        closePeerConnection(participantId, store, logger);
    }
};

// ============================================================================
// SERVER COMMUNICATION FUNCTIONS
// ============================================================================

const updateMediaStatusOnServer = async (store: any, logger: ReturnType<typeof createLogger>): Promise<void> => {
    if (!roomStore.currentRoom) return;

    try {
        await socketStore.emitWithCallback('update-media-status', {
            roomId: roomStore.currentRoom.id,
            hasVideo: store.hasVideo,
            hasAudio: store.hasAudio,
            isScreenSharing: store.isScreenSharing
        });

        logger.log('info', 'Updated media status on server', {
            hasVideo: store.hasVideo,
            hasAudio: store.hasAudio,
            isScreenSharing: store.isScreenSharing
        });

    } catch (error) {
        logger.log('error', 'Failed to update media status', {
            error: (error as Error).message
        });
    }
};

// ============================================================================
// DIAGNOSTICS FUNCTIONS
// ============================================================================

const getDiagnosticInfo = (store: any): ConnectionDiagnostics => {
    const diagnostics: ConnectionDiagnostics = {
        totalConnections: store.peerConnections.size,
        connectionStates: {},
        iceStates: {},
        signalingStates: {},
        pendingCandidates: {},
        connectionAttempts: {},
        mediaStatus: store.mediaStatus,
        hasLocalStream: !!store.localStream
    };

    for (const [id, pc] of store.peerConnections) {
        diagnostics.connectionStates[id] = pc.connection.connectionState;
        diagnostics.iceStates[id] = pc.connection.iceConnectionState;
        diagnostics.signalingStates[id] = pc.connection.signalingState;
        diagnostics.pendingCandidates[id] = store.pendingIceCandidates.get(id)?.length || 0;
    }

    for (const [id, attempt] of store.connectionAttempts) {
        diagnostics.connectionAttempts[id] = attempt.count;
    }

    return diagnostics;
};

// ============================================================================
// SOCKET EVENT SETUP
// ============================================================================

const setupSocketListeners = (store: any, logger: ReturnType<typeof createLogger>): void => {
    logger.log('info', 'Setting up WebRTC socket listeners');

    const signalingHandlers = createSignalingHandlers(store, logger);

    socketStore.on('webrtc-offer', signalingHandlers.handleIncomingOffer);
    socketStore.on('webrtc-answer', signalingHandlers.handleIncomingAnswer);
    socketStore.on('webrtc-ice-candidate', signalingHandlers.handleIncomingIceCandidate);
    socketStore.on('peer-disconnected', signalingHandlers.handlePeerDisconnected);

    logger.log('info', 'WebRTC socket listeners configured');
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

    // Functional managers
    private readonly logger: ReturnType<typeof createLogger>;
    private mediaManager: ReturnType<typeof createMediaManager>;
    private peerConnectionManager: ReturnType<typeof createPeerConnectionManager>;

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

        // Initialize functional managers
        this.logger = createLogger(this.logs);
        this.mediaManager = createMediaManager(this, this.logger);
        this.peerConnectionManager = createPeerConnectionManager(this, this.logger);

        // Setup socket listeners
        setupSocketListeners(this, this.logger);
    }

    // ========================================================================
    // PUBLIC API - MEDIA METHODS
    // ========================================================================

    async startMedia(constraints?: MediaConstraints): Promise<void> {
        return this.mediaManager.startMedia(constraints);
    }

    async startScreenShare(): Promise<void> {
        return this.mediaManager.startScreenShare();
    }

    stopMedia(): void {
        this.mediaManager.stopMedia();
    }

    toggleVideo(): void {
        this.mediaManager.toggleVideo();
    }

    toggleAudio(): void {
        this.mediaManager.toggleAudio();
    }

    // ========================================================================
    // PUBLIC API - CONNECTION METHODS
    // ========================================================================

    async connectToAllParticipants(): Promise<void> {
        return this.peerConnectionManager.connectToAllParticipants();
    }

    async initiatePeerConnection(participantId: string, userName: string): Promise<void> {
        return this.peerConnectionManager.initiatePeerConnection(participantId, userName);
    }

    closePeerConnection(participantId: string): void {
        closePeerConnection(participantId, this, this.logger);
    }

    closeAllPeerConnections(): void {
        closeAllPeerConnections(this, this.logger);
    }

    // ========================================================================
    // PUBLIC API - UTILITY METHODS
    // ========================================================================

    clearLogs(): void {
        this.logger.clearLogs();
        this.logger.log('info', 'WebRTC logs cleared');
    }

    getDiagnosticInfo(): ConnectionDiagnostics {
        return getDiagnosticInfo(this);
    }

    cleanup(): void {
        this.logger.log('info', 'Cleaning up WebRTC store');

        this.stopMedia();
        this.closeAllPeerConnections();

        runInAction(() => {
            this.pendingIceCandidates.clear();
            this.connectionAttempts.clear();
            this.mediaError = null;
        });

        this.logger.log('success', 'WebRTC store cleanup completed');
    }

    async handleNewParticipant(participantId: string, userName: string): Promise<void> {
        if (!this.isMediaActive) {
            this.logger.log('info', 'Media not active, skipping connection to new participant', { participantId });
            return;
        }

        // Check if we already have a connection
        if (this.peerConnections.has(participantId)) {
            this.logger.log('info', 'Connection already exists for participant', { participantId });
            return;
        }

        // Always initiate connection to new participants
        try {
            await this.initiatePeerConnection(participantId, userName);
            this.logger.log('success', 'Initiated connection to new participant', { participantId, userName });
        } catch (error) {
            this.logger.log('error', 'Failed to connect to new participant', {
                participantId,
                userName,
                error: (error as Error).message
            });
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
}

// ============================================================================
// EXPORT
// ============================================================================

export default new WebRTCStore();