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
    replyTo?: string; // Message ID being replied to
}

export interface ChatParticipant {
    socketId: string;
    userName: string;
    isOnline: boolean;
    isTyping: boolean;
    lastSeen: string;
}

export interface SendMessageRequest {
    roomId: string;
    content: string;
    type?: 'text' | 'emoji' | undefined;
    replyTo?: string | undefined;
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

// Chat store state
export interface ChatState {
    messages: ChatMessage[];
    participants: ChatParticipant[];
    typingUsers: Set<string>;
    isLoading: boolean;
    error: string | null;
}