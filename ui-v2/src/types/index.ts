// types/index.ts
export interface EventEntity {
    eventId: string;
    eventTitle: string;
    eventDescription?: string;
    scheduledStartTime: string;
    hostUserId: string;
    hostUserName: string;
    hostEmail: string;
    maxParticipants: number;
    currentBookings: number;
    roomId: string;
    status: EventStatus;
    createdAt: string;
}

export enum EventStatus {
    SCHEDULED = 'SCHEDULED',
    ACTIVE = 'ACTIVE',
    CLOSED = 'CLOSED'
}

export interface EventBooking {
    id: string;
    eventId: string;
    userId: string;
    userName: string;
    userEmail: string;
    bookedAt: string;
    isConnected?: boolean;
}

export interface CreateEventRequest {
    eventId: string;
    eventTitle: string;
    eventDescription?: string;
    scheduledStartTime: string;
    hostUserId: string;
    hostUserName: string;
    hostEmail: string;
    maxParticipants?: number;
    timeoutDuration?: number;
}

export interface CreateEventResponse {
    success: boolean;
    event?: EventEntity;
    error?: string;
}

export interface BookEventRequest {
    eventId: string;
    userId: string;
    userName: string;
    userEmail: string;
}

export interface BookEventResponse {
    success: boolean;
    booking?: EventBooking;
    event?: Partial<EventEntity>;
    error?: string;
}

export interface Participant {
    id: string;
    roomId: string;
    socketId: string;
    userName: string;
    userEmail: string;
    extUserId: string;
    isCreator: boolean;
    joinedAt: string;
    lastSeen: string;
    reconnectionToken: string;
    mediaStatus: {
        hasVideo: boolean;
        hasAudio: boolean;
        isScreenSharing: boolean;
    };
}

export interface Room {
    id: string;
    eventId: string;
    eventTitle: string;
    createdAt: string;
    lastActivity: string;
    participantCount: number;
    maxParticipants: number;
    isActive: boolean;
    timeoutDuration: number;
}

export interface JoinRoomRequest {
    eventId: string;
    roomId: string;
    extUserId: string;
    userName: string;
    userEmail: string;
    reconnectionToken?: string | undefined;
}

export interface JoinRoomResponse {
    success: boolean;
    room?: Room;
    participant?: Participant;
    participants?: Participant[];
    reconnectionToken?: string;
    error?: string;
}

export interface RoomUpdateEvent {
    roomId: string;
    participants: Participant[];
    event: 'participant-joined' | 'participant-left' | 'participant-reconnected';
    participant: Participant;
}

// Socket.IO event types
export interface ClientToServerEvents {
    'join-room': (data: JoinRoomRequest, callback: (response: JoinRoomResponse) => void) => void;
    'leave-room': (data: { roomId: string }, callback: (response: { success: boolean; error?: string }) => void) => void;
    'get-room-info': (data: { roomId: string }, callback: (response: any) => void) => void;
}

export interface ServerToClientEvents {
    'room-updated': (data: RoomUpdateEvent) => void;
    'participant-joined': (data: Participant) => void;
    'participant-left': (data: { socketId: string; userName: string }) => void;
    'error': (data: { message: string; code?: string }) => void;

    // Socket.IO event types
    'connect': () => void;
    'disconnect': (reason: string) => void;
    'connect_error': (error: { message: string; code?: string }) => void
    'reconnect': (attempt: number) => void;
    'reconnect_error': (error: { message: string; code?: string }) => void
}

// Logger types
export type LogLevel = 'info' | 'success' | 'warning' | 'error';

export interface LogEntry {
    id: string;
    timestamp: string;
    level: LogLevel;
    message: string;
    data?: any;
}

// Connection status
export type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

// User role
export type UserRole = 'host' | 'participant';