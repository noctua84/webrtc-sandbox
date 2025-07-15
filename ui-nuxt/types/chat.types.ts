// ui-nuxt/types/chat.types.ts

export interface ChatMessage {
    id: string;
    roomId: string;
    senderId: string;
    senderName: string;
    content: string;
    timestamp: string;
    type: 'text' | 'system' | 'emoji' | 'file';
    edited?: boolean;
    editedAt?: string;
    replyTo?: string;
    reactions?: MessageReaction[];
    mentions?: string[];
}

export interface ChatParticipant {
    socketId: string;
    userName: string;
    isOnline: boolean;
    isTyping: boolean;
    lastSeen: string;
}

export interface MessageReaction {
    emoji: string;
    userIds: string[];
    count: number;
}

export type SystemMessageType =
    | 'participant-joined'
    | 'participant-left'
    | 'host-joined'
    | 'host-left'
    | 'host-changed'
    | 'room-created';

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

export interface SendMessageRequest {
    roomId: string;
    content: string;
    type?: 'text' | 'emoji' | undefined;
    replyTo?: string | undefined;
    mentions?: string[] | undefined;
}

export interface SendMessageResponse {
    success: true;
    message: ChatMessage;
}

export interface TypingIndicatorRequest {
    roomId: string;
    isTyping: boolean;
}

export interface TypingIndicatorResponse {
    success: true;
}

export interface EditMessageRequest {
    roomId: string;
    messageId: string;
    newContent: string;
}

export interface EditMessageResponse {
    success: true;
    message: ChatMessage;
}

export interface DeleteMessageRequest {
    roomId: string;
    messageId: string;
}

export interface DeleteMessageResponse {
    success: true;
    messageId: string;
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

export interface ChatError {
    message: string;
    code?: string;
    timestamp: string;
}

// Helper types for the store
export interface ChatState {
    messages: ChatMessage[];
    participants: ChatParticipant[];
    typingUsers: Set<string>;
    isLoading: boolean;
    error: string | null;
}