export interface Room {
    id: string
    createdAt?: string
    lastActivity?: string
    participantCount?: number
    maxParticipants?: number
    isActive: boolean
    timeoutDuration?: number
}

export interface Participant {
    socketId: string
    userName: string
    isCreator: boolean
    joinedAt: string
    lastSeen: string
    isConnected: boolean
    reconnectionToken?: string
    mediaStatus: {
        hasVideo: boolean
        hasAudio: boolean
        isScreenSharing: boolean
    },
    isOnline?: boolean
    avatar?: string
}

export type RoomStatus = 'none' | 'creating' | 'joining' | 'connected' | 'error' | 'reconnecting'

export interface CreateRoomRequest {
    roomId?: string
    userName: string
    reconnectionToken?: string
}

export interface JoinRoomRequest {
    roomId: string
    userName: string
    reconnectionToken?: string
}

export interface ReconnectRoomRequest {
    roomId: string
    reconnectionToken: string
}

export interface LeaveRoomRequest {
    roomId: string
}

export interface GetRoomInfoRequest {
    roomId: string
}

export interface CreateRoomResponse {
    success: true
    room: Room
    participant: Participant
    reconnectionToken: string
    error?: string
}

export interface JoinRoomResponse {
    success: true
    room: Room
    participant: Participant
    participants: Participant[]
    reconnectionToken: string
    error?: string
}

export interface ReconnectRoomResponse {
    success: true
    room: Room
    participant: Participant
    participants: Participant[]
    error?: string
    reconnectionToken: string
}

export interface GetRoomInfoResponse {
    success: true
    room: Room
    participants: Participant[]
}

export interface ErrorResponse {
    success: false
    error: string
}

export interface RoomUpdateEvent {
    roomId: string
    participants: Participant[]
    event: 'participant-joined' | 'participant-left' | 'participant-reconnected' | 'participant-disconnected' | 'media-status-changed'
    participant?: Participant
    leftParticipantId?: string
    isConnected?: boolean
    isCreator?: boolean
    socketId?: string
}

export interface ReconnectionData {
    roomId: string
    reconnectionToken: string
    userName: string
    timestamp: number
}

export interface RoomError {
    message: string
    code?: string
    timestamp: string
}