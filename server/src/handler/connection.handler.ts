import { Server, Socket } from 'socket.io';
import { RoomManager } from '../room/manager';
import { log } from '../logging';

// ============================================================================
// ENHANCED DISCONNECT HANDLER WITH WEBRTC CLEANUP LOGGING
// ============================================================================

export const handleDisconnect = (
    socket: Socket,
    manager: RoomManager,
    io: Server,
    reason: string
) => {
    log('info', '🔌 [DISCONNECT] Socket disconnecting', {
        socketId: socket.id,
        reason,
        timestamp: new Date().toISOString()
    });

    try {
        const roomId = manager.getRoomBySocketId(socket.id);

        if (roomId) {
            const room = io.sockets.adapter.rooms.get(roomId);
            const otherParticipants = room ? Array.from(room).filter(id => id !== socket.id) : [];

            log('info', '📡 [DISCONNECT] Broadcasting peer disconnection for WebRTC cleanup', {
                socketId: socket.id,
                roomId,
                otherParticipants: otherParticipants.length,
                webrtcCleanupTargets: otherParticipants
            });

            // Broadcast to other participants for WebRTC cleanup
            socket.to(roomId).emit('peer-disconnected', {
                roomId,
                participantId: socket.id
            });

            log('success', '✅ [DISCONNECT] WebRTC cleanup signal sent', {
                socketId: socket.id,
                roomId,
                notifiedParticipants: otherParticipants.length
            });
        }

        // Remove participant using correct method
        const result = manager.removeParticipantFromRoom(socket.id, false);

        if (result && result.room) {
            log('info', '📊 [DISCONNECT] Room state after participant removal', {
                socketId: socket.id,
                roomId: result.roomId,
                wasConnected: result.wasConnected,
                remainingParticipants: result.room.participants.size,
                roomStillActive: result.room.isActive
            });

            // Broadcast room update
            io.to(result.roomId).emit('room-updated', {
                roomId: result.roomId,
                participants: Array.from(result.room.participants.values()),
                event: 'participant-disconnected',
                leftParticipantId: socket.id
            });

            log('success', '✅ [DISCONNECT] Room update broadcasted', {
                socketId: socket.id,
                roomId: result.roomId,
                updateSentTo: result.room.participants.size,
                eventType: 'participant-disconnected'
            });
        }

    } catch (error) {
        const err = error as Error;
        log('error', '💥 [DISCONNECT] Error handling disconnect', {
            socketId: socket.id,
            error: err.message,
            stack: err.stack,
            reason
        });
    }
};