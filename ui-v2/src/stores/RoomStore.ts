// ui-v2/src/stores/RoomStore.ts
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

    // Add state management for listeners and join attempts
    private listenersSetup = false;
    private joinAttemptInProgress = false;
    private lastJoinRequest: JoinRoomRequest | null = null;

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

        // Setup cleanup on socket disconnection
        this.setupSocketDisconnectionHandler();
    }

    private setupSocketDisconnectionHandler(): void {
        // Watch for socket disconnections to clean up listeners
        if (socketStore.socket) {
            socketStore.socket.on('disconnect', () => {
                this.removeSocketListeners();
            });
        }
    }

    // Setup socket listeners only once with proper cleanup
    setupSocketListeners(): void {
        if (this.listenersSetup) {
            socketStore.log('info', 'Room listeners already setup, skipping');
            return;
        }

        if (!socketStore.socket || !socketStore.isConnected) {
            socketStore.log('warning', 'Cannot setup room listeners: socket not connected');
            return;
        }

        socketStore.log('info', 'Setting up room socket listeners');

        // Remove any existing listeners first to prevent duplicates
        this.removeSocketListeners();

        // Setup new listeners
        socketStore.on('room-updated', this.handleRoomUpdate.bind(this));
        socketStore.on('participant-joined', this.handleParticipantJoined.bind(this));
        socketStore.on('participant-left', this.handleParticipantLeft.bind(this));

        this.listenersSetup = true;
        socketStore.log('success', 'Room socket listeners setup complete');
    }

    removeSocketListeners(): void {
        if (!this.listenersSetup) {
            return;
        }

        socketStore.log('info', 'Removing room socket listeners');

        try {
            socketStore.off('room-updated');
            socketStore.off('participant-joined');
            socketStore.off('participant-left');
        } catch (error) {
            socketStore.log('warning', 'Error removing socket listeners', { error: (error as Error).message });
        }

        this.listenersSetup = false;
        socketStore.log('info', 'Room socket listeners removed');
    }

    async joinRoom(): Promise<boolean> {
        // Prevent multiple simultaneous join attempts
        if (this.joinAttemptInProgress) {
            socketStore.log('warning', 'Join room already in progress, skipping duplicate request');
            return false;
        }

        if (!eventStore.currentEvent) {
            runInAction(() => {
                this.error = 'No event loaded - cannot join room';
            });
            return false;
        }

        // Check if we're already in this room
        if (this.isInRoom &&
            this.currentRoom?.id === eventStore.currentEvent.roomId &&
            this.currentParticipant) {
            socketStore.log('info', 'Already in room, skipping join attempt', {
                roomId: this.currentRoom.id,
                participantId: this.currentParticipant.id
            });
            return true;
        }

        this.joinAttemptInProgress = true;

        try {
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

            // Ensure socket is connected
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

            // Setup listeners only if not already done and socket is connected
            if (!this.listenersSetup && socketStore.isConnected) {
                this.setupSocketListeners();
            }

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

            // Check for duplicate request
            if (this.lastJoinRequest &&
                JSON.stringify(this.lastJoinRequest) === JSON.stringify(joinRequest)) {
                socketStore.log('warning', 'Duplicate join request detected, skipping');
                runInAction(() => {
                    this.isJoiningRoom = false;
                });
                return false;
            }

            this.lastJoinRequest = joinRequest;

            socketStore.log('info', 'Joining room with validated permissions...', {
                joinRequest: {
                    ...joinRequest,
                    reconnectionToken: joinRequest.reconnectionToken ? '[REDACTED]' : undefined
                },
                userRole: access.userRole
            });

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
        } finally {
            this.joinAttemptInProgress = false;
            // Clear the last request after a delay to allow for legitimate retries
            setTimeout(() => {
                this.lastJoinRequest = null;
            }, 5000);
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
        // Validate that this update is for our current room
        if (!this.currentRoom || data.roomId !== this.currentRoom.id) {
            socketStore.log('warning', 'Received room update for different room', {
                receivedRoomId: data.roomId,
                currentRoomId: this.currentRoom?.id
            });
            return;
        }

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
                    role: data.participant.isCreator ? 'host' : 'participant',
                    totalParticipants: data.participants.length
                });
                break;
            case 'participant-left':
                socketStore.log('info', 'Participant left', {
                    participant: data.participant.userName,
                    totalParticipants: data.participants.length
                });
                break;
            case 'participant-reconnected':
                socketStore.log('success', 'Participant reconnected', {
                    participant: data.participant.userName,
                    totalParticipants: data.participants.length
                });
                break;
        }
    }

    handleParticipantJoined(participant: Participant): void {
        socketStore.log('info', 'Participant joined event received', {
            participantId: participant.id,
            userName: participant.userName,
            isCreator: participant.isCreator
        });

        // This is handled by room-updated event, so we just log it
    }

    handleParticipantLeft(data: { socketId: string; userName: string }): void {
        socketStore.log('info', 'Participant left event received', {
            socketId: data.socketId,
            userName: data.userName
        });

        // This is handled by room-updated event, so we just log it
    }

    clearError(): void {
        runInAction(() => {
            this.error = null;
        });
    }

    reset(): void {
        socketStore.log('info', 'Resetting room store');

        // Remove listeners before reset
        this.removeSocketListeners();

        runInAction(() => {
            this.currentRoom = null;
            this.currentParticipant = null;
            this.participants = [];
            this.isJoiningRoom = false;
            this.isInRoom = false;
            this.reconnectionToken = null;
            this.error = null;
        });

        // Reset internal state
        this.joinAttemptInProgress = false;
        this.lastJoinRequest = null;
    }

    get participantCount(): number {
        return this.participants.length;
    }

    get isHost(): boolean {
        return this.currentParticipant?.isCreator ?? false;
    }
}

// Export singleton instance
export const roomStore = new RoomStore();
export default roomStore;