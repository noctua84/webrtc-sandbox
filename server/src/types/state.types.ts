export interface ParticipantState {
    socketId: string;
    roomId: string;
    userName: string; // Cached for performance
    isConnected: boolean;
    hasVideo: boolean;
    hasAudio: boolean;
    isScreenSharing: boolean;
    lastSeen: Date;
    connectionState?: 'connecting' | 'connected' | 'disconnected';
}

export interface RoomState {
    id: string;
    isActive: boolean;
    participantCount: number;
    connectedParticipantCount: number;
    lastActivity: Date;
    creatorSocketId: string;
}

export interface TypingState {
    roomId: string;
    participantId: string;
    userName: string;
    isTyping: boolean;
    lastUpdate: Date;
}

export interface PeerConnectionState {
    roomId: string;
    initiatorId: string;
    targetId: string;
    connectionState: RTCPeerConnectionState;
    iceConnectionState: RTCIceConnectionState;
    lastActivity: Date;
}