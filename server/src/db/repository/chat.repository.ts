import type {ChatMessage, MessageReaction} from "../../types/chat.types";
import {Logger} from "../../types/log.types";

export class MessageRepository {
    private messages = new Map<string, ChatMessage[]>(); // roomId -> messages[]
    private logger: Logger;

    constructor(logger: Logger) {
        this.logger = logger;
    }

    addMessage(message: ChatMessage): void {
        if (!this.messages.has(message.roomId)) {
            this.messages.set(message.roomId, []);
        }

        const roomMessages = this.messages.get(message.roomId)!;
        roomMessages.push(message);

        if (roomMessages.length > 200) {
            this.messages.set(message.roomId, roomMessages.slice(-200));
        }
    }

    getMessages(roomId: string): ChatMessage[] {
        return this.messages.get(roomId) || [];
    }

    updateMessage(roomId: string, messageId: string, newContent: string): ChatMessage | null {
        const messages = this.messages.get(roomId);
        if (!messages) return null;

        const messageIndex = messages.findIndex(m => m.id === messageId);
        if (messageIndex === -1) return null;

        const message = messages[messageIndex];

        if (message === undefined || message === null) {
            this.logger.error('Message not found for update', { roomId, messageId });
            return null;
        }

        message.content = newContent;
        message.edited = true;
        message.editedAt = new Date().toISOString();

        return message;
    }

    // Add reaction to message
    addReaction(roomId: string, messageId: string, emoji: string, userId: string): MessageReaction | null {
        const messages = this.messages.get(roomId);
        if (!messages) return null;

        const message = messages.find(m => m.id === messageId);
        if (!message) return null;

        if (!message.reactions) message.reactions = [];

        let reaction = message.reactions.find(r => r.emoji === emoji);
        if (reaction) {
            // Add user to existing reaction if not already there
            if (!reaction.userIds.includes(userId)) {
                reaction.userIds.push(userId);
                reaction.count = reaction.userIds.length;
            }
        } else {
            // Create new reaction
            reaction = {
                emoji,
                userIds: [userId],
                count: 1
            };
            message.reactions.push(reaction);
        }

        return reaction;
    }

    // Remove reaction from message
    removeReaction(roomId: string, messageId: string, emoji: string, userId: string): boolean {
        const messages = this.messages.get(roomId);
        if (!messages) return false;

        const message = messages.find(m => m.id === messageId);
        if (!message || !message.reactions) return false;

        const reaction = message.reactions.find(r => r.emoji === emoji);
        if (!reaction) return false;

        // Remove user from reaction
        reaction.userIds = reaction.userIds.filter(id => id !== userId);
        reaction.count = reaction.userIds.length;

        // Remove reaction if no users left
        if (reaction.count === 0) {
            message.reactions = message.reactions.filter(r => r.emoji !== emoji);
        }

        return true;
    }

    deleteMessage(roomId: string, messageId: string): boolean {
        const messages = this.messages.get(roomId);
        if (!messages) return false;

        const messageIndex = messages.findIndex(m => m.id === messageId);
        if (messageIndex === -1) return false;

        messages.splice(messageIndex, 1);
        return true;
    }

    clearRoomMessages(roomId: string): void {
        this.messages.delete(roomId);
    }
}