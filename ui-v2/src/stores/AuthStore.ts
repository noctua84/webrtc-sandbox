// stores/AuthStore.ts
import { makeObservable, observable, action, computed, runInAction } from 'mobx';
import { sessionStore } from './SessionStore';

export interface EventAccess {
    canView: boolean;
    canJoin: boolean;
    canStart: boolean;  // Host can start event
    canBook: boolean;   // Can book if not full and not already booked
    userRole: 'host' | 'participant' | 'guest';
    isBooked: boolean;
    booking?: {
        id: string;
        userName: string;
        userEmail: string;
        bookedAt: string;
    };
    event: {
        eventId: string;
        status: 'SCHEDULED' | 'ACTIVE' | 'CLOSED';
        currentBookings: number;
        maxParticipants: number;
    };
}

interface AuthCheckCache {
    [eventId: string]: {
        access: EventAccess;
        timestamp: number;
        userId: string;
    };
}

class AuthStore {
    accessCache: AuthCheckCache = {};
    isCheckingAccess = false;
    lastError: string | null = null;
    cacheTimeout = 30000; // 30 seconds

    constructor() {
        makeObservable(this, {
            accessCache: observable,
            isCheckingAccess: observable,
            lastError: observable,
            checkEventAccess: action,
            clearCache: action,
            clearError: action
        });
    }

    async checkEventAccess(eventId: string, userId?: string, forceRefresh = false): Promise<EventAccess | null> {
        // Use session store user info if no userId provided
        const checkUserId = userId || sessionStore.userInfo.userId;

        if (!checkUserId) {
            // Return guest access for events without user identification
            return this.checkGuestAccess(eventId);
        }

        // Check cache first (unless force refresh)
        if (!forceRefresh) {
            const cached = this.accessCache[eventId];
            if (cached &&
                cached.userId === checkUserId &&
                Date.now() - cached.timestamp < this.cacheTimeout) {
                return cached.access;
            }
        }

        runInAction(() => {
            this.isCheckingAccess = true;
            this.lastError = null;
        });

        try {
            const response = await fetch(`http://localhost:3001/api/events/${eventId}/access`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    userId: checkUserId,
                    eventId: eventId,
                }),
            });

            if (!response.ok) {
                throw new Error(`Access check failed: ${response.status}`);
            }

            const data = await response.json();

            if (data.success && data.access) {
                const access: EventAccess = data.access;

                // Update cache
                runInAction(() => {
                    this.accessCache[eventId] = {
                        access,
                        timestamp: Date.now(),
                        userId: checkUserId
                    };
                    this.isCheckingAccess = false;
                });

                return access;
            } else {
                throw new Error(data.error || 'Failed to check access');
            }
        } catch (error) {
            runInAction(() => {
                this.lastError = (error as Error).message;
                this.isCheckingAccess = false;
            });

            console.error('Access check error:', error);
            return null;
        }
    }

    private async checkGuestAccess(eventId: string): Promise<EventAccess | null> {
        try {
            // For guest users, just get basic event info
            const response = await fetch(`http://localhost:3001/api/events/${eventId}`);

            if (!response.ok) {
                return null;
            }

            const data = await response.json();

            if (data.success && data.event) {
                const event = data.event;

                return {
                    canView: true,
                    canJoin: false,
                    canStart: false,
                    canBook: event.currentBookings < event.maxParticipants && event.status === 'SCHEDULED',
                    userRole: 'guest',
                    isBooked: false,
                    event: {
                        eventId: event.eventId,
                        status: event.status,
                        currentBookings: event.currentBookings,
                        maxParticipants: event.maxParticipants
                    }
                };
            }
        } catch (error) {
            console.error('Guest access check error:', error);
        }

        return null;
    }

    getEventAccess(eventId: string): EventAccess | null {
        const cached = this.accessCache[eventId];
        if (cached &&
            cached.userId === sessionStore.userInfo.userId &&
            Date.now() - cached.timestamp < this.cacheTimeout) {
            return cached.access;
        }
        return null;
    }

    clearCache(eventId?: string): void {
        if (eventId) {
            delete this.accessCache[eventId];
        } else {
            this.accessCache = {};
        }
    }

    clearError(): void {
        this.lastError = null;
    }

    // Invalidate cache when user info changes
    onUserChange(): void {
        this.clearCache();
    }
}

export const authStore = new AuthStore();