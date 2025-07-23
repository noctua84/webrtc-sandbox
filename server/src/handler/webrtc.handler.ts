import {Server, Socket} from "socket.io";
import {
    type ErrorResponse,
    RTCIceCandidateInit,
    RTCSessionDescriptionInit,
    WebRTCAnswer,
    WebRTCIceCandidate,
    WebRTCOffer
} from "../types/webrtc.types";
import {RoomManager} from "../room/manager";
import {log} from "../logging";

// ============================================================================
// ENHANCED LOGGING UTILITIES WITH TURN ANALYSIS
// ============================================================================

const logWebRTCEvent = (eventType: string, socket: Socket, data: any, additional?: any) => {
    const baseInfo = {
        eventType,
        socketId: socket.id,
        timestamp: new Date().toISOString(),
        roomId: data.roomId,
        targetParticipantId: data.targetParticipantId
    };

    return { ...baseInfo, ...additional };
};

const logSdpDetails = (sdp: RTCSessionDescriptionInit) => {
    const sdpText = sdp.sdp || '';

    // Analyze SDP for TURN server references
    const turnServers = extractTurnServersFromSdp(sdpText);
    const stunServers = extractStunServersFromSdp(sdpText);

    return {
        type: sdp.type,
        sdpLength: sdpText.length,
        hasVideo: sdpText.includes('m=video'),
        hasAudio: sdpText.includes('m=audio'),
        iceOptions: sdpText.includes('ice-options'),
        candidateCount: (sdpText.match(/a=candidate/g) || []).length,
        bundlePolicy: sdpText.includes('a=group:BUNDLE'),
        rtcpMux: sdpText.includes('a=rtcp-mux'),
        // TURN/STUN analysis
        turnServerCount: turnServers.length,
        stunServerCount: stunServers.length,
        hasCustomTurnServer: turnServers.some(server => server.includes('157.90.27.220')),
        iceCredentials: {
            hasIceUfrag: sdpText.includes('a=ice-ufrag'),
            hasIcePwd: sdpText.includes('a=ice-pwd'),
            iceUfragCount: (sdpText.match(/a=ice-ufrag/g) || []).length
        }
    };
};

const logIceCandidateDetails = (candidate: RTCIceCandidateInit) => {
    const candidateStr = candidate.candidate || '';
    const parts = candidateStr.split(' ');

    // Detect if this is from our TURN server
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
        // TURN server analysis
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

// Helper functions for SDP analysis
const extractTurnServersFromSdp = (sdp: string): string[] => {
    const turnMatches = sdp.match(/a=candidate:[^\s]+ \d+ \w+ \d+ [^\s]+ \d+ typ relay/g) || [];
    return turnMatches.map(match => {
        const parts = match.split(' ');
        return parts[4] || 'unknown'; // Extract IP address
    }).filter((value, index, self) => self.indexOf(value) === index); // Remove duplicates
};

const extractStunServersFromSdp = (sdp: string): string[] => {
    const stunMatches = sdp.match(/a=candidate:[^\s]+ \d+ \w+ \d+ [^\s]+ \d+ typ srflx/g) || [];
    return stunMatches.map(match => {
        const parts = match.split(' ');
        return parts[4] || 'unknown'; // Extract IP address
    }).filter((value, index, self) => self.indexOf(value) === index); // Remove duplicates
};

// ============================================================================
// ENHANCED WEBRTC OFFER HANDLER
// ============================================================================

export const handleWebRTCOffer = (
    socket: Socket,
    manager: RoomManager,
    io: Server,
    data: WebRTCOffer,
    callback?: (response: any) => void
) => {
    const startTime = Date.now();
    const sdpAnalysis = logSdpDetails(data.sdp);

    log('info', '📨 [OFFER] Received WebRTC offer',
        logWebRTCEvent('offer-received', socket, data, {
            sdpDetails: sdpAnalysis,
            processingStarted: new Date().toISOString(),
            turnAnalysis: {
                hasCustomTurnCandidates: sdpAnalysis.hasCustomTurnServer,
                totalCandidates: sdpAnalysis.candidateCount,
                mediaTypes: {
                    video: sdpAnalysis.hasVideo,
                    audio: sdpAnalysis.hasAudio
                }
            }
        })
    );

    // Log TURN server usage insights
    if (sdpAnalysis.hasCustomTurnServer) {
        log('success', '🔄 [OFFER] Custom TURN server detected in offer', {
            socketId: socket.id,
            roomId: data.roomId,
            turnServerCount: sdpAnalysis.turnServerCount,
            stunServerCount: sdpAnalysis.stunServerCount
        });
    } else {
        log('warning', '⚠️ [OFFER] No custom TURN server detected in offer', {
            socketId: socket.id,
            roomId: data.roomId,
            candidateCount: sdpAnalysis.candidateCount,
            suggestion: 'Client may be using fallback STUN servers only'
        });
    }

    try {
        const { roomId, targetParticipantId, sdp } = data;

        // Validate sender is in the room
        const senderRoomId = manager.getRoomBySocketId(socket.id);

        log('info', '🔍 [OFFER] Validating sender room membership', {
            socketId: socket.id,
            senderRoomId,
            requestedRoomId: roomId,
            isValid: senderRoomId === roomId
        });

        if (senderRoomId !== roomId) {
            log('error', '❌ [OFFER] Sender not in requested room', {
                socketId: socket.id,
                senderRoomId,
                requestedRoomId: roomId,
                processingTimeMs: Date.now() - startTime
            });

            const response: ErrorResponse = {
                success: false,
                error: 'You are not in this room'
            };
            return callback?.(response);
        }

        // Find target participant socket
        const targetSocket = io.sockets.sockets.get(targetParticipantId);

        log('info', '🎯 [OFFER] Looking for target participant', {
            targetParticipantId,
            roomId,
            targetFound: !!targetSocket,
            connectedSockets: io.sockets.sockets.size
        });

        if (!targetSocket) {
            log('error', '❌ [OFFER] Target participant not found', {
                targetParticipantId,
                roomId,
                availableSockets: Array.from(io.sockets.sockets.keys()),
                processingTimeMs: Date.now() - startTime
            });

            const response: ErrorResponse = {
                success: false,
                error: 'Target participant not found'
            };
            return callback?.(response);
        }

        // Forward the offer with enhanced logging
        const forwardedData = {
            roomId,
            targetParticipantId: socket.id, // Sender becomes the target for response
            sdp
        };

        log('info', '📤 [OFFER] Forwarding offer to target', {
            from: socket.id,
            to: targetParticipantId,
            roomId,
            sdpDetails: sdpAnalysis,
            forwardingData: {
                newTargetId: socket.id,
                originalSender: socket.id
            },
            connectionContext: {
                hasCustomTurn: sdpAnalysis.hasCustomTurnServer,
                candidateTypes: `${sdpAnalysis.candidateCount} candidates`
            }
        });

        targetSocket.emit('webrtc-offer', forwardedData);

        log('success', '✅ [OFFER] Offer forwarded successfully', {
            from: socket.id,
            to: targetParticipantId,
            roomId,
            processingTimeMs: Date.now() - startTime,
            totalProcessingSteps: 4,
            turnServerStatus: sdpAnalysis.hasCustomTurnServer ? 'custom-turn-present' : 'fallback-only'
        });

        const response: { success: true } = { success: true };
        callback?.(response);

    } catch (error) {
        const err = error as Error;
        log('error', '💥 [OFFER] Error handling WebRTC offer', {
            socketId: socket.id,
            error: err.message,
            stack: err.stack,
            processingTimeMs: Date.now() - startTime,
            requestData: {
                roomId: data.roomId,
                targetParticipantId: data.targetParticipantId
            }
        });

        const response: ErrorResponse = {
            success: false,
            error: 'Internal server error while handling WebRTC offer'
        };
        callback?.(response);
    }
};

// ============================================================================
// ENHANCED WEBRTC ANSWER HANDLER
// ============================================================================

export const handleWebRTCAnswer = (
    socket: Socket,
    manager: RoomManager,
    io: Server,
    data: WebRTCAnswer,
    callback?: (response: any) => void
) => {
    const startTime = Date.now();
    const sdpAnalysis = logSdpDetails(data.sdp);

    log('info', '📨 [ANSWER] Received WebRTC answer',
        logWebRTCEvent('answer-received', socket, data, {
            sdpDetails: sdpAnalysis,
            processingStarted: new Date().toISOString(),
            answerAnalysis: {
                hasCustomTurnCandidates: sdpAnalysis.hasCustomTurnServer,
                candidateCount: sdpAnalysis.candidateCount,
                completingNegotiation: true
            }
        })
    );

    // Log TURN server usage in answer
    if (sdpAnalysis.hasCustomTurnServer) {
        log('success', '🔄 [ANSWER] Custom TURN server detected in answer', {
            socketId: socket.id,
            roomId: data.roomId,
            turnServerCount: sdpAnalysis.turnServerCount,
            negotiationPhase: 'answer-with-custom-turn'
        });
    }

    try {
        const { roomId, targetParticipantId, sdp } = data;

        // Validate sender is in the room
        const senderRoomId = manager.getRoomBySocketId(socket.id);

        log('info', '🔍 [ANSWER] Validating sender room membership', {
            socketId: socket.id,
            senderRoomId,
            requestedRoomId: roomId,
            isValid: senderRoomId === roomId
        });

        if (senderRoomId !== roomId) {
            log('error', '❌ [ANSWER] Sender not in requested room', {
                socketId: socket.id,
                senderRoomId,
                requestedRoomId: roomId,
                processingTimeMs: Date.now() - startTime
            });

            const response: ErrorResponse = {
                success: false,
                error: 'You are not in this room'
            };
            return callback?.(response);
        }

        // Find target participant socket
        const targetSocket = io.sockets.sockets.get(targetParticipantId);

        log('info', '🎯 [ANSWER] Looking for target participant', {
            targetParticipantId,
            roomId,
            targetFound: !!targetSocket,
            originalOfferSender: targetParticipantId
        });

        if (!targetSocket) {
            log('error', '❌ [ANSWER] Target participant not found', {
                targetParticipantId,
                roomId,
                availableSockets: Array.from(io.sockets.sockets.keys()),
                processingTimeMs: Date.now() - startTime
            });

            const response: ErrorResponse = {
                success: false,
                error: 'Target participant not found'
            };
            return callback?.(response);
        }

        // Forward the answer with enhanced logging
        const forwardedData = {
            roomId,
            targetParticipantId: socket.id, // Sender becomes the target
            sdp
        };

        log('info', '📤 [ANSWER] Forwarding answer to original offer sender', {
            from: socket.id,
            to: targetParticipantId,
            roomId,
            sdpDetails: sdpAnalysis,
            answerFlow: {
                originalOfferSender: targetParticipantId,
                answerSender: socket.id,
                completing: 'offer-answer exchange'
            },
            turnNegotiation: {
                bothSidesHaveTurn: 'to-be-determined-during-ice',
                answerHasTurn: sdpAnalysis.hasCustomTurnServer
            }
        });

        targetSocket.emit('webrtc-answer', forwardedData);

        log('success', '✅ [ANSWER] Answer forwarded successfully', {
            from: socket.id,
            to: targetParticipantId,
            roomId,
            processingTimeMs: Date.now() - startTime,
            exchangeComplete: 'offer-answer handshake done',
            nextPhase: 'ice-candidate-exchange'
        });

        const response: { success: true } = { success: true };
        callback?.(response);

    } catch (error) {
        const err = error as Error;
        log('error', '💥 [ANSWER] Error handling WebRTC answer', {
            socketId: socket.id,
            error: err.message,
            stack: err.stack,
            processingTimeMs: Date.now() - startTime,
            requestData: {
                roomId: data.roomId,
                targetParticipantId: data.targetParticipantId
            }
        });

        const response: ErrorResponse = {
            success: false,
            error: 'Internal server error while handling WebRTC answer'
        };
        callback?.(response);
    }
};

// ============================================================================
// ENHANCED ICE CANDIDATE HANDLER WITH TURN ANALYSIS
// ============================================================================

export const handleWebRTCIceCandidate = (
    socket: Socket,
    manager: RoomManager,
    io: Server,
    data: WebRTCIceCandidate,
    callback?: (response: any) => void
) => {
    const startTime = Date.now();
    const candidateAnalysis = logIceCandidateDetails(data.candidate);

    log('info', '🧊 [ICE] Received ICE candidate',
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
        log('success', '🔄 [ICE] TURN relay candidate from custom server!', {
            socketId: socket.id,
            roomId: data.roomId,
            targetParticipantId: data.targetParticipantId,
            relayAddress: candidateAnalysis.address,
            relayPort: candidateAnalysis.port,
            significance: 'NAT traversal via custom TURN server'
        });
    } else if (candidateAnalysis.isRelay) {
        log('info', '🔄 [ICE] TURN relay candidate from external server', {
            socketId: socket.id,
            candidateType: candidateAnalysis.type,
            address: candidateAnalysis.address
        });
    } else if (candidateAnalysis.isSrflx && candidateAnalysis.isFromCustomTurn) {
        log('success', '🌐 [ICE] STUN reflexive candidate from custom server', {
            socketId: socket.id,
            roomId: data.roomId,
            candidateType: candidateAnalysis.type,
            publicAddress: candidateAnalysis.address
        });
    } else if (candidateAnalysis.isHost) {
        log('info', '🏠 [ICE] Host candidate (local network)', {
            socketId: socket.id,
            candidateType: candidateAnalysis.type,
            localAddress: candidateAnalysis.address
        });
    }

    try {
        const { roomId, targetParticipantId, candidate } = data;

        // Validate sender is in the room
        const senderRoomId = manager.getRoomBySocketId(socket.id);

        log('info', '🔍 [ICE] Validating sender room membership', {
            socketId: socket.id,
            senderRoomId,
            requestedRoomId: roomId,
            isValid: senderRoomId === roomId,
            candidateType: candidateAnalysis.type
        });

        if (senderRoomId !== roomId) {
            log('error', '❌ [ICE] Sender not in requested room', {
                socketId: socket.id,
                senderRoomId,
                requestedRoomId: roomId,
                candidateType: candidateAnalysis.type,
                processingTimeMs: Date.now() - startTime
            });

            const response: ErrorResponse = {
                success: false,
                error: 'You are not in this room'
            };
            return callback?.(response);
        }

        // Find target participant socket
        const targetSocket = io.sockets.sockets.get(targetParticipantId);

        log('info', '🎯 [ICE] Looking for target participant', {
            targetParticipantId,
            roomId,
            targetFound: !!targetSocket,
            candidateDetails: candidateAnalysis
        });

        if (!targetSocket) {
            log('warning', '⚠️ [ICE] Target participant not found (normal during disconnection)', {
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

        // Forward the ICE candidate with enhanced logging
        const forwardedData = {
            roomId,
            targetParticipantId: socket.id, // Sender becomes the target
            candidate
        };

        log('info', '📤 [ICE] Forwarding ICE candidate to target', {
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

        log('success', '✅ [ICE] ICE candidate forwarded successfully', {
            from: socket.id,
            to: targetParticipantId,
            roomId,
            candidateType: candidateAnalysis.type,
            processingTimeMs: Date.now() - startTime,
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

    } catch (error) {
        const err = error as Error;
        log('error', '💥 [ICE] Error handling ICE candidate', {
            socketId: socket.id,
            error: err.message,
            stack: err.stack,
            processingTimeMs: Date.now() - startTime,
            candidateDetails: candidateAnalysis,
            requestData: {
                roomId: data.roomId,
                targetParticipantId: data.targetParticipantId
            }
        });

        const response: ErrorResponse = {
            success: false,
            error: 'Internal server error while handling WebRTC ICE candidate'
        };
        callback?.(response);
    }
};