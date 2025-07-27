import { PrismaClient } from "@prisma/client";
import type { Logger } from "../types/log.types";

/**
 * Room Domain Helper Functions
 * Utility functions for room operations and validations
 */

/**
 * Validate room ID format
 */
export const isValidRoomId = (roomId: string): boolean => {
    if (!roomId) return false;

    // Allow alphanumeric, hyphens, underscores (3-50 chars)
    const roomIdRegex = /^[a-zA-Z0-9\-_]{3,50}$/;
    return roomIdRegex.test(roomId);
};

/**
 * Validate username format
 */
export const isValidUsername = (username: string): boolean => {
    if (!username) return false;

    const trimmed = username.trim();
    // Allow most characters but limit length (1-30 chars)
    return trimmed.length >= 1 && trimmed.length <= 30;
};

/**
 * Check if a room is over capacity
 */
export const isRoomOverCapacity = async (
    prisma: PrismaClient,
    roomId: string,
    maxParticipants: number
): Promise<boolean> => {
    try {
        const participantCount = await prisma.participant.count({
            where: { roomId }
        });

        return participantCount >= maxParticipants;
    } catch {
        return true; // Err on the side of caution
    }
};

/**
 * Check if a socket is already in a room
 */
export const isSocketInRoom = async (
    prisma: PrismaClient,
    socketId: string
): Promise<string | null> => {
    try {
        const participant = await prisma.participant.findUnique({
            where: { socketId },
            select: { roomId: true }
        });

        return participant?.roomId || null;
    } catch {
        return null;
    }
};

/**
 * Get room activity metrics
 */
export const getRoomMetrics = async (
    prisma: PrismaClient,
    roomId: string
): Promise<{
    participantCount: number;
    activeParticipants: number;
    roomAge: number; // in milliseconds
    lastActivity: Date | null;
}> => {
    try {
        const room = await prisma.room.findUnique({
            where: { id: roomId },
            select: {
                createdAt: true,
                lastActivity: true,
                participants: {
                    select: {
                        lastSeen: true
                    }
                }
            }
        });

        if (!room) {
            return {
                participantCount: 0,
                activeParticipants: 0,
                roomAge: 0,
                lastActivity: null
            };
        }

        const now = new Date();
        const fiveMinutesAgo = new Date(now.getTime() - 5 * 60 * 1000);

        const activeParticipants = room.participants.filter(
            p => p.lastSeen > fiveMinutesAgo
        ).length;

        return {
            participantCount: room.participants.length,
            activeParticipants,
            roomAge: now.getTime() - room.createdAt.getTime(),
            lastActivity: room.lastActivity
        };
    } catch (error) {
        throw new Error(`Failed to get room metrics: ${error}`);
    }
};

/**
 * Check if a room should be cleaned up
 */
export const shouldCleanupRoom = async (
    prisma: PrismaClient,
    roomId: string,
    timeoutDuration: number
): Promise<boolean> => {
    try {
        const room = await prisma.room.findUnique({
            where: { id: roomId },
            select: {
                lastActivity: true,
                isActive: true,
                participants: {
                    select: { id: true }
                }
            }
        });

        if (!room) return true;
        if (!room.isActive) return true;
        if (room.participants.length === 0) return true;

        const cutoffTime = new Date(Date.now() - timeoutDuration);
        return room.lastActivity < cutoffTime;
    } catch {
        return false; // Don't cleanup on error
    }
};

/**
 * Generate secure reconnection token
 */
export const generateSecureToken = (): string => {
    const crypto = require('crypto');
    return crypto.randomBytes(32).toString('hex');
};

/**
 * Validate reconnection token format
 */
export const isValidReconnectionToken = (token: string): boolean => {
    if (!token) return false;

    // Should be 64 character hex string
    const tokenRegex = /^[a-f0-9]{64}$/;
    return tokenRegex.test(token);
};

/**
 * Get participants summary for a room
 */
export const getParticipantsSummary = async (
    prisma: PrismaClient,
    roomId: string
): Promise<{
    total: number;
    creators: number;
    recentlyActive: number;
    oldestJoinTime: Date | null;
    newestJoinTime: Date | null;
}> => {
    try {
        const participants = await prisma.participant.findMany({
            where: { roomId },
            select: {
                isCreator: true,
                joinedAt: true,
                lastSeen: true
            }
        });

        if (participants.length === 0) {
            return {
                total: 0,
                creators: 0,
                recentlyActive: 0,
                oldestJoinTime: null,
                newestJoinTime: null
            };
        }

        const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
        const creators = participants.filter(p => p.isCreator).length;
        const recentlyActive = participants.filter(p => p.lastSeen > fiveMinutesAgo).length;

        const joinTimes = participants.map(p => p.joinedAt).sort();

        return {
            total: participants.length,
            creators,
            recentlyActive,
            oldestJoinTime: joinTimes[0],
            newestJoinTime: joinTimes[joinTimes.length - 1]
        };
    } catch (error) {
        throw new Error(`Failed to get participants summary: ${error}`);
    }
};

/**
 * Find rooms that need cleanup
 */
export const findRoomsForCleanup = async (
    prisma: PrismaClient,
    timeoutDuration: number,
    limit: number = 100
): Promise<string[]> => {
    try {
        const cutoffTime = new Date(Date.now() - timeoutDuration);

        const rooms = await prisma.room.findMany({
            where: {
                OR: [
                    {
                        AND: [
                            { lastActivity: { lt: cutoffTime } },
                            { isActive: true }
                        ]
                    },
                    {
                        AND: [
                            { isActive: true },
                            { participants: { none: {} } } // No participants
                        ]
                    }
                ]
            },
            select: { id: true },
            take: limit
        });

        return rooms.map(room => room.id);
    } catch (error) {
        throw new Error(`Failed to find rooms for cleanup: ${error}`);
    }
};

/**
 * Get system-wide room statistics
 */
export const getSystemRoomStats = async (
    prisma: PrismaClient
): Promise<{
    totalRooms: number;
    activeRooms: number;
    totalParticipants: number;
    averageParticipantsPerRoom: number;
    oldestRoomAge: number; // in milliseconds
}> => {
    try {
        const [roomStats, participantCount] = await Promise.all([
            prisma.room.aggregate({
                _count: { id: true },
                _min: { createdAt: true },
                where: { isActive: true }
            }),
            prisma.participant.count()
        ]);

        const totalActiveRooms = roomStats._count.id || 0;
        const totalParticipants = participantCount;
        const averageParticipantsPerRoom = totalActiveRooms > 0
            ? totalParticipants / totalActiveRooms
            : 0;

        const oldestRoomAge = roomStats._min.createdAt
            ? Date.now() - roomStats._min.createdAt.getTime()
            : 0;

        return {
            totalRooms: totalActiveRooms,
            activeRooms: totalActiveRooms,
            totalParticipants,
            averageParticipantsPerRoom: Number(averageParticipantsPerRoom.toFixed(2)),
            oldestRoomAge
        };
    } catch (error) {
        throw new Error(`Failed to get system room stats: ${error}`);
    }
};

/**
 * Cleanup orphaned participants (participants without valid rooms)
 */
export const cleanupOrphanedParticipants = async (
    prisma: PrismaClient,
    logger?: Logger
): Promise<number> => {
    try {
        const result = await prisma.participant.deleteMany({
            where: {
                room: {
                    isActive: false
                }
            }
        });

        logger?.info('Cleaned up orphaned participants', {
            participantsRemoved: result.count
        });

        return result.count;
    } catch (error) {
        logger?.error('Failed to cleanup orphaned participants', { error });
        throw error;
    }
};

/**
 * Validate room configuration
 */
export const validateRoomConfig = (config: {
    maxParticipants?: number;
    timeoutDuration?: number;
}): { valid: boolean; errors: string[] } => {
    const errors: string[] = [];

    if (config.maxParticipants !== undefined) {
        if (config.maxParticipants < 1 || config.maxParticipants > 100) {
            errors.push('Max participants must be between 1 and 100');
        }
    }

    if (config.timeoutDuration !== undefined) {
        if (config.timeoutDuration < 60000 || config.timeoutDuration > 86400000) {
            errors.push('Timeout duration must be between 1 minute and 24 hours');
        }
    }

    return {
        valid: errors.length === 0,
        errors
    };
};