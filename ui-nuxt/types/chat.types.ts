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

export interface SendMessageRequest {
    roomId: string
    content: string
    type?: 'text' | 'emoji'
    replyTo?: string
    mentions?: string[]
}

export interface SendMessageResponse {
    success: true
    message: ChatMessage
}

export interface EditMessageRequest {
    roomId: string
    messageId: string
    newContent: string
}

export interface EditMessageResponse {
    success: true
    message: ChatMessage
}

export interface DeleteMessageRequest {
    roomId: string
    messageId: string
}

export interface DeleteMessageResponse {
    success: true
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

// Production logging interface (simplified)
export interface ChatError {
    message: string
    code?: string
    timestamp: string
}