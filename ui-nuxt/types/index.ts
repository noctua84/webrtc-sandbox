// types/index.ts

// ============================================================================
// CONNECTION TYPES
// ============================================================================

export type ConnectionStatus = 'connected' | 'connecting' | 'disconnected' | 'error'

export interface ReconnectionData {
    roomId: string
    userName: string
    timestamp: number
}

// ============================================================================
// ROOM TYPES
// ============================================================================

export type RoomStatus = 'none' | 'creating' | 'joining' | 'connected' | 'error'

export interface Room {
    id: string
    name: string
    createdAt: string
    createdBy: string
    maxParticipants: number
    isActive: boolean
}

export interface Participant {
    socketId: string
    userName: string
    joinedAt: string
    isConnected: boolean
    mediaStatus: MediaStatus
}

export interface CreateRoomRequest {
    userName: string
    roomName?: string
    maxParticipants?: number
}

export interface CreateRoomResponse {
    room: Room
    participant: Participant
    error?: string
    success: boolean
}

export interface JoinRoomRequest {
    roomId: string
    userName: string
}

export interface JoinRoomResponse {
    room: Room
    participant: Participant
    participants: Participant[]
    error?: string
    success: boolean
}

// ============================================================================
// WEBRTC TYPES
// ============================================================================

export interface MediaStatus {
    video: boolean
    audio: boolean
    screen: boolean
}

export interface WebRTCOffer {
    roomId: string
    targetSocketId: string
    offer: RTCSessionDescriptionInit
}

export interface WebRTCAnswer {
    roomId: string
    targetSocketId: string
    answer: RTCSessionDescriptionInit
}

export interface WebRTCIceCandidate {
    roomId: string
    targetSocketId: string
    candidate: RTCIceCandidateInit
}

export interface MediaStatusUpdate {
    roomId: string
    mediaStatus: MediaStatus
}

// ============================================================================
// CHAT TYPES
// ============================================================================

export interface ChatMessage {
    id: string
    roomId: string
    senderId: string
    senderName: string
    content: string
    timestamp: string
    type: 'text' | 'system' | 'emoji'
    edited?: boolean
    editedAt?: string
}

export interface SendMessageRequest {
    roomId: string
    content: string
    type?: 'text' | 'emoji'
}

export interface TypingIndicatorRequest {
    roomId: string
    isTyping: boolean
}

// ============================================================================
// EVENT TYPES
// ============================================================================

export interface RoomUpdateEvent {
    room: Room
    participants: Participant[]
    eventType: 'participant-joined' | 'participant-left' | 'participant-updated'
}

// ============================================================================
// API RESPONSE TYPES
// ============================================================================

export interface ApiResponse<T = any> {
    success: boolean
    data?: T
    error?: string
}

// ============================================================================
// LOGGING TYPES
// ============================================================================

export type LogLevel = 'info' | 'success' | 'warning' | 'error'

export interface LogEntry {
    id: number
    timestamp: string
    level: LogLevel
    message: string
    data?: string | null
}

export type LogData = Record<string, any>