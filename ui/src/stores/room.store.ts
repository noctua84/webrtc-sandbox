import { makeAutoObservable, runInAction } from 'mobx';
import socketStore from './socket.store.ts';
import type {
    Room,
    Participant,
    CreateRoomRequest,
    JoinRoomRequest,
    ReconnectRoomRequest,
    CreateRoomResponse,
    JoinRoomResponse,
    ReconnectRoomResponse,
    GetRoomInfoResponse,
    RoomUpdateEvent,
    ReconnectionData,
    LogLevel,
    LogEntry,
    LogData,
    RoomStatus
} from '../types';

// Reconnection data storage key
const RECONNECTION_STORAGE_KEY = 'webrtc-reconnection-data';
const RECONNECTION_EXPIRY_MS = 5 * 60 * 1000; // 5 minutes

class RoomStore {
    currentRoom: Room | null = null;
    currentParticipant: Participant | null = null;
    participants: Participant[] = [];
    isCreatingRoom: boolean = false;
    isJoiningRoom: boolean = false;
    isReconnecting: boolean = false;
    roomError: string | null = null;
    logs: LogEntry[] = [];
    reconnectionData: ReconnectionData | null = null;

    constructor() {
        makeAutoObservable(this);
        this.setupSocketListeners();
        this.loadReconnectionData();
    }

    // Detailed logging function
    log(level: LogLevel, message: string, data: LogData | null = null): void {
        const timestamp = new Date().toISOString();
        const logEntry: LogEntry = {
            id: Date.now() + Math.random(),
            timestamp,
            level,
            message,
            data: data ? JSON.stringify(data, null, 2) : null
        };

        runInAction(() => {
            this.logs.push(logEntry);
            // Keep only last 100 logs
            if (this.logs.length > 100) {
                this.logs = this.logs.slice(-100);
            }
        });

        // Also log to console
        const consoleMessage = `[ROOM] [${level.toUpperCase()}] ${message}`;
        if (data) {
            console.log(consoleMessage, data);
        } else {
            console.log(consoleMessage);
        }
    }

    private setupSocketListeners(): void {
        this.log('info', 'Setting up room-related socket listeners');

        // Listen for room updates (participants joining/leaving/reconnecting)
        socketStore.on('room-updated', (data: RoomUpdateEvent) => {
            this.handleRoomUpdate(data);
        });

        this.log('info', 'Room socket listeners configured');
    }

    private async handleRoomUpdate(data: RoomUpdateEvent): Promise<void> {
        this.log('info', 'Received room update', data);

        runInAction(() => {
            if (data.participants) {
                this.participants = data.participants;
                this.log('info', 'Updated participants list', {
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

        // Log specific events
        switch (data.event) {
            case 'participant-joined':
                if (data.participant) {
                    this.log('success', 'New participant joined the room', {
                        participant: data.participant,
                        totalParticipants: data.participants?.length
                    });

                    // Auto-connect to new participant if we have media active
                    try {
                        const { default: webrtcStore } = await import('./webrtc.store.ts');
                        if (webrtcStore.isMediaActive && data.participant.socketId !== this.currentParticipant?.socketId) {
                            this.log('info', 'Auto-connecting to new participant');
                            await webrtcStore.initiatePeerConnection(data.participant.socketId, data.participant.userName);
                        }
                    } catch (error) {
                        this.log('error', 'Failed to auto-connect to new participant', {
                            error: (error as Error).message,
                            participantId: data.participant.socketId
                        });
                    }
                }
                break;

            case 'participant-reconnected':
                if (data.participant) {
                    this.log('success', 'Participant reconnected to the room', {
                        participant: data.participant,
                        totalParticipants: data.participants?.length
                    });

                    // Auto-connect to reconnected participant if we have media active
                    try {
                        const { default: webrtcStore } = await import('./webrtc.store.ts');
                        if (webrtcStore.isMediaActive && data.participant.socketId !== this.currentParticipant?.socketId) {
                            this.log('info', 'Auto-connecting to reconnected participant');
                            await webrtcStore.initiatePeerConnection(data.participant.socketId, data.participant.userName);
                        }
                    } catch (error) {
                        this.log('error', 'Failed to auto-connect to reconnected participant', {
                            error: (error as Error).message,
                            participantId: data.participant.socketId
                        });
                    }
                }
                break;

            case 'participant-left':
                this.log('warning', 'Participant left the room', {
                    leftParticipantId: data.leftParticipantId,
                    remainingParticipants: data.participants?.length
                });
                break;

            case 'participant-disconnected':
                this.log('warning', 'Participant disconnected from the room', {
                    leftParticipantId: data.leftParticipantId,
                    remainingParticipants: data.participants?.length,
                    note: 'They may be able to reconnect'
                });
                break;

            case 'media-status-changed':
                if (data.participant) {
                    this.log('info', 'Participant media status changed', {
                        participant: {
                            socketId: data.participant.socketId,
                            userName: data.participant.userName,
                            mediaStatus: data.participant.mediaStatus
                        }
                    });
                }
                break;

            default:
                this.log('info', 'Room update event', { event: data.event });
        }
    }

    // Load reconnection data from localStorage
    private loadReconnectionData(): void {
        try {
            const stored = localStorage.getItem(RECONNECTION_STORAGE_KEY);
            if (stored) {
                const data: ReconnectionData = JSON.parse(stored);

                // Check if data is still valid (not expired)
                const now = Date.now();
                if (now - data.timestamp < RECONNECTION_EXPIRY_MS) {
                    runInAction(() => {
                        this.reconnectionData = data;
                    });

                    this.log('info', 'Loaded valid reconnection data', {
                        roomId: data.roomId,
                        userName: data.userName,
                        ageMs: now - data.timestamp
                    });
                } else {
                    this.log('info', 'Reconnection data expired, clearing', {
                        roomId: data.roomId,
                        ageMs: now - data.timestamp,
                        expiryMs: RECONNECTION_EXPIRY_MS
                    });
                    this.clearReconnectionData();
                }
            }
        } catch (error) {
            this.log('error', 'Failed to load reconnection data', { error: (error as Error).message });
            this.clearReconnectionData();
        }
    }

    // Save reconnection data to localStorage
    private saveReconnectionData(roomId: string, reconnectionToken: string, userName: string): void {
        const data: ReconnectionData = {
            roomId,
            reconnectionToken,
            userName,
            timestamp: Date.now()
        };

        try {
            localStorage.setItem(RECONNECTION_STORAGE_KEY, JSON.stringify(data));
            runInAction(() => {
                this.reconnectionData = data;
            });

            this.log('info', 'Saved reconnection data', { roomId, userName });
        } catch (error) {
            this.log('error', 'Failed to save reconnection data', { error: (error as Error).message });
        }
    }

    // Clear reconnection data
    private clearReconnectionData(): void {
        try {
            localStorage.removeItem(RECONNECTION_STORAGE_KEY);
            runInAction(() => {
                this.reconnectionData = null;
            });
            this.log('info', 'Cleared reconnection data');
        } catch (error) {
            this.log('error', 'Failed to clear reconnection data', { error: (error as Error).message });
        }
    }

    async createRoom(userName: string, customRoomId?: string): Promise<CreateRoomResponse> {
        if (!userName || userName.trim().length === 0) {
            const error = 'Username is required to create a room';
            this.log('error', error);

            runInAction(() => {
                this.roomError = error;
            });

            throw new Error(error);
        }

        runInAction(() => {
            this.isCreatingRoom = true;
            this.roomError = null;
        });

        this.log('info', 'Attempting to create room', {
            userName: userName.trim(),
            customRoomId,
            hasReconnectionData: !!this.reconnectionData
        });

        try {
            const requestData: CreateRoomRequest = {
                userName: userName.trim()
            };

            if (customRoomId && customRoomId.trim().length > 0) {
                requestData.roomId = customRoomId.trim();
            }

            // Include reconnection token if available for the same room
            if (this.reconnectionData &&
                (!customRoomId || this.reconnectionData.roomId === customRoomId)) {
                requestData.reconnectionToken = this.reconnectionData.reconnectionToken;
                this.log('info', 'Including reconnection token in create request');
            }

            this.log('info', 'Sending create-room request', requestData);

            const response = await socketStore.emitWithCallback<CreateRoomResponse>('create-room', requestData, 15000);

            this.log('success', 'Room created successfully', response);

            // Save reconnection data
            this.saveReconnectionData(response.room.id, response.reconnectionToken, response.participant.userName);

            runInAction(() => {
                this.currentRoom = response.room;
                this.currentParticipant = response.participant;
                this.participants = [response.participant]; // Creator is first participant
                this.isCreatingRoom = false;
                this.roomError = null;
            });

            this.log('info', 'Room state updated after creation', {
                roomId: this.currentRoom?.id,
                participantId: this.currentParticipant?.socketId,
                isCreator: this.currentParticipant?.isCreator,
                isActive: this.currentRoom?.isActive
            });

            return response;

        } catch (error) {
            const err = error as Error;
            this.log('error', 'Failed to create room', {
                error: err.message,
                userName,
                customRoomId
            });

            runInAction(() => {
                this.isCreatingRoom = false;
                this.roomError = err.message;
            });

            throw error;
        }
    }

    async joinRoom(roomId: string, userName: string): Promise<JoinRoomResponse> {
        if (!roomId || roomId.trim().length === 0) {
            const error = 'Room ID is required to join a room';
            this.log('error', error);

            runInAction(() => {
                this.roomError = error;
            });

            throw new Error(error);
        }

        if (!userName || userName.trim().length === 0) {
            const error = 'Username is required to join a room';
            this.log('error', error);

            runInAction(() => {
                this.roomError = error;
            });

            throw new Error(error);
        }

        runInAction(() => {
            this.isJoiningRoom = true;
            this.roomError = null;
        });

        this.log('info', 'Attempting to join room', {
            roomId: roomId.trim(),
            userName: userName.trim(),
            hasReconnectionData: !!this.reconnectionData
        });

        try {
            const requestData: JoinRoomRequest = {
                roomId: roomId.trim(),
                userName: userName.trim()
            };

            // Include reconnection token if available for this room
            if (this.reconnectionData && this.reconnectionData.roomId === roomId.trim()) {
                requestData.reconnectionToken = this.reconnectionData.reconnectionToken;
                this.log('info', 'Including reconnection token in join request');
            }

            this.log('info', 'Sending join-room request', requestData);

            const response = await socketStore.emitWithCallback<JoinRoomResponse>('join-room', requestData, 15000);

            this.log('success', 'Successfully joined room', response);

            // Save reconnection data
            this.saveReconnectionData(response.room.id, response.reconnectionToken, response.participant.userName);

            runInAction(() => {
                this.currentRoom = response.room;
                this.currentParticipant = response.participant;
                this.participants = response.participants || [];
                this.isJoiningRoom = false;
                this.roomError = null;
            });

            this.log('info', 'Room state updated after joining', {
                roomId: this.currentRoom?.id,
                participantId: this.currentParticipant?.socketId,
                totalParticipants: this.participants.length,
                isCreator: this.currentParticipant?.isCreator,
                isActive: this.currentRoom?.isActive
            });

            return response;

        } catch (error) {
            const err = error as Error;
            this.log('error', 'Failed to join room', {
                error: err.message,
                roomId: roomId.trim(),
                userName: userName.trim()
            });

            runInAction(() => {
                this.isJoiningRoom = false;
                this.roomError = err.message;
            });

            throw error;
        }
    }

    async attemptReconnection(): Promise<void> {
        if (!this.reconnectionData) {
            const error = 'No reconnection data available';
            this.log('error', error);
            throw new Error(error);
        }

        runInAction(() => {
            this.isReconnecting = true;
            this.roomError = null;
        });

        this.log('info', 'Attempting to reconnect to room', {
            roomId: this.reconnectionData.roomId,
            userName: this.reconnectionData.userName
        });

        try {
            const requestData: ReconnectRoomRequest = {
                roomId: this.reconnectionData.roomId,
                reconnectionToken: this.reconnectionData.reconnectionToken
            };

            this.log('info', 'Sending reconnect-room request', requestData);

            const response = await socketStore.emitWithCallback<ReconnectRoomResponse>('reconnect-room', requestData, 15000);

            this.log('success', 'Successfully reconnected to room', response);

            runInAction(() => {
                this.currentRoom = response.room;
                this.currentParticipant = response.participant;
                this.participants = response.participants || [];
                this.isReconnecting = false;
                this.roomError = null;
            });

            this.log('info', 'Room state updated after reconnection', {
                roomId: this.currentRoom?.id,
                participantId: this.currentParticipant?.socketId,
                totalParticipants: this.participants.length,
                isActive: this.currentRoom?.isActive
            });

        } catch (error) {
            const err = error as Error;
            this.log('error', 'Failed to reconnect to room', {
                error: err.message,
                roomId: this.reconnectionData.roomId
            });

            // Clear invalid reconnection data
            this.clearReconnectionData();

            runInAction(() => {
                this.isReconnecting = false;
                this.roomError = `Reconnection failed: ${err.message}`;
            });

            throw error;
        }
    }

    async getRoomInfo(roomId: string): Promise<GetRoomInfoResponse> {
        if (!roomId || roomId.trim().length === 0) {
            const error = 'Room ID is required to get room info';
            this.log('error', error);
            throw new Error(error);
        }

        this.log('info', 'Requesting room info', { roomId: roomId.trim() });

        try {
            const response = await socketStore.emitWithCallback<GetRoomInfoResponse>('get-room-info', {
                roomId: roomId.trim()
            }, 10000);

            this.log('success', 'Received room info', response);
            return response;

        } catch (error) {
            const err = error as Error;
            this.log('error', 'Failed to get room info', {
                error: err.message,
                roomId: roomId.trim()
            });

            throw error;
        }
    }

    async leaveRoom(): Promise<void> {
        if (!this.currentRoom) {
            this.log('warning', 'Cannot leave room: not currently in a room');
            return;
        }

        const roomId = this.currentRoom.id;
        const participantId = this.currentParticipant?.socketId;

        this.log('info', 'Explicitly leaving room', {
            roomId,
            participantId
        });

        try {
            // Import webrtcStore dynamically to avoid circular dependency
            const { default: webrtcStore } = await import('./webrtc.store.ts');

            // Cleanup WebRTC connections first
            webrtcStore.cleanup();

            // Notify server about explicit leave
            await socketStore.emitWithCallback<{ success: true }>('leave-room', {
                roomId
            }, 10000);

            this.log('success', 'Successfully left room on server');

            // Clear reconnection data since this is an explicit leave
            this.clearReconnectionData();

            // Update local state
            runInAction(() => {
                this.currentRoom = null;
                this.currentParticipant = null;
                this.participants = [];
                this.roomError = null;
            });

            this.log('info', 'Local room state cleared after explicit leave');

        } catch (error) {
            const err = error as Error;
            this.log('error', 'Failed to leave room on server', {
                error: err.message,
                roomId,
                participantId
            });

            // Still clear local state even if server call failed
            this.clearReconnectionData();

            runInAction(() => {
                this.currentRoom = null;
                this.currentParticipant = null;
                this.participants = [];
                this.roomError = `Failed to leave room: ${err.message}`;
            });

            throw error;
        }
    }

    // Clear room-related logs
    clearLogs(): void {
        runInAction(() => {
            this.logs = [];
        });
        this.log('info', 'Room logs cleared');
    }

    // Reset room error
    clearError(): void {
        runInAction(() => {
            this.roomError = null;
        });
        this.log('info', 'Room error cleared');
    }

    // Clear reconnection data manually
    clearReconnection(): void {
        this.clearReconnectionData();
    }

    // Computed properties
    get isInRoom(): boolean {
        return this.currentRoom !== null && this.currentParticipant !== null;
    }

    get isRoomCreator(): boolean {
        return this.currentParticipant?.isCreator === true;
    }

    get participantCount(): number {
        return this.participants.length;
    }

    get connectedParticipantCount(): number {
        return this.participants.filter(p => p.isConnected).length;
    }

    get canCreateRoom(): boolean {
        return socketStore.isConnected && !this.isCreatingRoom && !this.isJoiningRoom && !this.isReconnecting && !this.isInRoom;
    }

    get canJoinRoom(): boolean {
        return socketStore.isConnected && !this.isCreatingRoom && !this.isJoiningRoom && !this.isReconnecting && !this.isInRoom;
    }

    get canReconnect(): boolean {
        return socketStore.isConnected && !this.isInRoom && !!this.reconnectionData && !this.isReconnecting;
    }

    get roomStatus(): RoomStatus {
        if (this.isCreatingRoom) return 'creating';
        if (this.isJoiningRoom) return 'joining';
        if (this.isReconnecting) return 'reconnecting';
        if (this.isInRoom) return 'in-room';
        if (this.roomError) return 'error';
        return 'idle';
    }
}

export default new RoomStore();