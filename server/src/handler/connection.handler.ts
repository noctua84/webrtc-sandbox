import { Server, Socket } from 'socket.io';
import { RoomManager } from '../roomManager';
import { log } from '../logging';

export const handleDisconnect = (socket: Socket, manager: RoomManager, io: Server, reason: string) => {
    log('info', `Socket disconnected`, {
        socketId: socket.id,
        reason
    });

    try {
        // Get the room the participant was in before removing them
        const roomId = manager.getRoomBySocketId(socket.id);

        if (roomId) {
            log('info', `Participant disconnecting from room`, {
                socketId: socket.id,
                roomId
            });

            // CRITICAL FIX: Broadcast peer disconnection BEFORE removing participant
            // This ensures other participants can clean up WebRTC connections
            socket.to(roomId).emit('peer-disconnected', {
                roomId,
                participantId: socket.id
            });

            log('success', `Broadcasted peer disconnection`, {
                socketId: socket.id,
                roomId
            });
        }

        // Remove the participant from the room
        const result = manager.removeParticipantFromRoom(socket.id, false); // false = not explicit leave (just disconnect)

        if (result && result.room) {
            log('info', `Participant removed from room`, {
                socketId: socket.id,
                roomId: result.roomId,
                wasConnected: result.wasConnected,
                remainingParticipants: result.room.participants.size
            });

            // Broadcast room update to remaining participants
            io.to(result.roomId).emit('room-updated', {
                roomId: result.roomId,
                participants: Array.from(result.room.participants.values()),
                event: 'participant-disconnected',
                leftParticipantId: socket.id
            });

            log('success', `Broadcasted room update after disconnection`, {
                socketId: socket.id,
                roomId: result.roomId,
                remainingParticipants: result.room.participants.size
            });
        }

    } catch (error) {
        const err = error as Error;
        log('error', 'Error handling disconnect', {
            socketId: socket.id,
            error: err.message,
            stack: err.stack
        });
    }
};