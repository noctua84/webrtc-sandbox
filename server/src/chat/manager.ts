import {CreateMessageContext, DeleteMessageContext, EditMessageContext} from "../types/chat.types";
import * as crypto from "crypto";
import {v4 as uuidv4} from 'uuid';
import {PrismaClient} from "@prisma/client";

function generateContentHash(content: string): string {
    return crypto.createHash('sha256').update(content, 'utf8').digest('hex');
}

export class ChatManager {
    private prisma: any; // Assume prisma is initialized elsewhere

    constructor() {
        this.prisma = new PrismaClient(); // Initialize Prisma Client
    }

    // Create message with basic audit trail
    async createMessage(context: CreateMessageContext): Promise<any> {
        const messageId = uuidv4();
        const contentHash = generateContentHash(context.content);
        const timestamp = new Date();

        return await this.prisma.$transaction(async (tx: any) => {
            // Create the message
            const message = await tx.chatMessage.create({
                data: {
                    id: messageId,
                    roomId: context.roomId,
                    senderId: context.senderId,
                    senderName: context.senderName,
                    content: context.content,
                    originalContent: context.content, // Store original
                    type: context.type || 'TEXT',
                    replyToId: context.replyToId,
                    mentions: context.mentions || [],
                    timestamp,
                    ipAddress: context.ipAddress,
                    messageHash: contentHash
                }
            });

            // Create simple history entry for creation
            await tx.chatMessageHistory.create({
                data: {
                    messageId,
                    roomId: context.roomId,
                    senderId: context.senderId,
                    actionType: 'CREATED',
                    actionTimestamp: timestamp,
                    actionBy: context.senderId,
                    newContent: context.content,
                    ipAddress: context.ipAddress,
                    contentHash
                }
            });

            return message;
        });
    }

    // Edit message with history tracking
    async editMessage(context: EditMessageContext): Promise<any> {
        const timestamp = new Date();
        const newContentHash = generateContentHash(context.newContent);

        return await this.prisma.$transaction(async (tx: any) => {
            // Get current message
            const currentMessage = await tx.chatMessage.findUnique({
                where: { id: context.messageId }
            });

            if (!currentMessage) {
                throw new Error('Message not found');
            }

            if (currentMessage.isDeleted) {
                throw new Error('Cannot edit deleted message');
            }

            // Check if user can edit (only sender can edit their own messages)
            if (currentMessage.senderId !== context.editedBy) {
                throw new Error('You can only edit your own messages');
            }

            // Update message
            const updatedMessage = await tx.chatMessage.update({
                where: { id: context.messageId },
                data: {
                    content: context.newContent,
                    isEdited: true,
                    editedAt: timestamp,
                    editCount: { increment: 1 }
                }
            });

            // Create history entry for edit
            await tx.chatMessageHistory.create({
                data: {
                    messageId: context.messageId,
                    roomId: currentMessage.roomId,
                    senderId: currentMessage.senderId,
                    actionType: 'EDITED',
                    actionTimestamp: timestamp,
                    actionBy: context.editedBy,
                    previousContent: currentMessage.content,
                    newContent: context.newContent,
                    ipAddress: context.ipAddress,
                    contentHash: newContentHash
                }
            });

            return updatedMessage;
        });
    }

    // Soft delete message with audit trail
    async deleteMessage(context: DeleteMessageContext): Promise<any> {
        const timestamp = new Date();

        return await this.prisma.$transaction(async (tx: any) => {
            // Get current message
            const currentMessage = await tx.chatMessage.findUnique({
                where: { id: context.messageId }
            });

            if (!currentMessage) {
                throw new Error('Message not found');
            }

            if (currentMessage.isDeleted) {
                throw new Error('Message already deleted');
            }

            // Check permissions (user can delete own messages, room creator can delete any)
            const room = await tx.room.findUnique({
                where: { id: currentMessage.roomId },
                include: {
                    participants: {
                        where: { socketId: context.deletedBy }
                    }
                }
            });

            const participant = room?.participants[0];
            const canDelete = currentMessage.senderId === context.deletedBy ||
                participant?.isCreator ||
                context.reason === 'admin_action';

            if (!canDelete) {
                throw new Error('You can only delete your own messages');
            }

            // Soft delete the message
            const deletedMessage = await tx.chatMessage.update({
                where: { id: context.messageId },
                data: {
                    isDeleted: true,
                    deletedAt: timestamp,
                    deletedBy: context.deletedBy,
                    deletionReason: context.reason || 'user_request'
                }
            });

            // Create history entry for deletion
            await tx.chatMessageHistory.create({
                data: {
                    messageId: context.messageId,
                    roomId: currentMessage.roomId,
                    senderId: currentMessage.senderId,
                    actionType: 'DELETED',
                    actionTimestamp: timestamp,
                    actionBy: context.deletedBy,
                    previousContent: currentMessage.content,
                    actionReason: context.reason || 'user_request',
                    ipAddress: context.ipAddress
                }
            });

            return deletedMessage;
        });
    }

    // Get room messages (filtered for normal users)
    async getRoomMessages(
        roomId: string,
        options: {
            includeDeleted?: boolean;
            limit?: number;
            offset?: number;
        } = {}
    ): Promise<any> {
        const {
            includeDeleted = false,
            limit = 100,
            offset = 0
        } = options;

        const where: any = { roomId };

        if (!includeDeleted) {
            where.isDeleted = false;
        }

        return await this.prisma.chatMessage.findMany({
            where,
            orderBy: { timestamp: 'desc' },
            take: limit,
            skip: offset,
            include: {
                reactions: true
            }
        });
    }

    // Get message edit history (for transparency)
    async getMessageHistory(messageId: string): Promise<any> {
        return await this.prisma.chatMessageHistory.findMany({
            where: { messageId },
            orderBy: { actionTimestamp: 'asc' }
        });
    }

    // Simple compliance export (if needed for legal requests)
    async exportRoomData(
        roomId: string,
        startDate?: Date,
        endDate?: Date
    ): Promise<{
        messages: any[];
        history: any[];
        summary: any;
    }> {
        const where: any = { roomId };
        if (startDate || endDate) {
            where.timestamp = {};
            if (startDate) where.timestamp.gte = startDate;
            if (endDate) where.timestamp.lte = endDate;
        }

        const [messages, history] = await Promise.all([
            this.prisma.chatMessage.findMany({
                where,
                orderBy: { timestamp: 'asc' },
                include: {
                    reactions: true
                }
            }),
            this.prisma.chatMessageHistory.findMany({
                where: { roomId },
                orderBy: { actionTimestamp: 'asc' }
            })
        ]);

        const summary = {
            roomId,
            totalMessages: messages.length,
            deletedMessages: messages.filter((m: { isDeleted: any; }) => m.isDeleted).length,
            editedMessages: messages.filter((m: { isEdited: any; }) => m.isEdited).length,
            totalActions: history.length,
            dateRange: {
                start: startDate?.toISOString(),
                end: endDate?.toISOString()
            },
            exportedAt: new Date().toISOString()
        };

        return { messages, history, summary };
    }

    // Clean up old messages (for privacy compliance)
    async cleanupOldMessages(daysToKeep: number = 90): Promise<number> {
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);

        // Actually delete very old messages (hard delete for privacy)
        const { count } = await this.prisma.chatMessage.deleteMany({
            where: {
                timestamp: { lt: cutoffDate },
                isDeleted: true // Only hard delete already soft-deleted messages
            }
        });

        return count;
    }
}
