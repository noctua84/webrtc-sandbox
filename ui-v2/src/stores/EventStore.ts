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
import { socketStore } from './SocketStore';

class EventStore {
    currentEvent: EventEntity | null = null;
    currentBooking: EventBooking | null = null;
    userRole: UserRole | null = null;
    userId: string = '';
    userName: string = '';
    userEmail: string = '';
    isCreatingEvent = false;
    isBookingEvent = false;
    isLoadingEvent = false;
    error: string | null = null;

    constructor() {
        makeObservable(this, {
            currentEvent: observable,
            currentBooking: observable,
            userRole: observable,
            userId: observable,
            userName: observable,
            userEmail: observable,
            isCreatingEvent: observable,
            isBookingEvent: observable,
            isLoadingEvent: observable,
            error: observable,
            createEvent: action,
            bookEvent: action,
            setUserInfo: action,
            clearError: action,
            reset: action,
            canJoinEvent: computed,
            eventLink: computed
        });
    }

    setUserInfo(userId: string, userName: string, userEmail: string): void {
        this.userId = userId;
        this.userName = userName;
        this.userEmail = userEmail;
        socketStore.log('info', 'User info set', { userId, userName, userEmail });
    }

    async createEvent(eventRequest: CreateEventRequest): Promise<boolean> {
        runInAction(() => {
            this.isCreatingEvent = true;
            this.error = null;
        });

        socketStore.log('info', 'Creating event...', { eventRequest });

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
                    this.userRole = 'host';
                    this.isCreatingEvent = false;
                });

                socketStore.log('success', 'Event created successfully', {
                    eventId: data.event.eventId,
                    roomId: data.event.roomId
                });

                return true;
            } else {
                runInAction(() => {
                    this.error = data.error || 'Failed to create event';
                    this.isCreatingEvent = false;
                });

                socketStore.log('error', 'Event creation failed', { error: this.error });
                return false;
            }
        } catch (error) {
            const errorMessage = (error as Error).message;
            runInAction(() => {
                this.error = errorMessage;
                this.isCreatingEvent = false;
            });

            socketStore.log('error', 'Event creation error', { error: errorMessage });
            return false;
        }
    }

    async bookEvent(eventId: string): Promise<boolean> {
        if (!this.userId || !this.userName || !this.userEmail) {
            runInAction(() => {
                this.error = 'User information is required to book event';
            });
            return false;
        }

        runInAction(() => {
            this.isBookingEvent = true;
            this.error = null;
        });

        const bookingRequest: BookEventRequest = {
            eventId,
            userId: this.userId,
            userName: this.userName,
            userEmail: this.userEmail
        };

        socketStore.log('info', 'Booking event...', { bookingRequest });

        try {
            const response = await fetch(`http://localhost:3001/api/events/${eventId}/book`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(bookingRequest),
            });

            const data: BookEventResponse = await response.json();

            if (data.success && data.booking) {
                runInAction(() => {
                    this.currentBooking = data.booking!;
                    if (data.event) {
                        this.currentEvent = {
                            ...this.currentEvent,
                            ...data.event
                        } as EventEntity;
                    }
                    this.userRole = 'participant';
                    this.isBookingEvent = false;
                });

                socketStore.log('success', 'Event booked successfully', {
                    bookingId: data.booking.id,
                    eventId: data.booking.eventId
                });

                return true;
            } else {
                runInAction(() => {
                    this.error = data.error || 'Failed to book event';
                    this.isBookingEvent = false;
                });

                socketStore.log('error', 'Event booking failed', { error: this.error });
                return false;
            }
        } catch (error) {
            const errorMessage = (error as Error).message;
            runInAction(() => {
                this.error = errorMessage;
                this.isBookingEvent = false;
            });

            socketStore.log('error', 'Event booking error', { error: errorMessage });
            return false;
        }
    }

    async loadEvent(eventId: string): Promise<boolean> {
        runInAction(() => {
            this.isLoadingEvent = true;
            this.error = null;
        });

        socketStore.log('info', 'Loading event details...', { eventId });

        try {
            const response = await fetch(`http://localhost:3001/api/events/${eventId}`);

            if (response.ok) {
                const data = await response.json();

                if (data.success && data.event) {
                    runInAction(() => {
                        this.currentEvent = data.event;
                        this.isLoadingEvent = false;
                        // Don't set user role here - it will be determined during booking/joining
                    });

                    socketStore.log('success', 'Event details loaded', { event: data.event });
                    return true;
                }
            }

            runInAction(() => {
                this.error = 'Event not found';
                this.isLoadingEvent = false;
            });

            socketStore.log('error', 'Failed to load event', { eventId });
            return false;
        } catch (error) {
            const errorMessage = (error as Error).message;
            runInAction(() => {
                this.error = errorMessage;
                this.isLoadingEvent = false;
            });

            socketStore.log('error', 'Event loading error', { error: errorMessage });
            return false;
        }
    }

    clearError(): void {
        this.error = null;
    }

    reset(): void {
        this.currentEvent = null;
        this.currentBooking = null;
        this.userRole = null;
        this.isCreatingEvent = false;
        this.isBookingEvent = false;
        this.isLoadingEvent = false;
        this.error = null;
        socketStore.log('info', 'Event store reset');
    }

    get canJoinEvent(): boolean {
        return !!(
            this.currentEvent &&
            (this.userRole === 'host' || this.currentBooking) &&
            this.userId &&
            this.userName &&
            this.userEmail
        );
    }

    get eventLink(): string | null {
        if (!this.currentEvent) return null;
        return `${window.location.origin}/event/${this.currentEvent.eventId}`;
    }
}

export const eventStore = new EventStore();