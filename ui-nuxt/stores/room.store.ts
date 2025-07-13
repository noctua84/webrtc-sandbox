// stores/room.ts - Room business logic and state management
import { defineStore } from 'pinia'
import { ref, computed, readonly, watch } from 'vue'
import { useSocketIO } from '~/composables/useSocketIO'
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

const RECONNECTION_STORAGE_KEY = 'webrtc-reconnection-data'
const RECONNECTION_EXPIRY_MS = 5 * 60 * 1000

export const useRoomStore = defineStore('room', () => {
    // Room-specific state
    const currentRoom = ref<Room | null>(null)
    const currentParticipant = ref<Participant | null>(null)
    const participants = ref<Participant[]>([])
    const roomStatus = ref<RoomStatus>('none')
    const roomError = ref<RoomError | null>(null)

    // Loading states
    const isCreatingRoom = ref(false)
    const isJoiningRoom = ref(false)
    const isReconnecting = ref(false)
    const isInitialized = ref(false)

    // Get socket composable for communication
    const socketStore = useSocketIO({ autoConnect: true })

    // Utility functions
    const setError = (message: string, code?: string) => {
        roomError.value = {
            message,
            code,
            timestamp: new Date().toISOString()
        }
        socketStore.addLog('error', `[ROOM] ${message}`, { code })
    }

    const clearError = () => {
        roomError.value = null
    }

    const debugLog = (message: string, data?: any) => {
        if (process.env.NODE_ENV === 'development') {
            socketStore.addLog('info', `[ROOM] ${message}`, data)
        }
    }

    // Reconnection data management
    const getStoredReconnectionData = (): ReconnectionData | null => {
        if (!import.meta.client) return null

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

    const storeReconnectionData = (data: ReconnectionData) => {
        if (!import.meta.client) return

        try {
            localStorage.setItem(RECONNECTION_STORAGE_KEY, JSON.stringify(data))
            debugLog('Reconnection data stored', { roomId: data.roomId, userName: data.userName })
        } catch (error) {
            debugLog('Failed to store reconnection data', error)
        }
    }

    const clearReconnectionData = () => {
        if (!import.meta.client) return

        localStorage.removeItem(RECONNECTION_STORAGE_KEY)
        debugLog('Reconnection data cleared')
    }

    // Room state management
    const updateRoomState = (response: CreateRoomResponse | JoinRoomResponse | ReconnectRoomResponse) => {
        currentRoom.value = response.room
        currentParticipant.value = response.participant
        participants.value = 'participants' in response ? response.participants || [response.participant] : [response.participant]
        roomStatus.value = 'connected'

        // Reset loading states
        isCreatingRoom.value = false
        isJoiningRoom.value = false
        isReconnecting.value = false

        // Store reconnection data
        if (response.reconnectionToken) {
            storeReconnectionData({
                roomId: response.room.id,
                reconnectionToken: response.reconnectionToken,
                userName: response.participant.userName,
                timestamp: Date.now()
            })
        }

        debugLog('Room state updated', {
            roomId: response.room.id,
            participantCount: participants.value.length,
            isCreator: response.participant.isCreator
        })
    }

    const resetRoomState = () => {
        currentRoom.value = null
        currentParticipant.value = null
        participants.value = []
        roomStatus.value = 'none'
        isCreatingRoom.value = false
        isJoiningRoom.value = false
        isReconnecting.value = false
        clearError()
        debugLog('Room state reset')
    }

    // Socket event handlers
    const handleRoomUpdate = (event: RoomUpdateEvent) => {
        debugLog('Room update received', event)

        if (!currentRoom.value || event.roomId !== currentRoom.value.id) {
            debugLog('Ignoring update for different room', {
                currentRoomId: currentRoom.value?.id,
                eventRoomId: event.roomId
            })
            return
        }

        // Update participants list
        if (event.participants) {
            participants.value = event.participants
        }

        // Update room info
        if (currentRoom.value) {
            currentRoom.value.participantCount = participants.value.length
            currentRoom.value.lastActivity = new Date().toISOString()
        }

        debugLog(`Room updated: ${event.event}`, {
            participantCount: participants.value.length,
            eventType: event.event
        })
    }

    const handleDisconnection = () => {
        debugLog('Socket disconnected - preserving room state for reconnection')
        roomStatus.value = 'error'
        setError('Connection lost', 'CONNECTION_LOST')
    }

    // Initialize socket and register event listeners
    const initializeSocket = async () => {
        if (isInitialized.value) {
            debugLog('Socket already initialized')
            return
        }

        debugLog('Initializing socket and room event listeners')

        try {
            // Initialize socket connection
            await socketStore.initialize()

            // Register room-specific event listeners
            socketStore.on('room-updated', handleRoomUpdate)
            socketStore.on('disconnect', handleDisconnection)

            // Additional room events can be added here
            // socketStore.on('participant-joined', handleParticipantJoined)
            // socketStore.on('participant-left', handleParticipantLeft)

            isInitialized.value = true
            debugLog('Room store initialized successfully')

        } catch (error) {
            debugLog('Failed to initialize socket', error)
            setError('Failed to initialize connection', 'SOCKET_INIT_FAILED')
            throw error
        }
    }

    // Business logic methods
    const createRoom = async (userName: string): Promise<CreateRoomResponse> => {
        if (!userName.trim()) {
            const error = 'Username is required to create a room'
            setError(error, 'VALIDATION_ERROR')
            throw new Error(error)
        }

        // Ensure socket is initialized
        if (!isInitialized.value) {
            await initializeSocket()
        }

        isCreatingRoom.value = true
        roomStatus.value = 'creating'
        clearError()

        debugLog('Creating room', { userName })

        try {
            const request: CreateRoomRequest = { userName: userName.trim() }
            const response = await socketStore.emit<CreateRoomResponse>('create-room', request)

            if (response.success) {
                updateRoomState(response)
                debugLog('Room created successfully', { roomId: response.room.id })
                return response
            } else {
                throw new Error(response.error || 'Failed to create room')
            }
        } catch (error) {
            const errorMessage = (error as Error).message
            setError(`Failed to create room: ${errorMessage}`, 'CREATE_ROOM_FAILED')
            isCreatingRoom.value = false
            roomStatus.value = 'error'
            throw error
        }
    }

    const joinRoom = async (roomId: string, userName: string): Promise<JoinRoomResponse> => {
        if (!roomId.trim() || !userName.trim()) {
            const error = 'Room ID and username are required'
            setError(error, 'VALIDATION_ERROR')
            throw new Error(error)
        }

        if (!isInitialized.value) {
            await initializeSocket()
        }

        isJoiningRoom.value = true
        roomStatus.value = 'joining'
        clearError()

        debugLog('Joining room', { roomId, userName })

        try {
            const request: JoinRoomRequest = {
                roomId: roomId.trim(),
                userName: userName.trim()
            }
            const response = await socketStore.emit<JoinRoomResponse>('join-room', request)

            if (response.success) {
                updateRoomState(response)
                debugLog('Joined room successfully', { roomId: response.room.id })
                return response
            } else {
                throw new Error(response.error || 'Failed to join room')
            }
        } catch (error) {
            const errorMessage = (error as Error).message
            setError(`Failed to join room: ${errorMessage}`, 'JOIN_ROOM_FAILED')
            isJoiningRoom.value = false
            roomStatus.value = 'error'
            throw error
        }
    }

    const reconnectToRoom = async (roomId: string, reconnectionToken: string, userName: string): Promise<ReconnectRoomResponse> => {
        if (!isInitialized.value) {
            await initializeSocket()
        }

        isReconnecting.value = true
        roomStatus.value = 'reconnecting'
        clearError()

        debugLog('Reconnecting to room', { roomId, userName })

        try {
            const request: ReconnectRoomRequest = { roomId, reconnectionToken }
            const response = await socketStore.emit<ReconnectRoomResponse>('reconnect-room', request)

            if (response.success) {
                updateRoomState(response)
                debugLog('Reconnected successfully', { roomId: response.room.id })
                return response
            } else {
                throw new Error(response.error || 'Failed to reconnect to room')
            }
        } catch (error) {
            const errorMessage = (error as Error).message
            setError(`Failed to reconnect: ${errorMessage}`, 'RECONNECT_FAILED')
            isReconnecting.value = false
            roomStatus.value = 'error'
            clearReconnectionData()
            throw error
        }
    }

    const leaveRoom = async (): Promise<void> => {
        if (!currentRoom.value) {
            debugLog('No room to leave')
            return
        }

        debugLog('Leaving room', { roomId: currentRoom.value.id })

        try {
            const request: LeaveRoomRequest = { roomId: currentRoom.value.id }
            await socketStore.emit('leave-room', request)

            resetRoomState()
            clearReconnectionData()
            debugLog('Left room successfully')
        } catch (error) {
            const errorMessage = (error as Error).message
            setError(`Failed to leave room: ${errorMessage}`, 'LEAVE_ROOM_FAILED')
            throw error
        }
    }

    // Auto-reconnection on socket reconnection
    watch(() => socketStore.isConnected, async (isConnected) => {
        if (isConnected && roomStatus.value === 'error') {
            const reconnectionData = getStoredReconnectionData()
            if (reconnectionData) {
                debugLog('Socket reconnected, attempting to rejoin room')
                try {
                    await reconnectToRoom(
                        reconnectionData.roomId,
                        reconnectionData.reconnectionToken,
                        reconnectionData.userName
                    )
                } catch (error) {
                    debugLog('Auto-reconnection failed', error)
                }
            }
        }
    })

    // Computed properties
    const isInRoom = computed(() => roomStatus.value === 'connected')
    const isRoomCreator = computed(() => !!currentParticipant.value?.isCreator)
    const participantCount = computed(() => participants.value.length)

    const connectedParticipants = computed(() =>
        participants.value.filter(p => p.isConnected)
    )

    const connectedParticipantCount = computed(() => connectedParticipants.value.length)

    const otherParticipants = computed(() =>
        participants.value.filter(p => p.socketId !== currentParticipant.value?.socketId)
    )

    const hasReconnectionData = computed(() => !!getStoredReconnectionData())
    const reconnectionData = computed(() => getStoredReconnectionData())

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

    // Expose methods for external access
    const getReconnectionData = () => getStoredReconnectionData()

    return {
        // State (readonly)
        currentRoom: readonly(currentRoom),
        currentParticipant: readonly(currentParticipant),
        participants: readonly(participants),
        roomStatus: readonly(roomStatus),
        roomError: readonly(roomError),

        // Loading states (readonly)
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
        getReconnectionData,

        // Initialization
        initializeSocket,
        isInitialized: readonly(isInitialized),

        // Development utilities
        ...(process.env.NODE_ENV === 'development' && { debugLog })
    }
})