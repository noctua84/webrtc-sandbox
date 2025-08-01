import {Participant} from "@prisma/client";

export interface CreateRoomRequest {
    eventId: string; // Now required - rooms must be associated with events
    userName: string;
    userEmail: string; // Now required per schema
    reconnectionToken?: string;
}

export interface JoinRoomRequest {
    roomId: string;
    participantId?: string;
    eventId?: string;
    userName: string;
    userEmail: string; // Now required per schema
    extUserId: string; // Now required per schema
    reconnectionToken?: string;
}

export interface ReconnectRoomRequest {
    roomId: string;
    reconnectionToken: string;
}

export interface GetRoomInfoRequest {
    roomId: string;
}

export interface LeaveRoomRequest {
    roomId: string;
}

export interface RoomParticipant extends Participant {
    mediaStatus: {
        hasVideo: boolean;
        hasAudio: boolean;
        isScreenSharing: boolean;
    };
}

// Add a response type that matches what we actually send over the wire
export interface RoomParticipantResponse {
    id: string;
    socketId: string;
    userName: string;
    userEmail: string;
    extUserId: string;
    isCreator: boolean;
    joinedAt: string;
    lastSeen: string;
    reconnectionToken: string;
    roomId: string;
    mediaStatus: {
        hasVideo: boolean;
        hasAudio: boolean;
        isScreenSharing: boolean;
    };
}