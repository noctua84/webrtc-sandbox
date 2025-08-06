import {Participant as PrismaParticipant, PrismaClient, Room as PrismaRoom} from "@prisma/client";
import type {Logger} from "../../types/log.types";

// Context types for operations
export interface CreateRoomContext {
    eventId: string;
    creatorExtUserId: string;
    creatorUserName: string;
    creatorUserEmail: string;
    maxParticipants?: number;
    timeoutDuration?: number;
}

export interface AddParticipantContext {
    roomId: string;
    socketId: string;
    extUserId: string;
    userName: string;
    userEmail: string;
    reconnectionToken?: string;
}

export interface UpdateParticipantContext {
    participantId: string;
    socketId?: string;
    lastSeen?: Date;
    reconnectionToken?: string;
    isConnected?: boolean;
}

export interface IRoomRepository {
    createRoom(context: CreateRoomContext): Promise<PrismaRoom>;
    getRoomById(roomId: string): Promise<(PrismaRoom & { participants: PrismaParticipant[] }) | null>;
    getRoomByEventId(eventId: string): Promise<(PrismaRoom & { participants: PrismaParticipant[] }) | null>;
    addParticipant(context: AddParticipantContext): Promise<PrismaParticipant>;
    removeParticipant(socketId: string): Promise<boolean>;
    updateParticipant(context: UpdateParticipantContext): Promise<PrismaParticipant | null>;
    updateParticipantSocket(participantId: string, socketId: string): Promise<PrismaParticipant | null>;
    getParticipantBySocketId(socketId: string): any;
    getParticipantByToken(token: string): any;
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
    private config;

    constructor(prisma: PrismaClient, logger: Logger, config: any) {
        this.prisma = prisma;
        this.logger = logger;
        this.config = config;
    }

    /**
     * Create a new room
     */
    async createRoom(context: CreateRoomContext): Promise<PrismaRoom> {
        try {
            // Find or create the creator participant
            let creator = await this.prisma.participant.findUnique({
                where: { extUserId: context.creatorExtUserId }
            });

            if (!creator) {
                creator = await this.prisma.participant.create({
                    data: {
                        extUserId: context.creatorExtUserId,
                        userName: context.creatorUserName,
                        userEmail: context.creatorUserEmail
                    }
                });
            }

            // Create the room
            const room = await this.prisma.room.create({
                data: {
                    eventId: context.eventId,
                    creatorId: creator.id,
                    maxParticipants: context.maxParticipants || 10,
                    timeoutDuration: context.timeoutDuration || 3600000,
                    isActive: true,
                    lastActivity: new Date()
                }
            });

            this.logger.info('Room created successfully', {
                roomId: room.id,
                eventId: context.eventId,
                creatorId: creator.id
            });

            return room;
        } catch (error) {
            this.logger.error('Failed to create room', {
                error,
                eventId: context.eventId,
                creatorExtUserId: context.creatorExtUserId
            });
            throw error;
        }
    }

    async getRoomById(roomId: string): Promise<(PrismaRoom & { participants: PrismaParticipant[] }) | null> {
        try {
            return await this.prisma.room.findUnique({
                where: { id: roomId },
                include: {
                    participants: true
                }
            });
        } catch (error) {
            this.logger.error('Failed to get room by ID', { error, roomId });
            throw error;
        }
    }

    async getRoomByEventId(eventId: string): Promise<(PrismaRoom & { participants: PrismaParticipant[] }) | null> {
        try {
            // The schema has eventId as a unique field on Room, so we can use findUnique
            return await this.prisma.room.findUnique({
                where: { eventId },
                include: {
                    participants: true
                }
            });
        } catch (error) {
            this.logger.error('Failed to get room by event ID', { error, eventId });
            throw error;
        }
    }

    /**
     * Add participant to room
     */
    async addParticipant(context: AddParticipantContext): Promise<PrismaParticipant> {
        try {
            // Find or create the participant
            let participant = await this.prisma.participant.findUnique({
                where: { extUserId: context.extUserId }
            });

            if (participant) {
                // Update existing participant - disconnect from other rooms first
                participant = await this.prisma.participant.update({
                    where: { id: participant.id },
                    data: {
                        socketId: context.socketId,
                        userName: context.userName,
                        userEmail: context.userEmail,
                        reconnectionToken: context.reconnectionToken,
                        isConnected: true,
                        lastSeen: new Date(),
                        participantRooms: {
                            set: [{ id: context.roomId }] // Replace all rooms with just this one
                        }
                    }
                });
            } else {
                // Create new participant
                participant = await this.prisma.participant.create({
                    data: {
                        extUserId: context.extUserId,
                        socketId: context.socketId,
                        userName: context.userName,
                        userEmail: context.userEmail,
                        reconnectionToken: context.reconnectionToken,
                        isConnected: true,
                        joinedAt: new Date(),
                        lastSeen: new Date(),
                        participantRooms: {
                            connect: { id: context.roomId }
                        }
                    }
                });
            }

            this.logger.info('Participant added successfully', {
                participantId: participant.id,
                socketId: context.socketId,
                roomId: context.roomId,
                extUserId: context.extUserId
            });

            return participant;
        } catch (error) {
            this.logger.error('Failed to add participant', {
                error,
                socketId: context.socketId,
                roomId: context.roomId,
                extUserId: context.extUserId
            });
            throw error;
        }
    }

    /**
     * Remove participant from room
     */
    async removeParticipant(socketId: string): Promise<boolean> {
        try {
            const participant = await this.prisma.participant.findUnique({
                where: { socketId }
            });

            if (!participant) return false;

            // Disconnect from all rooms and update connection status
            await this.prisma.participant.update({
                where: { id: participant.id },
                data: {
                    socketId: null,
                    isConnected: false,
                    lastSeen: new Date(),
                    participantRooms: {
                        set: [] // Disconnect from all rooms
                    }
                }
            });

            this.logger.info('Participant removed successfully', {
                participantId: participant.id,
                socketId
            });

            return true;
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

            if (context.socketId !== undefined) {
                updateData.socketId = context.socketId;
            }

            if (context.lastSeen) {
                updateData.lastSeen = context.lastSeen;
            }

            if (context.reconnectionToken) {
                updateData.reconnectionToken = context.reconnectionToken;
            }

            if (context.isConnected !== undefined) {
                updateData.isConnected = context.isConnected;
            }

            if (Object.keys(updateData).length === 0) {
                return null;
            }

            return await this.prisma.participant.update({
                where: { id: context.participantId },
                data: updateData
            });
        } catch (error) {
            this.logger.error('Failed to update participant', {
                error,
                participantId: context.participantId
            });
            return null;
        }
    }

    async updateParticipantSocket(participantId: string, socketId: string): Promise<PrismaParticipant | null> {
        try {
            return await this.prisma.participant.update({
                where: { id: participantId },
                data: {
                    socketId,
                    isConnected: true,
                    lastSeen: new Date()
                }
            });
        } catch (error) {
            this.logger.error('Failed to update participant socket', {
                error,
                participantId,
                socketId
            });
            return null;
        }
    }

    async getParticipantBySocketId(socketId: string) {
        try {
            return await this.prisma.participant.findUnique({
                where: { socketId },
                include: {
                    createdRooms: true,
                    participantRooms: true
                }
            });
        } catch (error) {
            this.logger.error('Failed to get participant by socket ID', { error, socketId });
            throw error;
        }
    }

    async getParticipantByToken(token: string) {
        try {
            return await this.prisma.participant.findUnique({
                where: { reconnectionToken: token },
                include: {
                    createdRooms: true,
                    participantRooms: true
                }
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
            await this.prisma.room.update({
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
            // Disconnect participants from inactive rooms
            await this.prisma.participant.updateMany({
                where: {
                    participantRooms: {
                        some: {
                            OR: [
                                { lastActivity: { lt: cutoffTime } },
                                { isActive: false }
                            ]
                        }
                    }
                },
                data: {
                    socketId: null,
                    isConnected: false,
                    lastSeen: new Date()
                }
            });

            // Deactivate inactive rooms
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
                    where: {
                        participantRooms: {
                            some: { id: roomId }
                        },
                        isConnected: true
                    }
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