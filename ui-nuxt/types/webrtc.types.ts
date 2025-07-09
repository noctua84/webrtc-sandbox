export interface MediaStatus {
    video: boolean
    audio: boolean
    screen: boolean
}

export interface WebRTCOffer {
    roomId: string
    targetSocketId: string
    offer: RTCSessionDescriptionInit
}

export interface WebRTCAnswer {
    roomId: string
    targetSocketId: string
    answer: RTCSessionDescriptionInit
}

export interface WebRTCIceCandidate {
    roomId: string
    targetSocketId: string
    candidate: RTCIceCandidateInit
}

export interface MediaStatusUpdate {
    roomId: string
    mediaStatus: MediaStatus
}

export interface PeerConnection {
    connection: RTCPeerConnection
    participantId: string
    userName: string
    retryCount: number
}

export interface MediaDevices {
    videoDevices: MediaDeviceInfo[]
    audioDevices: MediaDeviceInfo[]
}

export interface ConnectionStatus {
    connectionState: RTCPeerConnectionState
    iceConnectionState: RTCIceConnectionState
    iceGatheringState: RTCIceGatheringState
    signalingState: RTCSignalingState
}

export interface WebRTCOffer {
    senderSocketId: string
    senderName: string
    targetSocketId: string
    offer: RTCSessionDescriptionInit
    roomId: string
}

export interface WebRTCAnswer {
    senderSocketId: string
    senderName: string
    targetSocketId: string
    answer: RTCSessionDescriptionInit
    roomId: string
}

export interface ICECandidate {
    senderSocketId: string
    targetSocketId: string
    candidate: RTCIceCandidate
    roomId: string
}

export interface StreamUpdate {
    participantId: string
    hasVideo: boolean
    hasAudio: boolean
    isScreenSharing: boolean
    roomId: string
}

export interface MediaStatusUpdate {
    participantId: string
    userName: string
    hasVideo: boolean
    hasAudio: boolean
    isScreenSharing: boolean
    roomId: string
}