import { PrismaClient } from "@prisma/client";
import type { Logger } from "../types/log.types";

/**
 * Chat Domain Helper Functions
 * Utility functions for chat operations and validations
 * Focused on core functionality without moderation
 */

/**
 * Validate if a user is a participant in a room
 */
export const validateRoomMembership = async (
    prisma: PrismaClient,
    roomId: string,
    socketId: string
): Promise<boolean> => {
    try {
        const participant = await prisma.participant.findFirst({
            where: {
                roomId,
                socketId
            }
        });
        return !!participant;
    } catch {
        return false;
    }
};

/**
 * Check if a user can edit a specific message
 */
export const canUserEditMessage = async (
    prisma: PrismaClient,
    messageId: string,
    userId: string
): Promise<boolean> => {
    try {
        const message = await prisma.chatMessage.findUnique({
            where: { id: messageId },
            select: { senderId: true, isDeleted: true }
        });

        if (!message || message.isDeleted) {
            return false;
        }

        // Only the sender can edit their own message
        return message.senderId === userId;
    } catch {
        return false;
    }
};

/**
 * Check if a user can delete a specific message
 */
export const canUserDeleteMessage = async (
    prisma: PrismaClient,
    messageId: string,
    userId: string
): Promise<boolean> => {
    try {
        const message = await prisma.chatMessage.findUnique({
            where: { id: messageId },
            select: {
                senderId: true,
                isDeleted: true,
                room: {
                    select: { creator: true }
                }
            }
        });

        if (!message || message.isDeleted) {
            return false;
        }

        // User can delete if they are the sender or room creator
        return message.senderId === userId || message.room.creator === userId;
    } catch {
        return false;
    }
};

/**
 * Basic content sanitization for safety
 */
export const sanitizeMessageContent = (content: string): string => {
    if (!content) return '';

    return content
        .trim()
        .substring(0, 1000); // Enforce max length
};

/**
 * Validate emoji format (basic check)
 */
export const isValidEmoji = (emoji: string): boolean => {
    if (!emoji || typeof emoji !== 'string') return false;

    // Basic validation - accept most reasonable emoji inputs
    return emoji.length <= 10 && emoji.trim().length > 0;
};

/**
 * Extract mentioned user IDs from content
 */
export const extractMentions = (content: string): string[] => {
    if (!content) return [];

    // Extract @mentions (assuming format @socketId or @username)
    const mentionRegex = /@(\w+)/g;
    const mentions: string[] = [];
    let match;

    while ((match = mentionRegex.exec(content)) !== null) {
        if (match[1] && !mentions.includes(match[1])) {
            mentions.push(match[1]);
        }
    }

    return mentions;
};

/**
 * Format message content for display (process mentions, etc.)
 */
export const formatMessageContent = (content: string, participants: Array<{socketId: string, userName: string}>): string => {
    if (!content) return '';

    let formattedContent = content;

    // Replace @mentions with formatted mentions
    participants.forEach(participant => {
        const mentionRegex = new RegExp(`@${participant.socketId}\\b`, 'g');
        formattedContent = formattedContent.replace(mentionRegex, `@${participant.userName}`);
    });

    return formattedContent;
};

/**
 * Basic rate limiting helper - check if user is sending messages too quickly
 */
export const checkRateLimit = async (
    prisma: PrismaClient,
    roomId: string,
    userId: string,
    timeWindow: number = 60000, // 1 minute
    maxMessages: number = 20 // Relaxed for video chat context
): Promise<boolean> => {
    try {
        const since = new Date(Date.now() - timeWindow);

        const recentMessages = await prisma.chatMessage.count({
            where: {
                roomId,
                senderId: userId,
                timestamp: {
                    gte: since
                },
                isDeleted: false
            }
        });

        return recentMessages < maxMessages;
    } catch {
        return true; // Allow on error to avoid blocking legitimate users
    }
};

/**
 * Get room statistics for analytics
 */
export const getRoomChatStats = async (
    prisma: PrismaClient,
    roomId: string
): Promise<{
    totalMessages: number;
    totalReactions: number;
    activeParticipants: number;
    lastActivityAt: Date | null;
}> => {
    try {
        const [messageCount, reactionCount, participantCount, lastMessage] = await Promise.all([
            prisma.chatMessage.count({
                where: { roomId, isDeleted: false }
            }),
            prisma.messageReaction.count({
                where: { message: { roomId } }
            }),
            prisma.participant.count({
                where: { roomId }
            }),
            prisma.chatMessage.findFirst({
                where: { roomId, isDeleted: false },
                orderBy: { timestamp: 'desc' },
                select: { timestamp: true }
            })
        ]);

        return {
            totalMessages: messageCount,
            totalReactions: reactionCount,
            activeParticipants: participantCount,
            lastActivityAt: lastMessage?.timestamp || null
        };
    } catch (error) {
        throw new Error(`Failed to get room chat stats: ${error}`);
    }
};

/**
 * Clean up old chat data for a room
 */
export const cleanupOldMessages = async (
    prisma: PrismaClient,
    roomId: string,
    retentionDays: number = 30,
    logger?: Logger
): Promise<number> => {
    try {
        const cutoffDate = new Date(Date.now() - (retentionDays * 24 * 60 * 60 * 1000));

        const result = await prisma.chatMessage.updateMany({
            where: {
                roomId,
                timestamp: {
                    lt: cutoffDate
                },
                isDeleted: false
            },
            data: {
                isDeleted: true,
                deletedAt: new Date(),
                deletionReason: 'retention_policy'
            }
        });

        logger?.info('Cleaned up old messages', {
            roomId,
            messagesDeleted: result.count,
            retentionDays
        });

        return result.count;
    } catch (error) {
        logger?.error('Failed to cleanup old messages', { error, roomId });
        throw error;
    }
};