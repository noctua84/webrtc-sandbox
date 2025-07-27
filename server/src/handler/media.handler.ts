import { Socket } from "socket.io";
import { Container } from "../di/container";
import { createHandler } from "../di/helpers";
import { MediaStatusUpdate, ErrorResponse, RoomUpdateEvent } from "../types/webrtc.types";
import { SocketConnectionContext } from "../types/socket.types";
import {RoomParticipant} from "../types/room.types";

/**
 * Media Handler with DI Integration
 * Handles media status updates (video/audio/screen sharing)
 * Follows the established createHandler pattern
 */

// ================================
// UPDATE MEDIA STATUS HANDLER
// ================================

export const updateMediaStatusHandler = createHandler(
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

                // Note: Media status is not stored in database (as per schema comment)
                // It's kept in memory/Redis for performance
                // We just need to validate the participant exists and broadcast the update

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

                // Create participant object with media status for broadcasting
                const participantWithMedia: RoomParticipant = {
                    socketId: participant.socketId,
                    userName: participant.userName,
                    isCreator: participant.isCreator,
                    joinedAt: participant.joinedAt.toISOString(),
                    lastSeen: participant.lastSeen.toISOString(),
                    reconnectionToken: participant.reconnectionToken!,
                    mediaStatus: {
                        hasVideo,
                        hasAudio,
                        isScreenSharing
                    },
                    roomId: "",
                    id: ""
                };

                // Broadcast media status change to other participants
                const updateEvent: RoomUpdateEvent = {
                    roomId,
                    participants: roomManager.participantsToArray(room.participants).map((p: any) =>
                        p.socketId === socket.id
                            ? { ...p, mediaStatus: { hasVideo, hasAudio, isScreenSharing } }
                            : p
                    ),
                    event: 'media-status-changed',
                    participant: participantWithMedia
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
                callback(response);
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