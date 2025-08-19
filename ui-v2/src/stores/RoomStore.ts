// stores/RoomStore.ts
import { makeObservable, observable, action, computed, runInAction } from 'mobx';
import type {
    Participant,
    Room,
    JoinRoomRequest,
    JoinRoomResponse,
    RoomUpdateEvent
} from '@/types';
import { socketStore } from './SocketStore';
import { eventStore } from './EventStore';
import { sessionStore } from './SessionStore';
import { authStore } from './AuthStore';

class RoomStore {
    currentRoom: Room | null = null;
    currentParticipant: Participant | null = null;
    participants: Participant[] = [];
    isJoiningRoom = false;
    isInRoom = false;
    reconnectionToken: string | null = null;
    error: string | null = null;

    constructor() {
        makeObservable(this, {
            currentRoom: observable,
            currentParticipant: observable,
            participants: observable,
            isJoiningRoom: observable,
            isInRoom: observable,
            reconnectionToken: observable,
            error: observable,
            joinRoom: action,
            leaveRoom: action,
            handleRoomUpdate: action,
            clearError: action,
            reset: action,
            participantCount: computed,
            isHost: computed
        });

        // Don't setup socket listeners in constructor - wait for socket connection
    }

    // Setup socket listeners when needed (after connection)
    setupSocketListeners(): void {
        if (!socketStore.socket || !socketStore.isConnected) {
            socketStore.log('warning', 'Cannot setup room listeners: socket not connected');
            return;
        }

        socketStore.log('info', 'Setting up room socket listeners');
        socketStore.on('room-updated', this.handleRoomUpdate.bind(this));
        socketStore.on('participant-joined', this.handleParticipantJoined.bind(this));
        socketStore.on('participant-left', this.handleParticipantLeft.bind(this));
    }

    async joinRoom(): Promise<boolean> {
        if (!eventStore.currentEvent) {
            runInAction(() => {
                this.error = 'No event loaded - cannot join room';
            });
            return false;
        }

        // Verify authorization before attempting to join
        const access = await authStore.checkEventAccess(eventStore.currentEvent.eventId);
        if (!access?.canJoin) {
            runInAction(() => {
                this.error = 'Not authorized to join this room';
            });
            socketStore.log('error', 'Join room blocked: insufficient permissions', {
                eventId: eventStore.currentEvent?.eventId,
                access
            });
            return false;
        }

        // Ensure we have user info for the join request
        if (!sessionStore.userInfo.userId || !sessionStore.userInfo.userName || !sessionStore.userInfo.userEmail) {
            runInAction(() => {
                this.error = 'User information required to join room';
            });
            return false;
        }

        // Ensure socket is connected and listeners are setup
        if (!socketStore.isConnected) {
            socketStore.log('warning', 'Socket not connected, attempting to connect...');
            try {
                await socketStore.connect();
            } catch (error) {
                runInAction(() => {
                    this.error = 'Failed to connect to server';
                });
                return false;
            }
        }

        // Setup socket listeners now that we're connected
        this.setupSocketListeners();

        runInAction(() => {
            this.isJoiningRoom = true;
            this.error = null;
        });

        const joinRequest: JoinRoomRequest = {
            eventId: eventStore.currentEvent.eventId,
            roomId: eventStore.currentEvent.roomId,
            extUserId: sessionStore.userInfo.userId,
            userName: sessionStore.userInfo.userName,
            userEmail: sessionStore.userInfo.userEmail,
            reconnectionToken: this.reconnectionToken || undefined
        };

        socketStore.log('info', 'Joining room with validated permissions...', {
            joinRequest: {
                ...joinRequest,
                reconnectionToken: joinRequest.reconnectionToken ? '[REDACTED]' : undefined
            },
            userRole: access.userRole
        });

        try {
            const response = await socketStore.emitWithCallback<JoinRoomResponse>(
                'join-room',
                joinRequest
            );

            if (response.success && response.room && response.participant) {
                runInAction(() => {
                    this.currentRoom = response.room!;
                    this.currentParticipant = response.participant!;
                    this.participants = response.participants || [];
                    this.reconnectionToken = response.reconnectionToken || null;
                    this.isInRoom = true;
                    this.isJoiningRoom = false;
                });

                socketStore.log('success', 'Successfully joined room', {
                    roomId: response.room.id,
                    participantId: response.participant.id,
                    participantCount: this.participants.length,
                    userRole: access.userRole,
                    isHost: response.participant.isCreator
                });

                return true;
            } else {
                runInAction(() => {
                    this.error = response.error || 'Failed to join room';
                    this.isJoiningRoom = false;
                });

                socketStore.log('error', 'Failed to join room', { error: this.error });
                return false;
            }
        } catch (error) {
            const errorMessage = (error as Error).message;
            runInAction(() => {
                this.error = errorMessage;
                this.isJoiningRoom = false;
            });

            socketStore.log('error', 'Room joining error', { error: errorMessage });
            return false;
        }
    }

    async leaveRoom(): Promise<boolean> {
        if (!this.currentRoom) {
            return true; // Already not in room
        }

        const roomId = this.currentRoom.id;
        socketStore.log('info', 'Leaving room...', { roomId });

        try {
            const response = await socketStore.emitWithCallback(
                'leave-room',
                { roomId }
            );

            if (response.success) {
                runInAction(() => {
                    this.isInRoom = false;
                    // Keep current room/participant data for potential reconnection
                });

                socketStore.log('success', 'Successfully left room');
                return true;
            } else {
                socketStore.log('error', 'Failed to leave room', { error: response.error });
                return false;
            }
        } catch (error) {
            socketStore.log('error', 'Room leaving error', { error: (error as Error).message });
            return false;
        }
    }

    handleRoomUpdate(data: RoomUpdateEvent): void {
        socketStore.log('info', 'Room update received', {
            event: data.event,
            participantCount: data.participants.length,
            participant: data.participant.userName
        });

        runInAction(() => {
            this.participants = data.participants;

            // Update current room participant count
            if (this.currentRoom) {
                this.currentRoom.participantCount = data.participants.length;
            }
        });

        // Handle specific events with better logging
        switch (data.event) {
            case 'participant-joined':
                socketStore.log('success', 'New participant joined', {
                    participant: data.participant.userName,
                    role: data.participant.isCreator ? 'host' : 'participant'
                });
                break;
            case 'participant-left':
                socketStore.log('info', 'Participant left', {
                    participant: data.participant.userName
                });
                break;
            case 'participant-reconnected':
                socketStore.log('success', 'Participant reconnected', {
                    participant: data.participant.userName
                });
                break;
        }
    }

    private handleParticipantJoined(participant: Participant): void {
        socketStore.log('info', 'New participant notification', {
            participant: participant.userName,
            socketId: participant.socketId
        });

        runInAction(() => {
            const existingIndex = this.participants.findIndex(p => p.socketId === participant.socketId);
            if (existingIndex === -1) {
                this.participants.push(participant);
            } else {
                this.participants[existingIndex] = participant;
            }
        });
    }

    private handleParticipantLeft(data: { socketId: string; userName: string }): void {
        socketStore.log('info', 'Participant left notification', { data });

        runInAction(() => {
            this.participants = this.participants.filter(p => p.socketId !== data.socketId);

            // Update room participant count
            if (this.currentRoom) {
                this.currentRoom.participantCount = this.participants.length;
            }
        });
    }

    // Get user's role in current room
    getUserRole(): 'host' | 'participant' | 'guest' {
        if (!this.currentParticipant) return 'guest';
        return this.currentParticipant.isCreator ? 'host' : 'participant';
    }

    // Check if current user can perform host actions
    canPerformHostActions(): boolean {
        return this.isHost && this.isInRoom;
    }

    // Get reconnection data for potential reconnection
    getReconnectionData(): { roomId: string; reconnectionToken: string; userName: string } | null {
        if (!this.currentRoom || !this.reconnectionToken || !this.currentParticipant) {
            return null;
        }

        return {
            roomId: this.currentRoom.id,
            reconnectionToken: this.reconnectionToken,
            userName: this.currentParticipant.userName
        };
    }

    clearError(): void {
        this.error = null;
    }

    reset(): void {
        // Cleanup but preserve reconnection data
        const reconnectionData = this.getReconnectionData();

        this.currentRoom = null;
        this.currentParticipant = null;
        this.participants = [];
        this.isJoiningRoom = false;
        this.isInRoom = false;
        this.error = null;

        // Restore reconnection token if we had one
        if (reconnectionData) {
            this.reconnectionToken = reconnectionData.reconnectionToken;
        } else {
            this.reconnectionToken = null;
        }

        socketStore.log('info', 'Room store reset', {
            preservedReconnection: !!reconnectionData
        });
    }

    get participantCount(): number {
        return this.participants.length;
    }

    get isHost(): boolean {
        return this.currentParticipant?.isCreator || false;
    }
}

export const roomStore = new RoomStore();