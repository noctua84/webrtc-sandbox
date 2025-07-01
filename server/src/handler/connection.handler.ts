import {log} from "../logging";
import type {RoomUpdateEvent} from "../types";
import {Server, Socket} from "socket.io";
import {RoomManager} from "../roomManager";
import {roomConfig} from "../config";

export const handleDisconnect = (socket: Socket, manager: RoomManager, reason: string, io: Server) => {
    log('info', `Socket disconnected`, { socketId: socket.id, reason });


    try {
        const result = manager.removeParticipantFromRoom(socket.id, false); // Not an explicit leave

        if (result && result.room && result.wasConnected) {
            // Notify remaining participants about disconnection (not complete removal)
            const updateEvent: RoomUpdateEvent = {
                roomId: result.roomId,
                participants: manager.participantsToArray(result.room.participants),
                event: 'participant-disconnected',
                leftParticipantId: socket.id
            };

            socket.to(result.roomId).emit('room-updated', updateEvent);

            // Check if any connected participants remain to send reconnection info
            const connectedParticipants = Array.from(result.room.participants.values()).filter(p => p.isConnected);
            if (connectedParticipants.length > 0) {
                const reconnectionToken = manager.getSocketToReconnectionToken(socket.id);
                if (reconnectionToken) {
                    // Notify about potential reconnection window
                    io.to(result.roomId).emit('reconnection-available', {
                        roomId: result.roomId,
                        timeLeft: roomConfig.participantReconnectionWindow / 1000 // in seconds
                    });
                }
            }

            log('info', `Notified remaining participants about disconnect`, {
                roomId: result.roomId,
                connectedCount: connectedParticipants.length,
                reason
            });
        }

    } catch (error) {
        const err = error as Error;
        log('error', `Error handling disconnect`, {
            socketId: socket.id,
            error: err.message,
            stack: err.stack
        });
    }
}