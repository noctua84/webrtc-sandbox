import {Participant, Room} from "./room.types";

export type RTCSdpType = 'offer' | 'answer' | 'pranswer' | 'rollback';

export interface RTCSessionDescriptionInit {
    type: RTCSdpType;
    sdp?: string;
}

export interface RTCIceCandidateInit {
    candidate?: string;
    sdpMLineIndex?: number | null;
    sdpMid?: string | null;
    usernameFragment?: string | null;
}

export interface WebRTCOffer {
    roomId: string;
    targetParticipantId: string;
    sdp: RTCSessionDescriptionInit;
}

export interface WebRTCAnswer {
    roomId: string;
    targetParticipantId: string;
    sdp: RTCSessionDescriptionInit;
}

export interface WebRTCIceCandidate {
    roomId: string;
    targetParticipantId: string;
    candidate: RTCIceCandidateInit;
}

export interface MediaStatusUpdate {
    roomId: string;
    hasVideo: boolean;
    hasAudio: boolean;
    isScreenSharing: boolean;
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
    success: boolean;
    room: RoomResponse;
    participant: Participant;
    reconnectionToken: string;
}

export interface JoinRoomResponse {
    success: boolean;
    room: RoomResponse;
    participant: Participant;
    participants: Participant[];
    reconnectionToken: string;
}

export interface ReconnectRoomResponse {
    success: boolean;
    room: RoomResponse;
    participant: Participant;
    participants: Participant[];
}

export interface GetRoomInfoResponse {
    success: boolean;
    room: RoomResponse;
    participants: Participant[];
}

export interface LeaveRoomResponse {
    success: boolean;
}

export interface ErrorResponse {
    success: boolean;
    error: string;
}

export type ApiResponse<T = any> = T | ErrorResponse;

export interface RoomUpdateEvent {
    roomId: string;
    participants: Participant[];
    event: 'participant-joined' | 'participant-left' | 'participant-reconnected' | 'participant-disconnected' | 'media-status-changed';
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