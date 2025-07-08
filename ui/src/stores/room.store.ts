import {makeAutoObservable, runInAction} from 'mobx';
import socketStore from './socket.store';
import {
    CreateRoomResponse,
    JoinRoomResponse,
    ReconnectRoomRequest,
    ReconnectRoomResponse,
    GetRoomInfoRequest,
    GetRoomInfoResponse, Room, RoomStatus,
} from '../types/room.types';
import type { CreateRoomRequest, JoinRoomRequest } from '@/types/room.types';
import {ReconnectionData} from "@/types/connection.types.ts";
import {LogData, LogEntry, LogLevel} from "@/types/logging.types.ts";
import {Participant} from "@/types/participant.types.ts";
import {ReconnectionAvailableEvent, RoomUpdateEvent} from "@/types/event.types.ts";
import chatStore from "@/stores/chat.store.ts";


const RECONNECTION_STORAGE_KEY = 'webrtc-reconnection-data';
const RECONNECTION_EXPIRY_MS = 5 * 60 * 1000;

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

const createLogEntry = (level: LogLevel, message: string, data?: LogData): LogEntry => ({
    id: Date.now() + Math.random(),
    timestamp: new Date().toISOString(),
    level,
    message,
    data: data ? JSON.stringify(data, null, 2) : null
});

const getStoredReconnectionData = (): ReconnectionData | null => {
    try {
        const stored = localStorage.getItem(RECONNECTION_STORAGE_KEY);
        if (!stored) return null;

        const data: ReconnectionData = JSON.parse(stored);
        const now = Date.now();
        const age = now - data.timestamp;

        // Expire after 5 minutes
        if (age > RECONNECTION_EXPIRY_MS) {
            localStorage.removeItem(RECONNECTION_STORAGE_KEY);
            return null;
        }

        return data;
    } catch (error) {
        localStorage.removeItem(RECONNECTION_STORAGE_KEY);
        return null;
    }
};

const storeReconnectionData = (data: ReconnectionData): void => {
    try {
        localStorage.setItem(RECONNECTION_STORAGE_KEY, JSON.stringify(data));
    } catch (error) {
        console.warn('Failed to store reconnection data:', error);
    }
};

const clearReconnectionData = (): void => {
    localStorage.removeItem(RECONNECTION_STORAGE_KEY);
};

// ============================================================================
// LOGGING FUNCTIONS
// ============================================================================

const createLogger = (logs: LogEntry[]) => ({
    log: (level: LogLevel, message: string, data?: LogData): void => {
        const logEntry = createLogEntry(level, message, data);

        runInAction(() => {
            logs.push(logEntry);
            if (logs.length > 100) {
                logs.splice(0, logs.length - 100);
            }
        });

        const consoleMessage = `[ROOM] [${level.toUpperCase()}] ${message}`;
        if (data) {
            console.log(consoleMessage, data);
        } else {
            console.log(consoleMessage);
        }
    },

    clearLogs: (): void => {
        runInAction(() => {
            logs.length = 0;
        });
    }
});

// ============================================================================
// WEBRTC INTEGRATION FUNCTIONS
// ============================================================================

const handleWebRTCIntegration = async (
    event: 'participant-joined' | 'participant-reconnected' | 'participant-left',
    participant: Participant,
    currentParticipant: Participant | null,
    logger: ReturnType<typeof createLogger>
): Promise<void> => {
    if (!participant || !currentParticipant || participant.socketId === currentParticipant.socketId) {
        return;
    }

    try {
        // Dynamic import to avoid circular dependency
        const { default: webrtcStore } = await import('./webrtc.store');

        if (webrtcStore.isMediaActive) {
            logger.log('info', `Auto-connecting to ${event.replace('-', ' ')} participant`, {
                participantId: participant.socketId,
                userName: participant.userName,
                event
            });

            await webrtcStore.handleNewParticipant(participant.socketId, participant.userName);
        } else {
            logger.log('info', `Media not active, skipping connection to ${event.replace('-', ' ')} participant`, {
                participantId: participant.socketId,
                userName: participant.userName
            });
        }
    } catch (error) {
        logger.log('error', `Failed to auto-connect to ${event.replace('-', ' ')} participant`, {
            error: (error as Error).message,
            participantId: participant.socketId,
            userName: participant.userName
        });
    }
};

// ============================================================================
// ROOM STORE CLASS
// ============================================================================

class RoomStore {
    // Observable state
    currentRoom: Room | null = null;
    currentParticipant: Participant | null = null;
    participants: Participant[] = [];
    roomStatus: RoomStatus = 'idle';
    roomError: string | null = null;
    logs: LogEntry[] = [];

    // Internal state
    private reconnectionTimeoutId: number | null = null;

    // Functional managers
    private readonly logger: ReturnType<typeof createLogger>;
    isCreatingRoom: boolean | undefined;
    isJoiningRoom: boolean | undefined;

    constructor() {
        makeAutoObservable(this, {
            // Only specify what should be observable
            currentRoom: true,
            currentParticipant: true,
            participants: true,
            roomStatus: true,
            roomError: true,
            logs: true
        });

        this.logger = createLogger(this.logs);
        this.setupSocketListeners();
        this.checkForReconnection();
    }

    // ========================================================================
    // localStorage management for reconnection data
    // ========================================================================
    private saveReconnectionData(roomId: string, reconnectionToken: string, userName: string): void {
        const reconnectionData: ReconnectionData = {
            roomId,
            reconnectionToken,
            userName,
            timestamp: Date.now()
        };
        storeReconnectionData(reconnectionData);

        // Clear any existing timeout
        this.clearReconnectionTimeout();

        // Set a timeout to clear reconnection data after 5 minutes
        this.reconnectionTimeoutId = window.setTimeout(() => {
            clearReconnectionData();
            this.reconnectionTimeoutId = null;
        }, RECONNECTION_EXPIRY_MS);
    }

    // ========================================================================
    // SOCKET EVENT HANDLERS
    // ========================================================================

    private setupSocketListeners(): void {
        this.logger.log('info', 'Setting up room socket listeners');

        socketStore.on('room-updated', this.handleRoomUpdate.bind(this));
        socketStore.on('reconnection-available', this.handleReconnectionAvailable.bind(this));

        this.logger.log('info', 'Room socket listeners configured');
    }

    private async handleRoomUpdate(data: RoomUpdateEvent): Promise<void> {
        this.logger.log('info', 'Received room update', data);

        // Store previous participants for comparison
        const previousParticipants = [...this.participants];

        runInAction(() => {
            if (data.participants) {
                this.participants = data.participants;
                this.logger.log('info', 'Updated participants list', {
                    count: this.participants.length,
                    connectedCount: this.participants.filter(p => p.isConnected).length,
                    participants: this.participants.map(p => ({
                        socketId: p.socketId,
                        userName: p.userName,
                        isCreator: p.isCreator,
                        isConnected: p.isConnected
                    }))
                });
            }
        });

        // Handle specific events and create system messages
        switch (data.event) {
            case 'participant-joined':
                if (data.participant) {
                    this.logger.log('success', 'New participant joined the room', {
                        participant: data.participant,
                        totalParticipants: data.participants?.length
                    });

                    // Handle WebRTC integration for new participant
                    await handleWebRTCIntegration(
                        'participant-joined',
                        data.participant,
                        this.currentParticipant,
                        this.logger
                    );

                    // NEW: Create system message for join
                    chatStore.generateSystemMessage(
                        data.participant.isCreator ? 'host-joined' : 'participant-joined',
                        data.participant.userName
                    );
                }
                break;

            case 'participant-left':
                if (data.leftParticipantId) {
                    // Find the participant who left from previous state
                    const leftParticipant = previousParticipants.find(p => p.socketId === data.leftParticipantId);

                    if (leftParticipant) {
                        this.logger.log('info', 'Participant left the room', {
                            participant: leftParticipant,
                            totalParticipants: data.participants?.length
                        });

                        // Handle WebRTC integration for left participant
                        await handleWebRTCIntegration(
                            'participant-left',
                            leftParticipant,
                            this.currentParticipant,
                            this.logger
                        );

                        // NEW: Create system message for leave
                        chatStore.generateSystemMessage(
                            leftParticipant.isCreator ? 'host-left' : 'participant-left',
                            leftParticipant.userName
                        );
                    }
                }
                break;

            case 'participant-disconnected':
                if (data.leftParticipantId) {
                    const disconnectedParticipant = previousParticipants.find(p => p.socketId === data.leftParticipantId);

                    if (disconnectedParticipant) {
                        this.logger.log('warning', 'Participant disconnected from room', {
                            participant: disconnectedParticipant,
                            totalParticipants: data.participants?.length
                        });

                        // Don't create system message for disconnections (they might reconnect)
                        // Only create leave message if they're fully removed
                    }
                }
                break;

            case 'participant-reconnected':
                if (data.participant) {
                    this.logger.log('success', 'Participant reconnected to room', {
                        participant: data.participant,
                        totalParticipants: data.participants?.length
                    });

                    // Handle WebRTC integration for reconnected participant
                    await handleWebRTCIntegration(
                        'participant-reconnected',
                        data.participant,
                        this.currentParticipant,
                        this.logger
                    );

                    // Don't create join message for reconnections
                }
                break;

            default:
                this.logger.log('info', 'Room update event', { event: data.event });
        }
    }


    private handleReconnectionAvailable(data: ReconnectionAvailableEvent): void {
        this.logger.log('info', 'Reconnection available', {
            roomId: data.roomId,
            timeLeft: data.timeLeft
        });

        // Store reconnection data
        if (this.currentParticipant) {
            const roomId = data.roomId;
            const reconnectionToken = this.currentParticipant.reconnectionToken || '';
            const userName = this.currentParticipant.userName || 'Unknown User';

            this.saveReconnectionData(roomId, reconnectionToken, userName);
        }
    }

    // ========================================================================
    // PUBLIC API METHODS
    // ========================================================================
    async createRoom({userName, roomId}: CreateRoomRequest): Promise<CreateRoomResponse> {
        runInAction(() => {
            this.roomStatus = 'creating';
            this.roomError = null;
        });

        this.logger.log('info', 'Creating room', { userName, roomId });

        try {
            const request: CreateRoomRequest = {
                userName: userName.trim(),
                ...(roomId && { roomId: roomId.trim() })
            };

            const response = await socketStore.emitWithCallback('create-room', request) as CreateRoomResponse;

            if (!response.success) {
                this.logger.log('error', 'Failed to create room', { error: response.error || 'Unknown error' });
                runInAction(() => {
                    this.roomStatus = 'error';
                    this.roomError = response.error || 'Failed to create room';
                });
            }

            this.logger.log('success', 'Room created successfully', {
                roomId: response.room.id,
                participantId: response.participant.socketId
            });

            runInAction(() => {
                this.currentRoom = response.room;
                this.currentParticipant = response.participant;
                this.participants = [response.participant];
                this.roomStatus = 'in-room';
            });

            this.logger.log('success', 'Room created successfully', {
                roomId: response.room.id,
                reconnectionToken: response.reconnectionToken,
                userName: response.participant.userName,
                timestamp: Date.now()
            });

            this.saveReconnectionData(response.room.id, response.reconnectionToken, response.participant.userName);

            return response;
        } catch (error) {
            const errorMessage = (error as Error).message;
            this.logger.log('error', 'Failed to create room', { error: errorMessage });

            runInAction(() => {
                this.roomStatus = 'error';
                this.roomError = errorMessage;
            });

            throw error;
        }
    }

    async joinRoom({roomId, userName}: JoinRoomRequest ): Promise<void> {
        if (!roomId.trim() || !userName.trim()) {
            throw new Error('Room ID and username are required');
        }

        this.logger.log('info', 'Joining room', { roomId, userName });

        runInAction(() => {
            this.roomError = null;
        });

        try {
            const request: JoinRoomRequest = {
                roomId: roomId.trim(),
                userName: userName.trim()
            };

            const response = await socketStore.emitWithCallback('join-room', request) as JoinRoomResponse;

            if (!response.success) {
                this.logger.log('error', 'Failed to join room', { roomId, userName, error: response.error || 'Unknown error' });
            }

            this.logger.log('success', 'Joined room successfully', {
                roomId: response.room.id,
                participantId: response.participant.socketId,
                totalParticipants: response.participants.length
            });

            runInAction(() => {
                this.currentRoom = response.room;
                this.currentParticipant = response.participant;
                this.participants = response.participants;
                this.isJoiningRoom = false;
                this.roomStatus = 'in-room';
            });

            this.saveReconnectionData(response.room.id, response.reconnectionToken, response.participant.userName);

            try {
                const { default: webrtcStore } = await import('./webrtc.store');
                if (webrtcStore.isMediaActive) {
                    this.logger.log('info', 'Auto-connecting to all existing participants');
                    await webrtcStore.connectToAllParticipants();
                }
            } catch (error) {
                this.logger.log('error', 'Failed to auto-connect to existing participants', {
                    error: (error as Error).message
                });
            }

        } catch (error) {
            const errorMessage = (error as Error).message;
            this.logger.log('error', 'Failed to join room', { error: errorMessage });

            runInAction(() => {
                this.roomStatus = 'error';
                this.roomError = errorMessage;
            });

            throw error;
        }
    }

    async leaveRoom(): Promise<void> {
        if (!this.currentRoom) return;

        const roomId = this.currentRoom.id;
        this.logger.log('info', 'Leaving room', { roomId });

        try {
            // Clean up WebRTC connections first
            try {
                const { default: webrtcStore } = await import('./webrtc.store');
                webrtcStore.cleanup();
            } catch (error) {
                this.logger.log('error', 'Failed to cleanup WebRTC store', {
                    error: (error as Error).message
                });
            }

            // Notify server
            await socketStore.emitWithCallback('leave-room', { roomId });

            this.logger.log('success', 'Left room successfully', { roomId });

        } catch (error) {
            this.logger.log('error', 'Failed to leave room', {
                error: (error as Error).message,
                roomId
            });
        } finally {
            // Always clean up local state
            runInAction(() => {
                this.currentRoom = null;
                this.currentParticipant = null;
                this.participants = [];
                this.roomStatus = 'idle';
                this.roomError = null;
            });

            clearReconnectionData();
            this.clearReconnectionTimeout();
        }
    }

    // ========================================================================
    // RECONNECTION METHODS
    // ========================================================================

    private checkForReconnection(): void {
        const reconnectionData = getStoredReconnectionData();
        if (!reconnectionData) return;

        this.logger.log('info', 'Found stored reconnection data', {
            roomId: reconnectionData.roomId,
            userName: reconnectionData.userName
        });

        // Auto-attempt reconnection after a short delay
        setTimeout(async () => {
            await this.attemptReconnection(reconnectionData);
        }, 1000);
    }

    private async attemptReconnection(data: ReconnectionData): Promise<void> {
        this.logger.log('info', 'Attempting reconnection', {
            roomId: data.roomId,
            userName: data.userName
        });

        runInAction(() => {
            this.roomStatus = 'reconnecting';
            this.roomError = null;
        });

        try {
            const request: ReconnectRoomRequest = {
                roomId: data.roomId,
                reconnectionToken: data.reconnectionToken
            };

            const response = await socketStore.emitWithCallback('reconnect-room', request) as ReconnectRoomResponse;

            if (!response.success) {
                this.logger.log('error', `${response.error || 'Failed to reconnect to room'}`);
            }

            this.logger.log('success', 'Reconnected to room successfully', {
                roomId: response.room.id,
                participantId: response.participant.socketId,
                totalParticipants: response.participants.length
            });

            runInAction(() => {
                this.currentRoom = response.room;
                this.currentParticipant = response.participant;
                this.participants = response.participants;
                this.roomStatus = 'in-room';
            });

        } catch (error) {
            const errorMessage = (error as Error).message;
            this.logger.log('error', 'Failed to reconnect to room', { error: errorMessage });

            runInAction(() => {
                this.roomStatus = 'error';
                this.roomError = `Reconnection failed: ${errorMessage}`;
            });

            clearReconnectionData();
        }
    }

    private clearReconnectionTimeout(): void {
        if (this.reconnectionTimeoutId) {
            clearTimeout(this.reconnectionTimeoutId);
            this.reconnectionTimeoutId = null;
        }
    }

    // ========================================================================
    // UTILITY METHODS
    // ========================================================================

    clearLogs(): void {
        this.logger.clearLogs();
        this.logger.log('info', 'Room logs cleared');
    }

    async getRoomInfo(roomId: string): Promise<Room | null> {
        try {
            const request: GetRoomInfoRequest = { roomId };
            const response = await socketStore.emitWithCallback('get-room-info', request) as GetRoomInfoResponse;

            if (!response.success) {
                return null;
            }

            return response.room;
        } catch (error) {
            this.logger.log('error', 'Failed to get room info', {
                error: (error as Error).message,
                roomId
            });
            return null;
        }
    }

    // ========================================================================
    // COMPUTED PROPERTIES
    // ========================================================================

    get isInRoom(): boolean {
        return this.roomStatus === 'in-room' && !!this.currentRoom;
    }

    get isRoomCreator(): boolean {
        return !!this.currentParticipant?.isCreator;
    }

    get participantCount(): number {
        return this.participants.length;
    }

    get connectedParticipants(): Participant[] {
        return this.participants.filter(p => p.isConnected);
    }

    get otherParticipants(): Participant[] {
        return this.participants.filter(p =>
            p.isConnected && p.socketId !== this.currentParticipant?.socketId
        );
    }

    get canCreateRoom(): boolean {
        return this.roomStatus === 'idle' && socketStore.isConnected;
    }

    get canJoinRoom(): boolean {
        return this.roomStatus === 'idle' && socketStore.isConnected;
    }

    get canLeaveRoom(): boolean {
        return this.isInRoom;
    }

    get isLoading(): boolean {
        return ['creating', 'joining', 'reconnecting'].includes(this.roomStatus);
    }

    get hasError(): boolean {
        return this.roomStatus === 'error' && !!this.roomError;
    }

    clearError() {
        runInAction(() => {
            this.roomError = null;
            this.roomStatus = 'idle';
        });
        this.logger.log('info', 'Room error cleared');
    }
}

export default new RoomStore();