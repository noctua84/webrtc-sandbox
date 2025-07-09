// stores/room.ts
import { defineStore } from 'pinia'
import type {
    Room,
    Participant,
    RoomStatus,
    CreateRoomRequest,
    CreateRoomResponse,
    JoinRoomRequest,
    JoinRoomResponse,
    RoomUpdateEvent,
    ReconnectionData,
    LogEntry,
    LogLevel,
    LogData
} from '../types'
import {useSocket} from "../composables/useSocket";

const RECONNECTION_STORAGE_KEY = 'webrtc-reconnection-data'
const RECONNECTION_EXPIRY_MS = 5 * 60 * 1000

const createLogEntry = (level: LogLevel, message: string, data?: LogData): LogEntry => ({
    id: Date.now() + Math.random(),
    timestamp: new Date().toISOString(),
    level,
    message,
    data: data ? JSON.stringify(data, null, 2) : null
})

export const useRoomStore = defineStore('room', () => {
    // State
    const currentRoom = ref<Room | null>(null)
    const currentParticipant = ref<Participant | null>(null)
    const participants = ref<Participant[]>([])
    const roomStatus = ref<RoomStatus>('none')
    const roomError = ref<string | null>(null)
    const logs = ref<LogEntry[]>([])

    // Composables
    const { emit, on, off, addLog: addSocketLog } = useSocket()

    // Helper functions
    const addLog = (level: LogLevel, message: string, data?: LogData) => {
        const entry = createLogEntry(level, message, data)
        logs.value.push(entry)

        // Keep only last 1000 logs
        if (logs.value.length > 1000) {
            logs.value = logs.value.slice(-1000)
        }
    }

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
                if (process.client) {
                    localStorage.removeItem(RECONNECTION_STORAGE_KEY)
                }
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

    // Actions
    const createRoom = async (request: CreateRoomRequest): Promise<CreateRoomResponse> => {
        try {
            roomStatus.value = 'creating'
            roomError.value = null

            addLog('info', 'Creating room', request)

            const response = await emit<CreateRoomResponse>('create-room', request)

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

                addLog('success', 'Room created successfully', response)
                return response
            } else {
                throw new Error(response.error || 'Failed to create room')
            }
        } catch (error) {
            roomStatus.value = 'error'
            roomError.value = error instanceof Error ? error.message : 'Unknown error'
            addLog('error', 'Failed to create room', { error: roomError.value })
            throw error
        }
    }

    const joinRoom = async (request: JoinRoomRequest): Promise<JoinRoomResponse> => {
        try {
            roomStatus.value = 'joining'
            roomError.value = null

            addLog('info', 'Joining room', request)

            const response = await emit<JoinRoomResponse>('join-room', request)

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

                addLog('success', 'Joined room successfully', response)
                return response
            } else {
                throw new Error(response.error || 'Failed to join room')
            }
        } catch (error) {
            roomStatus.value = 'error'
            roomError.value = error instanceof Error ? error.message : 'Unknown error'
            addLog('error', 'Failed to join room', { error: roomError.value })
            throw error
        }
    }

    const leaveRoom = async () => {
        try {
            if (!currentRoom.value) {
                addLog('warning', 'No room to leave')
                return
            }

            addLog('info', 'Leaving room', { roomId: currentRoom.value.id })

            await emit('leave-room', { roomId: currentRoom.value.id })

            // Clear state
            currentRoom.value = null
            currentParticipant.value = null
            participants.value = []
            roomStatus.value = 'none'
            roomError.value = null

            clearReconnectionData()
            addLog('success', 'Left room successfully')
        } catch (error) {
            addLog('error', 'Failed to leave room', { error })
        }
    }

    const handleRoomUpdate = (event: RoomUpdateEvent) => {
        addLog('info', 'Room updated', event)

        if (event.room) {
            currentRoom.value = event.room
        }

        if (event.participants) {
            participants.value = event.participants
        }
    }

    // Setup event listeners
    const setupEventListeners = () => {
        on('room-updated', handleRoomUpdate)
    }

    const cleanup = () => {
        off('room-updated', handleRoomUpdate)

        currentRoom.value = null
        currentParticipant.value = null
        participants.value = []
        roomStatus.value = 'none'
        roomError.value = null
    }

    // Computed
    const isInRoom = computed(() => !!currentRoom.value)
    const isRoomCreator = computed(() =>
        currentParticipant.value?.socketId === currentRoom.value?.createdBy
    )
    const participantCount = computed(() => participants.value.length)
    const connectedParticipants = computed(() =>
        participants.value.filter(p => p.isConnected)
    )
    const connectedParticipantCount = computed(() => connectedParticipants.value.length)

    const hasReconnectionData = computed(() => !!getStoredReconnectionData())
    const reconnectionData = computed(() => getStoredReconnectionData())

    return {
        // State
        currentRoom: readonly(currentRoom),
        currentParticipant: readonly(currentParticipant),
        participants: readonly(participants),
        roomStatus: readonly(roomStatus),
        roomError: readonly(roomError),
        logs: readonly(logs),

        // Computed
        isInRoom,
        isRoomCreator,
        participantCount,
        connectedParticipants,
        connectedParticipantCount,
        hasReconnectionData,
        reconnectionData,

        // Actions
        createRoom,
        joinRoom,
        leaveRoom,
        setupEventListeners,
        cleanup,
        clearReconnectionData
    }
})