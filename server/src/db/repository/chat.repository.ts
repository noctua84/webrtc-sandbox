import {Logger} from "../../types/log.types";
import {
    ChatMessage,
    ChatMessageHistory,
    MessageActionType,
    MessageReaction,
    MessageType,
    PrismaClient
} from "@prisma/client";
import {
    CreateMessageContext,
    DeleteMessageContext,
    EditMessageContext,
    IChatRepository,
    MessageFilterOptions
} from "../../types/chat.types";

export class MessageRepository implements IChatRepository {
    private logger: Logger;
    private client: PrismaClient;

    constructor(logger: Logger, prisma: PrismaClient) {
        this.logger = logger;
        this.client = prisma;
    }

    clearRoomMessages(roomId: string): Promise<void> {
        throw new Error("Method not implemented.");
    }
    async getMessageHistory(roomId: string): Promise<ChatMessageHistory[]> {
        return this.client.chatMessageHistory.findMany(
            {
                where: {roomId: roomId},
                include: {
                    message: true
                }
            }
        );
    }

    /**
     * Add a new message to the chat.
     * This method creates a new message in the database and logs the action.
     * It also creates a history entry for the message creation.
     *
     * @returns {Promise<ChatMessage>} - The newly created message.
     * @throws {Error} - If the message could not be added.
     * @param context
     * @param hash
     */
    async addMessage(context: CreateMessageContext, hash: string): Promise<ChatMessage> {
        const timestamp = new Date();

        try {
            const newMessage: ChatMessage = await this.client.$transaction(async(tx: any) => {
                const msg: ChatMessage = await tx.chatMessage.create({
                    data: {
                        roomId: context.roomId,
                        senderId: context.senderId,
                        senderName: context.senderName,
                        content: context.content,
                        timestamp: timestamp,
                        isEdited: false,
                        isDeleted: false,
                        ipAddress: context.ipAddress || 'unknown',
                        messageHash: hash,
                        type: context.type || MessageType.TEXT,
                    },
                    include: {
                        reactions: {
                            include: {
                                participant: {
                                    select: {
                                        socketId: true,
                                        userName: true
                                    }
                                }
                            }
                        }
                    }
                });

                await tx.chatMessageHistory.create({
                    data: {
                        messageId: msg.id,
                        roomId: msg.roomId,
                        senderId: msg.senderId,
                        actionType: MessageActionType.CREATED,
                        actionTimestamp: timestamp,
                        actionBy: msg.senderId,
                        previousContent: null,
                        newContent: msg.content,
                        actionReason: null,
                        ipAddress: msg.ipAddress,
                        contentHash: msg.messageHash
                    }
                });

                return msg;
            });

            this.logger.info(`Message added: ${newMessage.id}`, {messageId: newMessage.id, roomId: newMessage.roomId});

            return newMessage;
        } catch (error: any) {
            this.logger.error(`Failed to add message: ${error.message}`, {error, roomId: context.roomId, senderId: context.senderId});
            throw new Error('Failed to add message');
        }
    }

    /**
     * Retrieve messages for a specific room.
     * This method fetches all messages for a given room ID, ordered by timestamp.
     * It also includes reactions and their participants.
     *
     * @param {string} roomId - The ID of the room to retrieve messages for.
     * @param options
     * @returns {Promise<ChatMessage[]>} - An array of messages for the specified room.
     * @throws {Error} - If the messages could not be retrieved.
     */
    async getMessages(roomId: string, options: MessageFilterOptions): Promise<ChatMessage[]> {
        try {
            const query: any = {
                where: {
                    roomId: roomId,
                    isDeleted: !!options.includeDeleted
                },
                orderBy: { timestamp: 'asc' },
                skip: options.offset || 0,
                include: {
                    reactions: true
                }
            }

            if (options.limit) {
                query.take = options.limit;
            }

            const messages: ChatMessage[] = await this.client.chatMessage.findMany(query);

            this.logger.info(`Retrieved ${messages.length} messages for room ${roomId}`);
            return messages;
        } catch (error: any) {
            this.logger.error(`Failed to retrieve messages for room ${roomId}: ${error.message}`, {error, roomId});
            return [];
        }
    }

    /**
     * Update an existing message.
     * This method updates the content of a message and logs the action.
     * It also creates a history entry for the message edit.
     *
     * @returns {Promise<ChatMessage | null>} - The updated message or null if not found.
     * @throws {Error} - If the message could not be updated.
     * @param context
     * @param messageHash
     */
    async updateMessage(context: EditMessageContext, messageHash: string): Promise<ChatMessage | null> {
        const timestamp = new Date();

        try {
            const updatedMessage: ChatMessage | null = await this.client.$transaction(async(tx: any) => {
                // Get current message
                const currentMessage = await tx.chatMessage.findUnique({
                    where: { id: context.messageId }
                });

                if (!currentMessage || currentMessage.isDeleted) {
                    this.logger.error(`Message ${context.messageId} not found or already deleted`, {roomId: context.roomId, messageId: context.messageId});
                    return null;
                }

                // Update message content
                const updatedMsg: ChatMessage = await tx.chatMessage.update({
                    where: { id: context.messageId },
                    data: {
                        content: context.newContent,
                        editedAt: timestamp,
                        isEdited: true,
                        ipAddress: context.ipAddress || 'unknown',
                        messageHash: messageHash,
                        editCount: { increment: 1 }
                    },
                    include: {
                        reactions: {
                            include: {
                                participant: {
                                    select: {
                                        socketId: true,
                                        userName: true
                                    }
                                }
                            }
                        }
                    }
                });

                // Create history entry for edit
                await tx.chatMessageHistory.create({
                    data: {
                        messageId: context.messageId,
                        roomId: context.roomId,
                        senderId: currentMessage.senderId,
                        actionType: MessageActionType.EDITED,
                        actionTimestamp: timestamp,
                        actionBy: context.editedBy,
                        previousContent: currentMessage.content,
                        newContent: context.newContent,
                        actionReason: null,
                        ipAddress: context.ipAddress || 'unknown',
                        contentHash: updatedMsg.messageHash
                    }
                });

                return updatedMsg;
            });

            this.logger.info(`Message updated successfully`, {messageId: context.messageId, roomId: context.roomId});
            return updatedMessage;
        } catch (error: any) {
            this.logger.error(`Failed to update message ${context.messageId} in room ${context.roomId}: ${error.message}`, {error, roomId: context.roomId, messageId: context.messageId});
            return null;
        }
    }

    // Add reaction to message
    async addReaction(roomId: string, messageId: string, emoji: string, participantId: string): Promise<MessageReaction | null> {
        const timestamp = new Date();

        try {
            const reaction: MessageReaction = await this.client.$transaction(async(tx: any) => {
                // Check if reaction already exists
                const existingReaction = await tx.messageReaction.findFirst({
                    where: {
                        messageId,
                        emoji,
                        participantId: participantId
                    }
                });

                if (existingReaction) {
                    // Increment count if reaction already exists
                    return await tx.messageReaction.update({
                        where: { id: existingReaction.id },
                        data: { count: { increment: 1 } }
                    });
                } else {
                    // Create new reaction
                    return await tx.messageReaction.create({
                        data: {
                            messageId,
                            emoji,
                            participantId: participantId,
                            count: 1
                        }
                    });
                }
            });

            this.logger.info(`Reaction added to message ${messageId}`, {emoji, participantId, roomId});
            return reaction;
        } catch (error: any) {
            this.logger.error(`Failed to add reaction to message ${messageId}: ${error.message}`, {error, roomId, messageId, emoji, participantId});
            return null;
        }
    }

    // Remove reaction from message
    async removeReaction(roomId: string, messageId: string, emoji: string, participantId: string): Promise<boolean> {
        const timestamp = new Date();

        try {
            await this.client.$transaction(async(tx: any) => {
                // Check if reaction exists
                const existingReaction = await tx.messageReaction.findFirst({
                    where: {
                        messageId,
                        emoji,
                        participantId: participantId
                    }
                });

                if (!existingReaction) {
                    throw new Error('Reaction not found');
                }

                // Decrement count or delete if count is 1
                if (existingReaction.count > 1) {
                    return await tx.messageReaction.update({
                        where: { id: existingReaction.id },
                        data: { count: { decrement: 1 } }
                    });
                } else {
                    return await tx.messageReaction.delete({
                        where: { id: existingReaction.id }
                    });
                }
            });

            this.logger.info(`Reaction removed from message ${messageId}`, {emoji, participantId, roomId});
            return true;
        } catch (error: any) {
            this.logger.error(`Failed to remove reaction from message ${messageId}: ${error.message}`, {error, roomId, messageId, emoji, participantId});
            return false;
        }
    }

    async deleteMessage(context: DeleteMessageContext): Promise<boolean> {
        const timestamp = new Date();

        try {
            const del_msg = await this.client.$transaction(async(tx: any) => {
                // Check if message exists
                const existingMessage = await tx.chatMessage.findUnique({
                    where: { id: context.messageId }
                });

                if (!existingMessage) {
                    throw new Error('Message not found');
                }

                // Soft delete message
                const msg = await tx.chatMessage.update({
                    where: { id: existingMessage.id },
                    data: {
                        isDeleted: true,
                        deletedAt: timestamp,
                        deletedBy: context.deletedBy,
                        deletionReason: context.reason || 'user_request'
                    }
                });

                if (!msg) {
                    this.logger.error(`Failed to delete message ${existingMessage.id}`, {roomId: existingMessage.roomId, messageId: existingMessage.id});
                    throw new Error('Failed to delete message');
                }

                // Create history entry for deletion
                await tx.chatMessageHistory.create({
                    data: {
                        messageId: msg.id,
                        roomId: msg.roomId,
                        senderId: existingMessage.senderId,
                        actionType: MessageActionType.DELETED,
                        actionTimestamp: timestamp,
                        actionBy: context.deletedBy,
                        previousContent: existingMessage.content,
                        newContent: null,
                        actionReason: context.reason || 'user_request',
                        ipAddress: existingMessage.ipAddress,
                        contentHash: existingMessage.messageHash
                    }
                });

                return msg;
            });

            this.logger.info(`Message ${del_msg.id} deleted successfully`, {roomId: del_msg.roomId});
            return true;
        } catch (error: any) {
            this.logger.error(`Failed to delete message ${context.messageId}: ${error.message}`, {error, roomId: context.roomId, messageId: context.messageId});
            return false;
        }
    }
}