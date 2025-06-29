import type {AddParticipantResult, Participant, Room} from "./types";
import {log} from "./logging";

export class RoomManager {
    private rooms: Map<string, Room> = new Map();
    private socketToRoom: Map<string, string> = new Map();

    constructor() {
        log('info', 'RoomManager initialized');
    }

    createRoom(roomId: string, creatorSocketId: string): Room {
        log('info', `Creating new room: ${roomId}`);

        const room: Room = {
            id: roomId,
            creator: creatorSocketId,
            participants: new Map<string, Participant>(),
            createdAt: new Date().toISOString(),
            maxParticipants: 4 // Simple limit for demo
        };

        this.rooms.set(roomId, room);
        log('info', `Room created successfully`, { roomId, creatorSocketId });
        return room;
    }

    addParticipantToRoom(
        roomId: string,
        socketId: string,
        participantInfo: Omit<Participant, 'socketId'>
    ): AddParticipantResult {
        log('info', `Adding participant to room`, { roomId, socketId, participantInfo });

        const room = this.rooms.get(roomId);
        if (!room) {
            log('error', `Room not found: ${roomId}`);
            return { success: false, error: 'Room not found' };
        }

        if (room.participants.size >= room.maxParticipants) {
            log('error', `Room is full`, {
                roomId,
                currentCount: room.participants.size,
                maxCount: room.maxParticipants
            });
            return { success: false, error: 'Room is full' };
        }

        const participant: Participant = {
            socketId,
            ...participantInfo,
            joinedAt: new Date().toISOString()
        };

        room.participants.set(socketId, participant);
        this.socketToRoom.set(socketId, roomId);

        log('info', `Participant added successfully`, {
            roomId,
            socketId,
            totalParticipants: room.participants.size
        });

        return { success: true, room, participant };
    }

    removeParticipantFromRoom(socketId: string): { roomId: string; room: Room | undefined } | null {
        const roomId = this.socketToRoom.get(socketId);
        if (!roomId) {
            log('info', `Socket ${socketId} was not in any room`);
            return null;
        }

        log('info', `Removing participant from room`, { socketId, roomId });

        const room = this.rooms.get(roomId);
        if (room) {
            room.participants.delete(socketId);

            // If room is empty, delete it
            if (room.participants.size === 0) {
                this.rooms.delete(roomId);
                log('info', `Room deleted (empty)`, { roomId });
            } else {
                log('info', `Participant removed`, {
                    roomId,
                    socketId,
                    remainingParticipants: room.participants.size
                });
            }
        }

        this.socketToRoom.delete(socketId);
        return { roomId, room };
    }

    participantsToArray(participants: Map<string, Participant>): Participant[] {
        return Array.from(participants.values());
    }

    getRooms(): Map<string, Room> {
        return this.rooms;
    }

    getRoomBySocketId(socketId: string): string | undefined {
        log('info', `Fetching room by ID`, { socketId });
        return this.socketToRoom.get(socketId);
    }
}

