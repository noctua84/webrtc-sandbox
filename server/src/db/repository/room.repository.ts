import {Participant as PrismaParticipant, PrismaClient, Room as PrismaRoom} from "@prisma/client";
import type {Logger} from "../../types/log.types";
import {v4 as uuidv4} from 'uuid';

// Context types for operations
export interface CreateRoomContext {
    roomId: string;
    creatorSocketId: string;
    maxParticipants?: number;
    timeoutDuration?: number;
}

export interface AddParticipantContext {
    roomId: string;
    socketId: string;
    userName: string;
    isCreator: boolean;
    reconnectionToken?: string;
}

export interface UpdateParticipantContext {
    socketId: string;
    lastSeen?: Date;
    reconnectionToken?: string;
}

export interface IRoomRepository {
    createRoom(context: CreateRoomContext): Promise<PrismaRoom>;
    getRoomById(roomId: string): Promise<(PrismaRoom & { participants: PrismaParticipant[] }) | null>;
    addParticipant(context: AddParticipantContext): Promise<PrismaParticipant>;
    removeParticipant(socketId: string): Promise<boolean>;
    updateParticipant(context: UpdateParticipantContext): Promise<PrismaParticipant | null>;
    getParticipantBySocketId(socketId: string): Promise<PrismaParticipant | null>;
    getParticipantByToken(token: string): Promise<PrismaParticipant | null>;
    updateRoomActivity(roomId: string): Promise<void>;
    deactivateRoom(roomId: string): Promise<boolean>;
    cleanupInactiveRooms(cutoffTime: Date): Promise<number>;
    getRoomStats(roomId: string): Promise<{ participantCount: number; lastActivity: Date | null }>;
}

/**
 * Room Repository - Prisma implementation
 * Handles all database operations for rooms and participants
 * Follows DI principles and integrates with the existing Prisma schema
 */
export class RoomRepository implements IRoomRepository {
    private prisma: PrismaClient;
    private logger: Logger;

    constructor(prisma: PrismaClient, logger: Logger) {
        this.prisma = prisma;
        this.logger = logger;
    }

    /**
     * Create a new room
     */
    async createRoom(context: CreateRoomContext): Promise<PrismaRoom> {
        try {
            const room = await this.prisma.room.create({
                data: {
                    id: context.roomId,
                    creator: context.creatorSocketId,
                    maxParticipants: context.maxParticipants || 10,
                    timeoutDuration: context.timeoutDuration || 3600000, // 1 hour
                    isActive: true,
                    lastActivity: new Date()
                }
            });

            this.logger.info('Room created successfully', {
                roomId: room.id,
                creator: room.creator
            });

            return room;
        } catch (error) {
            this.logger.error('Failed to create room', {
                error,
                roomId: context.roomId,
                creator: context.creatorSocketId
            });
            throw error;
        }
    }

    /**
     * Get room by ID with participants
     */
    async getRoomById(roomId: string): Promise<(PrismaRoom & { participants: PrismaParticipant[] }) | null> {
        try {
            const room = await this.prisma.room.findUnique({
                where: { id: roomId },
                include: {
                    participants: {
                        orderBy: { joinedAt: 'asc' }
                    }
                }
            });

            return room;
        } catch (error) {
            this.logger.error('Failed to get room', { error, roomId });
            throw error;
        }
    }

    /**
     * Add participant to room
     */
    async addParticipant(context: AddParticipantContext): Promise<PrismaParticipant> {
        try {
            const participant = await this.prisma.participant.create({
                data: {
                    socketId: context.socketId,
                    userName: context.userName,
                    roomId: context.roomId,
                    isCreator: context.isCreator,
                    reconnectionToken: context.reconnectionToken || uuidv4(),
                    joinedAt: new Date(),
                    lastSeen: new Date()
                }
            });

            this.logger.info('Participant added successfully', {
                socketId: context.socketId,
                roomId: context.roomId,
                userName: context.userName,
                isCreator: context.isCreator
            });

            return participant;
        } catch (error) {
            this.logger.error('Failed to add participant', {
                error,
                socketId: context.socketId,
                roomId: context.roomId
            });
            throw error;
        }
    }

    /**
     * Remove participant from room
     */
    async removeParticipant(socketId: string): Promise<boolean> {
        try {
            const result = await this.prisma.participant.deleteMany({
                where: { socketId }
            });

            const removed = result.count > 0;
            if (removed) {
                this.logger.info('Participant removed successfully', { socketId });
            }

            return removed;
        } catch (error) {
            this.logger.error('Failed to remove participant', { error, socketId });
            throw error;
        }
    }

    /**
     * Update participant information
     */
    async updateParticipant(context: UpdateParticipantContext): Promise<PrismaParticipant | null> {
        try {
            const updateData: any = {};

            if (context.lastSeen) {
                updateData.lastSeen = context.lastSeen;
            }

            if (context.reconnectionToken) {
                updateData.reconnectionToken = context.reconnectionToken;
            }

            if (Object.keys(updateData).length === 0) {
                return null;
            }

            return await this.prisma.participant.update({
                where: {socketId: context.socketId},
                data: updateData
            });
        } catch (error) {
            this.logger.error('Failed to update participant', {
                error,
                socketId: context.socketId
            });
            return null;
        }
    }

    /**
     * Get participant by socket ID
     */
    async getParticipantBySocketId(socketId: string): Promise<PrismaParticipant | null> {
        try {
            return await this.prisma.participant.findUnique({
                where: {socketId}
            });
        } catch (error) {
            this.logger.error('Failed to get participant by socket ID', { error, socketId });
            throw error;
        }
    }

    /**
     * Get participant by reconnection token
     */
    async getParticipantByToken(token: string): Promise<PrismaParticipant | null> {
        try {
            return await this.prisma.participant.findUnique({
                where: {reconnectionToken: token}
            });
        } catch (error) {
            this.logger.error('Failed to get participant by token', { error });
            throw error;
        }
    }

    /**
     * Update room activity timestamp
     */
    async updateRoomActivity(roomId: string): Promise<void> {
        try {
            await this.prisma.room.update({
                where: { id: roomId },
                data: { lastActivity: new Date() }
            });
        } catch (error) {
            this.logger.error('Failed to update room activity', { error, roomId });
            throw error;
        }
    }

    /**
     * Deactivate a room
     */
    async deactivateRoom(roomId: string): Promise<boolean> {
        try {
            const result = await this.prisma.room.update({
                where: { id: roomId },
                data: {
                    isActive: false,
                    lastActivity: new Date()
                }
            });

            this.logger.info('Room deactivated', { roomId });
            return true;
        } catch (error) {
            this.logger.error('Failed to deactivate room', { error, roomId });
            return false;
        }
    }

    /**
     * Clean up inactive rooms
     */
    async cleanupInactiveRooms(cutoffTime: Date): Promise<number> {
        try {
            // First, remove participants from inactive rooms
            await this.prisma.participant.deleteMany({
                where: {
                    room: {
                        OR: [
                            { lastActivity: { lt: cutoffTime } },
                            { isActive: false }
                        ]
                    }
                }
            });

            // Then deactivate inactive rooms
            const result = await this.prisma.room.updateMany({
                where: {
                    AND: [
                        { lastActivity: { lt: cutoffTime } },
                        { isActive: true }
                    ]
                },
                data: { isActive: false }
            });

            this.logger.info('Cleanup completed', {
                roomsDeactivated: result.count,
                cutoffTime
            });

            return result.count;
        } catch (error) {
            this.logger.error('Failed to cleanup inactive rooms', { error, cutoffTime });
            throw error;
        }
    }

    /**
     * Get room statistics
     */
    async getRoomStats(roomId: string): Promise<{ participantCount: number; lastActivity: Date | null }> {
        try {
            const [room, participantCount] = await Promise.all([
                this.prisma.room.findUnique({
                    where: { id: roomId },
                    select: { lastActivity: true }
                }),
                this.prisma.participant.count({
                    where: { roomId }
                })
            ]);

            return {
                participantCount,
                lastActivity: room?.lastActivity || null
            };
        } catch (error) {
            this.logger.error('Failed to get room stats', { error, roomId });
            throw error;
        }
    }
}