// ui/src/stores/chat.store.ts

import { makeObservable, observable, action, runInAction, computed } from 'mobx';
import socketStore from './socket.store';
import roomStore from './room.store';

import type {
    ChatMessage,
    ChatParticipant,
    DeleteMessageRequest, DeleteMessageResponse,
    EditMessageRequest, EditMessageResponse,
    SendMessageRequest, SendMessageResponse, TypingIndicatorRequest
} from "@/types/chat.types.ts";
import {LogLevel,LogData, LogEntry} from "@/types/logging.types.ts";

class ChatStore {
    @observable messages: ChatMessage[] = [];
    @observable participants: ChatParticipant[] = [];
    @observable typingUsers = new Set<string>();
    @observable isLoading = false;
    @observable error: string | null = null;
    @observable logs: LogEntry[] = [];

    private typingTimeout: NodeJS.Timeout | null = null;
    private lastTypingTime = 0;

    constructor() {
        makeObservable(this);
        this.setupSocketListeners();
    }

    // Logging function
    log(level: LogLevel, message: string, data: LogData | null = null): void {
        const timestamp = new Date().toISOString();
        const logEntry: LogEntry = {
            id: Date.now() + Math.random(),
            timestamp,
            level,
            message,
            data: data ? JSON.stringify(data, null, 2) : null
        };

        runInAction(() => {
            this.logs.push(logEntry);
            if (this.logs.length > 100) {
                this.logs = this.logs.slice(-100);
            }
        });

        const consoleMessage = `[CHAT] [${level.toUpperCase()}] ${message}`;
        if (data) {
            console.log(consoleMessage, data);
        } else {
            console.log(consoleMessage);
        }
    }

    private setupSocketListeners(): void {
        this.log('info', 'Setting up chat socket listeners');

        // Handle incoming messages
        socketStore.on('chat-message', (message: ChatMessage) => {
            this.handleIncomingMessage(message);
        });

        // Handle message edits
        socketStore.on('chat-message-edited', (message: ChatMessage) => {
            this.handleMessageEdited(message);
        });

        // Handle message deletions
        socketStore.on('chat-message-deleted', (data: { roomId: string; messageId: string }) => {
            this.handleMessageDeleted(data);
        });

        // Handle typing indicators
        socketStore.on('chat-typing', (data: { roomId: string; userId: string; userName: string; isTyping: boolean }) => {
            this.handleTypingIndicator(data);
        });

        this.log('info', 'Chat socket listeners configured');
    }

    @action
    private handleIncomingMessage(message: ChatMessage): void {
        if (!roomStore.currentRoom || message.roomId !== roomStore.currentRoom.id) {
            this.log('warning', 'Received message for different room', {
                messageRoomId: message.roomId,
                currentRoomId: roomStore.currentRoom?.id
            });
            return;
        }

        this.log('info', 'Received chat message', {
            messageId: message.id,
            sender: message.senderName,
            type: message.type,
            content: message.content.substring(0, 50) + (message.content.length > 50 ? '...' : '')
        });

        runInAction(() => {
            // Remove from typing users when they send a message
            this.typingUsers.delete(message.senderId);

            // Add message to list
            this.messages.push(message);

            // Keep only last 200 messages
            if (this.messages.length > 200) {
                this.messages = this.messages.slice(-200);
            }
        });
    }

    @action
    private handleMessageEdited(editedMessage: ChatMessage): void {
        this.log('info', 'Message edited', { messageId: editedMessage.id });

        runInAction(() => {
            const index = this.messages.findIndex(m => m.id === editedMessage.id);
            if (index !== -1) {
                this.messages[index] = editedMessage;
            }
        });
    }

    @action
    private handleMessageDeleted(data: { roomId: string; messageId: string }): void {
        this.log('info', 'Message deleted', { messageId: data.messageId });

        runInAction(() => {
            this.messages = this.messages.filter(m => m.id !== data.messageId);
        });
    }

    @action
    private handleTypingIndicator(data: { roomId: string; userId: string; userName: string; isTyping: boolean }): void {
        if (!roomStore.currentRoom || data.roomId !== roomStore.currentRoom.id) return;
        if (data.userId === roomStore.currentParticipant?.socketId) return; // Don't show own typing

        runInAction(() => {
            if (data.isTyping) {
                this.typingUsers.add(data.userId);
            } else {
                this.typingUsers.delete(data.userId);
            }
        });

        // Auto-remove typing indicator after 3 seconds
        if (data.isTyping) {
            setTimeout(() => {
                runInAction(() => {
                    this.typingUsers.delete(data.userId);
                });
            }, 3000);
        }
    }

    // Send a message
    @action
    async sendMessage(content: string, type: 'text' | 'emoji' = 'text', replyTo?: string): Promise<void> {
        if (!roomStore.currentRoom) {
            throw new Error('Not in a room');
        }

        if (!content.trim()) {
            throw new Error('Message cannot be empty');
        }

        this.log('info', 'Sending message', { type, contentLength: content.length, replyTo });

        try {
            const messageData: SendMessageRequest = {
                roomId: roomStore.currentRoom.id,
                content: content.trim(),
                type,
                replyTo
            };

            // Fix: Use the correct response type that includes the message
            const response = await socketStore.emitWithCallback<SendMessageResponse>('send-message', messageData);

            this.log('success', 'Message sent successfully', { messageId: response.message.id });

        } catch (error) {
            this.log('error', 'Failed to send message', { error: (error as Error).message });
            throw error;
        }
    }

    // Edit a message
    @action
    async editMessage(messageId: string, newContent: string): Promise<void> {
        if (!roomStore.currentRoom) {
            throw new Error('Not in a room');
        }

        if (!newContent.trim()) {
            throw new Error('Message cannot be empty');
        }

        this.log('info', 'Editing message', { messageId, newContentLength: newContent.length });

        try {
            const editData: EditMessageRequest = {
                roomId: roomStore.currentRoom.id,
                messageId,
                newContent: newContent.trim()
            };

            // Fix: Use the correct response type
            const response = await socketStore.emitWithCallback<EditMessageResponse>('edit-message', editData);
            this.log('success', 'Message edited successfully', { messageId: response.message.id });

        } catch (error) {
            this.log('error', 'Failed to edit message', { messageId, error: (error as Error).message });
            throw error;
        }
    }

    // Delete a message
    @action
    async deleteMessage(messageId: string): Promise<void> {
        if (!roomStore.currentRoom) {
            throw new Error('Not in a room');
        }

        this.log('info', 'Deleting message', { messageId });

        try {
            const deleteData: DeleteMessageRequest = {
                roomId: roomStore.currentRoom.id,
                messageId
            };

            // Fix: Use the correct response type
            const response = await socketStore.emitWithCallback<DeleteMessageResponse>('delete-message', deleteData);
            this.log('success', 'Message deleted successfully', { messageId: response.messageId });

        } catch (error) {
            this.log('error', 'Failed to delete message', { messageId, error: (error as Error).message });
            throw error;
        }
    }

    // Send typing indicator
    @action
    sendTypingIndicator(isTyping: boolean): void {
        if (!roomStore.currentRoom) return;

        const now = Date.now();

        // Throttle typing indicators (max once per second)
        if (isTyping && now - this.lastTypingTime < 1000) return;
        this.lastTypingTime = now;

        try {
            const typingData: TypingIndicatorRequest = {
                roomId: roomStore.currentRoom.id,
                isTyping
            };

            socketStore.emitWithCallback('typing-indicator', typingData);

            // Auto-stop typing after 3 seconds
            if (isTyping) {
                if (this.typingTimeout) clearTimeout(this.typingTimeout);
                this.typingTimeout = setTimeout(() => {
                    this.sendTypingIndicator(false);
                }, 3000);
            }

        } catch (error) {
            this.log('error', 'Failed to send typing indicator', { error: (error as Error).message });
        }
    }

    // Load chat history
    @action
    async loadChatHistory(): Promise<void> {
        if (!roomStore.currentRoom) return;

        runInAction(() => {
            this.isLoading = true;
            this.error = null;
        });

        this.log('info', 'Loading chat history', { roomId: roomStore.currentRoom.id });

        try {
            // Use emitWithCallback instead of relying on separate event
            const response = await socketStore.emitWithCallback<{ success: true; messages: ChatMessage[] }>(
                'get-chat-history',
                { roomId: roomStore.currentRoom.id },
                5000 // 5 second timeout
            );

            this.log('info', 'Chat history loaded successfully', {
                messageCount: response.messages.length
            });

            runInAction(() => {
                this.messages = response.messages || [];
                this.isLoading = false;
                this.error = null;
            });

        } catch (error) {
            this.log('error', 'Failed to load chat history', { error: (error as Error).message });

            runInAction(() => {
                this.isLoading = false;
                this.error = (error as Error).message;
                // Don't clear messages on error, keep any existing ones
            });
        }
    }

    // Clear messages (when leaving room)
    @action
    clearMessages(): void {
        this.log('info', 'Clearing chat messages');

        runInAction(() => {
            this.messages = [];
            this.typingUsers.clear();
            this.error = null;
            this.isLoading = false;
        });

        if (this.typingTimeout) {
            clearTimeout(this.typingTimeout);
            this.typingTimeout = null;
        }
    }

    // Clear logs
    @action
    clearLogs(): void {
        runInAction(() => {
            this.logs = [];
        });
        this.log('info', 'Chat logs cleared');
    }

    @action
    resetLoadingState(): void {
        this.log('info', 'Manually resetting loading state');
        runInAction(() => {
            this.isLoading = false;
            this.error = null;
        });
    }

    // Computed properties
    @computed
    get messageCount(): number {
        return this.messages.length;
    }

    @computed
    get typingUserNames(): string[] {
        return Array.from(this.typingUsers).map(userId => {
            const participant = roomStore.participants.find(p => p.socketId === userId);
            return participant?.userName || 'Unknown';
        }).filter(Boolean);
    }

    @computed
    get hasMessages(): boolean {
        return this.messages.length > 0;
    }

    @computed
    get lastMessage(): ChatMessage | null | undefined {
        return this.messages.length > 0 ? this.messages[this.messages.length - 1] : null;
    }

    @computed
    get canSendMessage(): boolean {
        return roomStore.isInRoom && !this.isLoading;
    }

    // Get messages from specific user
    getMessagesByUser(userId: string): ChatMessage[] {
        return this.messages.filter(m => m.senderId === userId);
    }

    // Get message by ID
    getMessageById(messageId: string): ChatMessage | undefined {
        return this.messages.find(m => m.id === messageId);
    }

    // Check if user can edit/delete message
    canEditMessage(message: ChatMessage): boolean {
        return message.senderId === roomStore.currentParticipant?.socketId;
    }

    @computed
    get shouldShowLoading(): boolean {
        return this.isLoading && this.messages.length === 0;
    }
}

export default new ChatStore();