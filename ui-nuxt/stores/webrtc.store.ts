// stores/webrtc.ts
import {defineStore} from 'pinia'
import {computed, onBeforeUnmount, readonly, ref} from 'vue'

import {useSocketIO} from '~/composables/useSocketIO'
import {useRoomStore} from './room.store'
import type {
    ConnectionStatus,
    ICECandidate,
    MediaDevices,
    MediaStatusUpdate,
    PeerConnection,
    StreamUpdate,
    WebRTCAnswer,
    WebRTCOffer
} from "~/types/webrtc.types";

// ============================================================================
// CONSTANTS & CONFIGURATION
// ============================================================================

const ICE_SERVERS: RTCIceServer[] = [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    {
        urls: 'turn:openrelay.metered.ca:80',
        username: 'openrelayproject',
        credential: 'openrelayproject'
    }
]

const CONNECTION_CONFIG = {
    RETRY_DELAY_BASE: 2000,
    MAX_RETRY_ATTEMPTS: 3,
    CONNECTION_TIMEOUT: 30000,
    ICE_GATHERING_TIMEOUT: 10000
}

const MEDIA_CONSTRAINTS = {
    video: {
        width: { ideal: 1280, max: 1920 },
        height: { ideal: 720, max: 1080 },
        frameRate: { ideal: 30, max: 60 }
    },
    audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true
    }
}

// ============================================================================
// WEBRTC STORE
// ============================================================================

export const useWebRTCStore = defineStore('webrtc', () => {
    // State
    const localStream = ref<MediaStream | null>(null)
    const peerConnections = ref<Map<string, PeerConnection>>(new Map())
    const remoteStreams = ref<Map<string, MediaStream>>(new Map())
    const availableDevices = ref<MediaDevices>({
        videoDevices: [],
        audioDevices: []
    })

    // Media state
    const hasVideo = ref(false)
    const hasAudio = ref(false)
    const isScreenSharing = ref(false)
    const selectedVideoDevice = ref<string | null>(null)
    const selectedAudioDevice = ref<string | null>(null)

    // Connection state
    const isConnecting = ref(false)
    const connectionRetryAttempts = ref<Map<string, number>>(new Map())

    // Composables
    const { emit, on, off } = useSocketIO()
    const roomStore = useRoomStore()

    // ========================================================================
    // COMPUTED
    // ========================================================================

    const isMediaActive = computed(() => !!localStream.value)

    const connectedParticipants = computed(() => {
        const connected: string[] = []
        peerConnections.value.forEach((peer, participantId) => {
            if (peer.connection.connectionState === 'connected') {
                connected.push(participantId)
            }
        })
        return connected
    })

    const connectionStatuses = computed(() => {
        const statuses: Record<string, ConnectionStatus> = {}
        peerConnections.value.forEach((peer, participantId) => {
            statuses[participantId] = {
                connectionState: peer.connection.connectionState,
                iceConnectionState: peer.connection.iceConnectionState,
                iceGatheringState: peer.connection.iceGatheringState,
                signalingState: peer.connection.signalingState
            }
        })
        return statuses
    })

    // ========================================================================
    // UTILITY FUNCTIONS
    // ========================================================================

    const createPeerConnection = (participantId: string, userName: string): RTCPeerConnection => {
        const connection = new RTCPeerConnection({
            iceServers: ICE_SERVERS,
            iceCandidatePoolSize: 10
        })

        // Add local stream to connection
        if (localStream.value) {
            localStream.value.getTracks().forEach(track => {
                connection.addTrack(track, localStream.value!)
            })
        }

        // Handle ICE candidates
        connection.onicecandidate = async (event) => {
            if (event.candidate && roomStore.currentRoom) {
                await emit('ice-candidate', {
                    targetSocketId: participantId,
                    candidate: event.candidate,
                    roomId: roomStore.currentRoom.id
                })
            }
        }

        // Handle remote stream
        connection.ontrack = (event) => {
            const [remoteStream] = event.streams
            if (remoteStream) {
                remoteStreams.value.set(participantId, remoteStream)
            }
        }

        // Handle connection state changes
        connection.onconnectionstatechange = async () => {
            const state = connection.connectionState

            if (state === 'connected') {
                connectionRetryAttempts.value.delete(participantId)
            } else if (state === 'failed' || state === 'disconnected') {
                await handleConnectionFailure(participantId, userName)
            }
        }

        // Handle ICE connection state changes
        connection.oniceconnectionstatechange = async () => {
            if (connection.iceConnectionState === 'failed') {
                await handleConnectionFailure(participantId, userName)
            }
        }

        return connection
    }

    const handleConnectionFailure = async (participantId: string, userName: string) => {
        const currentAttempts = connectionRetryAttempts.value.get(participantId) || 0

        if (currentAttempts < CONNECTION_CONFIG.MAX_RETRY_ATTEMPTS) {
            connectionRetryAttempts.value.set(participantId, currentAttempts + 1)

            // Wait before retry
            const delay = CONNECTION_CONFIG.RETRY_DELAY_BASE * Math.pow(2, currentAttempts)
            await new Promise(resolve => setTimeout(resolve, delay))

            // Retry connection
            await initiatePeerConnection(participantId, userName)
        } else {
            // Max retries reached, clean up
            cleanup(participantId)
        }
    }

    const cleanup = (participantId?: string) => {
        if (participantId) {
            // Clean up specific participant
            const peer = peerConnections.value.get(participantId)
            if (peer) {
                peer.connection.close()
                peerConnections.value.delete(participantId)
            }
            remoteStreams.value.delete(participantId)
            connectionRetryAttempts.value.delete(participantId)
        } else {
            // Clean up all connections
            peerConnections.value.forEach(peer => peer.connection.close())
            peerConnections.value.clear()
            remoteStreams.value.clear()
            connectionRetryAttempts.value.clear()

            // Stop local stream
            if (localStream.value) {
                localStream.value.getTracks().forEach(track => track.stop())
                localStream.value = null
            }

            hasVideo.value = false
            hasAudio.value = false
            isScreenSharing.value = false
        }
    }

    // ========================================================================
    // MEDIA METHODS
    // ========================================================================

    const getAvailableDevices = async (): Promise<void> => {
        try {
            const devices = await navigator.mediaDevices.enumerateDevices()

            availableDevices.value = {
                videoDevices: devices.filter(device => device.kind === 'videoinput'),
                audioDevices: devices.filter(device => device.kind === 'audioinput')
            }
        } catch (error) {
            console.error('Failed to enumerate devices:', error)
        }
    }

    const startMedia = async (video = true, audio = true): Promise<void> => {
        try {
            isConnecting.value = true

            const constraints: MediaStreamConstraints = {
                video: video ? {
                    ...MEDIA_CONSTRAINTS.video,
                    deviceId: selectedVideoDevice.value ? { exact: selectedVideoDevice.value } : undefined
                } : false,
                audio: audio ? {
                    ...MEDIA_CONSTRAINTS.audio,
                    deviceId: selectedAudioDevice.value ? { exact: selectedAudioDevice.value } : undefined
                } : false
            }

            localStream.value = await navigator.mediaDevices.getUserMedia(constraints)
            hasVideo.value = video
            hasAudio.value = audio
            isScreenSharing.value = false

            await getAvailableDevices()
            await updateMediaStatus()

            // Auto-connect to existing participants
            if (roomStore.participants.length > 1) {
                await connectToAllParticipants()
            }
        } catch (error) {
            console.error('Failed to start media:', error)
            throw error
        } finally {
            isConnecting.value = false
        }
    }

    const startScreenShare = async () => {
        try {
            isConnecting.value = true

            const screenStream = await navigator.mediaDevices.getDisplayMedia({
                video: true,
                audio: true
            })

            // Stop current video stream
            if (localStream.value) {
                localStream.value.getVideoTracks().forEach(track => track.stop())
            }

            localStream.value = screenStream
            hasVideo.value = true
            isScreenSharing.value = true

            // Handle screen share end
            screenStream.getVideoTracks()[0].addEventListener('ended', () => {
                stopScreenShare()
            })

            await updateMediaStatus()

            // Update all peer connections with new stream
            await Promise.all(
                Array.from(peerConnections.value.values()).map(async (peer) => {
                    const videoSender = peer.connection.getSenders().find(
                        sender => sender.track?.kind === 'video'
                    )
                    if (videoSender && screenStream.getVideoTracks()[0]) {
                        return videoSender.replaceTrack(screenStream.getVideoTracks()[0])
                    }
                })
            )
        } catch (error) {
            console.error('Failed to start screen share:', error)
            throw error
        } finally {
            isConnecting.value = false
        }
    }

    const stopScreenShare = async () => {
        if (!isScreenSharing.value) return

        try {
            // Restart camera
            await startMedia(hasVideo.value, hasAudio.value)
        } catch (error) {
            console.error('Failed to stop screen share:', error)
        }
    }

    const stopMedia = async () => {
        if (localStream.value) {
            localStream.value.getTracks().forEach(track => track.stop())
            localStream.value = null
        }

        hasVideo.value = false
        hasAudio.value = false
        isScreenSharing.value = false

        await updateMediaStatus()
        cleanup()
    }

    const toggleVideo = async () => {
        if (!localStream.value) return

        const videoTrack = localStream.value.getVideoTracks()[0]
        if (videoTrack) {
            videoTrack.enabled = !videoTrack.enabled
            hasVideo.value = videoTrack.enabled
            await updateMediaStatus()
        }
    }

    const toggleAudio = async () => {
        if (!localStream.value) return

        const audioTrack = localStream.value.getAudioTracks()[0]
        if (audioTrack) {
            audioTrack.enabled = !audioTrack.enabled
            hasAudio.value = audioTrack.enabled
            await updateMediaStatus()
        }
    }

    const updateMediaStatus = async () => {
        if (!roomStore.currentRoom) return

        await emit('media-status-update', {
            roomId: roomStore.currentRoom.id,
            hasVideo: hasVideo.value,
            hasAudio: hasAudio.value,
            isScreenSharing: isScreenSharing.value
        })
    }

    // Add new method to switch video device
    const switchVideoDevice = async (deviceId: string): Promise<void> => {
        if (!localStream.value || deviceId === selectedVideoDevice.value) return

        try {
            selectedVideoDevice.value = deviceId

            // If we have active media, restart it with the new device
            if (hasVideo.value) {
                const audioEnabled = hasAudio.value
                await startMedia(true, audioEnabled)
            }
        } catch (error) {
            console.error('Failed to switch video device:', error)
            throw error
        }
    }

    // Add new method to switch audio device
    const switchAudioDevice = async (deviceId: string): Promise<void> => {
        if (!localStream.value || deviceId === selectedAudioDevice.value) return

        try {
            selectedAudioDevice.value = deviceId

            // If we have active media, restart it with the new device
            if (hasAudio.value) {
                const videoEnabled = hasVideo.value
                await startMedia(videoEnabled, true)
            }
        } catch (error) {
            console.error('Failed to switch audio device:', error)
            throw error
        }
    }

    // ========================================================================
    // CONNECTION METHODS
    // ========================================================================

    const handleNewParticipant = async (participantId: string, userName: string): Promise<void> => {
        if (!isMediaActive.value || peerConnections.value.has(participantId)) {
            return
        }

        try {
            await initiatePeerConnection(participantId, userName)
        } catch (error) {
            console.error('Failed to connect to new participant:', error)
        }
    }

    const initiatePeerConnection = async (participantId: string, userName: string): Promise<void> => {
        if (!roomStore.currentRoom || !roomStore.currentParticipant) {
            throw new Error('Not in a room')
        }

        const currentSocketId = roomStore.currentParticipant.socketId
        const shouldInitiate = currentSocketId < participantId

        if (!shouldInitiate) return

        const connection = createPeerConnection(participantId, userName)

        peerConnections.value.set(participantId, {
            connection,
            participantId,
            userName,
            retryCount: 0
        })

        try {
            const offer = await connection.createOffer()
            await connection.setLocalDescription(offer)

            emit('webrtc-offer', {
                targetSocketId: participantId,
                offer,
                roomId: roomStore.currentRoom.id
            })
        } catch (error) {
            cleanup(participantId)
            throw error
        }
    }

    const connectToAllParticipants = async (): Promise<void> => {
        if (!isMediaActive.value || !roomStore.currentParticipant) return

        const otherParticipants = roomStore.participants.filter(
            p => p.socketId !== roomStore.currentParticipant?.socketId
        )

        await Promise.allSettled(
            otherParticipants.map(participant =>
                handleNewParticipant(participant.socketId, participant.userName)
            )
        )
    }

    // ========================================================================
    // SOCKET EVENT HANDLERS
    // ========================================================================

    const handleWebRTCOffer = async (data: WebRTCOffer): Promise<void> => {
        try {
            const connection = createPeerConnection(data.senderSocketId, data.senderName)

            peerConnections.value.set(data.senderSocketId, {
                connection,
                participantId: data.senderSocketId,
                userName: data.senderName,
                retryCount: 0
            })

            await connection.setRemoteDescription(data.offer)
            const answer = await connection.createAnswer()
            await connection.setLocalDescription(answer)

            await emit('webrtc-answer', {
                targetSocketId: data.senderSocketId,
                answer,
                roomId: data.roomId
            })
        } catch (error) {
            console.error('Failed to handle WebRTC offer:', error)
        }
    }

    const handleWebRTCAnswer = async (data: WebRTCAnswer): Promise<void> => {
        try {
            const peer = peerConnections.value.get(data.senderSocketId)
            if (peer) {
                await peer.connection.setRemoteDescription(data.answer)
            }
        } catch (error) {
            console.error('Failed to handle WebRTC answer:', error)
        }
    }

    const handleICECandidate = async (data: ICECandidate): Promise<void> => {
        try {
            const peer = peerConnections.value.get(data.senderSocketId)
            if (peer && peer.connection.remoteDescription) {
                await peer.connection.addIceCandidate(data.candidate)
            }
        } catch (error) {
            console.error('Failed to handle ICE candidate:', error)
        }
    }

    const handleParticipantLeft = (participantId: string): void => {
        cleanup(participantId)
    }

    const handleStreamUpdate = (data: StreamUpdate): void => {
        // Handle remote stream updates if needed
        console.log('Stream update:', data)
    }

    const handleMediaStatusUpdate = (data: MediaStatusUpdate): void => {
        // Handle participant media status updates
        console.log('Media status update:', data)
    }

    // ========================================================================
    // LIFECYCLE
    // ========================================================================

    const initializeSocketListeners = (): void => {
        on('webrtc-offer', handleWebRTCOffer)
        on('webrtc-answer', handleWebRTCAnswer)
        on('ice-candidate', handleICECandidate)
        on('participant-left', handleParticipantLeft)
        on('stream-update', handleStreamUpdate)
        on('media-status-update', handleMediaStatusUpdate)
    }

    const removeSocketListeners = (): void => {
        off('webrtc-offer', handleWebRTCOffer)
        off('webrtc-answer', handleWebRTCAnswer)
        off('ice-candidate', handleICECandidate)
        off('participant-left', handleParticipantLeft)
        off('stream-update', handleStreamUpdate)
        off('media-status-update', handleMediaStatusUpdate)
    }

    // Initialize on store creation
    initializeSocketListeners()

    // Cleanup on unmount (handled by Nuxt)
    onBeforeUnmount(() => {
        cleanup()
        removeSocketListeners()
    })

    return {
        // State
        localStream: readonly(localStream),
        peerConnections: readonly(peerConnections),
        remoteStreams: readonly(remoteStreams),
        availableDevices: readonly(availableDevices),
        hasVideo: readonly(hasVideo),
        hasAudio: readonly(hasAudio),
        isScreenSharing: readonly(isScreenSharing),
        selectedVideoDevice,
        selectedAudioDevice,
        isConnecting: readonly(isConnecting),

        // Computed
        isMediaActive,
        connectedParticipants,
        connectionStatuses,

        // Methods
        getAvailableDevices,
        startMedia,
        startScreenShare,
        stopScreenShare,
        stopMedia,
        toggleVideo,
        toggleAudio,
        handleNewParticipant,
        connectToAllParticipants,
        cleanup,
        switchAudioDevice,
        switchVideoDevice
    }
})