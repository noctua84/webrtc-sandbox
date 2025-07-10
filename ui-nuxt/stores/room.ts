// stores/room.ts
import { defineStore } from 'pinia'
import type {
    RoomUpdateEvent,
    ReconnectionData,
} from '../types'
import type {
    Room,
    Participant,
    RoomStatus,
    RoomError,
    CreateRoomRequest,
    CreateRoomResponse,
    JoinRoomRequest,
    JoinRoomResponse,
    LeaveRoomRequest
} from '~/types/room.types'
import {useSocket} from "~/composables/useSocket"
import { ref, computed, readonly } from 'vue'

const RECONNECTION_STORAGE_KEY = 'webrtc-reconnection-data'
const RECONNECTION_EXPIRY_MS = 5 * 60 * 1000

export const useRoomStore = defineStore('room', () => {
    // State
    const currentRoom = ref<Room | null>(null)
    const currentParticipant = ref<Participant | null>(null)
    const participants = ref<Participant[]>([])
    const roomStatus = ref<RoomStatus>('none')
    const roomError = ref<RoomError | null>(null)

    // Loading states
    const isCreatingRoom = ref(false)
    const isJoiningRoom = ref(false)
    const isReconnecting = ref(false)

    // Dependencies
    const socketStore = useSocket()

    // Utility functions
    const setError = (message: string, code?: string) => {
        roomError.value = {
            message,
            code,
            timestamp: new Date().toISOString()
        }

        if (process.env.NODE_ENV === 'development') {
            console.error(`[ROOM ERROR] ${message}`, { code })
        }
    }

    const clearError = () => {
        roomError.value = null
    }

    const debugLog = (message: string, data?: any) => {
        if (process.env.NODE_ENV === 'development') {
            console.log(`[ROOM] ${message}`, data)
        }
    }

    // Reconnection data management
    const getStoredReconnectionData = (): ReconnectionData | null => {
        if (process.client) {
            try {
                const stored = localStorage.getItem(RECONNECTION_STORAGE_KEY)
                if (!stored) return null

                const data: ReconnectionData = JSON.parse(stored)
                const now = Date.now()
                const age = now - data.timestamp

                if (age > RECONNECTION_EXPIRY_MS) {
                    localStorage.removeItem(RECONNECTION_STORAGE_KEY)
                    return null
                }

                return data
            } catch (error) {
                localStorage.removeItem(RECONNECTION_STORAGE_KEY)
                return null
            }
        }
        return null
    }

    const storeReconnectionData = (data: ReconnectionData) => {
        if (process.client) {
            try {
                localStorage.setItem(RECONNECTION_STORAGE_KEY, JSON.stringify(data))
            } catch (error) {
                console.warn('Failed to store reconnection data:', error)
            }
        }
    }

    const clearReconnectionData = () => {
        if (process.client) {
            localStorage.removeItem(RECONNECTION_STORAGE_KEY)
        }
    }

    // Socket event handlers
    const handleRoomUpdate = (event: RoomUpdateEvent) => {
        debugLog('Room updated', event)

        if (event.room) {
            currentRoom.value = event.room
        }

        if (event.participants) {
            participants.value = event.participants
        }
    }

    const handleParticipantJoined = (participant: Participant) => {
        debugLog('Participant joined', { participant })

        const existingIndex = participants.value.findIndex(p => p.socketId === participant.socketId)
        if (existingIndex === -1) {
            participants.value.push(participant)
        } else {
            participants.value[existingIndex] = participant
        }
    }

    const handleParticipantLeft = (data: { socketId: string; userName: string }) => {
        debugLog('Participant left', data)

        participants.value = participants.value.filter(p => p.socketId !== data.socketId)
    }

    const handleRoomError = (error: { message: string; code?: string }) => {
        setError(error.message, error.code)
        roomStatus.value = 'error'
    }

    // Actions
    const createRoom = async (request: CreateRoomRequest): Promise<CreateRoomResponse> => {
        try {
            isCreatingRoom.value = true
            roomStatus.value = 'creating'
            clearError()

            debugLog('Creating room', request)

            const response = await socketStore.emit<CreateRoomResponse>('create-room', request)

            if (response.success && response.room) {
                currentRoom.value = response.room
                currentParticipant.value = response.participant
                participants.value = [response.participant]
                roomStatus.value = 'connected'

                // Store reconnection data
                storeReconnectionData({
                    roomId: response.room.id,
                    userName: request.userName,
                    timestamp: Date.now()
                })

                debugLog('Room created successfully', response)
                return response
            } else {
                throw new Error('Failed to create room')
            }
        } catch (err) {
            const error = err as Error
            roomStatus.value = 'error'
            setError(`Failed to create room: ${error.message}`, 'CREATE_ROOM_FAILED')
            throw error
        } finally {
            isCreatingRoom.value = false
        }
    }

    const joinRoom = async (request: JoinRoomRequest): Promise<JoinRoomResponse> => {
        try {
            isJoiningRoom.value = true
            roomStatus.value = 'joining'
            clearError()

            debugLog('Joining room', request)

            const response = await socketStore.emit<JoinRoomResponse>('join-room', request)

            if (response.success && response.room) {
                currentRoom.value = response.room
                currentParticipant.value = response.participant
                participants.value = response.participants || []
                roomStatus.value = 'connected'

                // Store reconnection data
                storeReconnectionData({
                    roomId: request.roomId,
                    userName: request.userName,
                    timestamp: Date.now()
                })

                debugLog('Joined room successfully', response)
                return response
            } else {
                throw new Error('Failed to join room')
            }
        } catch (err) {
            const error = err as Error
            roomStatus.value = 'error'
            setError(`Failed to join room: ${error.message}`, 'JOIN_ROOM_FAILED')
            throw error
        } finally {
            isJoiningRoom.value = false
        }
    }

    const reconnectToRoom = async (): Promise<void> => {
        const reconnectionData = getStoredReconnectionData()
        if (!reconnectionData) {
            throw new Error('No reconnection data available')
        }

        try {
            isReconnecting.value = true
            roomStatus.value = 'reconnecting'
            clearError()

            debugLog('Reconnecting to room', reconnectionData)

            await joinRoom({
                roomId: reconnectionData.roomId,
                userName: reconnectionData.userName
            })

            debugLog('Reconnected successfully')
        } catch (err) {
            const error = err as Error
            setError(`Failed to reconnect: ${error.message}`, 'RECONNECT_FAILED')
            clearReconnectionData()
            throw error
        } finally {
            isReconnecting.value = false
        }
    }

    const leaveRoom = async (): Promise<void> => {
        try {
            if (!currentRoom.value) {
                debugLog('No room to leave')
                return
            }

            debugLog('Leaving room', { roomId: currentRoom.value.id })

            const leaveData: LeaveRoomRequest = {
                roomId: currentRoom.value.id
            }

            await socketStore.emit('leave-room', leaveData)

            // Clear state
            currentRoom.value = null
            currentParticipant.value = null
            participants.value = []
            roomStatus.value = 'none'
            clearError()
            clearReconnectionData()

            debugLog('Left room successfully')
        } catch (err) {
            const error = err as Error
            setError(`Failed to leave room: ${error.message}`, 'LEAVE_ROOM_FAILED')
            throw error
        }
    }

    // Update participant media status
    const updateParticipantMediaStatus = (socketId: string, mediaStatus: Participant['mediaStatus']) => {
        const participant = participants.value.find(p => p.socketId === socketId)
        if (participant) {
            participant.mediaStatus = mediaStatus
        }
    }

    // Setup and cleanup
    const setupEventListeners = () => {
        debugLog('Setting up room event listeners')

        socketStore.on('room-updated', handleRoomUpdate)
        socketStore.on('participant-joined', handleParticipantJoined)
        socketStore.on('participant-left', handleParticipantLeft)
        socketStore.on('room-error', handleRoomError)

        debugLog('Room event listeners configured')
    }

    const cleanup = () => {
        debugLog('Cleaning up room store')

        socketStore.off('room-updated', handleRoomUpdate)
        socketStore.off('participant-joined', handleParticipantJoined)
        socketStore.off('participant-left', handleParticipantLeft)
        socketStore.off('room-error', handleRoomError)

        currentRoom.value = null
        currentParticipant.value = null
        participants.value = []
        roomStatus.value = 'none'
        clearError()
        isCreatingRoom.value = false
        isJoiningRoom.value = false
        isReconnecting.value = false
    }

    // Computed properties
    const isInRoom = computed(() => !!currentRoom.value && roomStatus.value === 'connected')

    const isRoomCreator = computed(() =>
        currentParticipant.value?.isCreator ||
        currentParticipant.value?.socketId === currentRoom.value?.createdBy
    )

    const participantCount = computed(() => participants.value.length)

    const connectedParticipants = computed(() =>
        participants.value.filter(p => p.isConnected)
    )

    const connectedParticipantCount = computed(() => connectedParticipants.value.length)

    const otherParticipants = computed(() =>
        participants.value.filter(p =>
            p.isConnected && p.socketId !== currentParticipant.value?.socketId
        )
    )

    const hasReconnectionData = computed(() => !!getStoredReconnectionData())

    const reconnectionData = computed(() => getStoredReconnectionData())

    // Loading and state checks
    const isLoading = computed(() =>
        isCreatingRoom.value || isJoiningRoom.value || isReconnecting.value
    )

    const canCreateRoom = computed(() =>
        roomStatus.value === 'none' && socketStore.isConnected
    )

    const canJoinRoom = computed(() =>
        roomStatus.value === 'none' && socketStore.isConnected
    )

    const canLeaveRoom = computed(() => isInRoom.value)

    const hasError = computed(() => !!roomError.value)

    // Initialize event listeners
    setupEventListeners()

    return {
        // State
        currentRoom: readonly(currentRoom),
        currentParticipant: readonly(currentParticipant),
        participants: readonly(participants),
        roomStatus: readonly(roomStatus),
        roomError: readonly(roomError),

        // Loading states (required by index.vue)
        isCreatingRoom: readonly(isCreatingRoom),
        isJoiningRoom: readonly(isJoiningRoom),
        isReconnecting: readonly(isReconnecting),

        // Computed properties
        isInRoom,
        isRoomCreator,
        participantCount,
        connectedParticipants,
        connectedParticipantCount,
        otherParticipants,
        hasReconnectionData,
        reconnectionData,
        isLoading,
        canCreateRoom,
        canJoinRoom,
        canLeaveRoom,
        hasError,

        // Actions
        createRoom,
        joinRoom,
        reconnectToRoom,
        leaveRoom,
        updateParticipantMediaStatus,
        clearError,
        clearReconnectionData,
        cleanup,

        // Development utilities
        ...(process.env.NODE_ENV === 'development' && { debugLog })
    }
})