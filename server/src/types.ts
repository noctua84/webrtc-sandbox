// Types for the WebRTC signaling server

export interface Participant {
    socketId: string;
    userName: string;
    isCreator: boolean;
    joinedAt: string;
}

export interface Room {
    id: string;
    creator: string;
    participants: Map<string, Participant>;
    createdAt: string;
    maxParticipants: number;
}

export interface CreateRoomRequest {
    roomId?: string;
    userName: string;
}

export interface JoinRoomRequest {
    roomId: string;
    userName: string;
}

export interface GetRoomInfoRequest {
    roomId: string;
}

export interface RoomResponse {
    id: string;
    createdAt: string;
    participantCount: number;
    maxParticipants: number;
}

export interface CreateRoomResponse {
    success: true;
    room: RoomResponse;
    participant: Participant;
}

export interface JoinRoomResponse {
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
    event: 'participant-joined' | 'participant-left';
    newParticipant?: Participant;
    leftParticipantId?: string;
}

export interface HealthStatus {
    status: 'healthy';
    timestamp: string;
    uptime: number;
    rooms: number;
    totalParticipants: number;
}

export interface RoomsInfo {
    rooms: RoomResponse[];
}

export interface AddParticipantResult {
    success: boolean;
    error?: string;
    room?: Room;
    participant?: Participant;
}

export interface RemoveParticipantResult {
    roomId: string;
    room: Room | null;
}

// Log levels for structured logging
export type LogLevel = 'info' | 'success' | 'warning' | 'error';

export interface LogData {
    [key: string]: any;
}

// Socket.IO event types
export interface ServerToClientEvents {
    'room-updated': (data: RoomUpdateEvent) => void;
}

export interface ClientToServerEvents {
    'create-room': (data: CreateRoomRequest, callback: (response: ApiResponse<CreateRoomResponse>) => void) => void;
    'join-room': (data: JoinRoomRequest, callback: (response: ApiResponse<JoinRoomResponse>) => void) => void;
    'get-room-info': (data: GetRoomInfoRequest, callback: (response: ApiResponse<GetRoomInfoResponse>) => void) => void;
}

export interface InterServerEvents {
    // No inter-server events for this implementation
}

export interface SocketData {
    // No additional socket data for this implementation
}