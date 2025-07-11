export interface ChatMessage {
    id: string
    roomId: string
    senderId: string
    senderName: string
    content: string
    timestamp: string
    type: 'text' | 'system' | 'emoji' | 'file'
    edited?: boolean
    editedAt?: string
    replyTo?: string
    reactions?: MessageReaction[]
    mentions?: string[]
}

export interface MessageReaction {
    emoji: string
    userIds: string[]
    count: number
}

export interface ChatParticipant {
    socketId: string
    userName: string
    isOnline: boolean
    isTyping: boolean
    lastSeen: string
}

export type SystemMessageType =
    | 'participant-joined'
    | 'participant-left'
    | 'host-joined'
    | 'host-left'
    | 'host-changed'
    | 'room-created'

export interface SystemMessageData {
    type: SystemMessageType
    userName: string
    userId: string
    isHost: boolean
    metadata?: {
        previousHost?: string
        reason?: string
    }
}

// ============================================================================
// REQUEST INTERFACES
// ============================================================================

export interface SendMessageRequest {
    roomId: string
    content: string
    type?: 'text' | 'emoji'
    replyTo?: string
    mentions?: string[]
}

export interface EditMessageRequest {
    roomId: string
    messageId: string
    newContent: string
}

export interface DeleteMessageRequest {
    roomId: string
    messageId: string
}

export interface TypingIndicatorRequest {
    roomId: string
    isTyping: boolean
}

export interface AddReactionRequest {
    roomId: string
    messageId: string
    emoji: string
}

export interface RemoveReactionRequest {
    roomId: string
    messageId: string
    emoji: string
}

// ============================================================================
// RESPONSE INTERFACES
// ============================================================================

export interface SendMessageResponse {
    success: true
    message: ChatMessage
    error?: string
}

export interface EditMessageResponse {
    success: true
    message: ChatMessage
}

export interface DeleteMessageResponse {
    success: true
    messageId: string
}

export interface TypingIndicatorResponse {
    success: true
}

export interface AddReactionResponse {
    success: true
    messageId: string
    reaction: MessageReaction
}

export interface RemoveReactionResponse {
    success: true
    messageId: string
    emoji: string
}

// ============================================================================
// CHAT STATE INTERFACES
// ============================================================================

export interface ChatState {
    messages: ChatMessage[]
    participants: ChatParticipant[]
    typingUsers: Set<string>
    isLoading: boolean
    error: string | null
}

export interface ChatError {
    message: string
    code?: string
    timestamp: string
}

// ============================================================================
// UTILITY FUNCTIONS (for type checking)
// ============================================================================

export const createSystemMessage = (
    roomId: string,
    type: SystemMessageType,
    data: SystemMessageData
): ChatMessage => ({
    id: `system-${Date.now()}-${Math.random()}`,
    roomId,
    senderId: 'system',
    senderName: 'System',
    content: formatSystemMessage(type, data),
    timestamp: new Date().toISOString(),
    type: 'system'
})

const formatSystemMessage = (type: SystemMessageType, data: SystemMessageData): string => {
    switch (type) {
        case 'participant-joined':
            return `${data.userName} joined the room`
        case 'participant-left':
            return `${data.userName} left the room`
        case 'host-joined':
            return `${data.userName} joined as host`
        case 'host-left':
            return `Host ${data.userName} left the room`
        case 'host-changed':
            return `${data.userName} is now the host`
        case 'room-created':
            return `Room created by ${data.userName}`
        default:
            return `Room event: ${type}`
    }
}

