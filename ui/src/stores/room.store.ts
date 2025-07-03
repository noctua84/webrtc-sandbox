import { makeAutoObservable, runInAction } from 'mobx';
import socketStore from './socket.store';
import type {
    Room,
    Participant,
    CreateRoomRequest,
    JoinRoomRequest,
    ReconnectRoomRequest,
    GetRoomInfoRequest,
    CreateRoomResponse,
    JoinRoomResponse,
    ReconnectRoomResponse,
    GetRoomInfoResponse,
    RoomUpdateEvent,
    ReconnectionAvailableEvent,
    RoomStatus,
    LogLevel,
    LogEntry,
    LogData,
    ReconnectionData
} from '../types';

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
        const stored = localStorage.getItem('webrtc-reconnection-data');
        if (!stored) return null;

        const data: ReconnectionData = JSON.parse(stored);
        const now = Date.now();
        const age = now - data.timestamp;

        // Expire after 5 minutes
        if (age > 5 * 60 * 1000) {
            localStorage.removeItem('webrtc-reconnection-data');
            return null;
        }

        return data;
    } catch (error) {
        localStorage.removeItem('webrtc-reconnection-data');
        return null;
    }
};

const storeReconnectionData = (data: ReconnectionData): void => {
    try {
        localStorage.setItem('webrtc-reconnection-data', JSON.stringify(data));
    } catch (error) {
        console.warn('Failed to store reconnection data:', error);
    }
};

const clearReconnectionData = (): void => {
    localStorage.removeItem('webrtc-reconnection-data');
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
    event: 'participant-joined' | 'participant-reconnected',
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
    private logger: ReturnType<typeof createLogger>;

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
    // SOCKET EVENT HANDLERS
    // ========================================================================

    private setupSocketListeners(): void {
        this.logger.log('info', 'Setting up room socket listeners');

        socketStore.on('room-updated', this.handleRoomUpdate.bind(this));
        socketStore.on('reconnection-available', this.handleReconnectionAvailable.bind(this));

        this.logger.log('info', 'Room socket listeners configured');
    }

    private async handleRoomUpdate(data: RoomUpdateEvent): Promise<void> {
        this.logger.log('info', 'Room update received', {
            event: data.event,
            roomId: data.roomId,
            participantCount: data.participants?.length
        });

        if (!this.currentRoom || this.currentRoom.id !== data.roomId) {
            this.logger.log('warning', 'Received room update for different room', {
                currentRoomId: this.currentRoom?.id,
                updateRoomId: data.roomId
            });
            return;
        }

        runInAction(() => {
            this.participants = data.participants || [];
        });

        // Handle specific events with WebRTC integration
        switch (data.event) {
            case 'participant-joined':
                if (data.participant) {
                    this.logger.log('success', 'Participant joined the room', {
                        participant: data.participant,
                        totalParticipants: data.participants?.length
                    });

                    // CRITICAL FIX: Establish bidirectional connections
                    await handleWebRTCIntegration(
                        'participant-joined',
                        data.participant,
                        this.currentParticipant,
                        this.logger
                    );
                }
                break;

            case 'participant-reconnected':
                if (data.participant) {
                    this.logger.log('success', 'Participant reconnected to the room', {
                        participant: data.participant,
                        totalParticipants: data.participants?.length
                    });

                    // CRITICAL FIX: Re-establish connections for reconnected participants
                    await handleWebRTCIntegration(
                        'participant-reconnected',
                        data.participant,
                        this.currentParticipant,
                        this.logger
                    );
                }
                break;

            case 'participant-left':
                if (data.leftParticipantId) {
                    this.logger.log('info', 'Participant left the room', {
                        leftParticipantId: data.leftParticipantId,
                        totalParticipants: data.participants?.length
                    });

                    // Clean up WebRTC connections
                    try {
                        const { default: webrtcStore } = await import('./webrtc.store');
                        webrtcStore.closePeerConnection(data.leftParticipantId);
                    } catch (error) {
                        this.logger.log('error', 'Failed to cleanup WebRTC connection for left participant', {
                            error: (error as Error).message,
                            participantId: data.leftParticipantId
                        });
                    }
                }
                break;

            case 'participant-disconnected':
                if (data.leftParticipantId) {
                    this.logger.log('warning', 'Participant disconnected from the room', {
                        leftParticipantId: data.leftParticipantId,
                        totalParticipants: data.participants?.length
                    });
                }
                break;

            case 'media-status-changed':
                if (data.participant) {
                    this.logger.log('info', 'Participant media status changed', {
                        participant: data.participant,
                        mediaStatus: data.participant.mediaStatus
                    });
                }
                break;
        }
    }

    private handleReconnectionAvailable(data: ReconnectionAvailableEvent): void {
        this.logger.log('info', 'Reconnection available', {
            roomId: data.roomId,
            timeLeft: data.timeLeft
        });

        // Store reconnection data
        if (this.currentParticipant) {
            const reconnectionData: ReconnectionData = {
                roomId: data.roomId,
                reconnectionToken: this.currentParticipant.reconnectionToken || '',
                userName: this.currentParticipant.userName,
                timestamp: Date.now()
            };
            storeReconnectionData(reconnectionData);
        }
    }

    // ========================================================================
    // PUBLIC API METHODS
    // ========================================================================

    async createRoom(userName: string, roomId?: string): Promise<void> {
        if (!userName.trim()) {
            throw new Error('Username is required');
        }

        this.logger.log('info', 'Creating room', { userName, roomId });

        runInAction(() => {
            this.roomStatus = 'creating';
            this.roomError = null;
        });

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

            // Store reconnection data
            const reconnectionData: ReconnectionData = {
                roomId: response.room.id,
                reconnectionToken: response.reconnectionToken,
                userName: response.participant.userName,
                timestamp: Date.now()
            };
            storeReconnectionData(reconnectionData);

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

    async joinRoom(roomId: string, userName: string): Promise<void> {
        if (!roomId.trim() || !userName.trim()) {
            throw new Error('Room ID and username are required');
        }

        this.logger.log('info', 'Joining room', { roomId, userName });

        runInAction(() => {
            this.roomStatus = 'joining';
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
                this.roomStatus = 'in-room';
            });

            // Store reconnection data
            const reconnectionData: ReconnectionData = {
                roomId: response.room.id,
                reconnectionToken: response.reconnectionToken,
                userName: response.participant.userName,
                timestamp: Date.now()
            };
            storeReconnectionData(reconnectionData);

            // CRITICAL FIX: Connect to all existing participants immediately if media is active
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
        setTimeout(() => {
            this.attemptReconnection(reconnectionData);
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
}

export default new RoomStore();