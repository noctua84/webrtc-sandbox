export interface Room {
    id: string
    name?: string
    createdBy: string
    createdAt: string
    maxParticipants: number
    isActive: boolean
}

export interface Participant {
    socketId: string
    userName: string
    isConnected: boolean
    isCreator?: boolean
    joinedAt: string
    mediaStatus?: {
        hasVideo: boolean
        hasAudio: boolean
        isScreenSharing: boolean
    }
}

export type RoomStatus = 'none' | 'creating' | 'joining' | 'connected' | 'error' | 'reconnecting'

export interface CreateRoomRequest {
    userName: string
    roomName?: string
    maxParticipants?: number
}

export interface CreateRoomResponse {
    success: true
    room: Room
    participant: Participant
}

export interface JoinRoomRequest {
    roomId: string
    userName: string
}

export interface JoinRoomResponse {
    success: true
    room: Room
    participant: Participant
    participants: Participant[]
}

export interface LeaveRoomRequest {
    roomId: string
}

export interface RoomUpdateEvent {
    room?: Room
    participants?: Participant[]
    event: 'participant-joined' | 'participant-left' | 'room-updated'
}

export interface ReconnectionData {
    roomId: string
    userName: string
    timestamp: number
}

export interface RoomError {
    message: string
    code?: string
    timestamp: string
}