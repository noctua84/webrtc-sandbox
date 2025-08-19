import { Socket } from "socket.io";
import { Container } from "../di";
import { MediaStatusUpdate, ErrorResponse, RoomUpdateEvent } from "../types/webrtc.types";
import { SocketConnectionContext } from "../types/socket.types";
import {RoomParticipant} from "../types/room.types";
import {createSocketHandler} from "../di/helpers";

/**
 * Media Handler with DI Integration
 * Handles media status updates (video/audio/screen sharing)
 * Follows the established createHandler pattern
 */

// ================================
// UPDATE MEDIA STATUS HANDLER
// ================================

export const updateMediaStatusHandler = createSocketHandler(
    ['logger', 'metrics', 'roomManager', 'io'] as const,
    (logger, metrics, roomManager, io) =>
        async (socket: Socket, data: MediaStatusUpdate, callback: (response: any) => void) => {
            const startTime = Date.now();

            try {
                logger.info('Received media status update', {
                    socketId: socket.id,
                    roomId: data.roomId,
                    mediaStatus: {
                        hasVideo: data.hasVideo,
                        hasAudio: data.hasAudio,
                        isScreenSharing: data.isScreenSharing
                    }
                });

                // Record metrics
                metrics.recordSocketEvent('update-media-status', 'inbound');

                const { roomId, hasVideo, hasAudio, isScreenSharing } = data;

                // Basic validation
                if (!roomId) {
                    const response: ErrorResponse = {
                        success: false,
                        error: 'Room ID is required'
                    };
                    return callback(response);
                }

                // Validate that sender is in the room
                const senderRoomId = await roomManager.getRoomBySocketId(socket.id);
                if (senderRoomId !== roomId) {
                    metrics.recordError('media', 'error', 'Media status update from participant not in room');
                    logger.error('Media status update from participant not in room', {
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

                // Get room from database
                const room = await roomManager.getRoomById(roomId);
                if (!room) {
                    logger.error('Room not found for media status update', {
                        roomId,
                        socketId: socket.id
                    });
                    const response: ErrorResponse = {
                        success: false,
                        error: 'Room not found'
                    };
                    return callback(response);
                }

                // Find participant in room
                const participant = room.participants.find((p: any) => p.socketId === socket.id);
                if (!participant) {
                    logger.error('Participant not found in room for media status update', {
                        socketId: socket.id,
                        roomId
                    });
                    const response: ErrorResponse = {
                        success: false,
                        error: 'Participant not found in room'
                    };
                    return callback(response);
                }

                // Update room activity
                await roomManager.updateRoomActivity(roomId);

                // Create participant with media status - use correct creator check
                const participantWithMedia: RoomParticipant = {
                    ...participant, // Spread all Participant fields
                    mediaStatus: {
                        hasVideo,
                        hasAudio,
                        isScreenSharing
                    }
                };

                // Create all participants array with updated media status
                const allParticipants: RoomParticipant[] = room.participants.map((p: any) => {
                    const isCurrentParticipant = p.socketId === socket.id;
                    return {
                        ...p, // Spread all Participant fields
                        mediaStatus: isCurrentParticipant ? {
                            hasVideo,
                            hasAudio,
                            isScreenSharing
                        } : {
                            hasVideo: false,
                            hasAudio: false,
                            isScreenSharing: false
                        }
                    };
                });

                // Broadcast media status change to other participants
                const updateEvent: RoomUpdateEvent = {
                    roomId,
                    participants: allParticipants.map(p => ({
                        id: p.id,
                        socketId: p.socketId!,
                        userName: p.userName,
                        userEmail: p.userEmail,
                        extUserId: p.extUserId,
                        isCreator: p.id === room.creatorId, // Correct creator check using room.creatorId
                        joinedAt: p.joinedAt?.toISOString() || new Date().toISOString(),
                        lastSeen: p.lastSeen?.toISOString() || new Date().toISOString(),
                        reconnectionToken: p.reconnectionToken!,
                        roomId: roomId,
                        mediaStatus: p.mediaStatus
                    })),
                    event: 'media-status-changed',
                    participant: {
                        id: participant.id,
                        socketId: participant.socketId!,
                        userName: participant.userName,
                        userEmail: participant.userEmail,
                        extUserId: participant.extUserId,
                        isCreator: participant.id === room.creatorId, // Correct creator check
                        joinedAt: participant.joinedAt?.toISOString() || new Date().toISOString(),
                        lastSeen: participant.lastSeen?.toISOString() || new Date().toISOString(),
                        reconnectionToken: participant.reconnectionToken!,
                        roomId: roomId,
                        mediaStatus: {
                            hasVideo,
                            hasAudio,
                            isScreenSharing
                        }
                    }
                };

                socket.to(roomId).emit('room-updated', updateEvent);

                // Record metrics
                const processingTime = Date.now() - startTime;
                metrics.recordSocketEvent('update-media-status', 'outbound', processingTime);

                // Record media metrics
                if (hasVideo) metrics.recordMediaEvent('video', 'enable');
                else metrics.recordMediaEvent('video', 'disable');

                if (hasAudio) metrics.recordMediaEvent('audio', 'enable');
                else metrics.recordMediaEvent('audio', 'disable');

                if (isScreenSharing) metrics.recordMediaEvent('screen', 'enable');
                else metrics.recordMediaEvent('screen', 'disable');

                logger.success('Media status updated and broadcasted', {
                    socketId: socket.id,
                    roomId,
                    mediaStatus: { hasVideo, hasAudio, isScreenSharing },
                    participantCount: room.participants.length,
                    processingTime
                });

                const response: { success: true } = { success: true };
                callback(response);

            } catch (error: any) {
                const err = error as Error;
                metrics.recordError('media', 'error', err.message);
                logger.error('Error handling media status update', {
                    socketId: socket.id,
                    error: err.message,
                    stack: err.stack
                });

                const response: ErrorResponse = {
                    success: false,
                    error: 'Internal server error while updating media status'
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

export function registerMediaHandlers(container: Container, context: SocketConnectionContext) {
    const logger = container.get<'logger'>('logger');

    logger.info('Registering media handlers', { socketId: context.connectionId });

    // Convert handler to actual function using the container
    const updateMediaStatus = updateMediaStatusHandler(container);

    // Register socket event listeners
    context.socket.on('update-media-status', updateMediaStatus);

    logger.success('Media handlers registered successfully', {
        socketId: context.connectionId,
        handlers: ['update-media-status']
    });

    // Return handlers for testing or cleanup
    return {
        updateMediaStatus
    };
}