export interface CreateMessageContext {
    roomId: string;
    senderId: string;
    senderName: string;
    content: string;
    type?: 'TEXT' | 'EMOJI';
    replyToId?: string;
    mentions?: string[];
    ipAddress?: string;
}

export interface EditMessageContext {
    messageId: string;
    newContent: string;
    editedBy: string;
    ipAddress?: string;
}

export interface DeleteMessageContext {
    messageId: string;
    deletedBy: string;
    reason?: 'user_request' | 'admin_action';
    ipAddress?: string;
}

export interface ChatMessage {
    id: string;
    roomId: string;
    senderId: string;
    senderName: string;
    content: string;
    timestamp: string;
    type: 'text' | 'system' | 'emoji' | undefined;
    edited?: boolean | undefined;
    editedAt?: string | undefined;
    replyTo?: string | undefined;
    mentions?: string[] | undefined;
    reactions?: MessageReaction[] | undefined;
}

export interface SendMessageRequest {
    roomId: string;
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

export interface TypingIndicatorRequest {
    roomId: string;
    isTyping: boolean;
}

export interface TypingIndicatorResponse {
    success: true;
}

export interface MessageReaction {
    emoji: string;
    userIds: string[];
    count: number; // Number of users who reacted with this emoji
}

export type AddReactionRequest = {
    roomId: string;
    messageId: string;
    emoji: string;
}

export type AddReactionResponse = {
    success: true;
    messageId: string;
    reaction: MessageReaction;
}

export type RemoveReactionRequest = {
    roomId: string;
    messageId: string;
    emoji: string;
    userId: string;
}

export type RemoveReactionResponse = {
    success: true;
    messageId: string;
    emoji: string;
}

export type SystemMessageType =
    'participant-joined' |
    'participant-left' |
    'host-joined' |
    'host-left' |
    'host-changed' |
    'room-created' |
    'room-updated';