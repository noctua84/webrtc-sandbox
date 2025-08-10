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
            clearError: action,
            reset: action,
            participantCount: computed,
            isHost: computed
        });

        this.setupSocketListeners();
    }

    private setupSocketListeners(): void {
        socketStore.on('room-updated', this.handleRoomUpdate.bind(this));
        socketStore.on('participant-joined', this.handleParticipantJoined.bind(this));
        socketStore.on('participant-left', this.handleParticipantLeft.bind(this));
    }

    async joinRoom(): Promise<boolean> {
        if (!eventStore.currentEvent || !eventStore.canJoinEvent) {
            runInAction(() => {
                this.error = 'Cannot join room: missing event or authorization';
            });
            return false;
        }

        runInAction(() => {
            this.isJoiningRoom = true;
            this.error = null;
        });

        const joinRequest: JoinRoomRequest = {
            eventId: eventStore.currentEvent.eventId,
            roomId: eventStore.currentEvent.roomId,
            extUserId: eventStore.userId,
            userName: eventStore.userName,
            userEmail: eventStore.userEmail,
            reconnectionToken: this.reconnectionToken || undefined
        };

        socketStore.log('info', 'Joining room...', { joinRequest });

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
                    participantCount: this.participants.length
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

        socketStore.log('info', 'Leaving room...', { roomId: this.currentRoom.id });

        try {
            const response = await socketStore.emitWithCallback(
                'leave-room',
                { roomId: this.currentRoom.id }
            );

            if (response.success) {
                runInAction(() => {
                    this.isInRoom = false;
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

    private handleRoomUpdate(data: RoomUpdateEvent): void {
        socketStore.log('info', 'Room update received', { data });

        runInAction(() => {
            this.participants = data.participants;

            // Update current room participant count
            if (this.currentRoom) {
                this.currentRoom.participantCount = data.participants.length;
            }
        });

        // Handle specific events
        switch (data.event) {
            case 'participant-joined':
                socketStore.log('info', 'Participant joined', {
                    participant: data.participant.userName
                });
                break;
            case 'participant-left':
                socketStore.log('info', 'Participant left', {
                    participant: data.participant.userName
                });
                break;
            case 'participant-reconnected':
                socketStore.log('info', 'Participant reconnected', {
                    participant: data.participant.userName
                });
                break;
        }
    }

    private handleParticipantJoined(participant: Participant): void {
        socketStore.log('info', 'New participant joined', { participant });

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
        socketStore.log('info', 'Participant left', { data });

        runInAction(() => {
            this.participants = this.participants.filter(p => p.socketId !== data.socketId);
        });
    }

    clearError(): void {
        this.error = null;
    }

    reset(): void {
        this.currentRoom = null;
        this.currentParticipant = null;
        this.participants = [];
        this.isJoiningRoom = false;
        this.isInRoom = false;
        this.reconnectionToken = null;
        this.error = null;
        socketStore.log('info', 'Room store reset');
    }

    get participantCount(): number {
        return this.participants.length;
    }

    get isHost(): boolean {
        return this.currentParticipant?.isCreator || false;
    }
}

export const roomStore = new RoomStore();