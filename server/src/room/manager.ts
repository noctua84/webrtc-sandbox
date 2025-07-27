import { Room as PrismaRoom, Participant as PrismaParticipant } from "@prisma/client";
import type { Logger } from "../types/log.types";
import {
    RoomRepository,
    CreateRoomContext,
    AddParticipantContext,
    IRoomRepository
} from "../db/repository/room.repository";
import crypto from 'crypto';

// Response types for manager operations
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
    createRoom(roomId: string, creatorSocketId: string, options?: { maxParticipants?: number; timeoutDuration?: number }): Promise<CreateRoomResult>;
    getRoomById(roomId: string): Promise<(PrismaRoom & { participants: PrismaParticipant[] }) | null>;
    addParticipantToRoom(roomId: string, socketId: string, participantInfo: { userName: string; isCreator: boolean }, reconnectionToken?: string): Promise<AddParticipantResult>;
    removeParticipantFromRoom(socketId: string): Promise<boolean>;
    getRoomBySocketId(socketId: string): Promise<string | null>;
    updateRoomActivity(roomId: string): Promise<void>;
    generateReconnectionToken(): string;
    validateReconnectionToken(token: string, roomId: string): Promise<PrismaParticipant | null>;
    cleanupInactiveRooms(): Promise<number>;
    participantsToArray(participants: PrismaParticipant[]): any[];
}

/**
 * Room Manager - Business logic layer for room operations
 * Handles validation, business rules, and coordinates with repository
 * Follows the domain manager pattern established in the codebase
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
     * Create a new room with validation
     */
    async createRoom(
        roomId: string,
        creatorSocketId: string,
        options: { maxParticipants?: number; timeoutDuration?: number } = {}
    ): Promise<CreateRoomResult> {
        try {
            // Validate input
            if (!roomId || !creatorSocketId) {
                return {
                    success: false,
                    error: 'Room ID and creator socket ID are required'
                };
            }

            // Check if room already exists
            const existingRoom = await this.repository.getRoomById(roomId);
            if (existingRoom) {
                return {
                    success: false,
                    error: 'Room already exists'
                };
            }

            // Create room via repository
            const context: CreateRoomContext = {
                roomId,
                creatorSocketId,
                maxParticipants: options.maxParticipants || this.config.room.maxParticipants,
                timeoutDuration: options.timeoutDuration || this.config.room.timeoutDuration
            };

            const room = await this.repository.createRoom(context);

            this.logger.info('Room created via manager', {
                roomId: room.id,
                creator: room.creator
            });

            return {
                success: true,
                room
            };
        } catch (error) {
            this.logger.error('Failed to create room via manager', {
                error,
                roomId,
                creatorSocketId
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

    /**
     * Add participant to room with business logic
     */
    async addParticipantToRoom(
        roomId: string,
        socketId: string,
        participantInfo: { userName: string; isCreator: boolean },
        reconnectionToken?: string
    ): Promise<AddParticipantResult> {
        try {
            // Validate input
            if (!roomId || !socketId || !participantInfo.userName?.trim()) {
                return {
                    success: false,
                    error: 'Room ID, socket ID, and username are required'
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
                if (existingParticipant && existingParticipant.roomId === roomId) {
                    // Remove old participant record and create new one
                    await this.repository.removeParticipant(existingParticipant.socketId);
                    isReconnection = true;
                    this.logger.info('Participant reconnecting', {
                        oldSocketId: existingParticipant.socketId,
                        newSocketId: socketId,
                        roomId
                    });
                }
            }

            // Check room capacity (unless reconnecting)
            if (!isReconnection && room.participants.length >= room.maxParticipants) {
                return {
                    success: false,
                    error: 'Room is full'
                };
            }

            // Check if socket is already in a room
            const existingParticipant = await this.repository.getParticipantBySocketId(socketId);
            if (existingParticipant) {
                return {
                    success: false,
                    error: 'Socket already in a room'
                };
            }

            // Add participant
            const context: AddParticipantContext = {
                roomId,
                socketId,
                userName: participantInfo.userName.trim(),
                isCreator: participantInfo.isCreator,
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

            if (success) {
                // Update room activity
                await this.repository.updateRoomActivity(participant.roomId);

                this.logger.info('Participant removed via manager', {
                    socketId,
                    roomId: participant.roomId
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
        try {
            const participant = await this.repository.getParticipantBySocketId(socketId);
            return participant?.roomId || null;
        } catch (error) {
            this.logger.error('Failed to get room by socket ID', { error, socketId });
            return null;
        }
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

            if (participant && participant.roomId === roomId) {
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
     * Convert participants to array for response
     */
    participantsToArray(participants: PrismaParticipant[]): any[] {
        return participants.map(p => ({
            socketId: p.socketId,
            userName: p.userName,
            isCreator: p.isCreator,
            joinedAt: p.joinedAt.toISOString(),
            lastSeen: p.lastSeen.toISOString(),
            reconnectionToken: p.reconnectionToken,
            // Note: Media status is not stored in DB, handled in memory
            mediaStatus: {
                hasVideo: false,
                hasAudio: false,
                isScreenSharing: false
            }
        }));
    }

    /**
     * Start cleanup interval
     */
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

    /**
     * Stop cleanup interval (for graceful shutdown)
     */
    public stopCleanupInterval(): void {
        if (this.cleanupInterval) {
            clearInterval(this.cleanupInterval);
            this.cleanupInterval = null;
            this.logger.info('Room cleanup interval stopped');
        }
    }
}