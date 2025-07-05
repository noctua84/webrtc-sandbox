import {Server, Socket} from "socket.io";
import {
    type ErrorResponse,
    RTCIceCandidateInit,
    RTCSessionDescriptionInit,
    WebRTCAnswer,
    WebRTCIceCandidate,
    WebRTCOffer
} from "../types";
import {RoomManager} from "../roomManager";
import {log} from "../logging";

// ============================================================================
// ENHANCED LOGGING UTILITIES
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
    return {
        type: sdp.type,
        sdpLength: sdp.sdp?.length || 0,
        hasVideo: sdp.sdp?.includes('m=video') || false,
        hasAudio: sdp.sdp?.includes('m=audio') || false,
        iceOptions: sdp.sdp?.includes('ice-options') || false,
        candidateCount: (sdp.sdp?.match(/a=candidate/g) || []).length
    };
};

const logIceCandidateDetails = (candidate: RTCIceCandidateInit) => {
    const candidateStr = candidate.candidate || '';
    const parts = candidateStr.split(' ');

    return {
        foundation: parts[0] || 'unknown',
        component: parts[1] || 'unknown',
        protocol: parts[2] || 'unknown',
        priority: parts[3] || 'unknown',
        address: parts[4] || 'unknown',
        port: parts[5] || 'unknown',
        type: parts[7] || 'unknown',
        candidateLength: candidateStr.length,
        hasRelatedAddress: candidateStr.includes('raddr'),
        hasRelatedPort: candidateStr.includes('rport')
    };
};

// ============================================================================
// ENHANCED WEBRTC OFFER HANDLER
// ============================================================================

export const handleWebRTCOffer = (
    socket: Socket,
    manager: RoomManager,
    io: Server,
    data: WebRTCOffer,
    callback: (response: any) => void
) => {
    const startTime = Date.now();

    log('info', '📨 [OFFER] Received WebRTC offer',
        logWebRTCEvent('offer-received', socket, data, {
            sdpDetails: logSdpDetails(data.sdp),
            processingStarted: new Date().toISOString()
        })
    );

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
            return callback(response);
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
            return callback(response);
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
            sdpDetails: logSdpDetails(sdp),
            forwardingData: {
                newTargetId: socket.id,
                originalSender: socket.id
            }
        });

        targetSocket.emit('webrtc-offer', forwardedData);

        log('success', '✅ [OFFER] Offer forwarded successfully', {
            from: socket.id,
            to: targetParticipantId,
            roomId,
            processingTimeMs: Date.now() - startTime,
            totalProcessingSteps: 4
        });

        const response: { success: true } = { success: true };
        callback(response);

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
        callback(response);
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
    callback: (response: any) => void
) => {
    const startTime = Date.now();

    log('info', '📨 [ANSWER] Received WebRTC answer',
        logWebRTCEvent('answer-received', socket, data, {
            sdpDetails: logSdpDetails(data.sdp),
            processingStarted: new Date().toISOString()
        })
    );

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
            return callback(response);
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
            return callback(response);
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
            sdpDetails: logSdpDetails(sdp),
            answerFlow: {
                originalOfferSender: targetParticipantId,
                answerSender: socket.id,
                completing: 'offer-answer exchange'
            }
        });

        targetSocket.emit('webrtc-answer', forwardedData);

        log('success', '✅ [ANSWER] Answer forwarded successfully', {
            from: socket.id,
            to: targetParticipantId,
            roomId,
            processingTimeMs: Date.now() - startTime,
            exchangeComplete: 'offer-answer handshake done'
        });

        const response: { success: true } = { success: true };
        callback(response);

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
        callback(response);
    }
};

// ============================================================================
// ENHANCED ICE CANDIDATE HANDLER
// ============================================================================

export const handleWebRTCIceCandidate = (
    socket: Socket,
    manager: RoomManager,
    io: Server,
    data: WebRTCIceCandidate,
    callback: (response: any) => void
) => {
    const startTime = Date.now();

    log('info', '🧊 [ICE] Received ICE candidate',
        logWebRTCEvent('ice-candidate-received', socket, data, {
            candidateDetails: logIceCandidateDetails(data.candidate),
            processingStarted: new Date().toISOString()
        })
    );

    try {
        const { roomId, targetParticipantId, candidate } = data;

        // Validate sender is in the room
        const senderRoomId = manager.getRoomBySocketId(socket.id);

        log('info', '🔍 [ICE] Validating sender room membership', {
            socketId: socket.id,
            senderRoomId,
            requestedRoomId: roomId,
            isValid: senderRoomId === roomId,
            candidateType: logIceCandidateDetails(candidate).type
        });

        if (senderRoomId !== roomId) {
            log('error', '❌ [ICE] Sender not in requested room', {
                socketId: socket.id,
                senderRoomId,
                requestedRoomId: roomId,
                candidateType: logIceCandidateDetails(candidate).type,
                processingTimeMs: Date.now() - startTime
            });

            const response: ErrorResponse = {
                success: false,
                error: 'You are not in this room'
            };
            return callback(response);
        }

        // Find target participant socket
        const targetSocket = io.sockets.sockets.get(targetParticipantId);

        log('info', '🎯 [ICE] Looking for target participant', {
            targetParticipantId,
            roomId,
            targetFound: !!targetSocket,
            candidateDetails: logIceCandidateDetails(candidate)
        });

        if (!targetSocket) {
            log('warning', '⚠️ [ICE] Target participant not found (normal during disconnection)', {
                targetParticipantId,
                roomId,
                candidateType: logIceCandidateDetails(candidate).type,
                processingTimeMs: Date.now() - startTime,
                handling: 'graceful - participant may have disconnected'
            });

            // Don't treat this as an error since participants might disconnect during negotiation
            const response: { success: true } = { success: true };
            return callback(response);
        }

        // Forward the ICE candidate with enhanced logging
        const forwardedData = {
            roomId,
            targetParticipantId: socket.id, // Sender becomes the target
            candidate
        };

        const candidateDetails = logIceCandidateDetails(candidate);

        log('info', '📤 [ICE] Forwarding ICE candidate to target', {
            from: socket.id,
            to: targetParticipantId,
            roomId,
            candidateDetails,
            iceNegotiation: {
                direction: `${socket.id} -> ${targetParticipantId}`,
                candidateType: candidateDetails.type,
                protocol: candidateDetails.protocol
            }
        });

        targetSocket.emit('webrtc-ice-candidate', forwardedData);

        log('success', '✅ [ICE] ICE candidate forwarded successfully', {
            from: socket.id,
            to: targetParticipantId,
            roomId,
            candidateType: candidateDetails.type,
            processingTimeMs: Date.now() - startTime,
            networkInfo: {
                protocol: candidateDetails.protocol,
                address: candidateDetails.address !== 'unknown' ? 'present' : 'unknown',
                port: candidateDetails.port
            }
        });

        const response: { success: true } = { success: true };
        callback(response);

    } catch (error) {
        const err = error as Error;
        log('error', '💥 [ICE] Error handling ICE candidate', {
            socketId: socket.id,
            error: err.message,
            stack: err.stack,
            processingTimeMs: Date.now() - startTime,
            candidateDetails: logIceCandidateDetails(data.candidate),
            requestData: {
                roomId: data.roomId,
                targetParticipantId: data.targetParticipantId
            }
        });

        const response: ErrorResponse = {
            success: false,
            error: 'Internal server error while handling WebRTC ICE candidate'
        };
        callback(response);
    }
};