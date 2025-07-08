import {Participant} from "@/types/participant.types.ts";


export type RoomStatus = 'idle' | 'creating' | 'joining' | 'reconnecting' | 'in-room' | 'error';

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
    roomId?: string | undefined;
    userName: string;
    reconnectionToken?: string | undefined;
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
    error?: any;
}

export interface JoinRoomResponse {
    success: true;
    room: Room;
    participant: Participant;
    participants: Participant[];
    reconnectionToken: string;
    error?: any;
}

export interface ReconnectRoomResponse {
    success: true;
    room: Room;
    participant: Participant;
    participants: Participant[];
    error?: any;
}

export interface GetRoomInfoResponse {
    success: true;
    room: Room;
    participants: Participant[];
}