import {Participant} from "@prisma/client";

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

export interface LeaveRoomRequest {
    roomId: string;
}

export interface RoomParticipant extends Participant {
    mediaStatus: {
        hasVideo: boolean;
        hasAudio: boolean;
        isScreenSharing: boolean;
    }
}