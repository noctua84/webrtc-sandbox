import {
    CreateMessageContext,
    DeleteMessageContext,
    EditMessageContext,
    IChatManager, IChatRepository,
    MessageFilterOptions
} from "../types/chat.types";
import * as crypto from "crypto";
import {MetricsCollector} from "../metrics/collector";
import {ServerLogger} from "../logger";
import {MessageReaction} from "@prisma/client";

function generateContentHash(content: string): string {
    return crypto.createHash('sha256').update(content, 'utf8').digest('hex');
}

export class ChatManager implements IChatManager {
    private metrics: MetricsCollector
    private repository: IChatRepository
    private logger: ServerLogger

    constructor(metrics: MetricsCollector, repository: IChatRepository, logger: ServerLogger) {
        this.metrics = metrics;
        this.repository = repository;
        this.logger = logger
    }

    addReaction(roomId: string, messageId: string, emoji: string, userId: string): Promise<MessageReaction | null> {
        throw new Error("Method not implemented.");
    }
    removeReaction(roomId: string, messageId: string, emoji: string, userId: string): Promise<boolean> {
        throw new Error("Method not implemented.");
    }
    clearRoomMessages(roomId: string): Promise<void> {
        throw new Error("Method not implemented.");
    }

    // Create message with basic audit trail
    async createMessage(context: CreateMessageContext) {
        const timestamp = new Date();
        const contentHash = generateContentHash(context.content);

        return await this.repository.addMessage(context, contentHash);
    }

    // Edit message with history tracking
    async editMessage(context: EditMessageContext) {
        const timestamp = new Date();
        const newContentHash = generateContentHash(context.newContent);

        return await this.repository.updateMessage(context, newContentHash);
    }

    // Soft delete message with audit trail
    async deleteMessage(context: DeleteMessageContext) {
        const timestamp = new Date();

        return await this.repository.deleteMessage(context);
    }

    // Get room messages (filtered for normal users)
    async getRoomMessages(
        roomId: string,
        options: MessageFilterOptions
    ) {
        return await this.repository.getMessages(roomId, options);
    }

    async getMessageHistory(roomId: string) {
        return await this.repository.getMessageHistory(roomId);
    }
}
