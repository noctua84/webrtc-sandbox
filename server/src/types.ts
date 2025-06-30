// Types for the WebRTC signaling server

export interface Participant {
    socketId: string;
    userName: string;
    isCreator: boolean;
    joinedAt: string;
    lastSeen: string;
    isConnected: boolean;
    reconnectionToken?: string; // For reconnection identification
}

export interface Room {
    id: string;
    creator: string;
    participants: Map<string, Participant>;
    createdAt: string;
    lastActivity: string;
    maxParticipants: number;
    timeoutDuration: number; // Room timeout in milliseconds
    isActive: boolean;
}

export interface CreateRoomRequest {
    roomId?: string;
    userName: string;
    reconnectionToken?: string; // For reconnection attempts
}

export interface JoinRoomRequest {
    roomId: string;
    userName: string;
    reconnectionToken?: string; // For reconnection attempts
}

export interface ReconnectRoomRequest {
    roomId: string;
    reconnectionToken: string;
}

export interface GetRoomInfoRequest {
    roomId: string;
}

export interface RoomResponse {
    id: string;
    createdAt: string;
    lastActivity: string;
    participantCount: number;
    maxParticipants: number;
    isActive: boolean;
    timeoutDuration: number;
}

export interface CreateRoomResponse {
    success: true;
    room: RoomResponse;
    participant: Participant;
    reconnectionToken: string;
}

export interface JoinRoomResponse {
    success: true;
    room: RoomResponse;
    participant: Participant;
    participants: Participant[];
    reconnectionToken: string;
}

export interface ReconnectRoomResponse {
    success: true;
    room: RoomResponse;
    participant: Participant;
    participants: Participant[];
}

export interface GetRoomInfoResponse {
    success: true;
    room: RoomResponse;
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

export interface HealthStatus {
    status: 'healthy';
    timestamp: string;
    uptime: number;
    rooms: number;
    activeRooms: number;
    totalParticipants: number;
    connectedParticipants: number;
}

export interface RoomsInfo {
    rooms: RoomResponse[];
    activeRooms: RoomResponse[];
}

export interface AddParticipantResult {
    success: boolean;
    error?: string;
    room?: Room;
    participant?: Participant;
    isReconnection?: boolean;
}

export interface RemoveParticipantResult {
    roomId: string;
    room: Room | null;
    wasConnected: boolean;
}

export interface ReconnectionAttempt {
    socketId: string;
    roomId: string;
    reconnectionToken: string;
    userName: string;
    timestamp: string;
}

// Log levels for structured logging
export type LogLevel = 'info' | 'success' | 'warning' | 'error';

export interface LogData {
    [key: string]: any;
}

// Socket.IO event types
export interface ServerToClientEvents {
    'room-updated': (data: RoomUpdateEvent) => void;
    'reconnection-available': (data: { roomId: string; timeLeft: number }) => void;
}

export interface ClientToServerEvents {
    'create-room': (data: CreateRoomRequest, callback: (response: ApiResponse<CreateRoomResponse>) => void) => void;
    'join-room': (data: JoinRoomRequest, callback: (response: ApiResponse<JoinRoomResponse>) => void) => void;
    'reconnect-room': (data: ReconnectRoomRequest, callback: (response: ApiResponse<ReconnectRoomResponse>) => void) => void;
    'get-room-info': (data: GetRoomInfoRequest, callback: (response: ApiResponse<GetRoomInfoResponse>) => void) => void;
    'leave-room': (data: { roomId: string }, callback: (response: ApiResponse<{ success: true }>) => void) => void;
}

export interface InterServerEvents {
    // No inter-server events for this implementation
}

export interface SocketData {
    // No additional socket data for this implementation
}