import { makeAutoObservable, runInAction } from 'mobx';
import socketStore from './socket.store';
import type {
    Room,
    Participant,
    CreateRoomRequest,
    JoinRoomRequest,
    CreateRoomResponse,
    JoinRoomResponse,
    GetRoomInfoResponse,
    RoomUpdateEvent,
    LogLevel,
    LogEntry,
    LogData,
    RoomStatus
} from '../types';

class RoomStore {
    currentRoom: Room | null = null;
    currentParticipant: Participant | null = null;
    participants: Participant[] = [];
    isCreatingRoom: boolean = false;
    isJoiningRoom: boolean = false;
    roomError: string | null = null;
    logs: LogEntry[] = [];

    constructor() {
        makeAutoObservable(this);
        this.setupSocketListeners();
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

        // Listen for room updates (participants joining/leaving)
        socketStore.on('room-updated', (data: RoomUpdateEvent) => {
            this.handleRoomUpdate(data);
        });

        this.log('info', 'Room socket listeners configured');
    }

    private handleRoomUpdate(data: RoomUpdateEvent): void {
        this.log('info', 'Received room update', data);

        runInAction(() => {
            if (data.participants) {
                this.participants = data.participants;
                this.log('info', 'Updated participants list', {
                    count: this.participants.length,
                    participants: this.participants.map(p => ({
                        socketId: p.socketId,
                        userName: p.userName,
                        isCreator: p.isCreator
                    }))
                });
            }
        });

        // Log specific events
        switch (data.event) {
            case 'participant-joined':
                if (data.newParticipant) {
                    this.log('success', 'New participant joined the room', {
                        participant: data.newParticipant,
                        totalParticipants: data.participants?.length
                    });
                }
                break;

            case 'participant-left':
                this.log('warning', 'Participant left the room', {
                    leftParticipantId: data.leftParticipantId,
                    remainingParticipants: data.participants?.length
                });
                break;

            default:
                this.log('info', 'Room update event', { event: data.event });
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
            customRoomId
        });

        try {
            const requestData: CreateRoomRequest = {
                userName: userName.trim()
            };

            if (customRoomId && customRoomId.trim().length > 0) {
                requestData.roomId = customRoomId.trim();
            }

            this.log('info', 'Sending create-room request', requestData);

            const response = await socketStore.emitWithCallback<CreateRoomResponse>('create-room', requestData, 15000);

            this.log('success', 'Room created successfully', response);

            runInAction(() => {
                this.currentRoom = response.room;
                this.currentParticipant = response.participant;
                this.participants = [response.participant]; // Creator is first participant
                this.isCreatingRoom = false;
                this.roomError = null;
            });

            this.log('info', 'Room state updated after creation', {
                roomId: this?.currentRoom?.id,
                participantId: this?.currentParticipant?.socketId,
                isCreator: this?.currentParticipant?.isCreator
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
            userName: userName.trim()
        });

        try {
            const requestData: JoinRoomRequest = {
                roomId: roomId.trim(),
                userName: userName.trim()
            };

            this.log('info', 'Sending join-room request', requestData);

            const response = await socketStore.emitWithCallback<JoinRoomResponse>('join-room', requestData, 15000);

            this.log('success', 'Successfully joined room', response);

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
                isCreator: this.currentParticipant?.isCreator
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
            // Notify server about explicit leave
            await socketStore.emitWithCallback<{ success: true }>('leave-room', {
                roomId
            }, 10000);

            this.log('success', 'Successfully left room on server');

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

    get canCreateRoom(): boolean {
        return socketStore.isConnected && !this.isCreatingRoom && !this.isJoiningRoom && !this.isInRoom;
    }

    get canJoinRoom(): boolean {
        return socketStore.isConnected && !this.isCreatingRoom && !this.isJoiningRoom && !this.isInRoom;
    }

    get roomStatus(): RoomStatus {
        if (this.isCreatingRoom) return 'creating';
        if (this.isJoiningRoom) return 'joining';
        if (this.isInRoom) return 'in-room';
        if (this.roomError) return 'error';
        return 'idle';
    }
}

export default new RoomStore();
