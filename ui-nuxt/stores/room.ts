// ui-nuxt/stores/room.ts - Fixed reconnection token implementation

import { defineStore } from 'pinia'
import type {
    Room,
    Participant,
    RoomStatus,
    RoomError,
    CreateRoomRequest,
    CreateRoomResponse,
    JoinRoomRequest,
    JoinRoomResponse,
    ReconnectRoomRequest,
    ReconnectRoomResponse,
    LeaveRoomRequest,
    RoomUpdateEvent,
    ReconnectionData
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

    const getStoredReconnectionData = (): ReconnectionData | null => {
        if (import.meta.client) {
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
        if (import.meta.client) {
            try {
                localStorage.setItem(RECONNECTION_STORAGE_KEY, JSON.stringify(data))
            } catch (error) {
                console.warn('Failed to store reconnection data:', error)
            }
        }
    }

    const clearReconnectionData = () => {
        if (import.meta.client) {
            localStorage.removeItem(RECONNECTION_STORAGE_KEY)
        }
    }

    // 🔧 FIXED: Store method that the component can access
    const getReconnectionData = (): ReconnectionData | null => {
        return getStoredReconnectionData()
    }

    // Actions
    const createRoom = async (userName: string): Promise<CreateRoomResponse> => {
        try {
            isCreatingRoom.value = true
            roomStatus.value = 'creating'
            clearError()

            debugLog('Creating room', { userName })

            const request: CreateRoomRequest = {
                userName: userName.trim()
            }

            const response = await socketStore.emit<CreateRoomResponse>('create-room', request)

            if (response.success && response.room) {
                currentRoom.value = response.room
                currentParticipant.value = response.participant
                participants.value = [response.participant]
                roomStatus.value = 'connected'

                storeReconnectionData({
                    roomId: response.room.id,
                    reconnectionToken: response.reconnectionToken, // ✅ Now included
                    userName: userName.trim(),
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

    const joinRoom = async (roomId: string, userName: string): Promise<JoinRoomResponse> => {
        try {
            isJoiningRoom.value = true
            roomStatus.value = 'joining'
            clearError()

            debugLog('Joining room', { roomId, userName })

            const request: JoinRoomRequest = {
                roomId: roomId.trim(),
                userName: userName.trim()
            }

            const response = await socketStore.emit<JoinRoomResponse>('join-room', request)

            if (response.success && response.room) {
                currentRoom.value = response.room
                currentParticipant.value = response.participant
                participants.value = response.participants || []
                roomStatus.value = 'connected'

                storeReconnectionData({
                    roomId: roomId.trim(),
                    reconnectionToken: response.reconnectionToken, // ✅ Now included
                    userName: userName.trim(),
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

    const reconnectToRoom = async (
        roomId: string,
        reconnectionToken: string,
        userName: string
    ): Promise<ReconnectRoomResponse> => {
        try {
            isReconnecting.value = true
            roomStatus.value = 'reconnecting'
            clearError()

            debugLog('Reconnecting to room', { roomId, userName })

            const request: ReconnectRoomRequest = {
                roomId,
                reconnectionToken
            }

            const response = await socketStore.emit<ReconnectRoomResponse>('reconnect-room', request)

            if (response.success && response.room) {
                currentRoom.value = response.room
                currentParticipant.value = response.participant
                participants.value = response.participants || []
                roomStatus.value = 'connected'

                // Update stored reconnection data timestamp
                storeReconnectionData({
                    roomId,
                    reconnectionToken,
                    userName,
                    timestamp: Date.now()
                })

                debugLog('Reconnected successfully', response)
                return response
            } else {
                throw new Error(response.error || 'Failed to reconnect to room')
            }
        } catch (err) {
            const error = err as Error
            roomStatus.value = 'error'
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

    // Socket event handlers
    const handleRoomUpdate = (event: RoomUpdateEvent) => {
        debugLog('Room updated', event)

        // 🔧 FIXED: RoomUpdateEvent doesn't have a 'room' field
        // Update participants from the event
        if (event.participants) {
            participants.value = event.participants
        }

        // Handle specific event types
        if (event.event === 'participant-joined' && event.participant) {
            debugLog('Participant joined', { participant: event.participant })
        } else if (event.event === 'participant-left' && event.leftParticipantId) {
            debugLog('Participant left', { leftParticipantId: event.leftParticipantId })
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
        debugLog('Room error', error)
        setError(error.message, error.code)
    }

    // Event listener setup
    const setupEventListeners = () => {
        debugLog('Setting up event listeners')

        socketStore.on('room-updated', handleRoomUpdate)
        socketStore.on('participant-joined', handleParticipantJoined)
        socketStore.on('participant-left', handleParticipantLeft)
        socketStore.on('room-error', handleRoomError)
    }

    // Computed properties
    const isInRoom = computed(() => roomStatus.value === 'connected')

    const isRoomCreator = computed(() =>
        !!currentParticipant.value?.isCreator
    )

    const participantCount = computed(() => participants.value.length)

    const connectedParticipants = computed(() =>
        participants.value.filter(p => p.isConnected)
    )

    const connectedParticipantCount = computed(() =>
        connectedParticipants.value.length
    )

    const otherParticipants = computed(() =>
        participants.value.filter(p => p.socketId !== currentParticipant.value?.socketId)
    )

    const hasReconnectionData = computed(() =>
        getStoredReconnectionData() !== null
    )

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
        clearError,
        clearReconnectionData,

        // 🔧 FIXED: Expose getReconnectionData method for component access
        getReconnectionData,

        // Development utilities
        ...(process.env.NODE_ENV === 'development' && { debugLog })
    }
})