import {Server, Socket} from "socket.io";
import {type ErrorResponse, WebRTCAnswer, WebRTCIceCandidate, WebRTCOffer} from "../types";
import {RoomManager} from "../roomManager";
import {log} from "../logging";

export const handleWebRTCOffer = (socket: Socket, manager: RoomManager, io: Server, data: WebRTCOffer, callback: (response: any) => void) => {
    log('info', `Received WebRTC offer`, {
        socketId: socket.id,
        roomId: data.roomId,
        targetParticipantId: data.targetParticipantId
    });

    try {
        const { roomId, targetParticipantId, sdp } = data;

        // Validate that sender is in the room
        const senderRoomId = manager.getRoomBySocketId(socket.id);
        if (senderRoomId !== roomId) {
            log('error', `WebRTC offer from participant not in room`, {
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

        // Forward offer to target participant
        const targetSocket = io.sockets.sockets.get(targetParticipantId);
        if (!targetSocket) {
            log('error', `Target participant not found for WebRTC offer`, {
                targetParticipantId,
                roomId
            });
            const response: ErrorResponse = {
                success: false,
                error: 'Target participant not found'
            };
            return callback(response);
        }

        // Forward the offer
        targetSocket.emit('webrtc-offer', {
            roomId,
            targetParticipantId: socket.id, // Sender becomes the target for response
            sdp
        });

        log('success', `WebRTC offer forwarded`, {
            from: socket.id,
            to: targetParticipantId,
            roomId
        });

        const response: { success: true } = { success: true };
        callback(response);

    } catch (error) {
        const err = error as Error;
        log('error', `Error handling WebRTC offer`, {
            socketId: socket.id,
            error: err.message,
            stack: err.stack
        });

        const response: ErrorResponse = {
            success: false,
            error: 'Internal server error while handling WebRTC offer'
        };
        callback(response);
    }
}

export const handleWebRTCAnswer = (socket: Socket, manager: RoomManager, io: Server, data: WebRTCAnswer, callback: (response: any) => void) => {
    log('info', `Received WebRTC answer`, {
        socketId: socket.id,
        roomId: data.roomId,
        targetParticipantId: data.targetParticipantId
    });

    try {
        const { roomId, targetParticipantId, sdp } = data;

        // Validate that sender is in the room
        const senderRoomId = manager.getRoomBySocketId(socket.id);
        if (senderRoomId !== roomId) {
            log('error', `WebRTC answer from participant not in room`, {
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

        // Forward answer to target participant
        const targetSocket = io.sockets.sockets.get(targetParticipantId);
        if (!targetSocket) {
            log('error', `Target participant not found for WebRTC answer`, {
                targetParticipantId,
                roomId
            });
            const response: ErrorResponse = {
                success: false,
                error: 'Target participant not found'
            };
            return callback(response);
        }

        // Forward the answer
        targetSocket.emit('webrtc-answer', {
            roomId,
            targetParticipantId: socket.id, // Sender becomes the target
            sdp
        });

        log('success', `WebRTC answer forwarded`, {
            from: socket.id,
            to: targetParticipantId,
            roomId
        });

        const response: { success: true } = { success: true };
        callback(response);

    } catch (error) {
        const err = error as Error;
        log('error', `Error handling WebRTC answer`, {
            socketId: socket.id,
            error: err.message,
            stack: err.stack
        });

        const response: ErrorResponse = {
            success: false,
            error: 'Internal server error while handling WebRTC answer'
        };
        callback(response);
    }
}

export const handleWebRTCIceCandidate = (socket: Socket, manager: RoomManager, io: Server, data: WebRTCIceCandidate, callback: (response: any) => void) => {
    log('info', `Received WebRTC ICE candidate`, {
        socketId: socket.id,
        roomId: data.roomId,
        targetParticipantId: data.targetParticipantId,
        candidateType: data.candidate.candidate?.split(' ')[7] // Extract candidate type for logging
    });

    try {
        const { roomId, targetParticipantId, candidate } = data;

        // Validate that sender is in the room
        const senderRoomId = manager.getRoomBySocketId(socket.id);
        if (senderRoomId !== roomId) {
            log('error', `WebRTC ICE candidate from participant not in room`, {
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

        // Forward ICE candidate to target participant
        const targetSocket = io.sockets.sockets.get(targetParticipantId);
        if (!targetSocket) {
            log('warning', `Target participant not found for ICE candidate`, {
                targetParticipantId,
                roomId
            });
            // Don't treat this as an error since participants might disconnect during negotiation
            const response: { success: true } = { success: true };
            return callback(response);
        }

        // Forward the ICE candidate
        targetSocket.emit('webrtc-ice-candidate', {
            roomId,
            targetParticipantId: socket.id, // Sender becomes the target
            candidate
        });

        log('success', `WebRTC ICE candidate forwarded`, {
            from: socket.id,
            to: targetParticipantId,
            roomId,
            candidateType: candidate.candidate?.split(' ')[7]
        });

        const response: { success: true } = { success: true };
        callback(response);

    } catch (error) {
        const err = error as Error;
        log('error', `Error handling WebRTC ICE candidate`, {
            socketId: socket.id,
            error: err.message,
            stack: err.stack
        });

        const response: ErrorResponse = {
            success: false,
            error: 'Internal server error while handling WebRTC ICE candidate'
        };
        callback(response);
    }
}