import { Room as PrismaRoom, Participant as PrismaParticipant } from "@prisma/client";
import type { Logger } from "../types/log.types";
import {
    RoomRepository,
    CreateRoomContext,
    AddParticipantContext,
    IRoomRepository
} from "../db/repository/room.repository";
import crypto from 'crypto';

// Updated response types to match new schema
export interface CreateRoomResult {
    success: boolean;
    room?: PrismaRoom;
    error?: string;
}

export interface AddParticipantResult {
    success: boolean;
    participant?: PrismaParticipant;
    room?: PrismaRoom & { participants: PrismaParticipant[] };
    isReconnection?: boolean;
    error?: string;
}

export interface IRoomManager {
    createRoomForEvent(eventId: string, creatorExtUserId: string, creatorInfo: { userName: string; userEmail: string }, options?: { maxParticipants?: number; timeoutDuration?: number }): Promise<CreateRoomResult>;
    getRoomById(roomId: string): Promise<(PrismaRoom & { participants: PrismaParticipant[] }) | null>;
    getRoomByEventId(eventId: string): Promise<(PrismaRoom & { participants: PrismaParticipant[] }) | null>;
    addParticipantToRoom(roomId: string, socketId: string, participantInfo: { extUserId: string; userName: string; userEmail: string }, reconnectionToken?: string): Promise<AddParticipantResult>;
    removeParticipantFromRoom(socketId: string): Promise<boolean>;
    getRoomBySocketId(socketId: string): Promise<string | null>;
    updateRoomActivity(roomId: string): Promise<void>;
    generateReconnectionToken(): string;
    validateReconnectionToken(token: string, roomId: string): Promise<PrismaParticipant | null>;
    cleanupInactiveRooms(): Promise<number>;
    participantsToArray(participants: PrismaParticipant[]): any[];
    generateJoinToken(eventId: string, userId: string): string;
    validateJoinToken(token: string, eventId: string, userId: string): boolean;
    disconnectAllParticipants(roomId: string): Promise<void>;
    stopCleanupInterval(): void;
}

/**
 * Room Manager - Business logic layer for room operations
 * Updated to work with new event-centric schema
 */
export class RoomManager implements IRoomManager {
    private repository: IRoomRepository;
    private logger: Logger;
    private cleanupInterval: NodeJS.Timeout | null = null;
    private readonly config: any;

    constructor(repository: IRoomRepository, logger: Logger, config: any) {
        this.repository = repository;
        this.logger = logger;
        this.config = config;
        this.startCleanupInterval();
    }

    /**
     * Create a new room for an event (replaces createRoom)
     * Rooms must be associated with events in the new schema
     */
    async createRoomForEvent(
        eventId: string,
        creatorExtUserId: string,
        creatorInfo: { userName: string; userEmail: string },
        options: { maxParticipants?: number; timeoutDuration?: number } = {}
    ): Promise<CreateRoomResult> {
        try {
            // Validate input
            if (!eventId || !creatorExtUserId || !creatorInfo.userName || !creatorInfo.userEmail) {
                return {
                    success: false,
                    error: 'Event ID, creator user ID, username, and email are required'
                };
            }

            // Check if room already exists for this event
            const existingRoom = await this.repository.getRoomByEventId(eventId);
            if (existingRoom) {
                return {
                    success: false,
                    error: 'Room already exists for this event'
                };
            }

            // Create room via repository
            const context: CreateRoomContext = {
                eventId,
                creatorExtUserId,
                creatorUserName: creatorInfo.userName,
                creatorUserEmail: creatorInfo.userEmail,
                maxParticipants: options.maxParticipants || this.config.room.maxParticipants,
                timeoutDuration: options.timeoutDuration || this.config.room.timeoutDuration
            };

            const room = await this.repository.createRoom(context);

            this.logger.info('Room created for event via manager', {
                roomId: room.id,
                eventId,
                creator: room.creatorId
            });

            return {
                success: true,
                room
            };
        } catch (error) {
            this.logger.error('Failed to create room for event via manager', {
                error,
                eventId,
                creatorExtUserId
            });
            return {
                success: false,
                error: 'Internal error creating room'
            };
        }
    }

    /**
     * Get room by ID
     */
    async getRoomById(roomId: string): Promise<(PrismaRoom & { participants: PrismaParticipant[] }) | null> {
        try {
            return await this.repository.getRoomById(roomId);
        } catch (error) {
            this.logger.error('Failed to get room via manager', { error, roomId });
            return null;
        }
    }

    async getRoomByEventId(eventId: string): Promise<(PrismaRoom & { participants: PrismaParticipant[] }) | null> {
        try {
            return await this.repository.getRoomByEventId(eventId);
        } catch (error) {
            this.logger.error('Failed to get room by event ID via manager', { error, eventId });
            return null;
        }
    }

    /**
     * Add participant to room with updated business logic
     */
    async addParticipantToRoom(
        roomId: string,
        socketId: string,
        participantInfo: { extUserId: string; userName: string; userEmail: string },
        reconnectionToken?: string
    ): Promise<AddParticipantResult> {
        try {
            // Validate input
            if (!roomId || !socketId || !participantInfo.extUserId || !participantInfo.userName?.trim() || !participantInfo.userEmail) {
                return {
                    success: false,
                    error: 'Room ID, socket ID, external user ID, username, and email are required'
                };
            }

            // Get room and validate
            const room = await this.repository.getRoomById(roomId);
            if (!room) {
                return {
                    success: false,
                    error: 'Room not found'
                };
            }

            if (!room.isActive) {
                return {
                    success: false,
                    error: 'Room is not active'
                };
            }

            // Check for reconnection
            let isReconnection = false;
            if (reconnectionToken) {
                const existingParticipant = await this.repository.getParticipantByToken(reconnectionToken);
                if (existingParticipant && (
                    existingParticipant.createdRooms?.id === roomId ||
                    existingParticipant.participantRooms.some((pr: any) => pr.id === roomId)
                )) {
                    // Update existing participant with new socket
                    await this.repository.updateParticipantSocket(existingParticipant.id, socketId);
                    isReconnection = true;
                    this.logger.info('Participant reconnecting', {
                        participantId: existingParticipant.id,
                        newSocketId: socketId,
                        roomId
                    });

                    // Get updated room data
                    const updatedRoom = await this.repository.getRoomById(roomId);
                    return {
                        success: true,
                        participant: existingParticipant,
                        room: updatedRoom!,
                        isReconnection: true
                    };
                }
            }

            // Check room capacity (unless reconnecting)
            if (!isReconnection && room.participants.length >= room.maxParticipants) {
                return {
                    success: false,
                    error: 'Room is full'
                };
            }

            // Check if socket is already in use
            const existingParticipant = await this.repository.getParticipantBySocketId(socketId);
            if (existingParticipant) {
                return {
                    success: false,
                    error: 'Socket already in use'
                };
            }

            // Add participant
            const context: AddParticipantContext = {
                roomId,
                socketId,
                extUserId: participantInfo.extUserId,
                userName: participantInfo.userName.trim(),
                userEmail: participantInfo.userEmail,
                reconnectionToken: reconnectionToken || this.generateReconnectionToken()
            };

            const participant = await this.repository.addParticipant(context);

            // Update room activity
            await this.repository.updateRoomActivity(roomId);

            // Get updated room data
            const updatedRoom = await this.repository.getRoomById(roomId);

            this.logger.info('Participant added via manager', {
                socketId,
                roomId,
                extUserId: participantInfo.extUserId,
                userName: participantInfo.userName,
                isReconnection
            });

            return {
                success: true,
                participant,
                room: updatedRoom!,
                isReconnection
            };
        } catch (error) {
            this.logger.error('Failed to add participant via manager', {
                error,
                roomId,
                socketId
            });
            return {
                success: false,
                error: 'Internal error adding participant'
            };
        }
    }

    /**
     * Remove participant from room
     */
    async removeParticipantFromRoom(socketId: string): Promise<boolean> {
        try {
            const participant = await this.repository.getParticipantBySocketId(socketId);
            if (!participant) {
                return false;
            }

            const success = await this.repository.removeParticipant(socketId);

            if (success && participant.participantRooms.length > 0) {
                // Update room activity for all rooms the participant was in
                for (const room of participant.participantRooms) {
                    await this.repository.updateRoomActivity(room.id);
                }

                this.logger.info('Participant removed via manager', {
                    socketId,
                    participantId: participant.id
                });
            }

            return success;
        } catch (error) {
            this.logger.error('Failed to remove participant via manager', {
                error,
                socketId
            });
            return false;
        }
    }

    /**
     * Get room ID by socket ID
     */
    async getRoomBySocketId(socketId: string): Promise<string | null> {
        // TODO: refactor this to use event id rather than socket ID
        // TODO: remove the socket logic since rooms are precreated and their join link is available.
        return "deprecated"; // This method is deprecated in the new schema
    }

    /**
     * Update room activity timestamp
     */
    async updateRoomActivity(roomId: string): Promise<void> {
        try {
            await this.repository.updateRoomActivity(roomId);
        } catch (error) {
            this.logger.error('Failed to update room activity via manager', {
                error,
                roomId
            });
        }
    }

    /**
     * Generate secure reconnection token
     */
    generateReconnectionToken(): string {
        return crypto.randomBytes(32).toString('hex');
    }

    /**
     * Validate reconnection token
     */
    async validateReconnectionToken(token: string, roomId: string): Promise<PrismaParticipant | null> {
        try {
            const participant = await this.repository.getParticipantByToken(token);

            if (participant && (
                participant?.createdRooms?.id === roomId) ||
                participant?.participantRooms.some((room: any) => room.id === roomId)
            ) {
                return participant;
            }

            return null;
        } catch (error) {
            this.logger.error('Failed to validate reconnection token', { error });
            return null;
        }
    }

    /**
     * Clean up inactive rooms
     */
    async cleanupInactiveRooms(): Promise<number> {
        try {
            const cutoffTime = new Date(Date.now() - this.config.room.timeoutDuration);
            const cleanedCount = await this.repository.cleanupInactiveRooms(cutoffTime);

            if (cleanedCount > 0) {
                this.logger.info('Cleaned up inactive rooms', {
                    count: cleanedCount,
                    cutoffTime
                });
            }

            return cleanedCount;
        } catch (error) {
            this.logger.error('Failed to cleanup inactive rooms via manager', { error });
            return 0;
        }
    }

    /**
     * Convert participants to array for response (updated for new schema)
     */
    participantsToArray(participants: PrismaParticipant[]): any[] {
        return participants.map(p => ({
            id: p.id,
            socketId: p.socketId,
            extUserId: p.extUserId,
            userName: p.userName,
            userEmail: p.userEmail,
            joinedAt: p.joinedAt.toISOString(),
            lastSeen: p.lastSeen.toISOString(),
            isConnected: p.isConnected,
            reconnectionToken: p.reconnectionToken,
            // Note: Media status is not stored in DB, handled in memory
            mediaStatus: {
                hasVideo: false,
                hasAudio: false,
                isScreenSharing: false
            }
        }));
    }

    // ... rest of the methods remain the same (cleanup interval, tokens, etc.)

    private startCleanupInterval(): void {
        if (this.cleanupInterval) {
            clearInterval(this.cleanupInterval);
        }

        this.cleanupInterval = setInterval(async () => {
            await this.cleanupInactiveRooms();
        }, this.config.room.cleanupInterval);

        this.logger.info('Room cleanup interval started', {
            interval: this.config.room.cleanupInterval
        });
    }

    public stopCleanupInterval(): void {
        if (this.cleanupInterval) {
            clearInterval(this.cleanupInterval);
            this.cleanupInterval = null;
            this.logger.info('Room cleanup interval stopped');
        }
    }

    generateJoinToken(eventId: string, userId: string): string {
        const timestamp = Date.now();
        const tokenData = `${eventId}:${userId}:${timestamp}`;

        if (this.config.turnServer.secret) {
            const hmac = crypto.createHmac('sha256', this.config.turnServer.secret);
            hmac.update(tokenData);
            return `${timestamp}.${hmac.digest('hex')}`;
        }

        return `${timestamp}.${crypto.randomBytes(16).toString('hex')}`;
    }

    async disconnectAllParticipants(roomId: string): Promise<void> {
        try {
            this.logger.info('Disconnecting all participants from closed event room', {
                roomId
            });
        } catch (error) {
            const err = error as Error;
            this.logger.error('Failed to disconnect participants', {
                roomId,
                error: err.message
            });
        }
    }

    validateJoinToken(token: string, eventId: string, userId: string): boolean {
        try {
            const [timestampStr, signature] = token.split('.');
            const timestamp = parseInt(timestampStr);

            const maxAge = 60 * 60 * 1000; // 1 hour
            if (Date.now() - timestamp > maxAge) {
                return false;
            }

            if (this.config.turnServer.secret) {
                const tokenData = `${eventId}:${userId}:${timestamp}`;
                const hmac = crypto.createHmac('sha256', this.config.turnServer.secret);
                hmac.update(tokenData);
                const expectedSignature = hmac.digest('hex');

                return signature === expectedSignature;
            }

            return signature !== null && signature.length === 32;

        } catch (error) {
            this.logger.error('Failed to validate join token', {
                token,
                eventId,
                userId,
                error: (error as Error).message
            });
            return false;
        }
    }
}