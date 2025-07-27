import {ChatMessage, ChatMessageHistory, MessageActionType, MessageReaction, MessageType} from "@prisma/client";

// ================================
// Core Chat Types
// ================================

export interface CreateMessageContext {
    roomId: string;
    senderId: string;
    senderName: string;
    content: string;
    type?: MessageType;
    replyToId?: string;
    mentions?: string[];
    ipAddress?: string;
}

export interface EditMessageContext {
    messageId: string;
    roomId: string;
    senderId: string;
    senderName: string;
    newContent: string;
    editedBy: string;
    ipAddress?: string;
}

export interface DeleteMessageContext {
    messageId: string;
    deletedBy: string;
    roomId: string;
    reason?: 'user_request' | 'admin_action' | 'moderation' | 'retention_policy';
    ipAddress?: string;
}

// ================================
// Filter Types
// ================================

export type MessageFilterOptions = {
    includeDeleted?: boolean;
    limit?: number;
    offset?: number;
}

// ================================
// Request/Response Types
// ================================

export interface SendMessageRequest {
    roomId: string;
    senderId: string;
    senderName: string;
    content: string;
    type?: 'text' | 'emoji';
    replyTo?: string;
    mentions?: string[];
}

export interface SendMessageResponse {
    success: true;
    message: ChatMessage;
}

export interface EditMessageRequest {
    roomId: string;
    messageId: string;
    newContent: string;
    senderId: string;
    senderName: string;
    editedBy: string;
}

export interface EditMessageResponse {
    success: true;
    message: ChatMessage;
}

export interface DeleteMessageRequest {
    roomId: string;
    messageId: string;
    deletedBy: string;
}

export interface DeleteMessageResponse {
    success: true;
    messageId: string;
}

export interface TypingIndicatorRequest {
    roomId: string;
    isTyping: boolean;
}

export interface TypingIndicatorResponse {
    success: true;
}

export interface AddReactionRequest {
    roomId: string;
    messageId: string;
    emoji: string;
}

export interface AddReactionResponse {
    success: true;
    messageId: string;
    reaction: MessageReaction;
}

export interface RemoveReactionRequest {
    roomId: string;
    messageId: string;
    emoji: string;
}

export interface RemoveReactionResponse {
    success: true;
    messageId: string;
    emoji: string;
}

// ================================
// System Message Types
// ================================

export type SystemMessageType =
    'participant-joined' |
    'participant-left' |
    'host-joined' |
    'host-left' |
    'host-changed' |
    'room-created' |
    'room-updated';

export interface SystemMessageData {
    type: SystemMessageType;
    userName: string;
    userId: string;
    isHost: boolean;
    metadata?: {
        previousHost?: string;
        reason?: string;
    };
}

// ================================
// Chat Analytics Types
// ================================

export interface ChatRoomStats {
    totalMessages: number;
    totalReactions: number;
    activeParticipants: number;
    lastActivityAt: Date | null;
}

// ================================
// Chat Participant Types
// ================================

export interface TypingIndicator {
    roomId: string;
    userId: string;
    userName: string;
    isTyping: boolean;
}

// ================================
// Error Types
// ================================

export interface ChatError {
    code: 'VALIDATION_ERROR' | 'MESSAGE_NOT_FOUND' | 'UNAUTHORIZED' | 'RATE_LIMITED' | 'CONTENT_FILTERED';
    message: string;
    details?: any;
}

// ================================
// Configuration Types
// ================================

export interface ChatConfig {
    maxMessageLength: number;
    maxMessagesPerMinute: number;
    messageRetentionDays: number;
    enableProfanityFilter: boolean;
    enableMentions: boolean;
    enableReactions: boolean;
    enableMessageHistory: boolean;
}

// ================================
// Repository Interface
// ================================

export interface IChatRepository {
    addMessage(context: CreateMessageContext, messageHash: string): Promise<ChatMessage>;
    getMessages(roomId: string, options: MessageFilterOptions): Promise<ChatMessage[]>;
    updateMessage(context: EditMessageContext, messageHash: string): Promise<ChatMessage | null>;
    deleteMessage(context: DeleteMessageContext): Promise<boolean>;
    addReaction(roomId: string, messageId: string, emoji: string, userId: string): Promise<MessageReaction | null>;
    removeReaction(roomId: string, messageId: string, emoji: string, userId: string): Promise<boolean>;
    clearRoomMessages(roomId: string): Promise<void>;
    getMessageHistory(roomId: string): Promise<ChatMessageHistory[]>;
}

// ================================
// Manager Interface
// ================================

export interface IChatManager {
    createMessage(context: CreateMessageContext): Promise<ChatMessage>;
    getRoomMessages(roomId: string, options: MessageFilterOptions): Promise<ChatMessage[]>;
    editMessage(context: EditMessageContext): Promise<ChatMessage | null>;
    deleteMessage(context: DeleteMessageContext): Promise<boolean>;
    addReaction(roomId: string, messageId: string, emoji: string, userId: string): Promise<MessageReaction | null>;
    removeReaction(roomId: string, messageId: string, emoji: string, userId: string): Promise<boolean>;
    clearRoomMessages(roomId: string): Promise<void>;
    getMessageHistory(roomId: string): Promise<ChatMessageHistory[]>;
}