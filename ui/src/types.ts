// Shared types for the WebRTC UI client

export interface Participant {
    socketId: string;
    userName: string;
    isCreator: boolean;
    joinedAt: string;
    lastSeen: string;
    isConnected: boolean;
    reconnectionToken?: string;
}

export interface Room {
    id: string;
    createdAt: string;
    lastActivity: string;
    participantCount: number;
    maxParticipants: number;
    isActive: boolean;
    timeoutDuration: number;
}

export interface CreateRoomRequest {
    roomId?: string;
    userName: string;
    reconnectionToken?: string;
}

export interface JoinRoomRequest {
    roomId: string;
    userName: string;
    reconnectionToken?: string;
}

export interface ReconnectRoomRequest {
    roomId: string;
    reconnectionToken: string;
}

export interface GetRoomInfoRequest {
    roomId: string;
}

export interface CreateRoomResponse {
    success: true;
    room: Room;
    participant: Participant;
    reconnectionToken: string;
}

export interface JoinRoomResponse {
    success: true;
    room: Room;
    participant: Participant;
    participants: Participant[];
    reconnectionToken: string;
}

export interface ReconnectRoomResponse {
    success: true;
    room: Room;
    participant: Participant;
    participants: Participant[];
}

export interface GetRoomInfoResponse {
    success: true;
    room: Room;
    participants: Participant[];
}

export interface ErrorResponse {
    success: false;
    error: string;
}

export type ApiResponse<T = any> = T | ErrorResponse;

export interface RoomUpdateEvent {
    roomId: string;
    participants: Participant[];
    event: 'participant-joined' | 'participant-left' | 'participant-reconnected' | 'participant-disconnected';
    participant?: Participant;
    leftParticipantId?: string;
}

export interface ReconnectionAvailableEvent {
    roomId: string;
    timeLeft: number;
}

// Log types for the UI
export type LogLevel = 'info' | 'success' | 'warning' | 'error';

export interface LogEntry {
    id: string | number;
    timestamp: string;
    level: LogLevel;
    message: string;
    data: string | null;
}

export interface LogData {
    [key: string]: any;
}

// Connection status types
export type ConnectionStatus = 'connected' | 'connecting' | 'disconnected' | 'error';
export type RoomStatus = 'idle' | 'creating' | 'joining' | 'reconnecting' | 'in-room' | 'error';

// Reconnection data for localStorage
export interface ReconnectionData {
    roomId: string;
    reconnectionToken: string;
    userName: string;
    timestamp: number;
}

// Socket.IO event types for client
export interface ServerToClientEvents {
    'room-updated': (data: RoomUpdateEvent) => void;
    'reconnection-available': (data: ReconnectionAvailableEvent) => void;
}

export interface ClientToServerEvents {
    'create-room': (data: CreateRoomRequest, callback: (response: ApiResponse<CreateRoomResponse>) => void) => void;
    'join-room': (data: JoinRoomRequest, callback: (response: ApiResponse<JoinRoomResponse>) => void) => void;
    'reconnect-room': (data: ReconnectRoomRequest, callback: (response: ApiResponse<ReconnectRoomResponse>) => void) => void;
    'get-room-info': (data: GetRoomInfoRequest, callback: (response: ApiResponse<GetRoomInfoResponse>) => void) => void;
    'leave-room': (data: { roomId: string }, callback: (response: ApiResponse<{ success: true }>) => void) => void;
}

// Component prop types
export interface StatusIndicatorProps {
    status: ConnectionStatus | RoomStatus;
    label?: string;
    className?: string;
}

export interface LogViewerProps {
    logs: LogEntry[];
    title: string;
    onClear?: () => void;
    className?: string;
}