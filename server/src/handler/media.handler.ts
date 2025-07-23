import {Server, Socket} from "socket.io";
import {RoomManager} from "../room/manager";
import {type ErrorResponse, MediaStatusUpdate, type RoomUpdateEvent} from "../types/webrtc.types";
import {log} from "../logging";

export const handleUpdateMediaStatus = (socket: Socket, manager: RoomManager, io: Server, data: MediaStatusUpdate, callback: (response: any) => void) => {
    log('info', `Received media status update`, {
        socketId: socket.id,
        roomId: data.roomId,
        mediaStatus: {
            hasVideo: data.hasVideo,
            hasAudio: data.hasAudio,
            isScreenSharing: data.isScreenSharing
        }
    });

    try {
        const { roomId, hasVideo, hasAudio, isScreenSharing } = data;

        // Validate that sender is in the room
        const senderRoomId = manager.getRoomBySocketId(socket.id);
        if (senderRoomId !== roomId) {
            log('error', `Media status update from participant not in room`, {
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

        const room = manager.getRoomById(roomId);
        if (!room) {
            log('error', `Room not found for media status update`, { roomId, socketId: socket.id });
            const response: ErrorResponse = {
                success: false,
                error: 'Room not found'
            };
            return callback(response);
        }

        // Update participant's media status
        const participant = room.participants.get(socket.id);
        if (participant) {
            participant.mediaStatus = {
                hasVideo,
                hasAudio,
                isScreenSharing
            };

            manager.updateRoomActivity(roomId);

            // Broadcast media status change to other participants
            const updateEvent: RoomUpdateEvent = {
                roomId,
                participants: manager.participantsToArray(room.participants),
                event: 'media-status-changed',
                participant
            };

            socket.to(roomId).emit('room-updated', updateEvent);

            log('success', `Media status updated and broadcasted`, {
                socketId: socket.id,
                roomId,
                mediaStatus: participant.mediaStatus
            });

            const response: { success: true } = { success: true };
            callback(response);
        } else {
            log('error', `Participant not found in room for media status update`, {
                socketId: socket.id,
                roomId
            });
            const response: ErrorResponse = {
                success: false,
                error: 'Participant not found in room'
            };
            callback(response);
        }

    } catch (error) {
        const err = error as Error;
        log('error', `Error handling media status update`, {
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