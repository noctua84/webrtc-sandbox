export type MediaStatus = 'inactive' | 'requesting' | 'active' | 'error';

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

export interface PeerConnection {
    participantId: string;
    userName: string;
    connection: RTCPeerConnection;
    localStream?: MediaStream | undefined;
    remoteStream?: MediaStream | undefined;
    isInitiator: boolean;
    connectionState: RTCPeerConnectionState;
    iceConnectionState: RTCIceConnectionState;
}

export interface MediaConstraints {
    video: boolean | MediaTrackConstraints;
    audio: boolean | MediaTrackConstraints;
}