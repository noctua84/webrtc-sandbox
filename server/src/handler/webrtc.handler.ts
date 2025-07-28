import { Socket } from "socket.io";
import { Container } from "../di";
import { createHandler } from "../di";
import {
    WebRTCOffer,
    WebRTCAnswer,
    WebRTCIceCandidate,
    ErrorResponse,
    RTCSessionDescriptionInit
} from "../types/webrtc.types";
import { SocketConnectionContext } from "../types/socket.types";

/**
 * WebRTC Handler with DI Integration
 * Handles WebRTC signaling (offers, answers, ICE candidates)
 * Follows the established createHandler pattern with enhanced logging
 */

// ================================
// HELPER FUNCTIONS
// ================================

const logWebRTCEvent = (eventType: string, socket: Socket, data: any, additionalInfo: any = {}) => ({
    eventType,
    socketId: socket.id,
    timestamp: new Date().toISOString(),
    roomId: data.roomId,
    targetParticipantId: data.targetParticipantId,
    ...additionalInfo
});

const analyzeSDP = (sdp: RTCSessionDescriptionInit) => {
    const sdpString = sdp.sdp || '';
    const lines = sdpString.split('\n');
    const turnServers = extractTurnServersFromSdp(sdpString);
    const stunServers = extractStunServersFromSdp(sdpString);

    return {
        type: sdpString.includes('a=sendrecv') ? 'bidirectional' :
            sdpString.includes('a=sendonly') ? 'send-only' : 'receive-only',
        hasAudio: sdpString.includes('m=audio'),
        hasVideo: sdpString.includes('m=video'),
        iceServers: {
            turnServers,
            stunServers,
            hasCustomTurnServer: turnServers.some(server => server.includes('157.90.27.220'))
        },
        codecInfo: {
            audioCodecs: (sdpString.match(/a=rtpmap:\d+ [^\/]+/g) || [])
                .filter(line => line.includes('audio'))
                .map(line => line.split(' ')[1]),
            videoCodecs: (sdpString.match(/a=rtpmap:\d+ [^\/]+/g) || [])
                .filter(line => line.includes('video'))
                .map(line => line.split(' ')[1])
        },
        iceDetails: {
            hasIceUfrag: sdpString.includes('a=ice-ufrag'),
            hasIcePwd: sdpString.includes('a=ice-pwd'),
            iceUfragCount: (sdpString.match(/a=ice-ufrag/g) || []).length
        }
    };
};

const logIceCandidateDetails = (candidate: RTCIceCandidateInit) => {
    const candidateStr = candidate.candidate || '';
    const parts = candidateStr.split(' ');
    const isFromCustomTurn = candidateStr.includes('157.90.27.220');
    const candidateType = parts[7] || 'unknown';

    return {
        foundation: parts[0] || 'unknown',
        component: parts[1] || 'unknown',
        protocol: parts[2] || 'unknown',
        priority: parts[3] || 'unknown',
        address: parts[4] || 'unknown',
        port: parts[5] || 'unknown',
        type: candidateType,
        candidateLength: candidateStr.length,
        hasRelatedAddress: candidateStr.includes('raddr'),
        hasRelatedPort: candidateStr.includes('rport'),
        isFromCustomTurn,
        isRelay: candidateType === 'relay',
        isSrflx: candidateType === 'srflx',
        isHost: candidateType === 'host',
        networkInsight: {
            likelyTurnRelay: candidateType === 'relay' && isFromCustomTurn,
            likelyStunSrflx: candidateType === 'srflx' && isFromCustomTurn,
            publicStunCandidate: candidateType === 'srflx' && !isFromCustomTurn
        }
    };
};

const extractTurnServersFromSdp = (sdp: string): string[] => {
    const turnMatches = sdp.match(/a=candidate:[^\s]+ \d+ \w+ \d+ [^\s]+ \d+ typ relay/g) || [];
    return turnMatches.map(match => {
        const parts = match.split(' ');
        return parts[4] || 'unknown';
    }).filter((value, index, self) => self.indexOf(value) === index);
};

const extractStunServersFromSdp = (sdp: string): string[] => {
    const stunMatches = sdp.match(/a=candidate:[^\s]+ \d+ \w+ \d+ [^\s]+ \d+ typ srflx/g) || [];
    return stunMatches.map(match => {
        const parts = match.split(' ');
        return parts[4] || 'unknown';
    }).filter((value, index, self) => self.indexOf(value) === index);
};

// ================================
// WEBRTC OFFER HANDLER
// ================================

export const webrtcOfferHandler = createHandler(
    ['logger', 'metrics', 'roomManager', 'io'] as const,
    (logger, metrics, roomManager, io) =>
        async (socket: Socket, data: WebRTCOffer, callback: (response: any) => void) => {
            const startTime = Date.now();
            const sdpAnalysis = analyzeSDP(data.sdp);

            try {
                logger.info('🎯 [OFFER] Received WebRTC offer',
                    logWebRTCEvent('offer-received', socket, data, {
                        sdpDetails: sdpAnalysis,
                        processingStarted: new Date().toISOString(),
                        turnAnalysis: {
                            hasCustomTurn: sdpAnalysis.iceServers.hasCustomTurnServer,
                            turnServers: sdpAnalysis.iceServers.turnServers,
                            stunServers: sdpAnalysis.iceServers.stunServers
                        }
                    })
                );

                // Record metrics
                metrics.recordSocketEvent('webrtc-offer', 'inbound');

                const { roomId, targetParticipantId, sdp } = data;

                // Basic validation
                if (!roomId || !targetParticipantId || !sdp) {
                    const response: ErrorResponse = {
                        success: false,
                        error: 'Room ID, target participant ID, and SDP are required'
                    };
                    return callback(response);
                }

                // Validate that sender is in the room
                const senderRoomId = await roomManager.getRoomBySocketId(socket.id);
                if (senderRoomId !== roomId) {
                    metrics.recordError('webrtc', 'error', 'Offer from participant not in room');
                    logger.error('❌ [OFFER] Offer from participant not in room', {
                        socketId: socket.id,
                        senderRoomId,
                        requestedRoomId: roomId
                    });
                    const response: ErrorResponse = {
                        success: false,
                        error: 'You are not in this room'
                    };
                    return callback(response);
                }

                // Get room and validate target participant
                const room = await roomManager.getRoomById(roomId);
                if (!room) {
                    logger.error('❌ [OFFER] Room not found', { roomId, socketId: socket.id });
                    const response: ErrorResponse = {
                        success: false,
                        error: 'Room not found'
                    };
                    return callback(response);
                }

                // Check if target participant exists in room
                const targetParticipant = room.participants.find((p: any) => p.socketId === targetParticipantId);
                if (!targetParticipant) {
                    logger.error('❌ [OFFER] Target participant not in room', {
                        targetParticipantId,
                        roomId,
                        availableParticipants: room.participants.map((p: any) => p.socketId)
                    });
                    const response: ErrorResponse = {
                        success: false,
                        error: 'Target participant not in room'
                    };
                    return callback(response);
                }

                // Find target participant socket
                const targetSocket = io.sockets.sockets.get(targetParticipantId);
                if (!targetSocket) {
                    logger.error('❌ [OFFER] Target participant socket not found', {
                        targetParticipantId,
                        roomId,
                        availableSockets: Array.from(io.sockets.sockets.keys())
                    });
                    const response: ErrorResponse = {
                        success: false,
                        error: 'Target participant not connected'
                    };
                    return callback(response);
                }

                // Update room activity
                await roomManager.updateRoomActivity(roomId);

                // Forward the offer with enhanced logging
                const forwardedData = {
                    roomId,
                    targetParticipantId: socket.id, // Sender becomes the target for the response
                    sdp
                };

                logger.info('📤 [OFFER] Forwarding offer to target participant', {
                    from: socket.id,
                    to: targetParticipantId,
                    roomId,
                    sdpDetails: sdpAnalysis,
                    peerConnection: {
                        direction: `${socket.id} -> ${targetParticipantId}`,
                        mediaCapabilities: {
                            audio: sdpAnalysis.hasAudio,
                            video: sdpAnalysis.hasVideo
                        },
                        turnNegotiation: sdpAnalysis.iceServers.hasCustomTurnServer
                    }
                });

                targetSocket.emit('webrtc-offer', forwardedData);

                // Record metrics
                const processingTime = Date.now() - startTime;
                metrics.recordSocketEvent('webrtc-offer', 'outbound', processingTime);

                logger.success('✅ [OFFER] Offer forwarded successfully', {
                    from: socket.id,
                    to: targetParticipantId,
                    roomId,
                    processingTimeMs: processingTime,
                    nextPhase: 'awaiting-answer'
                });

                const response: { success: true } = { success: true };
                callback(response);

            } catch (error: any) {
                const err = error as Error;
                metrics.recordError('webrtc', 'error', err.message);
                logger.error('💥 [OFFER] Error handling WebRTC offer', {
                    socketId: socket.id,
                    error: err.message,
                    stack: err.stack,
                    processingTimeMs: Date.now() - startTime
                });

                const response: ErrorResponse = {
                    success: false,
                    error: 'Internal server error while handling WebRTC offer'
                };
                // Safe callback invocation
                if (callback && typeof callback === 'function') {
                    callback(response);
                }
            }
        }
);

// ================================
// WEBRTC ANSWER HANDLER
// ================================

export const webrtcAnswerHandler = createHandler(
    ['logger', 'metrics', 'roomManager', 'io'] as const,
    (logger, metrics, roomManager, io) =>
        async (socket: Socket, data: WebRTCAnswer, callback: (response: any) => void) => {
            const startTime = Date.now();
            const sdpAnalysis = analyzeSDP(data.sdp);

            try {
                logger.info('📞 [ANSWER] Received WebRTC answer',
                    logWebRTCEvent('answer-received', socket, data, {
                        sdpDetails: sdpAnalysis,
                        processingStarted: new Date().toISOString(),
                        turnAnalysis: {
                            hasCustomTurn: sdpAnalysis.iceServers.hasCustomTurnServer
                        }
                    })
                );

                // Record metrics
                metrics.recordSocketEvent('webrtc-answer', 'inbound');

                const { roomId, targetParticipantId, sdp } = data;

                // Basic validation
                if (!roomId || !targetParticipantId || !sdp) {
                    const response: ErrorResponse = {
                        success: false,
                        error: 'Room ID, target participant ID, and SDP are required'
                    };
                    return callback(response);
                }

                // Validate that sender is in the room
                const senderRoomId = await roomManager.getRoomBySocketId(socket.id);
                if (senderRoomId !== roomId) {
                    metrics.recordError('webrtc', 'error', 'Answer from participant not in room');
                    logger.error('❌ [ANSWER] Answer from participant not in room', {
                        socketId: socket.id,
                        senderRoomId,
                        requestedRoomId: roomId
                    });
                    const response: ErrorResponse = {
                        success: false,
                        error: 'You are not in this room'
                    };
                    return callback(response);
                }

                // Find target participant socket
                const targetSocket = io.sockets.sockets.get(targetParticipantId);
                if (!targetSocket) {
                    logger.error('❌ [ANSWER] Target participant not found', {
                        targetParticipantId,
                        roomId,
                        availableSockets: Array.from(io.sockets.sockets.keys()),
                        processingTimeMs: Date.now() - startTime
                    });
                    const response: ErrorResponse = {
                        success: false,
                        error: 'Target participant not found'
                    };
                    return callback(response);
                }

                // Update room activity
                await roomManager.updateRoomActivity(roomId);

                // Forward the answer
                const forwardedData = {
                    roomId,
                    targetParticipantId: socket.id, // Sender becomes the target
                    sdp
                };

                logger.info('📤 [ANSWER] Forwarding answer to original offer sender', {
                    from: socket.id,
                    to: targetParticipantId,
                    roomId,
                    sdpDetails: sdpAnalysis,
                    answerFlow: {
                        originalOfferSender: targetParticipantId,
                        answerSender: socket.id,
                        completing: 'offer-answer exchange'
                    }
                });

                targetSocket.emit('webrtc-answer', forwardedData);

                // Record metrics
                const processingTime = Date.now() - startTime;
                metrics.recordSocketEvent('webrtc-answer', 'outbound', processingTime);

                logger.success('✅ [ANSWER] Answer forwarded successfully', {
                    from: socket.id,
                    to: targetParticipantId,
                    roomId,
                    processingTimeMs: processingTime,
                    exchangeComplete: 'offer-answer handshake done',
                    nextPhase: 'ice-candidate-exchange'
                });

                const response: { success: true } = { success: true };
                callback(response);

            } catch (error: any) {
                const err = error as Error;
                metrics.recordError('webrtc', 'error', err.message);
                logger.error('💥 [ANSWER] Error handling WebRTC answer', {
                    socketId: socket.id,
                    error: err.message,
                    stack: err.stack,
                    processingTimeMs: Date.now() - startTime
                });

                const response: ErrorResponse = {
                    success: false,
                    error: 'Internal server error while handling WebRTC answer'
                };
                // Safe callback invocation
                if (callback && typeof callback === 'function') {
                    callback(response);
                }
            }
        }
);

// ================================
// WEBRTC ICE CANDIDATE HANDLER
// ================================

export const webrtcIceCandidateHandler = createHandler(
    ['logger', 'metrics', 'roomManager', 'io'] as const,
    (logger, metrics, roomManager, io) =>
        async (socket: Socket, data: WebRTCIceCandidate, callback?: (response: any) => void) => {
            const startTime = Date.now();
            const candidateAnalysis = logIceCandidateDetails(data.candidate);

            try {
                logger.info('🧊 [ICE] Received ICE candidate',
                    logWebRTCEvent('ice-candidate-received', socket, data, {
                        candidateDetails: candidateAnalysis,
                        processingStarted: new Date().toISOString(),
                        turnInsights: {
                            isFromCustomTurn: candidateAnalysis.isFromCustomTurn,
                            candidateType: candidateAnalysis.type,
                            isRelay: candidateAnalysis.isRelay,
                            networkType: candidateAnalysis.networkInsight
                        }
                    })
                );

                // Enhanced logging for TURN relay candidates
                if (candidateAnalysis.isRelay && candidateAnalysis.isFromCustomTurn) {
                    logger.success('🔄 [ICE] TURN relay candidate from custom server!', {
                        candidateType: candidateAnalysis.type,
                        address: candidateAnalysis.address,
                        port: candidateAnalysis.port,
                        turnServerWorking: true
                    });
                }

                // Record metrics
                metrics.recordSocketEvent('webrtc-ice-candidate', 'inbound');

                const { roomId, targetParticipantId, candidate } = data;

                // Basic validation
                if (!roomId || !targetParticipantId || !candidate) {
                    const response: ErrorResponse = {
                        success: false,
                        error: 'Room ID, target participant ID, and candidate are required'
                    };
                    return callback?.(response);
                }

                // Validate that sender is in the room
                const senderRoomId = await roomManager.getRoomBySocketId(socket.id);
                if (senderRoomId !== roomId) {
                    metrics.recordError('webrtc', 'error', 'ICE candidate from participant not in room');
                    logger.error('❌ [ICE] ICE candidate from participant not in room', {
                        socketId: socket.id,
                        senderRoomId,
                        requestedRoomId: roomId
                    });
                    const response: ErrorResponse = {
                        success: false,
                        error: 'You are not in this room'
                    };
                    return callback?.(response);
                }

                // Find target participant socket
                const targetSocket = io.sockets.sockets.get(targetParticipantId);
                if (!targetSocket) {
                    logger.warning('⚠️ [ICE] Target participant not found (normal during disconnection)', {
                        targetParticipantId,
                        roomId,
                        candidateType: candidateAnalysis.type,
                        processingTimeMs: Date.now() - startTime,
                        handling: 'graceful - participant may have disconnected'
                    });

                    // Don't treat this as an error since participants might disconnect during negotiation
                    const response: { success: true } = { success: true };
                    return callback?.(response);
                }

                // Update room activity
                await roomManager.updateRoomActivity(roomId);

                // Forward the ICE candidate
                const forwardedData = {
                    roomId,
                    targetParticipantId: socket.id, // Sender becomes the target
                    candidate
                };

                logger.info('📤 [ICE] Forwarding ICE candidate to target', {
                    from: socket.id,
                    to: targetParticipantId,
                    roomId,
                    candidateDetails: candidateAnalysis,
                    iceNegotiation: {
                        direction: `${socket.id} -> ${targetParticipantId}`,
                        candidateType: candidateAnalysis.type,
                        protocol: candidateAnalysis.protocol,
                        turnServerInvolved: candidateAnalysis.isFromCustomTurn
                    }
                });

                targetSocket.emit('webrtc-ice-candidate', forwardedData);

                // Record metrics
                const processingTime = Date.now() - startTime;
                metrics.recordSocketEvent('webrtc-ice-candidate', 'outbound', processingTime);

                logger.success('✅ [ICE] ICE candidate forwarded successfully', {
                    from: socket.id,
                    to: targetParticipantId,
                    roomId,
                    candidateType: candidateAnalysis.type,
                    processingTimeMs: processingTime,
                    networkInfo: {
                        protocol: candidateAnalysis.protocol,
                        address: candidateAnalysis.address !== 'unknown' ? 'present' : 'unknown',
                        port: candidateAnalysis.port,
                        turnRelay: candidateAnalysis.networkInsight.likelyTurnRelay,
                        customTurnUsed: candidateAnalysis.isFromCustomTurn
                    }
                });

                const response: { success: true } = { success: true };
                callback?.(response);

            } catch (error: any) {
                const err = error as Error;
                metrics.recordError('webrtc', 'error', err.message);
                logger.error('💥 [ICE] Error handling ICE candidate', {
                    socketId: socket.id,
                    error: err.message,
                    stack: err.stack,
                    processingTimeMs: Date.now() - startTime,
                    candidateDetails: candidateAnalysis
                });

                const response: ErrorResponse = {
                    success: false,
                    error: 'Internal server error while handling WebRTC ICE candidate'
                };
                // Safe callback invocation
                if (callback && typeof callback === 'function') {
                    callback(response);
                }
            }
        }
);

// ================================
// HANDLER REGISTRATION FUNCTION
// ================================

export function registerWebRTCHandlers(container: Container, context: SocketConnectionContext) {
    const logger = container.get<'logger'>('logger');

    logger.info('Registering WebRTC handlers', { socketId: context.connectionId });

    // Convert handlers to actual functions using the container
    const webrtcOffer = webrtcOfferHandler(container);
    const webrtcAnswer = webrtcAnswerHandler(container);
    const webrtcIceCandidate = webrtcIceCandidateHandler(container);

    // Register socket event listeners
    context.socket.on('webrtc-offer', webrtcOffer);
    context.socket.on('webrtc-answer', webrtcAnswer);
    context.socket.on('webrtc-ice-candidate', webrtcIceCandidate);

    logger.success('WebRTC handlers registered successfully', {
        socketId: context.connectionId,
        handlers: [
            'webrtc-offer',
            'webrtc-answer',
            'webrtc-ice-candidate'
        ]
    });

    // Return handlers for testing or cleanup
    return {
        webrtcOffer,
        webrtcAnswer,
        webrtcIceCandidate
    };
}