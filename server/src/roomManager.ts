import type {AddParticipantResult, Participant, Room} from "./types";
import {log} from "./logging";
import {ROOM_CONFIG, getEnvironmentConfig} from "./config";
import {v4 as uuidv4} from 'uuid';

export class RoomManager {
    private rooms: Map<string, Room> = new Map();
    private socketToRoom: Map<string, string> = new Map();
    private socketToReconnectionToken = new Map<string, string>();
    private reconnectionTokenToParticipant = new Map<string, { roomId: string; participantData: Participant }>();
    private cleanupInterval: NodeJS.Timeout | null = null;
    private readonly cfg = getEnvironmentConfig();


    constructor() {
        this.startCleanupInterval();
        log('info', 'RoomManager initialized');
    }

    createRoom(roomId: string, creatorSocketId: string): Room {
        log('info', `Creating new room: ${roomId}`);

        // Check room limits
        if (this.rooms.size >= ROOM_CONFIG.MAX_ROOMS) {
            log('error', `Maximum number of rooms reached`, { maxRooms: ROOM_CONFIG.MAX_ROOMS });
            throw new Error('Maximum number of rooms reached');
        }

        // Check if room already exists
        if (this.rooms.has(roomId)) {
            log('error', `Room already exists`, { roomId });
            throw new Error('Room already exists');
        }

        const room: Room = {
            id: roomId,
            creator: creatorSocketId,
            participants: new Map<string, Participant>(),
            createdAt: new Date().toISOString(),
            maxParticipants: ROOM_CONFIG.MAX_PARTICIPANTS,
            lastActivity: "",
            timeoutDuration: this.cfg.roomTimeout,
            isActive: true
        };

        this.rooms.set(roomId, room);
        log('info', `Room created successfully`, { roomId, creatorSocketId });
        return room;
    }

    updateRoomActivity(roomId: string): void {
        const room = this.rooms.get(roomId);
        if (room) {
            room.lastActivity = new Date().toISOString();
        }
    }

    addParticipantToRoom(
        roomId: string,
        socketId: string,
        participantInfo: Omit<Participant, 'socketId' | 'lastSeen' | 'isConnected' | 'reconnectionToken'>,
        reconnectionToken?: string
    ): AddParticipantResult {
        log('info', `Adding participant to room`, {roomId, socketId, participantInfo, reconnectionToken});

        const room = this.rooms.get(roomId);
        if (!room) {
            log('error', `Room not found: ${roomId}`);
            return {success: false, error: 'Room not found'};
        }

        if (!room.isActive) {
            log('error', `Room is not active: ${roomId}`);
            return {success: false, error: 'Room is no longer active'};
        }

        const now = new Date().toISOString();
        let isReconnection = false;

        // Check if this is a reconnection attempt
        if (reconnectionToken) {
            const reconnectionData = this.reconnectionTokenToParticipant.get(reconnectionToken);
            if (reconnectionData && reconnectionData.roomId === roomId) {
                log('info', `Reconnection detected`, {
                    reconnectionToken,
                    previousSocketId: reconnectionData.participantData.socketId,
                    newSocketId: socketId
                });

                // Update existing participant with new socket ID
                const existingParticipant = reconnectionData.participantData;
                existingParticipant.socketId = socketId;
                existingParticipant.lastSeen = now;
                existingParticipant.isConnected = true;

                room.participants.set(socketId, existingParticipant);
                this.socketToRoom.set(socketId, roomId);
                this.socketToReconnectionToken.set(socketId, reconnectionToken);

                this.updateRoomActivity(roomId);
                isReconnection = true;

                log('success', `Participant reconnected successfully`, {
                    roomId,
                    socketId,
                    totalParticipants: room.participants.size,
                    reconnectionToken
                });

                return {success: true, room, participant: existingParticipant, isReconnection: true};
            }
        }

        // Check room capacity for new participants
        const connectedParticipants = Array.from(room.participants.values()).filter(p => p.isConnected).length;
        if (connectedParticipants >= room.maxParticipants) {
            log('error', `Room is full`, {
                roomId,
                connectedCount: connectedParticipants,
                maxCount: room.maxParticipants
            });
            return { success: false, error: 'Room is full' };
        }

        // Create new participant
        const newReconnectionToken = reconnectionToken || this.generateReconnectionToken();
        const participant: Participant = {
            socketId,
            ...participantInfo,
            joinedAt: now,
            lastSeen: now,
            isConnected: true,
            reconnectionToken: newReconnectionToken
        };

        room.participants.set(socketId, participant);
        this.socketToRoom.set(socketId, roomId);
        this.socketToReconnectionToken.set(socketId, newReconnectionToken);

        // Store reconnection data
        this.reconnectionTokenToParticipant.set(newReconnectionToken, {
            roomId,
            participantData: { ...participant }
        });

        this.updateRoomActivity(roomId);

        log('info', `Participant added successfully`, {
            roomId,
            socketId,
            totalParticipants: room.participants.size,
            reconnectionToken: newReconnectionToken
        });

        return { success: true, room, participant, isReconnection };
    }

    removeParticipantFromRoom(socketId: string, isExplicitLeave: boolean = false): {
        roomId: string;
        room: Room | undefined;
        wasConnected: boolean
    } | null {
        const roomId = this.socketToRoom.get(socketId);
        if (!roomId) {
            log('info', `Socket ${socketId} was not in any room`);
            return null;
        }

        log('info', `Removing participant from room`, { socketId, roomId, isExplicitLeave });

        const room = this.rooms.get(roomId);
        const reconnectionToken = this.socketToReconnectionToken.get(socketId);
        let wasConnected = false;

        if (room) {
            const participant = room.participants.get(socketId);
            wasConnected = participant?.isConnected || false;

            if (isExplicitLeave) {
                // Complete removal for explicit leave
                room.participants.delete(socketId);
                this.socketToRoom.delete(socketId);
                this.socketToReconnectionToken.delete(socketId);

                if (reconnectionToken) {
                    this.reconnectionTokenToParticipant.delete(reconnectionToken);
                }

                log('info', `Participant explicitly left and removed completely`, {
                    roomId,
                    socketId,
                    remainingParticipants: room.participants.size
                });
            } else {
                // Mark as disconnected but keep for potential reconnection
                if (participant) {
                    participant.isConnected = false;
                    participant.lastSeen = new Date().toISOString();
                    participant.socketId = ''; // Clear socket ID but keep participant data

                    log('info', `Participant disconnected but kept for reconnection`, {
                        roomId,
                        socketId,
                        reconnectionToken,
                        remainingConnected: Array.from(room.participants.values()).filter(p => p.isConnected).length
                    });
                }

                // Clean up socket mappings but keep reconnection data
                this.socketToRoom.delete(socketId);
                this.socketToReconnectionToken.delete(socketId);
            }

            this.updateRoomActivity(roomId);

            // Check if room should be cleaned up
            const connectedParticipants = Array.from(room.participants.values()).filter(p => p.isConnected);
            if (connectedParticipants.length === 0 && isExplicitLeave) {
                // If no connected participants and someone explicitly left, mark room as inactive
                room.isActive = false;
                log('info', `Room marked as inactive (no connected participants after explicit leave)`, { roomId });
            }
        }

        return { roomId, room, wasConnected };
    }

    participantsToArray(participants: Map<string, Participant>): Participant[] {
        return Array.from(participants.values());
    }

    performCleanup(): void {
        // TODO: Cleanup method does not have the necessary context since this.rooms is undefined upon execution.

        const now = Date.now();
        const roomsToDelete: string[] = [];
        const tokensToDelete: string[] = [];

        // only temporary fix to avoid undefined error
        // this.room is currently undefined in the cleanup methods context.
        if (this.rooms === undefined || this.rooms.size === 0) {
            log('info', `No rooms to clean up`);
            return;
        }

        for (const [roomId, room] of this.rooms.entries()) {
            const roomAge = now - new Date(room.lastActivity).getTime();
            const connectedParticipants = Array.from(room.participants.values()).filter(p => p.isConnected);

            // Mark room as inactive if no connected participants for too long
            if (connectedParticipants.length === 0) {
                if (roomAge > room.timeoutDuration) {
                    room.isActive = false;
                    roomsToDelete.push(roomId);

                    log('info', `Room expired and will be deleted`, {
                        roomId,
                        lastActivity: room.lastActivity,
                        ageMinutes: Math.round(roomAge / 60000)
                    });
                }
            }

            // Clean up disconnected participants that can no longer reconnect
            for (const [participantKey, participant] of room.participants.entries()) {
                if (!participant.isConnected) {
                    const disconnectAge = now - new Date(participant.lastSeen).getTime();
                    if (disconnectAge > ROOM_CONFIG.PARTICIPANT_RECONNECTION_WINDOW) {
                        room.participants.delete(participantKey);
                        if (participant.reconnectionToken) {
                            tokensToDelete.push(participant.reconnectionToken);
                        }

                        log('info', `Disconnected participant expired and removed`, {
                            roomId,
                            participantId: participantKey,
                            userName: participant.userName,
                            disconnectAgeMinutes: Math.round(disconnectAge / 60000)
                        });
                    }
                }
            }
        }

        // Delete expired rooms
        for (const roomId of roomsToDelete) {
            this.rooms.delete(roomId);
        }

        // Delete expired reconnection tokens
        for (const token of tokensToDelete) {
            this.reconnectionTokenToParticipant.delete(token);
        }

        if (roomsToDelete.length > 0 || tokensToDelete.length > 0) {
            log('info', `Cleanup completed`, {
                deletedRooms: roomsToDelete.length,
                deletedTokens: tokensToDelete.length,
                remainingRooms: this.rooms.size,
                remainingTokens: this.reconnectionTokenToParticipant.size
            });
        }
    }

    validateReconnectionToken(token: string, roomId: string): boolean {
        const data = this.reconnectionTokenToParticipant.get(token);
        return data?.roomId === roomId;
    }

    // Getters for external access
    getRooms(): Map<string, Room> {
        return this.rooms;
    }

    getReconnectionTokens(): Map<string, { roomId: string; participantData: Participant }> {
        return this.reconnectionTokenToParticipant;
    }

    getRoomBySocketId(socketId: string): string | undefined {
        log('info', `Fetching room by ID`, { socketId });
        return this.socketToRoom.get(socketId);
    }

    getRoomById(roomId: string): Room | undefined {
        log('info', `Fetching room by ID`, { roomId });
        return this.rooms.get(roomId);
    }

    getParticipantReconnectionToken(token: string)  {
        log('info', `Fetching reconnection token for socket`, { token });
        return this.reconnectionTokenToParticipant.get(token)
    }

    getSocketToReconnectionToken(socketId: string): string | undefined {
        log('info', `Fetching reconnection token for socket`, { socketId });
        return this.socketToReconnectionToken.get(socketId);
    }

    // setters for external access
    setRoomParticipant(roomId: string, participant: Participant): void {
        log('info', `Setting participant in room`, { roomId, participant });
        const room = this.rooms.get(roomId);
        if (room) {
            room.participants.set(participant.socketId, participant);
            this.socketToRoom.set(participant.socketId, roomId);
            this.socketToReconnectionToken.set(participant.socketId, participant.reconnectionToken || '');
        } else {
            log('error', `Room not found for setting participant`, { roomId });
        }
    }

    // Lifecycle Management
    shutdown(): void {
        if (this.cleanupInterval) {
            clearInterval(this.cleanupInterval);
            this.cleanupInterval = null;
        }

        log('info',`RoomManager shutting down`, {
            remainingRooms: this.rooms.size,
            remainingTokens: this.reconnectionTokenToParticipant.size
        });

        // Clean up all data
        this.rooms.clear();
        this.socketToRoom.clear();
        this.socketToReconnectionToken.clear();
        this.reconnectionTokenToParticipant.clear();
    }

    // private methods
    private generateReconnectionToken(): string {
        return uuidv4();
    }

    private startCleanupInterval(): void {
        this.cleanupInterval = setInterval(() => {
            this.performCleanup();
        }, this.cfg.cleanupInterval);

        log('info', `Room cleanup interval started`, {
            intervalMs: this.cfg.cleanupInterval,
            roomTimeoutMs: this.cfg.roomTimeout,
            reconnectionWindowMs: ROOM_CONFIG.PARTICIPANT_RECONNECTION_WINDOW
        });
    }
}

