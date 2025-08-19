// stores/EventStore.ts
import { makeObservable, observable, action, computed, runInAction } from 'mobx';
import type {
    EventEntity,
    CreateEventRequest,
    CreateEventResponse,
    BookEventRequest,
    BookEventResponse,
    EventBooking,
    UserRole
} from '@/types';
import { sessionStore } from './SessionStore';

class EventStore {
    currentEvent: EventEntity | null = null;
    isCreatingEvent = false;
    isLoadingEvent = false;
    error: string | null = null;

    constructor() {
        makeObservable(this, {
            currentEvent: observable,
            isCreatingEvent: observable,
            isLoadingEvent: observable,
            error: observable,
            createEvent: action,
            loadEvent: action,
            clearError: action,
            reset: action,
            eventLink: computed
        });
    }

    async createEvent(eventRequest: CreateEventRequest): Promise<boolean> {
        runInAction(() => {
            this.isCreatingEvent = true;
            this.error = null;
        });

        try {
            const response = await fetch('http://localhost:3001/api/events', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(eventRequest),
            });

            const data: CreateEventResponse = await response.json();

            if (data.success && data.event) {
                runInAction(() => {
                    this.currentEvent = data.event!;
                    this.isCreatingEvent = false;
                });

                // Store user info and mark as host in session
                sessionStore.setUserInfo(
                    eventRequest.hostUserId,
                    eventRequest.hostUserName,
                    eventRequest.hostEmail
                );
                sessionStore.addHostedEvent(data.event.eventId);

                return true;
            } else {
                runInAction(() => {
                    this.error = data.error || 'Failed to create event';
                    this.isCreatingEvent = false;
                });
                return false;
            }
        } catch (error) {
            const errorMessage = (error as Error).message;
            runInAction(() => {
                this.error = errorMessage;
                this.isCreatingEvent = false;
            });
            return false;
        }
    }

    async loadEvent(eventId: string): Promise<boolean> {
        runInAction(() => {
            this.isLoadingEvent = true;
            this.error = null;
        });

        try {
            const response = await fetch(`http://localhost:3001/api/events/${eventId}`);

            if (response.ok) {
                const data = await response.json();

                if (data.success && data.event) {
                    runInAction(() => {
                        this.currentEvent = data.event;
                        this.isLoadingEvent = false;
                    });
                    return true;
                }
            }

            runInAction(() => {
                this.error = 'Event not found';
                this.isLoadingEvent = false;
            });
            return false;
        } catch (error) {
            const errorMessage = (error as Error).message;
            runInAction(() => {
                this.error = errorMessage;
                this.isLoadingEvent = false;
            });
            return false;
        }
    }

    clearError(): void {
        this.error = null;
    }

    reset(): void {
        this.currentEvent = null;
        this.isCreatingEvent = false;
        this.isLoadingEvent = false;
        this.error = null;
    }

    get eventLink(): string | null {
        if (!this.currentEvent) return null;
        return `${window.location.origin}/event/${this.currentEvent.eventId}`;
    }
}

export const eventStore = new EventStore();