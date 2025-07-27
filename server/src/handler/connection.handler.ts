import { Socket } from 'socket.io';
import { Container } from '../di';

/**
 * Enhanced Disconnect Handler with Prisma Integration
 * Follows the exact same pattern as the existing connection.handler.ts
 * Does NOT use createHandler since disconnect events have a specific Socket.IO signature
 */

export const handleDisconnect = async (
    socket: Socket,
    container: Container,
    reason: string
) => {
    // Get services from container
    const logger = container.get<'logger'>('logger');
    const metrics = container.get<'metrics'>('metrics');
    const roomManager = container.get<'roomManager'>('roomManager');
    const chatManager = container.get<'chatManager'>('chatManager');
    const io = container.get<'io'>('io');

    const sessionDuration = Date.now() - (socket.data?.connectionTime?.getTime() || Date.now());

    logger.info('Socket disconnecting', {
        socketId: socket.id,
        reason,
        sessionDuration,
        timestamp: new Date().toISOString()
    });

    // Record disconnection metrics
    metrics.recordSocketConnection(false);

    try {
        // Get current room for this socket
        const roomId = await roomManager.getRoomBySocketId(socket.id);

        if (roomId) {
            logger.info('Broadcasting peer disconnection for WebRTC cleanup', {
                socketId: socket.id,
                roomId
            });

            // Broadcast to other participants for WebRTC cleanup
            socket.to(roomId).emit('peer-disconnected', {
                roomId,
                participantId: socket.id
            });

            // Get room data before removing participant
            const roomBefore = await roomManager.getRoomById(roomId);
            const participantCountBefore = roomBefore?.participants.length || 0;

            // Remove participant from room via manager
            const removed = await roomManager.removeParticipantFromRoom(socket.id);

            if (removed) {
                logger.info('Participant removed from room', {
                    socketId: socket.id,
                    roomId,
                    sessionDuration
                });

                // Record participant leave metrics
                metrics.recordParticipantLeave('disconnect', sessionDuration);

                // Get updated room data
                const roomAfter = await roomManager.getRoomById(roomId);
                const participantCountAfter = roomAfter?.participants.length || 0;

                // Broadcast room update to remaining participants
                if (roomAfter && roomAfter.isActive) {
                    const updateEvent = {
                        roomId,
                        participants: roomManager.participantsToArray(roomAfter.participants),
                        event: 'participant-disconnected',
                        leftParticipantId: socket.id
                    };

                    io.to(roomId).emit('room-updated', updateEvent);

                    logger.success('Room update broadcasted after disconnect', {
                        socketId: socket.id,
                        roomId,
                        remainingParticipants: participantCountAfter,
                        updateSentTo: participantCountAfter
                    });
                }

                // Clean up chat history if room is now empty
                if (participantCountAfter === 0) {
                    try {
                        await chatManager.clearRoomMessages(roomId);
                        logger.info('Cleaned up empty room chat history', {
                            socketId: socket.id,
                            roomId
                        });
                    } catch (chatError) {
                        logger.error('Failed to cleanup chat history', {
                            error: chatError,
                            socketId: socket.id,
                            roomId
                        });
                    }
                }

                // Log room state change
                logger.info('Room state after disconnect', {
                    socketId: socket.id,
                    roomId,
                    participantsBefore: participantCountBefore,
                    participantsAfter: participantCountAfter,
                    roomStillActive: roomAfter?.isActive || false
                });
            }
        } else {
            logger.info('Socket was not in any room', {
                socketId: socket.id,
                reason
            });
        }

        // Record final disconnect metrics
        metrics.recordSocketEvent('disconnect', 'handled', sessionDuration);

        logger.success('Disconnect cleanup completed', {
            socketId: socket.id,
            reason,
            sessionDuration,
            hadRoom: !!roomId
        });

    } catch (error) {
        const err = error as Error;

        // Record error metrics
        metrics.recordError('socket', 'error', 'Disconnect cleanup failed');

        logger.error('Error during disconnect cleanup', {
            socketId: socket.id,
            error: err.message,
            stack: err.stack,
            reason,
            sessionDuration
        });

        // Even if cleanup fails, we should still try basic room cleanup
        try {
            const roomId = await roomManager.getRoomBySocketId(socket.id);
            if (roomId) {
                await roomManager.removeParticipantFromRoom(socket.id);
                logger.info('Emergency participant cleanup completed', {
                    socketId: socket.id,
                    roomId
                });
            }
        } catch (emergencyError) {
            logger.error('Emergency cleanup also failed', {
                socketId: socket.id,
                error: emergencyError,
                originalError: err.message
            });
        }
    }
};