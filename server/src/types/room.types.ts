export interface Participant {
    socketId: string;
    userName: string;
    isCreator: boolean;
    joinedAt: string;
    lastSeen: string;
    isConnected: boolean;
    reconnectionToken?: string;
    mediaStatus: {
        hasVideo: boolean;
        hasAudio: boolean;
        isScreenSharing: boolean;
    };
}

export interface Room {
    id: string;
    creator: string;
    participants: Participant[];
    createdAt: string;
    lastActivity: string;
    maxParticipants: number;
    timeoutDuration: number;
    isActive: boolean;
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

export interface LeaveRoomRequest {
    roomId: string;
}